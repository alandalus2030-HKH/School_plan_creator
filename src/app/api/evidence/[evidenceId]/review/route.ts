import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAudit } from '@/lib/audit'

/**
 * POST /api/evidence/[evidenceId]/review — قبول الدليل أو رفضه من طابور الفرز
 * body: { action: 'accept' | 'reject', reasonCode?: string, note?: string, ownerTeamId?: string }
 *
 * ── المرجع: الوثيقة 3.2 ──
 * «عضو الفريق يفحص، يكمل الإسناد بالمؤشرات، ثم يقبل أو يرفض بسبب من
 *  قائمة مغلقة.» والقبول يمنح الهويّة الثابتة ويُدخل الدليل التغطية.
 *
 * وثلاثة موانع تُفحص هنا، وتُفحص ثانيةً في القاعدة (ترحيل 084):
 *   • **لا يَقبل الدليلَ من رفعه** — والحارس القديم
 *     (`/api/evidence/[id]`) مبنيّ على المكلَّف بالمهمّة، فدليل القناة
 *     المباشرة بلا مهمّة كان يفلت منه.
 *   • **لا قبول بلا مرساة** — «دليلٌ بلا مرساة دليلٌ تائه» (3.3).
 *   • **ولا بلا عامٍ منسوب** — عليه تقوم العدسة الطولية (3.6.1).
 * والرفض لا يشترط شيئاً من ذلك: الناقص يُردّ لا يُحبَس.
 */

const REJECT_WITH_NOTE = 'أخرى'   // السبب الوحيد الذي يلزمه نصّ
/** من يملك تجاوز الفريق المالك — ويُسجَّل تجاوزه */
const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']

export async function POST(req: NextRequest, context: { params: Promise<{ evidenceId: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { evidenceId } = await context.params

  let body: any = {}
  try { body = await req.json() } catch { /* جسمٌ فارغ */ }
  const action      = body?.action
  const reasonCode  = typeof body?.reasonCode === 'string' ? body.reasonCode.trim() : ''
  const note        = typeof body?.note === 'string' ? body.note.trim() : ''
  const ownerTeamId = typeof body?.ownerTeamId === 'string' ? body.ownerTeamId : null
  /* وسم الدوام يختاره المقيّم عند القبول — والافتراض «دليل فترة» (3.5) */
  const permanence  = body?.permanence === 'permanent' ? 'permanent' : 'period'
  const lastReviewed = typeof body?.lastReviewedAt === 'string' && body.lastReviewedAt
    ? body.lastReviewedAt : null

  if (action !== 'accept' && action !== 'reject') {
    return NextResponse.json({ error: 'إجراءٌ غير معروف' }, { status: 400 })
  }

  const admin = createAdminClient()

  /* المدرسة الفعّالة والصلاحية */
  const { data: me } = await admin.from('profiles')
    .select('school_id, active_school_id, is_super_admin, role').eq('id', auth.user.id).single()
  if (!me) return NextResponse.json({ error: 'الملفّ الشخصي غير موجود' }, { status: 403 })
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  if (!schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })

  const { data: roleRow } = await admin.from('roles').select('permissions').eq('code', me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleRow?.permissions) ? roleRow!.permissions : []
  const can = (p: string) => me.is_super_admin || perms.includes('all') || perms.includes(p)
  /* القبول يلزمه accept_evidence؛ والرفض يكفيه triage_evidence (074) */
  if (!can(action === 'accept' ? 'accept_evidence' : 'triage_evidence')) {
    return NextResponse.json({ error: 'لا تملك صلاحية فرز الأدلة' }, { status: 403 })
  }

  /* الدليل من مدرستك وغير محذوف */
  const { data: ev } = await admin.from('evidence')
    .select('id, name, school_id, status, uploaded_by, academic_year, code, deleted_at, owner_team_id, request_id')
    .eq('id', evidenceId).maybeSingle()
  if (!ev || ev.deleted_at) return NextResponse.json({ error: 'الدليل غير موجود' }, { status: 404 })
  if (ev.school_id !== schoolId) {
    return NextResponse.json({ error: 'الدليل خارج نطاق مدرستك' }, { status: 403 })
  }

  /* ── الملكيّة: الحكم لعضو الفريق المالك (3.2) ──
     «مالكٌ واحد — فريق المعيار الرئيس للمرساة التي دخل بها، **وهو وحده
      يقبل أو يرفض**… وكل فريق يبقى سيّد تغطيته». وعلّته منصوصة: أن
     يقبله فريقٌ ويُسنده إلى مؤشرات فريقٍ آخر، فتُحتسب في تغطية الثاني
     أدلّةٌ لم يفحصها، ثم يكتب سرد فصله على تغطيةٍ لا يثق بها (6.3).
     ومن خارج الفريق يمرّ **تجاوزاً صريحاً يُسجَّل باسمه** — فالمسؤولية
     الإدارية قائمة، لكنّ الفعل يُنسب ولا يُخفى. */
  let override = false
  if (ev.owner_team_id) {
    const { data: member } = await admin.from('focus_team_members')
      .select('profile_id').eq('team_id', ev.owner_team_id).eq('profile_id', auth.user.id).maybeSingle()
    if (!member) {
      const canOverride = me.is_super_admin || perms.includes('all') || ADMIN_ROLES.includes(me.role)
      if (!canOverride) {
        const { data: team } = await admin.from('focus_teams')
          .select('name_ar').eq('id', ev.owner_team_id).maybeSingle()
        return NextResponse.json(
          { error: `هذا الدليل لفريق «${team?.name_ar || '—'}» — والحكم لعضوٍ منه` }, { status: 403 })
      }
      override = true
    }
  }

  /* ── مانع 1: لا يَقبل الدليلَ من رفعه ── */
  if (action === 'accept' && ev.uploaded_by === auth.user.id) {
    return NextResponse.json(
      { error: 'لا تقبل دليلاً رفعتَه بنفسك — القبول لعضوٍ آخر من فريق التركيز' }, { status: 403 })
  }

  if (action === 'accept') {
    /* ── مانع 2: لا قبول بلا مرساة ── */
    const { count: anchors } = await admin.from('evidence_anchors')
      .select('id', { count: 'exact', head: true }).eq('evidence_id', evidenceId)
    if (!anchors) {
      return NextResponse.json(
        { error: 'لا يُقبل دليلٌ بلا مرساة — حدِّد المعيار الذي يغطّيه أولاً' }, { status: 409 })
    }
    /* ── مانع 3: ولا بلا عامٍ منسوب ── */
    if (!ev.academic_year || !/^\d{4}-\d{4}$/.test(ev.academic_year)) {
      return NextResponse.json(
        { error: 'لا يُقبل دليلٌ بلا عامٍ منسوب — صحّح العام أولاً' }, { status: 409 })
    }
  } else {
    /* الرفض بسببٍ من القائمة المغلقة — ليمكن تحليله (3.2) */
    if (!reasonCode) return NextResponse.json({ error: 'سبب الرفض مطلوب' }, { status: 400 })
    const { data: reason } = await admin.from('dropdown_options')
      .select('value').eq('category', 'evidence_reject_reason').eq('value', reasonCode).maybeSingle()
    if (!reason) return NextResponse.json({ error: 'سبب الرفض ليس من القائمة المعتمدة' }, { status: 400 })
    if (reasonCode === REJECT_WITH_NOTE && !note) {
      return NextResponse.json({ error: 'سبب «أخرى» يلزمه شرحٌ مكتوب' }, { status: 400 })
    }
  }

  const now = new Date().toISOString()
  const today = now.slice(0, 10)
  const patch: Record<string, any> = {
    status:      action === 'accept' ? 'accepted' : 'rejected',
    reviewed_by: auth.user.id,
    /* ختمُ سجلّ الدليل: الفاعل يُنسب ولا يُفترض (9.3 · ترحيل 091) */
    changed_by:  auth.user.id,
    reviewed_at: now,
    last_reviewed_at: now,
    review_note:        action === 'reject' ? (note || null) : null,
    reject_reason_code: action === 'reject' ? reasonCode : null,
  }
  /* الفرز قد يُصحّح الفريق المالك قبل الحكم (3.2) */
  if (ownerTeamId) patch.owner_team_id = ownerTeamId

  /* ── وسم الدوام عند القبول (3.5) ──
     «الوسم قرار المقيّم عند القبول لا اختيار الرافع — فهو من يعرف أيّ
      شيء يشهد له الدليل. والافتراض «دليل فترة»، لأن الدوام دعوى
      تُراجَع لا أصلٌ يُفترَض.» وللدائمة تاريخ آخر مراجعة، فسياسةٌ
     عمرها ثماني سنوات «سارية» شكلاً وميّتة فعلاً. */
  if (action === 'accept') {
    patch.permanence = permanence
    patch.last_reviewed_at = permanence === 'permanent' ? (lastReviewed || today) : null
  }

  const { data: updated, error } = await admin.from('evidence')
    .update(patch).eq('id', evidenceId).select('id, status, code').maybeSingle()

  /* رفض القاعدة يُعرَض ولا يُبتلَع — حرّاس 084 يتكلّمون بالعربية */
  if (error) return NextResponse.json({ error: error.message }, { status: 409 })
  if (!updated) return NextResponse.json({ error: 'لم يُحدَّث أيّ صفّ' }, { status: 500 })

  await recordAudit({
    req, userId: auth.user.id, schoolId,
    action: action === 'accept' ? 'evidence_accepted' : 'evidence_rejected',
    table: 'evidence', recordId: evidenceId,
    after: action === 'accept'
      ? { status: 'accepted', code: updated.code, permanence,
          ...(permanence === 'permanent' ? { last_reviewed_at: lastReviewed || today } : {}),
          ...(override ? { override: 'من خارج الفريق المالك' } : {}) }
      : { status: 'rejected', reason: reasonCode, ...(note ? { note } : {}), ...(override ? { override: 'من خارج الفريق المالك' } : {}) },
  })

  /* ════════════════════════════════════════════════════════════
     طلبُ الدليل الموجَّه: يُغلق بالقبول — **إن سُدّت فجوته** (3.1)
     ════════════════════════════════════════════════════════════
     والنصّ يفرّق بين حالتين «يخلطهما النظام الساذج»:

     «قد يرفع الموظّف ملفّاً سليماً يشهد لمؤشّر غير الذي طُلب. فللمقيّم
      أن يصحّح المرساة… فيدخل الدليل المخزن بمرساته الصحيحة، **ويبقى
      الطلب الأصلي مفتوحاً لأن فجوته لم تُسدّ بعد**… ملفّ خاطئ يُرفض،
      وملفّ صحيح في غير موضعه يُقبل ويُحفظ — ولا يُهدر عملٌ صحيح لأن
      طالبه أخطأ في التوجيه.»

     فالإغلاق لا يتبع القبول وحده، بل القبول **مع بقاء مرساة الطلب**.
     ولولا هذا الفحص لأغلقنا فجوةً بدليلٍ قُبل في معيارٍ آخر — وهي
     «فجوةٌ مستورة»، وهي أسوأ ما تحذّر منه الوثيقة في هذا الباب.

     والرفض لا يُعالَج هنا: مُشغِّل 090 يُعيد الطلب مفتوحاً من القاعدة
     نفسها، فيلحق كلَّ مسارٍ يرفض لا هذا المنفذ وحده. */
  let requestOutcome: 'closed' | 'diverted' | null = null
  if (ev.request_id) {
    const { data: rq } = await admin.from('evidence_requests')
      .select('id, status, sub_node_id, indicator_ids, requested_by, what_is_asked')
      .eq('id', ev.request_id).maybeSingle()

    if (rq && action === 'accept') {
      const { data: anchorRows } = await admin.from('evidence_anchors')
        .select('framework_node_id, kind, confirm_status').eq('evidence_id', evidenceId)
      const live = (anchorRows || []).filter((a: any) => a.confirm_status === 'confirmed')
      const onSub = live.find((a: any) => a.framework_node_id === rq.sub_node_id)
      const wanted: string[] = rq.indicator_ids || []
      /* مرساةٌ ضمنية على المعيار الفرعي «تغطّيه كاملاً» فتسدّ أيّ مؤشّر فيه (3.3) */
      const satisfied = wanted.length
        ? (onSub?.kind === 'implicit'
           || live.some((a: any) => wanted.includes(a.framework_node_id)))
        : !!onSub

      if (satisfied) {
        const { error: closeErr } = await admin.from('evidence_requests')
          .update({ status: 'closed', evidence_id: evidenceId, diverted_note: null })
          .eq('id', rq.id)
        if (!closeErr) requestOutcome = 'closed'
      } else {
        /* الدليل يُحفظ والطلب يبقى مفتوحاً — ويُقال للطالب لماذا */
        await admin.from('evidence_requests').update({
          status: 'open',
          diverted_note: `قُبل الدليل «${ev.name}» بمرساةٍ غير المطلوبة — فالفجوة ما تزال قائمة.`,
          updated_at: now,
        }).eq('id', rq.id)
        requestOutcome = 'diverted'
      }

      /* والطالب يُبلَّغ بأيّ النتيجتين — فهو من يعدّ الفجوات */
      if (rq.requested_by && rq.requested_by !== auth.user.id) {
        const { data: pref } = await admin.from('profiles')
          .select('notif_enabled, notif_inapp').eq('id', rq.requested_by).maybeSingle()
        if (pref?.notif_enabled !== false && pref?.notif_inapp !== false) {
          await admin.from('notifications').insert({
            recipient_id: rq.requested_by,
            sender_id:    auth.user.id,
            type:         'evidence_request',
            title: requestOutcome === 'closed'
              ? `سُدّت فجوة: ${rq.what_is_asked}`
              : `دليلٌ قُبل في غير موضع طلبك: ${ev.name}`,
            body: requestOutcome === 'closed'
              ? `أُغلق الطلب بقبول «${ev.name}» — هويّته ${updated.code || '—'}.`
              : 'الدليل سليمٌ ودخل المخزن بمرساته الصحيحة، والطلب باقٍ مفتوحاً لأن فجوته لم تُسدّ بعد (3.1).',
            link: '/dashboard/evidence/requests',
            is_read: false, send_email: false,
          })
        }
      }
    }
  }

  /* ── الحكم يصل صاحبه ──
     كان يُسجَّل في سجلّ التدقيق ولا يبلغ الرافع، فيصير الرفض طريقاً
     مسدوداً صامتاً. والمنفذ القديم يُشعر المكلَّف بالمهمّة — ودليل
     القناة المباشرة بلا مهمّة، فتخرج قائمته فارغة.
     والمبدأ من 3.1: «رُفض الدليل → يعود إلى المكلَّف **ومعه سبب
     الرفض**» — فالسبب المصنَّف يُحلَّل **ويصل**.
     ولا يُشعَر من حكم بنفسه، وتُحترم تفضيلات المستقبِل. */
  const recipient = ev.uploaded_by
  if (recipient && recipient !== auth.user.id) {
    const { data: pref } = await admin.from('profiles')
      .select('notif_enabled, notif_inapp').eq('id', recipient).maybeSingle()
    if (pref?.notif_enabled !== false && pref?.notif_inapp !== false) {
      await admin.from('notifications').insert({
        recipient_id: recipient,
        sender_id:    auth.user.id,
        type:         'evidence_status',
        title: action === 'accept'
          ? `قُبل دليلك: ${ev.name}`
          : `رُفض دليلك: ${ev.name}`,
        body: action === 'accept'
          ? `هويّته الثابتة ${updated.code || '—'} — ودخل مخزن الأدلة واحتُسب في التغطية.`
            + (permanence === 'permanent' ? ' ووُسم وثيقةً دائمة.' : '')
          : `السبب: ${reasonCode}${note ? ` — ${note}` : ''}`
            + (ev.request_id ? ' · وعاد الطلب مفتوحاً في «أدلة مطلوبة».' : ''),
        link: '/dashboard/evidence',
        is_read: false, send_email: false,
      })
    }
  }

  return NextResponse.json({
    ok: true, status: updated.status, code: updated.code,
    ...(requestOutcome ? { request: requestOutcome } : {}),
  })
}

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
    .select('id, name, school_id, status, uploaded_by, academic_year, code, deleted_at')
    .eq('id', evidenceId).maybeSingle()
  if (!ev || ev.deleted_at) return NextResponse.json({ error: 'الدليل غير موجود' }, { status: 404 })
  if (ev.school_id !== schoolId) {
    return NextResponse.json({ error: 'الدليل خارج نطاق مدرستك' }, { status: 403 })
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
  const patch: Record<string, any> = {
    status:      action === 'accept' ? 'accepted' : 'rejected',
    reviewed_by: auth.user.id,
    reviewed_at: now,
    last_reviewed_at: now,
    review_note:        action === 'reject' ? (note || null) : null,
    reject_reason_code: action === 'reject' ? reasonCode : null,
  }
  /* الفرز قد يُصحّح الفريق المالك قبل الحكم (3.2) */
  if (ownerTeamId) patch.owner_team_id = ownerTeamId

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
      ? { status: 'accepted', code: updated.code }
      : { status: 'rejected', reason: reasonCode, ...(note ? { note } : {}) },
  })

  return NextResponse.json({ ok: true, status: updated.status, code: updated.code })
}

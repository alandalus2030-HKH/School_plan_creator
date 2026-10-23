import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAudit } from '@/lib/audit'

/**
 * تغيير حالة الدليل (uploaded | approved | rejected)
 * الحراسة: manage_tasks / rate_tasks / مشرف + عزل المدرسة الفعّالة.
 */

const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']
const VALID = ['pending', 'accepted', 'rejected']

async function getContext(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles').select('school_id, active_school_id, is_super_admin, role, department').eq('id', userId).single()
  if (!me) return null
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  return { admin, me, schoolId }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ evidenceId: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { evidenceId } = await context.params
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })

  const { admin, me, schoolId } = ctx
  const { data: roleData } = await admin.from('roles').select('permissions').eq('code', me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleData?.permissions) ? roleData!.permissions : []
  const canReview = me.is_super_admin || ADMIN_ROLES.includes(me.role)
    || perms.includes('all') || perms.includes('review_evidence')
  if (!canReview) return NextResponse.json({ error: 'لا تملك صلاحية مراجعة الأدلة' }, { status: 403 })

  const { status, note, reason, taskAction } = await req.json()
  if (!VALID.includes(status)) return NextResponse.json({ error: 'حالة غير صالحة' }, { status: 400 })

  /* ── النطاق المدرسيّ من **الدليل نفسه** لا من خطّته ──
     كان يُستنتج عبر السلسلة (الدليل → المهمة → العقدة → الخطة)، ودليل
     القناة المباشرة بلا مهمّة (3.1: «رفع مباشر — موظّف مخوَّل يرفع من
     المخزن») — فتنقطع السلسلة عند أوّل حلقة ويُحكَم عليه بأنه «خارج
     مدرستك» وهو فيها. ولهذا أُنشئ `evidence.school_id` في 073: ليملك
     الدليلُ مدرستَه بنفسه. وسلسلة المهمّة تبقى لما يخصّ المهمّة وحدها. */
  const { data: ev } = await admin.from('evidence')
    .select('id, name, task_id, school_id, uploaded_by, status, owner_team_id, code').eq('id', evidenceId).maybeSingle()
  if (!ev) return NextResponse.json({ error: 'الدليل غير موجود' }, { status: 404 })
  if (ev.school_id !== schoolId) {
    return NextResponse.json({ error: 'الدليل خارج نطاق مدرستك' }, { status: 403 })
  }

  /* سياق المهمّة — إن كان الدليل من خطة. ويبقى `p` فارغاً في القناة المباشرة. */
  const { data: t } = ev.task_id
    ? await admin.from('tasks').select('node_id, name_ar, status, assigned_to_user_id, assigned_to_team_id, assigned_to_department').eq('id', ev.task_id).maybeSingle()
    : { data: null }
  const { data: n } = t?.node_id ? await admin.from('plan_nodes').select('plan_id').eq('id', t.node_id).maybeSingle() : { data: null }
  const { data: p } = n?.plan_id ? await admin.from('plans').select('school_id, owner_id, department').eq('id', n.plan_id).maybeSingle() : { data: null }

  /* ولا يَقبل الدليلَ من رفعه — في القنوات كلّها (3.2). والحارس القديم
     أدناه مبنيّ على المكلَّف بالمهمّة، فدليل القناة المباشرة كان يفلت منه. */
  if (status === 'accepted' && ev.uploaded_by === auth.user.id) {
    return NextResponse.json(
      { error: 'لا تقبل دليلاً رفعتَه بنفسك — القبول لعضوٍ آخر من فريق التركيز' }, { status: 403 })
  }

  /* حصر مراجعة رؤساء الأقسام بأدلة قسمهم فقط — النطاق المدرسي يبقى
     لمدير المدرسة/نائبه/منسّق الجودة/المشرف. (تشديد حوكمي: لا تدخّل قسم في آخر) */
  const DEPT_SCOPED_REVIEW_ROLES = ['department_head']
  if (!me.is_super_admin && DEPT_SCOPED_REVIEW_ROLES.includes(me.role)) {
    const planDept = (p as any)?.department || null
    /* ودليلٌ بلا خطة لا قسم له يُقاس عليه — فرزه بفريق التركيز لا بالقسم (3.2) */
    if (!p) {
      return NextResponse.json(
        { error: 'هذا دليلٌ بلا خطة — فرزه من طابور فريق التركيز' }, { status: 403 })
    }
    if (!me.department || planDept !== me.department) {
      return NextResponse.json({ error: 'يمكنك مراجعة أدلة قسمك فقط' }, { status: 403 })
    }
  }

  /* منع التقييم الذاتي: لا يراجع المكلَّف دليلاً على مهمته (مباشر / قسمه / فريقه) */
  let isAssignee = t?.assigned_to_user_id === auth.user.id
  if (!isAssignee && t?.assigned_to_department && me.department) {
    isAssignee = me.department === t.assigned_to_department
  }
  if (!isAssignee && t?.assigned_to_team_id) {
    const { data: tm } = await admin.from('team_members')
      .select('id').eq('team_id', t.assigned_to_team_id).eq('profile_id', auth.user.id).maybeSingle()
    isAssignee = !!tm
  }
  if (isAssignee) {
    return NextResponse.json({ error: 'لا يمكنك مراجعة دليل على مهمة أنت مكلَّف بها — المراجعة للمقيّم فقط' }, { status: 403 })
  }

  /* ── إعادة الفتح: حكمٌ يُنقض، فله شروط الحكم ──
     (3.3) «بعد القبول: تعديل مسموح **ويُسجَّل**: من · متى · **لماذا**».
     فالسبب إلزاميّ عند نقض حكمٍ قائم (مقبول أو مرفوض)، ويُسجَّل في
     سجلّ التدقيق ويصل الرافع. */
  const undoing = status === 'pending' && (ev.status === 'accepted' || ev.status === 'rejected')
  if (undoing && !String(reason || '').trim()) {
    return NextResponse.json(
      { error: 'سبب إعادة الفتح مطلوب — الحكم يُنقض بسببٍ مكتوب (3.3)' }, { status: 400 })
  }

  /* ── الملكيّة: نقض الحكم لعضو الفريق المالك، ومن سواه تجاوزٌ يُسجَّل (3.2) ── */
  let override = false
  if (undoing && ev.owner_team_id) {
    const { data: member } = await admin.from('focus_team_members')
      .select('profile_id').eq('team_id', ev.owner_team_id).eq('profile_id', auth.user.id).maybeSingle()
    if (!member) {
      const canOverride = me.is_super_admin || perms.includes('all') || ADMIN_ROLES.includes(me.role)
      if (!canOverride) {
        const { data: team } = await admin.from('focus_teams')
          .select('name_ar').eq('id', ev.owner_team_id).maybeSingle()
        return NextResponse.json(
          { error: `هذا الدليل لفريق «${team?.name_ar || '—'}» — ونقض حكمه لعضوٍ منه` }, { status: 403 })
      }
      override = true
    }
  }

  /* ── تبعية الحكم: الدليل سندٌ لشيءٍ مُقفَل ──
     اليوم: مهمّة منجزة. وغداً: دورة مهمّة دورية موثّقة · وحكمُ فريقٍ في
     صفّ سلم (6.3). فالصيغة عامّة لئلّا يتسرّب الخلل إلى ما يُبنى لاحقاً.
     ولم يعد منعاً: المهمّة أُنجزت لأن دليلها قُبل، فنقضُ القبول يُفرغ
     سندها — **فيُنبَّه ويُطلب قرارٌ صريح**، ولا يُمنع التصحيح.
     ويبقى **منعاً واحداً**: الخطة المجمّدة — فالتجميد فعلٌ مقصود من
     المدرسة له حارسه في القاعدة (053)، لا أثرٌ جانبيّ. */
  if (undoing && t?.status === 'completed') {
    if (taskAction !== 'return' && taskAction !== 'keep') {
      return NextResponse.json({
        error: 'هذه المهمّة منجزة وسندها هذا الدليل — اختر: إعادتها إلى التقييم معه، أو إبقاؤها',
        needsTaskDecision: true,
        taskName: t?.name_ar || null,
      }, { status: 409 })
    }
    if (taskAction === 'return') {
      await admin.from('tasks').update({ status: 'submitted', updated_by: auth.user.id }).eq('id', ev.task_id)
    }
  }

  const { error } = await admin.from('evidence').update({
    status,
    /* ختمُ سجلّ الدليل (9.3 · 091): الفاعل، ومعه سبب النقض المكتوب —
       فكان السبب يُسجَّل في سجلّ التدقيق وحده، وسجلّ الدليل أحقُّ به. */
    changed_by:    auth.user.id,
    change_reason: undoing ? String(reason).trim() : (note?.trim() || null),
    /* سبب الرفض يُحفظ كإرشاد لصاحب المهمة؛ يُمسح عند الاعتماد أو إلغاء الرفض يدوياً */
    review_note: status === 'rejected' ? (note?.trim() || null) : null,
    reviewed_by: status === 'pending' ? null : auth.user.id,
    reviewed_at: status === 'pending' ? null : new Date().toISOString(),
  }).eq('id', evidenceId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recordAudit({
    req, userId: auth.user.id, schoolId,
    action: status === 'accepted' ? 'evidence_accepted' : status === 'rejected' ? 'evidence_rejected' : 'evidence_reset',
    table: 'evidence', recordId: evidenceId,
    after: {
      status,
      ...(note?.trim() ? { note: note.trim() } : {}),
      ...(undoing ? { reason: String(reason).trim(), was: ev.status, code: ev.code || null } : {}),
      ...(undoing && t?.status === 'completed' ? { task: taskAction === 'return' ? 'أُعيدت إلى التقييم' : 'أُبقيت منجزة' } : {}),
      ...(override ? { override: 'من خارج الفريق المالك' } : {}),
    },
  })

  /* ── نقضُ الحكم يصل صاحبه ──
     الرافع عرف بالقبول أو الرفض (إشعار /review)، فيُعلَم بنقضه كذلك
     وإلّا رأى دليله يتنقّل بين الحالات بلا خبر. */
  if (undoing && ev.uploaded_by && ev.uploaded_by !== auth.user.id) {
    const { data: pref } = await admin.from('profiles')
      .select('notif_enabled, notif_inapp').eq('id', ev.uploaded_by).maybeSingle()
    if (pref?.notif_enabled !== false && pref?.notif_inapp !== false) {
      await admin.from('notifications').insert({
        recipient_id: ev.uploaded_by, sender_id: auth.user.id, type: 'evidence_status',
        title: `أُعيد فتح دليلك: ${ev.name}`,
        body: `عاد إلى طابور الفرز — السبب: ${String(reason).trim()}`,
        link: '/dashboard/evidence', is_read: false, send_email: false,
      })
    }
  }

  /* إشعارات الرفض (مع سبب اختياري) — تشمل المكلَّف الفردي أو أعضاء القسم + صاحب الخطة */
  if (status === 'rejected') {
    const sender = auth.user.id
    const detail = `الدليل: ${ev.name}${note?.trim() ? ` — السبب: ${note.trim()}` : ''}`
    const recipients = new Set<string>()

    /* مستقبِلو الرفض: المكلَّف الفردي، أو كل أعضاء القسم المُكلَّف */
    if (t?.assigned_to_user_id) {
      recipients.add(t.assigned_to_user_id)
    } else if (t?.assigned_to_department) {
      const { data: members } = await admin.from('profiles')
        .select('id').eq('department', t.assigned_to_department).eq('is_active', true)
      ;(members || []).forEach((m: any) => recipients.add(m.id))
    }
    /* صاحب الخطة أيضاً */
    const ownerId = (p as any)?.owner_id as string | null
    if (ownerId) recipients.add(ownerId)

    recipients.delete(sender)   // لا تُشعر من رفض

    if (recipients.size > 0) {
      const ids = [...recipients]
      const { data: prefs } = await admin.from('profiles')
        .select('id, notif_enabled, notif_inapp').in('id', ids)
      const allowed = new Set((prefs || [])
        .filter((p: any) => p.notif_enabled !== false && p.notif_inapp !== false).map((p: any) => p.id))
      const rows = ids.filter(id => allowed.has(id)).map(id => ({
        recipient_id: id, sender_id: sender, type: 'task_status_changed',
        title: `↩️ رُفض دليل على مهمة: ${t?.name_ar || ''}`,
        body: detail, link: `/dashboard/tasks/${ev.task_id}`, is_read: false, send_email: false,
      }))
      if (rows.length > 0) await admin.from('notifications').insert(rows)
    }
  }

  return NextResponse.json({ ok: true })
}

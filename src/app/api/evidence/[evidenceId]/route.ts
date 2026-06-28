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

  const { status, note } = await req.json()
  if (!VALID.includes(status)) return NextResponse.json({ error: 'حالة غير صالحة' }, { status: 400 })

  /* تأكيد أن الدليل ضمن مدرسة المستخدم (الدليل → المهمة → العقدة → الخطة) */
  const { data: ev } = await admin.from('evidence').select('id, name, task_id').eq('id', evidenceId).maybeSingle()
  if (!ev) return NextResponse.json({ error: 'الدليل غير موجود' }, { status: 404 })
  const { data: t } = await admin.from('tasks').select('node_id, name_ar, status, assigned_to_user_id, assigned_to_team_id, assigned_to_department').eq('id', ev.task_id).maybeSingle()
  const { data: n } = t?.node_id ? await admin.from('plan_nodes').select('plan_id').eq('id', t.node_id).maybeSingle() : { data: null }
  const { data: p } = n?.plan_id ? await admin.from('plans').select('school_id, owner_id, department').eq('id', n.plan_id).maybeSingle() : { data: null }
  if (!p || p.school_id !== schoolId) return NextResponse.json({ error: 'الدليل خارج نطاق مدرستك' }, { status: 403 })

  /* حصر مراجعة رؤساء الأقسام بأدلة قسمهم فقط — النطاق المدرسي يبقى
     لمدير المدرسة/نائبه/منسّق الجودة/المشرف. (تشديد حوكمي: لا تدخّل قسم في آخر) */
  const DEPT_SCOPED_REVIEW_ROLES = ['department_head']
  if (!me.is_super_admin && DEPT_SCOPED_REVIEW_ROLES.includes(me.role)) {
    const planDept = (p as any)?.department || null
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

  /* المهمة المنجزة مقفلة — لا تُغيَّر حالة أدلتها إلا بعد إعادة فتحها */
  if (t?.status === 'completed') {
    return NextResponse.json({ error: 'المهمة منجزة — أعد فتحها أولاً لتغيير حالة الأدلة' }, { status: 409 })
  }

  const { error } = await admin.from('evidence').update({
    status,
    /* سبب الرفض يُحفظ كإرشاد لصاحب المهمة؛ يُمسح عند الاعتماد أو إلغاء الرفض يدوياً */
    review_note: status === 'rejected' ? (note?.trim() || null) : null,
    reviewed_by: status === 'pending' ? null : auth.user.id,
    reviewed_at: status === 'pending' ? null : new Date().toISOString(),
  }).eq('id', evidenceId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recordAudit({
    req, userId: auth.user.id, schoolId,
    action: status === 'accepted' ? 'evidence_accepted' : status === 'rejected' ? 'evidence_rejected' : 'evidence_reset',
    table: 'evidence', recordId: evidenceId, after: { status, ...(note?.trim() ? { note: note.trim() } : {}) },
  })

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

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/tasks/[taskId]/comment-notify
 * يُرسل إشعار «تعليق جديد» لأصحاب العلاقة بالمهمة عند كتابة تعليق:
 *   المكلّف (فرد / أعضاء القسم / أعضاء الفريق) + المقيّم + صاحب الخطة،
 *   إضافةً للمذكورين بـ @ — عدا كاتب التعليق، ومع احترام تفضيلات الإشعارات.
 * إدراج التعليق نفسه يتم في العميل؛ هذا المسار للإشعارات فقط (توزيع خادمي صحيح).
 */
export async function POST(req: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { taskId } = await context.params
  const admin = createAdminClient()
  const userId = auth.user.id

  const body = await req.json().catch(() => ({}))
  const content: string = (body.content || '').toString().trim()
  if (!content) return NextResponse.json({ ok: true, notified: 0 })

  /* سياق المستخدم + المدرسة الفعّالة */
  const { data: me } = await admin.from('profiles')
    .select('school_id, active_school_id, is_super_admin, full_name_ar').eq('id', userId).single()
  if (!me) return NextResponse.json({ error: 'مستخدم غير موجود' }, { status: 403 })
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id

  /* المهمة */
  const { data: task } = await admin.from('tasks')
    .select('id, name_ar, node_id, assigned_to_user_id, assigned_to_team_id, assigned_to_department, reviewer_id, deleted_at')
    .eq('id', taskId).maybeSingle()
  if (!task || task.deleted_at) return NextResponse.json({ error: 'المهمة غير موجودة' }, { status: 404 })

  /* عزل المدرسة + صاحب الخطة */
  let ownerId: string | null = null
  if (task.node_id) {
    const { data: node } = await admin.from('plan_nodes').select('plan_id').eq('id', task.node_id).maybeSingle()
    if (node?.plan_id) {
      const { data: plan } = await admin.from('plans').select('school_id, owner_id').eq('id', node.plan_id).maybeSingle()
      if (plan && plan.school_id !== schoolId) return NextResponse.json({ error: 'المهمة خارج نطاق مدرستك' }, { status: 403 })
      ownerId = (plan as any)?.owner_id ?? null
    }
  }

  /* أصحاب العلاقة: المكلّف (فرد/قسم/فريق) + المقيّم + صاحب الخطة */
  const stakeholders = new Set<string>()
  if (task.assigned_to_user_id) {
    stakeholders.add(task.assigned_to_user_id)
  } else if (task.assigned_to_department) {
    const { data: members } = await admin.from('profiles').select('id')
      .eq('school_id', schoolId).eq('department', task.assigned_to_department).eq('is_active', true)
    ;(members || []).forEach((m: any) => stakeholders.add(m.id))
  } else if (task.assigned_to_team_id) {
    const { data: tm } = await admin.from('team_members').select('profile_id').eq('team_id', task.assigned_to_team_id)
    ;(tm || []).forEach((m: any) => stakeholders.add(m.profile_id))
  }
  if (task.reviewer_id) stakeholders.add(task.reviewer_id)
  if (ownerId) stakeholders.add(ownerId)

  /* المذكورون بـ @ (مطابقة الاسم) — لعنوان مخصّص */
  const { data: schoolProfiles } = await admin.from('profiles').select('id, full_name_ar').eq('school_id', schoolId)
  const mentionedIds = new Set<string>()
  for (const p of (schoolProfiles || [])) {
    if ((p as any).full_name_ar && content.includes(`@${(p as any).full_name_ar}`)) mentionedIds.add(p.id)
  }

  /* الدمج عدا الكاتب */
  const all = new Set<string>([...stakeholders, ...mentionedIds])
  all.delete(userId)
  if (all.size === 0) return NextResponse.json({ ok: true, notified: 0 })

  /* تفضيلات الإشعارات */
  const ids = [...all]
  const { data: prefs } = await admin.from('profiles').select('id, notif_enabled, notif_inapp').in('id', ids)
  const allowed = new Set((prefs || [])
    .filter((p: any) => p.notif_enabled !== false && p.notif_inapp !== false).map((p: any) => p.id))

  const snippet = content.length > 80 ? content.slice(0, 80) + '…' : content
  const author = me.full_name_ar || 'مستخدم'
  const rows = ids.filter(id => allowed.has(id)).map(id => ({
    recipient_id: id, sender_id: userId, type: 'task_comment',
    title: mentionedIds.has(id) ? `💬 ذكرك ${author} في تعليق` : `💬 علّق ${author} على مهمة: ${task.name_ar || ''}`,
    body: snippet, link: `/dashboard/tasks/${taskId}`, is_read: false, send_email: false,
  }))
  if (rows.length > 0) await admin.from('notifications').insert(rows)

  return NextResponse.json({ ok: true, notified: rows.length })
}

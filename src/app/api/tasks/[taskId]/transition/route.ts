import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/tasks/[taskId]/transition
 * انتقالات سير عمل المهمة:
 *   submit  → المكلّف يرفع المهمة للتقييم
 *   approve → المقيّم يعتمد (+ تقييم 1-5) → منجزة
 *   return  → المقيّم يعيد المهمة (+ سبب) → مُعادة للتعديل
 * يحترم العزل بالمدرسة + الأدوار + منع التقييم الذاتي + يسجّل التحوّل.
 */

async function getContext(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles').select('school_id, active_school_id, is_super_admin, role').eq('id', userId).single()
  if (!me) return null
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  return { admin, me, schoolId }
}

async function hasReviewPerm(admin: any, role: string, isSuper: boolean) {
  const { data: roleData } = await admin.from('roles').select('permissions').eq('code', role).maybeSingle()
  const perms: string[] = Array.isArray(roleData?.permissions) ? roleData!.permissions : []
  const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']
  return perms.includes('all') || perms.includes('rate_tasks') || ADMIN_ROLES.includes(role) || isSuper
}

async function notify(admin: any, recipientId: string | null, senderId: string, title: string, body: string | null, link: string) {
  if (!recipientId || recipientId === senderId) return
  const { data: p } = await admin.from('profiles').select('notif_enabled, notif_inapp').eq('id', recipientId).maybeSingle()
  if (p?.notif_enabled === false || p?.notif_inapp === false) return
  await admin.from('notifications').insert({
    recipient_id: recipientId, sender_id: senderId, type: 'task_status_changed',
    title, body, link, is_read: false, send_email: false,
  })
}

export async function POST(req: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { taskId } = await context.params
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin } = ctx
  const userId = auth.user.id

  const body = await req.json().catch(() => ({}))
  const action: string = body.action

  /* ── تحميل المهمة + التحقق من المدرسة ── */
  const { data: task } = await admin
    .from('tasks')
    .select('id, status, name_ar, node_id, assigned_to_user_id, assigned_to_team_id, reviewer_id, required_evidence_types, deleted_at')
    .eq('id', taskId).maybeSingle()
  if (!task || task.deleted_at) return NextResponse.json({ error: 'المهمة غير موجودة' }, { status: 404 })

  let taskSchool: string | null = null
  if (task.node_id) {
    const { data: node } = await admin.from('plan_nodes').select('plan_id').eq('id', task.node_id).maybeSingle()
    if (node?.plan_id) {
      const { data: plan } = await admin.from('plans').select('school_id').eq('id', node.plan_id).maybeSingle()
      taskSchool = plan?.school_id ?? null
    }
  }
  if (taskSchool && taskSchool !== ctx.schoolId) {
    return NextResponse.json({ error: 'المهمة خارج نطاق مدرستك' }, { status: 403 })
  }

  /* ── تحديد الأدوار ── */
  let isAssignee = task.assigned_to_user_id === userId
  if (!isAssignee && task.assigned_to_team_id) {
    const { data: tm } = await admin.from('team_members').select('id')
      .eq('team_id', task.assigned_to_team_id).eq('profile_id', userId).maybeSingle()
    isAssignee = !!tm
  }
  const canReview = (task.reviewer_id === userId) || await hasReviewPerm(admin, ctx.me.role, ctx.me.is_super_admin)

  const requiredTypes: string[] = Array.isArray(task.required_evidence_types) ? task.required_evidence_types : []

  /* ── أدلة المهمة (للبوابات) ── */
  const evidenceByType = async () => {
    const { data: ev } = await admin.from('evidence')
      .select('evidence_type, status').eq('task_id', taskId).is('deleted_at', null)
    return ev || []
  }

  const logAndRespond = async (to: string, fields: Record<string, any>, note: string | null, notifyTo: string | null, notifTitle: string, notifBody: string | null) => {
    await admin.from('tasks').update({ ...fields, status: to, updated_at: new Date().toISOString(), updated_by: userId }).eq('id', taskId)
    await admin.from('task_transitions').insert({ task_id: taskId, from_status: task.status, to_status: to, actor_id: userId, note })
    await notify(admin, notifyTo, userId, notifTitle, notifBody, `/dashboard/tasks/${taskId}`)
    return NextResponse.json({ ok: true, status: to })
  }

  /* ════ start (بدء العمل) ════ */
  if (action === 'start') {
    if (!isAssignee) return NextResponse.json({ error: 'بدء العمل متاح للمكلّف فقط' }, { status: 403 })
    if (!['not_started', 'returned'].includes(task.status)) {
      return NextResponse.json({ error: 'لا يمكن بدء العمل من حالتها الحالية' }, { status: 400 })
    }
    return logAndRespond('in_progress', { return_note: null }, null, null, '', null)
  }

  /* ════ submit ════ */
  if (action === 'submit') {
    if (!isAssignee) return NextResponse.json({ error: 'الرفع للتقييم متاح للمكلّف فقط' }, { status: 403 })
    if (!['not_started', 'in_progress', 'returned'].includes(task.status)) {
      return NextResponse.json({ error: 'لا يمكن رفع المهمة من حالتها الحالية' }, { status: 400 })
    }
    if (requiredTypes.length > 0) {
      const ev = await evidenceByType()
      const present = new Set(ev.map((e: any) => e.evidence_type))
      const missing = requiredTypes.filter(t => !present.has(t))
      if (missing.length) return NextResponse.json({ error: `يجب رفع أدلة الأنواع: ${missing.join('، ')}` }, { status: 400 })
    }
    return logAndRespond('submitted', { submitted_at: new Date().toISOString(), submitted_by: userId, return_note: null },
      null, task.reviewer_id, `مهمة بانتظار تقييمك: ${task.name_ar}`, null)
  }

  /* ════ approve ════ */
  if (action === 'approve') {
    if (!canReview) return NextResponse.json({ error: 'الاعتماد متاح للمقيّم فقط' }, { status: 403 })
    if (isAssignee) return NextResponse.json({ error: 'لا يمكنك تقييم مهمتك الخاصة' }, { status: 403 })
    if (task.status !== 'submitted') return NextResponse.json({ error: 'المهمة ليست مرفوعة للتقييم' }, { status: 400 })
    const rating = parseInt(body.rating, 10)
    if (!(rating >= 1 && rating <= 5)) return NextResponse.json({ error: 'التقييم مطلوب (1-5)' }, { status: 400 })
    if (requiredTypes.length > 0) {
      const ev = await evidenceByType()
      const accepted = new Set(ev.filter((e: any) => e.status === 'accepted').map((e: any) => e.evidence_type))
      const notAccepted = requiredTypes.filter(t => !accepted.has(t))
      if (notAccepted.length) return NextResponse.json({ error: `لا يمكن الاعتماد قبل قبول أدلة الأنواع: ${notAccepted.join('، ')}` }, { status: 400 })
    }
    return logAndRespond('completed',
      { rating, rating_note: body.note?.toString().trim() || null, rated_at: new Date().toISOString(), reviewer_id: task.reviewer_id || userId },
      body.note?.toString().trim() || null, task.assigned_to_user_id, `تم اعتماد مهمتك: ${task.name_ar}`, body.note?.toString().trim() || null)
  }

  /* ════ return ════ */
  if (action === 'return') {
    if (!canReview) return NextResponse.json({ error: 'الإعادة متاحة للمقيّم فقط' }, { status: 403 })
    if (isAssignee) return NextResponse.json({ error: 'لا يمكنك مراجعة مهمتك الخاصة' }, { status: 403 })
    if (task.status !== 'submitted') return NextResponse.json({ error: 'المهمة ليست مرفوعة للتقييم' }, { status: 400 })
    const note = body.note?.toString().trim()
    if (!note) return NextResponse.json({ error: 'سبب الإعادة مطلوب' }, { status: 400 })
    return logAndRespond('returned', { return_note: note }, note,
      task.assigned_to_user_id, `أُعيدت مهمتك للتعديل: ${task.name_ar}`, note)
  }

  return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 })
}

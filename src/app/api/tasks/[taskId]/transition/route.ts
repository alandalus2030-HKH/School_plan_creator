import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/tasks/[taskId]/transition
 * انتقالات سير عمل المهمة:
 *   submit         → المكلّف يرفع المهمة للتقييم
 *   approve        → المقيّم يعتمد (+ تقييم 1-5) → منجزة
 *   return         → المقيّم يعيد المهمة (+ سبب) → مُعادة للتعديل
 *   reopen         → صاحب manage_tasks يعيد فتح مهمة منجزة (+ سبب إلزامي)
 *   request_reopen → المكلّف/المقيّم يطلب إعادة الفتح (إشعار لمشرف نظام المدرسة)
 * يحترم العزل بالمدرسة + الأدوار + منع التقييم الذاتي + يسجّل التحوّل.
 * المهمة المنجزة مقفلة: لا انتقالات عليها إلا reopen/request_reopen.
 */

async function getContext(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles').select('school_id, active_school_id, is_super_admin, role').eq('id', userId).single()
  if (!me) return null
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  return { admin, me, schoolId }
}

const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']

async function hasReviewPerm(admin: any, role: string, isSuper: boolean) {
  const { data: roleData } = await admin.from('roles').select('permissions').eq('code', role).maybeSingle()
  const perms: string[] = Array.isArray(roleData?.permissions) ? roleData!.permissions : []
  return perms.includes('all') || perms.includes('rate_tasks') || ADMIN_ROLES.includes(role) || isSuper
}

async function hasManagePerm(admin: any, role: string, isSuper: boolean) {
  const { data: roleData } = await admin.from('roles').select('permissions').eq('code', role).maybeSingle()
  const perms: string[] = Array.isArray(roleData?.permissions) ? roleData!.permissions : []
  return perms.includes('all') || perms.includes('manage_tasks') || ADMIN_ROLES.includes(role) || isSuper
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
    .select('id, status, name_ar, node_id, assigned_to_user_id, assigned_to_team_id, assigned_to_department, reviewer_id, required_evidence_types, deleted_at')
    .eq('id', taskId).maybeSingle()
  if (!task || task.deleted_at) return NextResponse.json({ error: 'المهمة غير موجودة' }, { status: 404 })

  let taskSchool: string | null = null
  let planDept: string | null = null
  if (task.node_id) {
    const { data: node } = await admin.from('plan_nodes').select('plan_id').eq('id', task.node_id).maybeSingle()
    if (node?.plan_id) {
      const { data: plan } = await admin.from('plans').select('school_id, department').eq('id', node.plan_id).maybeSingle()
      taskSchool = plan?.school_id ?? null
      planDept = plan?.department ?? null
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
  if (!isAssignee && task.assigned_to_department) {
    /* مهمة مُكلَّف بها القسم كله → أي عضو في القسم منفّذ */
    const { data: prof } = await admin.from('profiles').select('department').eq('id', userId).maybeSingle()
    isAssignee = !!prof && prof.department === task.assigned_to_department
  }
  let canReview = (task.reviewer_id === userId) || await hasReviewPerm(admin, ctx.me.role, ctx.me.is_super_admin)
  /* رئيس القسم (مشرف قسم خطة المهمة) مقيّم افتراضي لمهام قسمه */
  if (!canReview && planDept) {
    const { data: sup } = await admin.from('department_supervisors').select('id')
      .eq('user_id', userId).eq('department', planDept).maybeSingle()
    canReview = !!sup
  }

  const requiredTypes: string[] = Array.isArray(task.required_evidence_types) ? task.required_evidence_types : []

  /* ── أدلة المهمة (للبوابات) ── */
  const evidenceByType = async () => {
    const { data: ev } = await admin.from('evidence')
      .select('evidence_type, status').eq('task_id', taskId).is('deleted_at', null)
    return ev || []
  }

  const logAndRespond = async (to: string, fields: Record<string, any>, note: string | null, notifyTo: string | null, notifTitle: string, notifBody: string | null) => {
    const { data: upRows, error: upErr } = await admin.from('tasks')
      .update({ ...fields, status: to, updated_at: new Date().toISOString(), updated_by: userId })
      .eq('id', taskId).select('id')
    if (upErr) return NextResponse.json({ error: 'فشل تحديث المهمة: ' + upErr.message }, { status: 500 })
    if (!upRows || upRows.length === 0) return NextResponse.json({ error: 'لم يُحدَّث أي صف (تحقّق من معرّف المهمة/الصلاحيات)' }, { status: 500 })
    const { error: trErr } = await admin.from('task_transitions')
      .insert({ task_id: taskId, from_status: task.status, to_status: to, actor_id: userId, note })
    if (trErr) console.error('[transition] log insert failed:', trErr.message)
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
    /* لا مقيّم معيّن → تصعيد لصاحب الخطة (المراجع/المصعّد الافتراضي) */
    let notifyTo = task.reviewer_id
    let notifTitle = `مهمة بانتظار تقييمك: ${task.name_ar}`
    if (!notifyTo && task.node_id) {
      const { data: node } = await admin.from('plan_nodes').select('plan_id').eq('id', task.node_id).maybeSingle()
      if (node?.plan_id) {
        const { data: plan } = await admin.from('plans').select('owner_id').eq('id', node.plan_id).maybeSingle()
        if (plan?.owner_id) { notifyTo = plan.owner_id; notifTitle = `مهمة مرفوعة بلا مقيّم في خطتك: ${task.name_ar}` }
      }
    }
    return logAndRespond('submitted', { submitted_at: new Date().toISOString(), submitted_by: userId, return_note: null },
      null, notifyTo, notifTitle, null)
  }

  /* ════ approve ════ */
  if (action === 'approve') {
    if (!canReview) return NextResponse.json({ error: 'الاعتماد متاح للمقيّم فقط' }, { status: 403 })
    if (isAssignee) return NextResponse.json({ error: 'لا يمكنك تقييم مهمتك الخاصة' }, { status: 403 })
    if (task.status !== 'submitted') return NextResponse.json({ error: 'المهمة ليست مرفوعة للتقييم' }, { status: 400 })
    const rating = parseInt(body.rating, 10)
    if (!(rating >= 1 && rating <= 5)) return NextResponse.json({ error: 'التقييم مطلوب (1-5)' }, { status: 400 })
    const ev = await evidenceByType()
    if (requiredTypes.length > 0) {
      const accepted = new Set(ev.filter((e: any) => e.status === 'accepted').map((e: any) => e.evidence_type))
      const notAccepted = requiredTypes.filter(t => !accepted.has(t))
      if (notAccepted.length) return NextResponse.json({ error: `لا يمكن الاعتماد قبل قبول أدلة الأنواع: ${notAccepted.join('، ')}` }, { status: 400 })
    }
    /* حجب الاعتماد إن كانت كل الأدلة مرفوضة ولا يوجد مقبول واحد */
    if (ev.length > 0 && ev.every((e: any) => e.status === 'rejected')) {
      return NextResponse.json({ error: 'لا يمكن اعتماد المهمة — جميع الأدلة مرفوضة. اقبل دليلاً أو أعِد المهمة للتعديل.' }, { status: 400 })
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

  /* ════ reopen (إعادة فتح مهمة منجزة — manage_tasks فقط، بسبب إلزامي) ════ */
  if (action === 'reopen') {
    if (!(await hasManagePerm(admin, ctx.me.role, ctx.me.is_super_admin))) {
      return NextResponse.json({ error: 'إعادة فتح المهمة متاحة لمن يملك صلاحية إدارة المهام فقط' }, { status: 403 })
    }
    if (task.status !== 'completed') {
      return NextResponse.json({ error: 'المهمة ليست منجزة — لا حاجة لإعادة الفتح' }, { status: 400 })
    }
    /* الطلب المعلّق — استعلام منفصل متسامح (قد لا يكون الترحيل 025 قد شُغّل بعد) */
    const { data: reqRow } = await admin.from('tasks')
      .select('reopen_requested_by, reopen_request_note').eq('id', taskId).maybeSingle()

    /* السبب: تعليق المشرف الاختياري + عبارة آلية من الطلب المعلّق إن وُجد —
       فيبقى سجل سير العمل موثِّقاً لسبب إعادة الفتح دائماً */
    const adminNote = body.note?.toString().trim() || null
    let autoNote: string | null = null
    if (reqRow?.reopen_requested_by) {
      const who = reqRow.reopen_requested_by === task.assigned_to_user_id ? 'المكلّف'
                : reqRow.reopen_requested_by === task.reviewer_id        ? 'المقيّم'
                : 'مقدّم الطلب'
      autoNote = `إعادة فتح بناءً على طلب ${who}${reqRow.reopen_request_note ? ` — سبب الطلب: ${reqRow.reopen_request_note}` : ''}`
    }
    const note = [adminNote, autoNote].filter(Boolean).join(' · ') || 'إعادة فتح بقرار إدارة المدرسة'

    /* التقييم السابق يبقى محفوظاً في سجل التحوّلات، ويُصفَّر من المهمة لإعادة دورة التقييم
       + مسح الطلب المعلّق (إن كانت أعمدته موجودة) */
    const clearReq = reqRow
      ? { reopen_requested_by: null, reopen_requested_at: null, reopen_request_note: null }
      : {}
    const res = await logAndRespond('in_progress',
      { rating: null, rating_note: null, rated_at: null, submitted_at: null, submitted_by: null, return_note: null, ...clearReq },
      note, task.assigned_to_user_id, `أُعيد فتح المهمة: ${task.name_ar}`, note)
    if (res.status === 200) {
      await notify(admin, task.reviewer_id, userId, `أُعيد فتح المهمة: ${task.name_ar}`, note, `/dashboard/tasks/${taskId}`)
    }
    return res
  }

  /* ════ request_reopen (طلب إعادة الفتح — إشعار لمشرفي نظام المدرسة، بلا تغيير حالة) ════ */
  if (action === 'request_reopen') {
    if (task.status !== 'completed') {
      return NextResponse.json({ error: 'المهمة ليست منجزة' }, { status: 400 })
    }
    if (!isAssignee && task.reviewer_id !== userId) {
      return NextResponse.json({ error: 'طلب إعادة الفتح متاح للمكلّف أو المقيّم فقط' }, { status: 403 })
    }
    const note = body.note?.toString().trim()
    if (!note) return NextResponse.json({ error: 'سبب طلب إعادة الفتح مطلوب' }, { status: 400 })

    /* تخزين الطلب على المهمة (آخر طلب يحل محل السابق) — لعرضه للمشرف وتوليد عبارة السجل.
       متسامح إن لم يُشغَّل الترحيل 025 بعد: يكمل بالإشعارات فقط */
    const { error: reqErr } = await admin.from('tasks').update({
      reopen_requested_by: userId,
      reopen_requested_at: new Date().toISOString(),
      reopen_request_note: note,
    }).eq('id', taskId)
    if (reqErr && !/reopen/i.test(reqErr.message)) {
      return NextResponse.json({ error: 'فشل تسجيل الطلب: ' + reqErr.message }, { status: 500 })
    }

    const { data: schoolAdmins } = await admin.from('profiles').select('id')
      .eq('school_id', ctx.schoolId).in('role', ADMIN_ROLES).eq('is_active', true)
    let recipients = (schoolAdmins || []).map((a: any) => a.id)
    if (recipients.length === 0) {
      /* احتياط: لا مدير مدرسة → إشعار مشرفي النظام */
      const { data: supers } = await admin.from('profiles').select('id')
        .eq('is_super_admin', true).eq('is_active', true)
      recipients = (supers || []).map((a: any) => a.id)
    }
    for (const rid of recipients) {
      await notify(admin, rid, userId, `طلب إعادة فتح مهمة منجزة: ${task.name_ar}`, note, `/dashboard/tasks/${taskId}`)
    }
    return NextResponse.json({ ok: true, requested: true })
  }

  return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 })
}

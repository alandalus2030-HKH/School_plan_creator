import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAudit } from '@/lib/audit'

/**
 * PATCH  /api/tasks/[taskId]  → تعديل/تكليف المهمة (لمن يملك manage_tasks)
 * DELETE /api/tasks/[taskId]  → حذف ناعم (لمن يملك manage_tasks أو منشئ المهمة)
 * حراسة خادمية للعمليات الإدارية (لا تكفي حراسة الواجهة وحدها).
 */

const EDITABLE = [
  'name_ar', 'name_en', 'description', 'task_type', 'priority',
  'start_date', 'end_date', 'assigned_to_user_id', 'assigned_to_team_id',
  'assigned_to_department',
  'reviewer_id', 'depends_on_task_id', 'budget_qar', 'other_resources',
  'evidence_required', 'required_evidence_types',
] as const

async function getContext(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles').select('school_id, active_school_id, is_super_admin, role').eq('id', userId).single()
  if (!me) return null
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  return { admin, me, schoolId }
}

async function canManageTasks(admin: any, role: string, isSuper: boolean) {
  const { data: roleData } = await admin.from('roles').select('permissions').eq('code', role).maybeSingle()
  const perms: string[] = Array.isArray(roleData?.permissions) ? roleData!.permissions : []
  const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']
  return perms.includes('all') || perms.includes('manage_tasks') || ADMIN_ROLES.includes(role) || isSuper
}

/** يرجع المهمة + مدرستها + حالة اعتماد خطتها، أو رد خطأ */
async function loadScoped(admin: any, taskId: string, schoolId: string) {
  const { data: task } = await admin
    .from('tasks').select('id, node_id, created_by, deleted_at, status').eq('id', taskId).maybeSingle()
  if (!task || task.deleted_at) return { error: NextResponse.json({ error: 'المهمة غير موجودة' }, { status: 404 }) }
  let taskSchool: string | null = null
  let planApproved = false
  if (task.node_id) {
    const { data: node } = await admin.from('plan_nodes').select('plan_id').eq('id', task.node_id).maybeSingle()
    if (node?.plan_id) {
      const { data: plan } = await admin.from('plans').select('school_id, approved_at').eq('id', node.plan_id).maybeSingle()
      taskSchool = plan?.school_id ?? null
      planApproved = !!plan?.approved_at
    }
  }
  if (taskSchool && taskSchool !== schoolId) {
    return { error: NextResponse.json({ error: 'المهمة خارج نطاق مدرستك' }, { status: 403 }) }
  }
  return { task, planApproved }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { taskId } = await context.params
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })

  if (!(await canManageTasks(ctx.admin, ctx.me.role, ctx.me.is_super_admin))) {
    return NextResponse.json({ error: 'لا تملك صلاحية إدارة المهام' }, { status: 403 })
  }
  const scoped = await loadScoped(ctx.admin, taskId, ctx.schoolId)
  if (scoped.error) return scoped.error

  /* المهمة المنجزة مقفلة — التعديل يتطلب إعادة فتحها أولاً (سجل اعتماد) */
  if (scoped.task!.status === 'completed') {
    return NextResponse.json({ error: 'المهمة منجزة ومقفلة — أعد فتحها أولاً من صفحة المهمة' }, { status: 403 })
  }

  const body = await req.json()
  const updates: Record<string, any> = { updated_by: auth.user.id, updated_at: new Date().toISOString() }
  for (const key of EDITABLE) {
    if (body[key] !== undefined) updates[key] = body[key] === '' ? null : body[key]
  }

  /* الحالة قبل التعديل (لسجل التدقيق) */
  const { data: before } = await ctx.admin.from('tasks').select(EDITABLE.join(', ')).eq('id', taskId).single()

  const { error } = await ctx.admin.from('tasks').update(updates).eq('id', taskId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  /* تدقيق: الحقول المتغيّرة فقط */
  const oldV: Record<string, any> = {}, newV: Record<string, any> = {}
  for (const k of EDITABLE) {
    if (updates[k] !== undefined && JSON.stringify((before as any)?.[k]) !== JSON.stringify(updates[k])) {
      oldV[k] = (before as any)?.[k] ?? null; newV[k] = updates[k]
    }
  }
  if (Object.keys(newV).length) {
    await recordAudit({ req, userId: auth.user.id, schoolId: ctx.schoolId, action: 'update', table: 'tasks', recordId: taskId, before: oldV, after: newV })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { taskId } = await context.params
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })

  const scoped = await loadScoped(ctx.admin, taskId, ctx.schoolId)
  if (scoped.error) return scoped.error

  /* خطة معتمدة → عناصرها محمية من الحذف (مصداقية سجل الاعتماد) */
  if (scoped.planApproved) {
    return NextResponse.json({ error: 'المهمة تابعة لخطة معتمدة — ألغِ اعتماد الخطة أولاً إن لزم الحذف' }, { status: 403 })
  }

  /* المهمة المنجزة مقفلة — الحذف يتطلب إعادة فتحها أولاً */
  if (scoped.task!.status === 'completed') {
    return NextResponse.json({ error: 'المهمة منجزة ومقفلة — أعد فتحها أولاً إن لزم الحذف' }, { status: 403 })
  }

  const isManager = await canManageTasks(ctx.admin, ctx.me.role, ctx.me.is_super_admin)
  const isCreator = scoped.task!.created_by === auth.user.id
  if (!isManager && !isCreator) {
    return NextResponse.json({ error: 'لا تملك صلاحية حذف هذه المهمة' }, { status: 403 })
  }

  const { data: tname } = await ctx.admin.from('tasks').select('name_ar, status').eq('id', taskId).single()

  const { error } = await ctx.admin.from('tasks')
    .update({ deleted_at: new Date().toISOString(), updated_by: auth.user.id }).eq('id', taskId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recordAudit({
    req, userId: auth.user.id, schoolId: ctx.schoolId,
    action: 'delete', table: 'tasks', recordId: taskId,
    before: { name_ar: (tname as any)?.name_ar ?? null, status: (tname as any)?.status ?? null },
  })
  return NextResponse.json({ ok: true })
}

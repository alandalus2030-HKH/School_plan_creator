import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * لوحة التجميع — خطط الأقسام مع مؤشرات مجمّعة
 * الوصول: صلاحية view_aggregate (أو all / مشرف نظام / school_admin / admin)
 * العزل:
 *   - مشرف النظام / school_admin / admin → كل أقسام المدرسة
 *   - غيرهم → الأقسام المُسندة في department_supervisors فقط
 */

const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']

async function getContext(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles').select('school_id, active_school_id, is_super_admin, role, department').eq('id', userId).single()
  if (!me) return null
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  return { admin, me, schoolId }
}

export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })

  const { admin, me, schoolId } = ctx

  /* الصلاحية */
  const { data: roleData } = await admin.from('roles').select('permissions').eq('code', me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleData?.permissions) ? roleData!.permissions : []
  const isAdmin = me.is_super_admin || ADMIN_ROLES.includes(me.role)
  const canView = isAdmin || perms.includes('all') || perms.includes('view_aggregate')
  if (!canView) return NextResponse.json({ error: 'لا تملك صلاحية عرض لوحة التجميع' }, { status: 403 })

  /* نطاق الأقسام المسموح بها:
     غير المشرف يرى قسمه (profile.department) + الأقسام المُسندة له في إشراف الأقسام */
  let allowedDepts: string[] | null = null   // null = كل الأقسام
  if (!isAdmin && !perms.includes('all')) {
    const { data: sup } = await admin.from('department_supervisors')
      .select('department').eq('school_id', schoolId).eq('user_id', auth.user.id)
    const depts = (sup || []).map((s: any) => s.department)
    if (me.department) depts.push(me.department)
    allowedDepts = [...new Set(depts)]
  }

  /* الخطط (غير المؤرشفة) */
  let planQ = admin.from('plans')
    .select('id, name_ar, department, plan_category, owner_id, approved_at, is_archived')
    .eq('school_id', schoolId)
  const { data: allPlans } = await planQ
  let plans = (allPlans || []).filter((p: any) => !p.is_archived)
  if (allowedDepts !== null) {
    const set = new Set(allowedDepts)
    /* العزل: أقسام المستخدم المُسندة/قسمه — أو الخطط التي يملكها (الملكية بُعد عزل) */
    plans = plans.filter((p: any) => (p.department && set.has(p.department)) || p.owner_id === auth.user.id)
  }

  if (plans.length === 0) {
    return NextResponse.json({ scope: allowedDepts, plans: [], owners: {} })
  }

  const planIds = plans.map((p: any) => p.id)

  /* العقد → ربط المهام بالخطط */
  const { data: nodes } = await admin.from('plan_nodes')
    .select('id, plan_id').in('plan_id', planIds)
  const nodeToPlan = new Map<string, string>()
  for (const n of nodes || []) nodeToPlan.set(n.id, n.plan_id)
  const nodeIds = (nodes || []).map((n: any) => n.id)

  /* المهام */
  const tasksByPlan: Record<string, any[]> = {}
  let taskIds: string[] = []
  const taskToPlan = new Map<string, string>()
  if (nodeIds.length > 0) {
    const { data: tasks } = await admin.from('tasks')
      .select('id, node_id, name_ar, status, end_date, rating')
      .in('node_id', nodeIds)
    for (const t of tasks || []) {
      const pid = nodeToPlan.get(t.node_id)
      if (!pid) continue
      ;(tasksByPlan[pid] ||= []).push(t)
      taskToPlan.set(t.id, pid)
      taskIds.push(t.id)
    }
  }

  /* عدد الأدلة لكل خطة */
  const evidenceByPlan: Record<string, number> = {}
  if (taskIds.length > 0) {
    const { data: evs } = await admin.from('evidence').select('task_id').in('task_id', taskIds)
    for (const e of evs || []) {
      const pid = taskToPlan.get(e.task_id)
      if (pid) evidenceByPlan[pid] = (evidenceByPlan[pid] || 0) + 1
    }
  }

  /* أصحاب الخطط */
  const ownerIds = [...new Set(plans.map((p: any) => p.owner_id).filter(Boolean))]
  const owners: Record<string, string> = {}
  if (ownerIds.length > 0) {
    const { data: profs } = await admin.from('profiles').select('id, name_ar').in('id', ownerIds)
    for (const p of profs || []) owners[p.id] = p.name_ar
  }

  const today = new Date().toISOString().slice(0, 10)

  /* مؤشرات كل خطة */
  const result = plans.map((p: any) => {
    const ts = tasksByPlan[p.id] || []
    const total = ts.length
    let completed = 0, inProgress = 0, notStarted = 0, overdue = 0
    let ratingSum = 0, ratingCount = 0
    const tasks: any[] = []
    for (const t of ts) {
      if (t.status === 'completed') completed++
      else if (t.status === 'in_progress') inProgress++
      else notStarted++
      const isOverdue = t.status !== 'completed' && !!t.end_date && t.end_date < today
      if (isOverdue) overdue++
      if (t.rating) { ratingSum += t.rating; ratingCount++ }
      tasks.push({ id: t.id, name_ar: t.name_ar, status: t.status, end_date: t.end_date, overdue: isOverdue })
    }
    return {
      id: p.id, name_ar: p.name_ar,
      department: p.department || null,
      plan_category: p.plan_category || null,
      owner_id: p.owner_id || null,
      owner_name: p.owner_id ? (owners[p.owner_id] || null) : null,
      approved_at: p.approved_at || null,
      tasks,
      metrics: {
        total, completed, inProgress, notStarted, overdue,
        progress: total > 0 ? Math.round((completed / total) * 100) : 0,
        avgRating: ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : null,
        evidence: evidenceByPlan[p.id] || 0,
      },
    }
  })

  return NextResponse.json({ scope: allowedDepts, plans: result, owners })
}

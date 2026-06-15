import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * بيانات التقارير الرسمية — نقطة موحّدة محميّة بصلاحية view_reports + عزل المدرسة الفعّالة.
 * ?type=plans-portfolio → محفظة الخطط ومؤشراتها.
 * (تُضاف أنواع أخرى تباعاً.)
 */

const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']

async function getContext(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles').select('school_id, active_school_id, is_super_admin, role').eq('id', userId).single()
  if (!me) return null
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  return { admin, me, schoolId }
}

async function canViewReports(admin: any, role: string, isSuper: boolean) {
  if (isSuper || ADMIN_ROLES.includes(role)) return true
  const { data: roleData } = await admin.from('roles').select('permissions').eq('code', role).maybeSingle()
  const perms: string[] = Array.isArray(roleData?.permissions) ? roleData!.permissions : []
  return perms.includes('all') || perms.includes('view_reports')
}

const today = () => new Date().toISOString().slice(0, 10)

/* ════ محفظة الخطط ════ */
async function plansPortfolio(admin: any, schoolId: string) {
  const { data: allPlans } = await admin.from('plans')
    .select('id, name_ar, department, plan_category, owner_id, approved_at, is_archived')
    .eq('school_id', schoolId)
  const plans = (allPlans || []).filter((p: any) => !p.is_archived)
  if (plans.length === 0) return { plans: [] }

  const planIds = plans.map((p: any) => p.id)
  const { data: nodes } = await admin.from('plan_nodes').select('id, plan_id').in('plan_id', planIds)
  const nodeToPlan = new Map<string, string>()
  for (const n of nodes || []) nodeToPlan.set(n.id, n.plan_id)
  const nodeIds = (nodes || []).map((n: any) => n.id)

  const tasksByPlan: Record<string, any[]> = {}
  const taskToPlan = new Map<string, string>()
  let taskIds: string[] = []
  if (nodeIds.length) {
    const { data: tasks } = await admin.from('tasks')
      .select('id, node_id, status, end_date, rating').in('node_id', nodeIds).is('deleted_at', null)
    for (const t of tasks || []) {
      const pid = nodeToPlan.get(t.node_id); if (!pid) continue
      ;(tasksByPlan[pid] ||= []).push(t); taskToPlan.set(t.id, pid); taskIds.push(t.id)
    }
  }

  const evByPlan: Record<string, number> = {}
  if (taskIds.length) {
    const { data: evs } = await admin.from('evidence').select('task_id').eq('status', 'accepted').in('task_id', taskIds)
    for (const e of evs || []) { const pid = taskToPlan.get(e.task_id); if (pid) evByPlan[pid] = (evByPlan[pid] || 0) + 1 }
  }

  const ownerIds = [...new Set(plans.map((p: any) => p.owner_id).filter(Boolean))]
  const owners: Record<string, string> = {}
  if (ownerIds.length) {
    const { data: profs } = await admin.from('profiles').select('id, name_ar').in('id', ownerIds)
    for (const p of profs || []) owners[p.id] = p.name_ar
  }

  const td = today()
  const rows = plans.map((p: any) => {
    const ts = tasksByPlan[p.id] || []
    let completed = 0, overdue = 0, ratingSum = 0, ratingCount = 0
    for (const t of ts) {
      if (t.status === 'completed') completed++
      if (t.status !== 'completed' && t.end_date && t.end_date < td) overdue++
      if (t.rating) { ratingSum += t.rating; ratingCount++ }
    }
    return {
      id: p.id, name_ar: p.name_ar, department: p.department || null,
      plan_category: p.plan_category || null,
      owner_name: p.owner_id ? (owners[p.owner_id] || null) : null,
      approved: !!p.approved_at,
      total: ts.length, completed, overdue,
      progress: ts.length ? Math.round((completed / ts.length) * 100) : 0,
      avgRating: ratingCount ? Math.round((ratingSum / ratingCount) * 10) / 10 : null,
      evidence: evByPlan[p.id] || 0,
    }
  }).sort((a: any, b: any) => (a.department || '').localeCompare(b.department || '', 'ar'))

  return { plans: rows }
}

/* مُحمِّل مشترك: مهام المدرسة (غير المحذوفة) مع ربط الخطة/القسم + ملفات الأعضاء */
async function loadSchoolTasks(admin: any, schoolId: string) {
  const { data: allPlans } = await admin.from('plans')
    .select('id, name_ar, department, is_archived').eq('school_id', schoolId)
  const plans = (allPlans || []).filter((p: any) => !p.is_archived)
  const planMeta = new Map<string, { name: string; dept: string | null }>()
  for (const p of plans) planMeta.set(p.id, { name: p.name_ar, dept: p.department || null })
  const planIds = plans.map((p: any) => p.id)

  const nodeToPlan = new Map<string, string>()
  if (planIds.length) {
    const { data: nodes } = await admin.from('plan_nodes').select('id, plan_id').in('plan_id', planIds)
    for (const n of nodes || []) nodeToPlan.set(n.id, n.plan_id)
  }
  const nodeIds = [...nodeToPlan.keys()]

  let tasks: any[] = []
  if (nodeIds.length) {
    const { data: t } = await admin.from('tasks')
      .select('id, name_ar, status, end_date, rating, assigned_to_user_id, assigned_to_department, node_id')
      .in('node_id', nodeIds).is('deleted_at', null)
    tasks = (t || []).map((x: any) => {
      const pid = nodeToPlan.get(x.node_id) || null
      const meta = pid ? planMeta.get(pid) : null
      return { ...x, planId: pid, planName: meta?.name || null, dept: meta?.dept || null }
    })
  }

  const { data: profiles } = await admin.from('profiles')
    .select('id, name_ar, department, job_title').eq('school_id', schoolId).eq('is_active', true)

  return { tasks, profiles: profiles || [] }
}

const STATUS_KEYS = ['not_started', 'in_progress', 'submitted', 'returned', 'completed']
const isOverdue = (t: any, td: string) => t.status !== 'completed' && !!t.end_date && t.end_date < td

/* ════ حالة المهام ════ */
async function taskStatus(admin: any, schoolId: string) {
  const { tasks } = await loadSchoolTasks(admin, schoolId)
  const td = today()
  const counts: Record<string, number> = {}
  for (const k of STATUS_KEYS) counts[k] = 0
  let overdue = 0
  const byDeptMap = new Map<string, { dept: string; total: number; completed: number; overdue: number }>()
  for (const t of tasks) {
    counts[t.status] = (counts[t.status] || 0) + 1
    if (isOverdue(t, td)) overdue++
    const dept = t.dept || 'غير مصنّفة'
    const g = byDeptMap.get(dept) || { dept, total: 0, completed: 0, overdue: 0 }
    g.total++; if (t.status === 'completed') g.completed++; if (isOverdue(t, td)) g.overdue++
    byDeptMap.set(dept, g)
  }
  const byDept = [...byDeptMap.values()]
    .map(g => ({ ...g, progress: g.total ? Math.round((g.completed / g.total) * 100) : 0 }))
    .sort((a, b) => a.dept.localeCompare(b.dept, 'ar'))
  return { total: tasks.length, counts, overdue, byDept }
}

/* ════ المهام المتأخرة ════ */
async function overdueReport(admin: any, schoolId: string) {
  const { tasks, profiles } = await loadSchoolTasks(admin, schoolId)
  const td = today()
  const pname = new Map<string, string>(profiles.map((p: any) => [p.id, p.name_ar]))
  const rows = tasks.filter((t: any) => isOverdue(t, td)).map((t: any) => ({
    id: t.id, name_ar: t.name_ar, status: t.status, end_date: t.end_date,
    plan: t.planName, dept: t.dept,
    assignee: t.assigned_to_user_id ? (pname.get(t.assigned_to_user_id) || null) : (t.assigned_to_department || null),
    daysLate: Math.max(0, Math.floor((new Date(td).getTime() - new Date(t.end_date).getTime()) / 86400000)),
  })).sort((a: any, b: any) => b.daysLate - a.daysLate)
  return { rows }
}

/* ════ أداء الموظفين + عبء العمل ════ */
async function staffStats(admin: any, schoolId: string) {
  const { tasks, profiles } = await loadSchoolTasks(admin, schoolId)
  const td = today()
  const stat = new Map<string, any>()
  for (const p of profiles) stat.set(p.id, {
    id: p.id, name_ar: p.name_ar, department: p.department || null, job_title: p.job_title || null,
    total: 0, active: 0, completed: 0, overdue: 0, ratingSum: 0, ratingCount: 0,
  })
  for (const t of tasks) {
    const s = t.assigned_to_user_id ? stat.get(t.assigned_to_user_id) : null
    if (!s) continue
    s.total++
    if (t.status === 'completed') s.completed++
    else s.active++
    if (isOverdue(t, td)) s.overdue++
    if (t.rating) { s.ratingSum += t.rating; s.ratingCount++ }
  }
  const rows = [...stat.values()].map(s => ({
    ...s,
    progress: s.total ? Math.round((s.completed / s.total) * 100) : 0,
    avgRating: s.ratingCount ? Math.round((s.ratingSum / s.ratingCount) * 10) / 10 : null,
  })).sort((a, b) => b.total - a.total)
  return { rows }
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, me, schoolId } = ctx

  if (!(await canViewReports(admin, me.role, me.is_super_admin)))
    return NextResponse.json({ error: 'لا تملك صلاحية عرض التقارير' }, { status: 403 })

  const type = req.nextUrl.searchParams.get('type')
  switch (type) {
    case 'plans-portfolio':    return NextResponse.json(await plansPortfolio(admin, schoolId))
    case 'task-status':        return NextResponse.json(await taskStatus(admin, schoolId))
    case 'overdue':            return NextResponse.json(await overdueReport(admin, schoolId))
    case 'staff-performance':  return NextResponse.json(await staffStats(admin, schoolId))
    case 'workload':           return NextResponse.json(await staffStats(admin, schoolId))
    default: return NextResponse.json({ error: 'نوع تقرير غير معروف' }, { status: 400 })
  }
}

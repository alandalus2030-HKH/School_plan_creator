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
    case 'plans-portfolio': return NextResponse.json(await plansPortfolio(admin, schoolId))
    default: return NextResponse.json({ error: 'نوع تقرير غير معروف' }, { status: 400 })
  }
}

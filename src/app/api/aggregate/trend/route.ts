import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * اتجاه لوحة التجميع عبر الزمن — من لقطات plan_metric_snapshots (تُلتقط أسبوعياً عبر pg_cron).
 * نفس نطاق /api/aggregate: view_aggregate + إشراف الأقسام + الخطط المملوكة.
 * يعيد صفوفاً مجمّعة لكل (تاريخ، قسم) ليُعيد العميل تجميعها حسب المرشّحات.
 */

const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']
const NO_DEPT = 'غير مصنّفة'

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

  const { data: roleData } = await admin.from('roles').select('permissions').eq('code', me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleData?.permissions) ? roleData!.permissions : []
  const isAdmin = me.is_super_admin || ADMIN_ROLES.includes(me.role)
  const canView = isAdmin || perms.includes('all') || perms.includes('view_aggregate')
  if (!canView) return NextResponse.json({ error: 'لا تملك صلاحية عرض لوحة التجميع' }, { status: 403 })

  /* نطاق الأقسام المسموح بها */
  let allowedDepts: string[] | null = null
  if (!isAdmin && !perms.includes('all')) {
    const { data: sup } = await admin.from('department_supervisors')
      .select('department').eq('school_id', schoolId).eq('user_id', auth.user.id)
    const depts = (sup || []).map((s: any) => s.department)
    if (me.department) depts.push(me.department)
    allowedDepts = [...new Set(depts)]
  }

  /* الخطط المرئية + قسم كل خطة */
  const { data: allPlans } = await admin.from('plans')
    .select('id, department, owner_id, is_archived').eq('school_id', schoolId)
  let plans = (allPlans || []).filter((p: any) => !p.is_archived)
  if (allowedDepts !== null) {
    const set = new Set(allowedDepts)
    plans = plans.filter((p: any) => (p.department && set.has(p.department)) || p.owner_id === auth.user.id)
  }
  if (plans.length === 0) return NextResponse.json({ points: [] })

  const planDept = new Map<string, string>()
  for (const p of plans) planDept.set(p.id, p.department || NO_DEPT)
  const planIds = plans.map((p: any) => p.id)

  /* اللقطات لتلك الخطط */
  const { data: snaps } = await admin.from('plan_metric_snapshots')
    .select('plan_id, captured_on, total, completed, overdue, rating_sum, rating_count, evidence_accepted')
    .in('plan_id', planIds)
    .order('captured_on', { ascending: true })

  /* تجميع لكل (تاريخ، قسم) */
  const key = (d: string, dept: string) => `${d}|||${dept}`
  const acc = new Map<string, any>()
  for (const s of snaps || []) {
    const dept = planDept.get(s.plan_id) || NO_DEPT
    const k = key(s.captured_on, dept)
    const cur = acc.get(k) || { captured_on: s.captured_on, department: dept, total: 0, completed: 0, overdue: 0, rating_sum: 0, rating_count: 0, evidence_accepted: 0 }
    cur.total += s.total; cur.completed += s.completed; cur.overdue += s.overdue
    cur.rating_sum += s.rating_sum; cur.rating_count += s.rating_count
    cur.evidence_accepted += s.evidence_accepted
    acc.set(k, cur)
  }

  const points = [...acc.values()].sort((a, b) =>
    a.captured_on < b.captured_on ? -1 : a.captured_on > b.captured_on ? 1 : a.department.localeCompare(b.department, 'ar'))

  return NextResponse.json({ points })
}

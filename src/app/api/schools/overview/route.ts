import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/schools/overview
 * إحصائيات مُجمَّعة لكل مدرسة — للمقارنة الإجمالية
 * متاح لمشرف النظام فقط
 *
 * ⚖️ خصوصية: يُرجع أرقاماً مُجمَّعة فقط — لا أسماء مهام/مستخدمين/سجلات فردية
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { user } = auth

  const admin = createAdminClient()

  /* التحقق من مشرف النظام */
  const { data: me } = await admin
    .from('profiles').select('is_super_admin').eq('id', user.id).single()
  if (!me?.is_super_admin) {
    return NextResponse.json({ error: 'متاح لمشرف النظام فقط' }, { status: 403 })
  }

  const today = new Date().toISOString().split('T')[0]

  /* ── جلب البيانات الخام (تبقى في الخادم — لا تُرسل) ── */
  const [
    { data: schools },
    { data: plans },
    { data: nodes },
    { data: tasks },
    { data: kpis },
    { data: readings },
    { data: profiles },
  ] = await Promise.all([
    admin.from('schools').select('id, name_ar, is_active').order('created_at'),
    admin.from('plans').select('id, school_id').is('deleted_at', null),
    admin.from('plan_nodes').select('id, plan_id').is('deleted_at', null),
    admin.from('tasks').select('id, node_id, status, end_date, rating').is('deleted_at', null),
    admin.from('kpis').select('id, node_id, target_value'),
    admin.from('kpi_readings').select('kpi_id, actual_value, reading_date').order('reading_date', { ascending: false }),
    admin.from('profiles').select('school_id, is_active'),
  ])

  /* ── خرائط ربط (node → school) ── */
  const planSchool: Record<string, string> = {}
  ;(plans || []).forEach(p => { planSchool[p.id] = p.school_id })
  const nodeSchool: Record<string, string> = {}
  ;(nodes || []).forEach(n => { nodeSchool[n.id] = planSchool[n.plan_id] })

  /* ── أحدث قراءة لكل KPI ── */
  const latestReading: Record<string, number> = {}
  ;(readings || []).forEach(r => {
    if (latestReading[r.kpi_id] === undefined) latestReading[r.kpi_id] = r.actual_value
  })

  /* ── حساب الأرقام المُجمَّعة لكل مدرسة ── */
  const result = (schools || []).map(s => {
    const sid = s.id

    const schoolPlans = (plans || []).filter(p => p.school_id === sid)
    const schoolTasks = (tasks || []).filter(t => t.node_id && nodeSchool[t.node_id] === sid)
    const schoolKpis  = (kpis  || []).filter(k => k.node_id && nodeSchool[k.node_id] === sid)

    const total     = schoolTasks.length
    const completed = schoolTasks.filter(t => t.status === 'completed').length
    const delayed   = schoolTasks.filter(t => t.status === 'delayed').length
    const overdue   = schoolTasks.filter(t =>
      t.end_date && t.end_date < today && t.status !== 'completed').length
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0

    /* متوسط تحقق KPIs */
    const kpiPcts = schoolKpis
      .filter(k => k.target_value && latestReading[k.id] !== undefined)
      .map(k => Math.min(Math.round((latestReading[k.id] / k.target_value!) * 100), 100))
    const kpiAvg = kpiPcts.length > 0
      ? Math.round(kpiPcts.reduce((a, b) => a + b, 0) / kpiPcts.length) : null

    /* متوسط التقييم */
    const rated = schoolTasks.filter(t => t.rating != null)
    const ratingAvg = rated.length > 0
      ? +(rated.reduce((a, t) => a + (t.rating || 0), 0) / rated.length).toFixed(1) : null

    const users       = (profiles || []).filter(p => p.school_id === sid)
    const activeUsers = users.filter(p => p.is_active).length

    return {
      id:           sid,
      name_ar:      s.name_ar,
      is_active:    s.is_active,
      plans:        schoolPlans.length,
      tasks_total:  total,
      tasks_done:   completed,
      tasks_delayed: delayed,
      tasks_overdue: overdue,
      completion:   rate,
      kpi_count:    schoolKpis.length,
      kpi_avg:      kpiAvg,
      rating_avg:   ratingAvg,
      users:        users.length,
      active_users: activeUsers,
    }
  })

  return NextResponse.json({ schools: result })
}

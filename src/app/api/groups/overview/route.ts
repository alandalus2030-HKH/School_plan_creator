import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/groups/overview
 * أرقام مُجمَّعة لمدارس مجموعة المالك فقط
 * متاح لمالك المجموعة (وللمشرف لأغراض الاختبار)
 *
 * ⚖️ خصوصية: أرقام مُجمَّعة فقط — لا بيانات فردية
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { user } = auth

  const admin = createAdminClient()

  const { data: me } = await admin
    .from('profiles')
    .select('is_super_admin, is_group_owner, owned_group_id')
    .eq('id', user.id).single()

  if (!me?.is_group_owner && !me?.is_super_admin) {
    return NextResponse.json({ error: 'متاح لمالك المجموعة فقط' }, { status: 403 })
  }
  if (!me.owned_group_id) {
    return NextResponse.json({ error: 'لا توجد مجموعة مرتبطة بحسابك' }, { status: 400 })
  }

  const groupId = me.owned_group_id
  const today = new Date().toISOString().split('T')[0]

  /* اسم المجموعة + مدارسها */
  const [{ data: group }, { data: groupSchools }] = await Promise.all([
    admin.from('school_groups').select('name_ar').eq('id', groupId).single(),
    admin.from('schools').select('id, name_ar, is_active').eq('group_id', groupId),
  ])

  const schoolIds = (groupSchools || []).map(s => s.id)
  if (schoolIds.length === 0) {
    return NextResponse.json({ group_name: group?.name_ar || '', schools: [] })
  }

  /* بيانات مدارس المجموعة فقط */
  const [{ data: plans }, { data: nodes }, { data: tasks }, { data: kpis }, { data: readings }, { data: profiles }] =
    await Promise.all([
      admin.from('plans').select('id, school_id').in('school_id', schoolIds).is('deleted_at', null),
      admin.from('plan_nodes').select('id, plan_id').is('deleted_at', null),
      admin.from('tasks').select('id, node_id, status, end_date, rating').is('deleted_at', null),
      admin.from('kpis').select('id, node_id, target_value'),
      admin.from('kpi_readings').select('kpi_id, actual_value, reading_date').order('reading_date', { ascending: false }),
      admin.from('profiles').select('school_id, is_active').in('school_id', schoolIds),
    ])

  const planSchool: Record<string, string> = {}
  ;(plans || []).forEach(p => { planSchool[p.id] = p.school_id })
  const nodeSchool: Record<string, string> = {}
  ;(nodes || []).forEach(n => { if (planSchool[n.plan_id]) nodeSchool[n.id] = planSchool[n.plan_id] })

  const latestReading: Record<string, number> = {}
  ;(readings || []).forEach(r => { if (latestReading[r.kpi_id] === undefined) latestReading[r.kpi_id] = r.actual_value })

  const result = (groupSchools || []).map(s => {
    const sid = s.id
    const schoolPlans = (plans || []).filter(p => p.school_id === sid)
    const schoolTasks = (tasks || []).filter(t => t.node_id && nodeSchool[t.node_id] === sid)
    const schoolKpis  = (kpis  || []).filter(k => k.node_id && nodeSchool[k.node_id] === sid)

    const total     = schoolTasks.length
    const completed = schoolTasks.filter(t => t.status === 'completed').length
    const overdue   = schoolTasks.filter(t => t.end_date && t.end_date < today && t.status !== 'completed').length
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0

    const kpiPcts = schoolKpis
      .filter(k => k.target_value && latestReading[k.id] !== undefined)
      .map(k => Math.min(Math.round((latestReading[k.id] / k.target_value!) * 100), 100))
    const kpiAvg = kpiPcts.length > 0 ? Math.round(kpiPcts.reduce((a, b) => a + b, 0) / kpiPcts.length) : null

    const users = (profiles || []).filter(p => p.school_id === sid)

    return {
      id: sid, name_ar: s.name_ar, is_active: s.is_active,
      plans: schoolPlans.length, tasks_total: total, tasks_done: completed,
      tasks_delayed: schoolTasks.filter(t => t.status === 'delayed').length,
      tasks_overdue: overdue, completion: rate,
      kpi_count: schoolKpis.length, kpi_avg: kpiAvg, rating_avg: null,
      users: users.length, active_users: users.filter(p => p.is_active).length,
    }
  })

  return NextResponse.json({ group_name: group?.name_ar || '', schools: result })
}

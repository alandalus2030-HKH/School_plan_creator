import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const supabase = await createClient()
  /* getSession (محلي، بدون شبكة) لا getUser — الـmiddleware (proxy.ts) تحقّق
     فعلياً من الجلسة عبر الشبكة لنفس هذا الطلب قبل وصوله لهذا المكوّن */
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) redirect('/login')

  /* ── ملف تعريف واحد يغطّي فحصي المجموعة والصلاحيات معاً (كانا استعلامين منفصلين) ── */
  let redirectToGroup = false
  let redirectToMyTasks = false
  try {
    const { data: profile } = await supabase
      .from('profiles').select('is_group_owner, is_super_admin, role').eq('id', user.id).single()

    if (profile?.is_group_owner && !profile?.is_super_admin) redirectToGroup = true

    if (!redirectToGroup && profile?.role) {
      const { data: roleData } = await supabase
        .from('roles').select('permissions').eq('code', profile.role).single()

      if (roleData) {
        const perms: string[] = Array.isArray(roleData.permissions) ? roleData.permissions : []
        const isManager =
          perms.includes('all')           ||
          perms.includes('manage_plans')  ||
          perms.includes('manage_tasks')  ||
          perms.includes('manage_users')  ||
          perms.includes('manage_settings')
        if (!isManager) redirectToMyTasks = true
      } else {
        const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']
        if (!ADMIN_ROLES.includes(profile.role)) redirectToMyTasks = true
      }
    }
  } catch { /* خطأ → نبقيه في لوحة التحكم */ }

  if (redirectToGroup) redirect('/dashboard/group')
  if (redirectToMyTasks) redirect('/dashboard/my-tasks')

  /* ── إحصائيات (دفعة واحدة متوازية — تضمّ الآن طلبات إعادة الفتح أيضاً) ── */
  const [
    { count: tasksCount     },
    { count: completedCount },
    { count: delayedCount   },
    { count: plansCount     },
    { data:  recentTasks    },
    reopenRes,
  ] = await Promise.all([
    supabase.from('tasks').select('*', { count: 'exact', head: true }),
    supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
    supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'delayed'),
    supabase.from('plans').select('*', { count: 'exact', head: true }),
    supabase.from('tasks')
      .select('id, name_ar, status, end_date, task_type')
      .order('created_at', { ascending: false }).limit(6),
    /* طلبات إعادة فتح معلّقة — متسامح إن لم يُشغَّل الترحيل 025 (عمود غير موجود) */
    supabase.from('tasks').select('*', { count: 'exact', head: true })
      .not('reopen_requested_by', 'is', null)
      .then(res => res, () => ({ count: 0, error: null } as any)),
  ])

  const completionRate = tasksCount && tasksCount > 0
    ? Math.round(((completedCount || 0) / tasksCount) * 100) : 0

  const reopenRequestsCount = reopenRes?.error ? 0 : (reopenRes?.count || 0)

  return (
    <DashboardClient
      plansCount={plansCount      || 0}
      tasksCount={tasksCount      || 0}
      completedCount={completedCount || 0}
      delayedCount={delayedCount  || 0}
      completionRate={completionRate}
      reopenRequestsCount={reopenRequestsCount}
      recentTasks={(recentTasks   || []) as any}
    />
  )
}

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  /* ── تحقق من الصلاحيات ── */
  let redirectToMyTasks = false
  try {
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()

    if (profile?.role) {
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

  if (redirectToMyTasks) redirect('/dashboard/my-tasks')

  /* ── إحصائيات ── */
  const [
    { count: tasksCount     },
    { count: completedCount },
    { count: delayedCount   },
    { count: plansCount     },
    { data:  recentTasks    },
  ] = await Promise.all([
    supabase.from('tasks').select('*', { count: 'exact', head: true }),
    supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
    supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'delayed'),
    supabase.from('plans').select('*', { count: 'exact', head: true }),
    supabase.from('tasks')
      .select('id, name_ar, status, end_date, task_type')
      .order('created_at', { ascending: false }).limit(6),
  ])

  const completionRate = tasksCount && tasksCount > 0
    ? Math.round(((completedCount || 0) / tasksCount) * 100) : 0

  return (
    <DashboardClient
      plansCount={plansCount      || 0}
      tasksCount={tasksCount      || 0}
      completedCount={completedCount || 0}
      delayedCount={delayedCount  || 0}
      completionRate={completionRate}
      recentTasks={(recentTasks   || []) as any}
    />
  )
}

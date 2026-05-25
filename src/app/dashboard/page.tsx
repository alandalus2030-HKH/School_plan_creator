import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  /* ── تحقق من صلاحيات المستخدم ── */
  let redirectToMyTasks = false
  try {
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()

    if (profile?.role) {
      const { data: roleData } = await supabase
        .from('roles').select('permissions').eq('code', profile.role).single()

      /* نعيد التوجيه فقط إذا:
         1. وُجد الدور في الجدول (roleData ليس null)
         2. وصلاحياته لا تشمل any من صلاحيات الإدارة */
      if (roleData) {
        const perms: string[] = Array.isArray(roleData.permissions) ? roleData.permissions : []
        const isManager =
          perms.includes('all')          ||
          perms.includes('manage_plans') ||
          perms.includes('manage_tasks') ||
          perms.includes('manage_users') ||
          perms.includes('manage_settings')
        if (!isManager) redirectToMyTasks = true
      } else {
        /* الدور غير موجود في roles → تحقق من اسم الدور مباشرة */
        const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']
        if (!ADMIN_ROLES.includes(profile.role)) redirectToMyTasks = true
      }
    }
  } catch { /* خطأ في الاستعلام → نبقيه في لوحة التحكم */ }

  if (redirectToMyTasks) redirect('/dashboard/my-tasks')

  /* ── إحصائيات للمديرين ── */
  const [
    { count: tasksCount    },
    { count: completedCount},
    { count: delayedCount  },
    { count: plansCount    },
    { data:  recentTasks   },
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

  const statusMap: Record<string, { ar: string; color: string }> = {
    not_started: { ar: 'لم تبدأ',  color: 'bg-slate-100 text-slate-600'  },
    in_progress: { ar: 'جارية',    color: 'bg-blue-100  text-blue-700'   },
    completed:   { ar: 'منجزة',    color: 'bg-green-100 text-green-700'  },
    delayed:     { ar: 'متأخرة',   color: 'bg-red-100   text-red-700'    },
  }

  return (
    <div className="space-y-6">

      {/* ── إحصائيات رئيسية ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'الخطط',       value: plansCount    || 0, icon: '🗺️', color: 'bg-violet-50 border-violet-200 text-violet-700', href: '/dashboard/plans'   },
          { label: 'إجمالي المهام',value: tasksCount    || 0, icon: '✅', color: 'bg-blue-50   border-blue-200   text-blue-700',   href: '/dashboard/tasks'   },
          { label: 'المنجزة',     value: completedCount|| 0, icon: '🏆', color: 'bg-green-50  border-green-200  text-green-700',  href: '/dashboard/tasks'   },
          { label: 'نسبة الإنجاز',value: `${completionRate}%`,icon:'📊', color: 'bg-amber-50  border-amber-200  text-amber-700',  href: '/dashboard/reports' },
        ].map(s => (
          <Link key={s.label} href={s.href}
            className={`rounded-2xl border p-5 ${s.color} hover:shadow-md transition-shadow`}>
            <div className="text-3xl mb-2">{s.icon}</div>
            <div className="text-3xl font-bold">{s.value}</div>
            <div className="text-sm font-medium mt-1 opacity-80">{s.label}</div>
          </Link>
        ))}
      </div>

      {/* ── شريط الإنجاز + المتأخرة + إجراءات ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 className="font-bold text-slate-700 mb-4">📈 نسبة الإنجاز الكلية</h3>
          <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden">
            <div className="absolute top-0 right-0 h-full bg-gradient-to-l from-violet-500 to-indigo-500 rounded-full transition-all"
              style={{ width: `${completionRate}%` }} />
          </div>
          <div className="flex justify-between mt-2 text-sm text-slate-500">
            <span>المنجز: {completedCount || 0}</span>
            <span className="font-bold text-violet-700">{completionRate}%</span>
            <span>الإجمالي: {tasksCount || 0}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-red-200 p-5 shadow-sm">
          <h3 className="font-bold text-red-700 mb-3">⚠️ المهام المتأخرة</h3>
          <div className="text-4xl font-bold text-red-600">{delayedCount || 0}</div>
          <p className="text-sm text-slate-500 mt-1">مهمة تجاوزت موعدها</p>
          <Link href="/dashboard/tasks?status=delayed"
            className="mt-3 inline-block text-xs text-red-600 hover:underline font-medium">
            عرض المهام المتأخرة ←
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 className="font-bold text-slate-700 mb-3">⚡ إجراءات سريعة</h3>
          <div className="space-y-2">
            <Link href="/dashboard/plans"
              className="flex items-center gap-2 p-2 rounded-xl hover:bg-violet-50 text-sm text-slate-700 transition-colors">
              <span>🗺️</span> عرض الخطط
            </Link>
            <Link href="/dashboard/tasks"
              className="flex items-center gap-2 p-2 rounded-xl hover:bg-blue-50 text-sm text-slate-700 transition-colors">
              <span>✅</span> كل المهام
            </Link>
            <Link href="/dashboard/reports"
              className="flex items-center gap-2 p-2 rounded-xl hover:bg-amber-50 text-sm text-slate-700 transition-colors">
              <span>📊</span> التقارير
            </Link>
          </div>
        </div>
      </div>

      {/* ── آخر المهام ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-700">🕐 آخر المهام المضافة</h3>
          <Link href="/dashboard/tasks" className="text-xs text-violet-600 hover:underline font-medium">عرض الكل</Link>
        </div>
        {recentTasks && recentTasks.length > 0 ? (
          <div className="divide-y divide-slate-50">
            {recentTasks.map((task, i) => (
              <Link key={i} href={`/dashboard/tasks/${task.id}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-lg">
                    {task.task_type === 'academic' ? '📚' : task.task_type === 'administrative' ? '🗃️' : '📌'}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-slate-700">{task.name_ar}</p>
                    {task.end_date && (
                      <p className="text-xs text-slate-400">
                        الانتهاء: {new Date(task.end_date).toLocaleDateString('ar-QA')}
                      </p>
                    )}
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusMap[task.status]?.color || 'bg-slate-100'}`}>
                  {statusMap[task.status]?.ar || task.status}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 text-slate-400">
            <p className="text-3xl mb-2">📭</p>
            <p className="text-sm">لا توجد مهام بعد</p>
          </div>
        )}
      </div>
    </div>
  )
}

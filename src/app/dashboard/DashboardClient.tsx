'use client'

import Link from 'next/link'
import {
  Map, CheckCircle2, Trophy, TrendingUp,
  AlertTriangle, Zap, Clock, BookOpen, Archive, Pin, Inbox,
} from 'lucide-react'
import ActivityFeed from '@/components/ActivityFeed'
import RecognitionPodium from '@/components/RecognitionPodium'

type Task = {
  id: string
  name_ar: string
  status: string
  end_date: string | null
  task_type: string
}

type Props = {
  plansCount:      number
  tasksCount:      number
  completedCount:  number
  delayedCount:    number
  completionRate:  number
  recentTasks:     Task[]
}

const statusMap: Record<string, { ar: string; bg: string; fg: string }> = {
  not_started: { ar: 'لم تبدأ', bg: '#f1f5f9', fg: '#64748b' },
  in_progress: { ar: 'جارية',   bg: '#f4dde2', fg: '#8a1538' },
  completed:   { ar: 'منجزة',   bg: '#d98ea0', fg: '#46091a' },
  delayed:     { ar: 'متأخرة',  bg: '#8a1538', fg: '#ffffff' },
}

const statCards = (p: Props) => [
  { label: 'الخطط',          value: p.plansCount,     Icon: Map,          tone: 'dark',   href: '/dashboard/plans'   },
  { label: 'إجمالي المهام',  value: p.tasksCount,     Icon: CheckCircle2, tone: 'medium', href: '/dashboard/tasks'   },
  { label: 'المنجزة',        value: p.completedCount, Icon: Trophy,       tone: 'light2', href: '/dashboard/tasks'   },
  { label: 'نسبة الإنجاز',   value: `${p.completionRate}%`, Icon: TrendingUp, tone: 'light', href: '/dashboard/reports' },
]

const tones: Record<string, { bg: string; fg: string; iconFg: string }> = {
  dark:   { bg: 'linear-gradient(135deg,#5a0d22,#8a1538)', fg: '#fff',     iconFg: 'rgba(255,255,255,0.8)' },
  medium: { bg: '#f4dde2',                                  fg: '#8a1538',  iconFg: '#c25c74' },
  light2: { bg: '#fbf2f4',                                  fg: '#8a1538',  iconFg: '#d98ea0' },
  light:  { bg: '#f4dde2',                                  fg: '#6f1029',  iconFg: '#c25c74' },
}

function TaskIcon({ type }: { type: string }) {
  if (type === 'academic')       return <BookOpen size={16} />
  if (type === 'administrative') return <Archive  size={16} />
  return <Pin size={16} />
}

export default function DashboardClient(props: Props) {
  return (
    <div className="space-y-6">

      {/* ── صدارة الشهر ── */}
      <RecognitionPodium />

      {/* ── إحصائيات رئيسية ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards(props).map(s => {
          const t = tones[s.tone]
          return (
            <Link key={s.label} href={s.href}
              className="rounded-2xl p-5 hover:shadow-md transition-shadow"
              style={{ background: t.bg, color: t.fg }}>
              <s.Icon size={28} style={{ color: t.iconFg, marginBottom: 8 }} />
              <div className="text-3xl font-bold">{s.value}</div>
              <div className="text-sm font-medium mt-1 opacity-80">{s.label}</div>
            </Link>
          )
        })}
      </div>

      {/* ── شريط الإنجاز + المتأخرة + إجراءات ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* نسبة الإنجاز */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
            <TrendingUp size={16} style={{ color: 'var(--maroon-600)' }} />
            نسبة الإنجاز الكلية
          </h3>
          <div className="relative h-3 bg-slate-100 rounded-full overflow-hidden">
            <div className="absolute top-0 right-0 h-full rounded-full transition-all"
              style={{ width: `${props.completionRate}%`, background: 'var(--maroon-600)' }} />
          </div>
          <div className="flex justify-between mt-2 text-sm text-slate-500">
            <span>المنجز: {props.completedCount}</span>
            <span className="font-bold" style={{ color: 'var(--maroon-600)' }}>{props.completionRate}%</span>
            <span>الإجمالي: {props.tasksCount}</span>
          </div>
        </div>

        {/* المهام المتأخرة */}
        <div className="bg-white rounded-2xl border p-5 shadow-sm" style={{ borderColor: 'var(--maroon-200)' }}>
          <h3 className="font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--maroon-700)' }}>
            <AlertTriangle size={16} />
            المهام المتأخرة
          </h3>
          <div className="text-4xl font-bold" style={{ color: 'var(--maroon-600)' }}>{props.delayedCount}</div>
          <p className="text-sm text-slate-500 mt-1">مهمة تجاوزت موعدها</p>
          <Link href="/dashboard/tasks?status=delayed"
            className="mt-3 inline-block text-xs font-medium hover:underline"
            style={{ color: 'var(--maroon-600)' }}>
            عرض المهام المتأخرة ←
          </Link>
        </div>

        {/* إجراءات سريعة */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
            <Zap size={16} style={{ color: 'var(--maroon-600)' }} />
            إجراءات سريعة
          </h3>
          <div className="space-y-1">
            {[
              { href: '/dashboard/plans',   Icon: Map,          label: 'عرض الخطط' },
              { href: '/dashboard/tasks',   Icon: CheckCircle2, label: 'كل المهام' },
              { href: '/dashboard/reports', Icon: TrendingUp,   label: 'التقارير'  },
            ].map(a => (
              <Link key={a.href} href={a.href}
                className="flex items-center gap-2 p-2 rounded-xl text-sm text-slate-700 transition-colors hover:bg-violet-50">
                <a.Icon size={15} style={{ color: 'var(--maroon-500)' }} />
                {a.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ── آخر المهام ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-700 flex items-center gap-2">
            <Clock size={16} style={{ color: 'var(--maroon-600)' }} />
            آخر المهام المضافة
          </h3>
          <Link href="/dashboard/tasks"
            className="text-xs font-medium hover:underline"
            style={{ color: 'var(--maroon-600)' }}>
            عرض الكل
          </Link>
        </div>

        {props.recentTasks.length > 0 ? (
          <div className="divide-y divide-slate-50">
            {props.recentTasks.map((task) => {
              const sm = statusMap[task.status]
              return (
                <Link key={task.id} href={`/dashboard/tasks/${task.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span style={{ color: 'var(--maroon-400)' }}>
                      <TaskIcon type={task.task_type} />
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
                  {sm && (
                    <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
                      style={{ background: sm.bg, color: sm.fg }}>
                      {sm.ar}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-10 text-slate-400">
            <Inbox size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">لا توجد مهام بعد</p>
          </div>
        )}
      </div>

      {/* ── سجل النشاط ── */}
      <ActivityFeed limit={8} />
    </div>
  )
}

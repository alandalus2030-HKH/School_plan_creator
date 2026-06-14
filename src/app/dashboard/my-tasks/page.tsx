'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ClipboardList, Zap, CheckCircle2, AlertTriangle,
  UserRound, Users, Search, BookOpen, Archive, Pin,
  CalendarDays, PartyPopper, Clock, Star,
} from 'lucide-react'

import { STATUS_META, RATING_META, PRIORITY_META } from '@/lib/constants/tasks'
import { SkeletonTaskList } from '@/components/Skeleton'
import RecognitionPodium from '@/components/RecognitionPodium'
import type { PlanNode, Plan, Team } from '@/lib/types'

/* ── aliases للتوافق مع الكود الموجود ── */
const STATUS_INFO = Object.fromEntries(
  Object.entries(STATUS_META).map(([k, v]) => [k, {
    label: v.ar,
    badge: `${v.light} ${v.text} ${v.tailwindBorder}`,
    dot:   '',
  }])
)
const RATING_INFO = RATING_META
const PRIORITY_LABEL = Object.fromEntries(
  Object.entries(PRIORITY_META).map(([k, v]) => [k, { icon: '', label: v.ar }])
)

const TYPE_ICON_MAP: Record<string, any> = {
  academic: BookOpen, administrative: Archive, general: Pin,
}
function TaskTypeIcon({ type }: { type: string }) {
  const Icon = TYPE_ICON_MAP[type] || Pin
  return <Icon size={18} style={{ color: 'var(--maroon-400)' }} />
}

type Task = {
  id: string
  name_ar: string
  status: string
  task_type: string
  priority: string
  start_date: string | null
  end_date: string | null
  node_id: string | null
  assigned_to_user_id: string | null
  assigned_to_team_id: string | null
  reviewer_id: string | null
  rating: number | null
  rated_at: string | null
  /* مصدر ظهور المهمة للمستخدم */
  _source?: 'assigned' | 'team' | 'reviewer' | 'department'
}

export default function MyTasksPage() {
  const supabase = createClient()
  const router   = useRouter()

  const [userId,    setUserId]    = useState('')
  const [userName,  setUserName]  = useState('')
  const [tasks,     setTasks]     = useState<Task[]>([])
  const [nodes,     setNodes]     = useState<Pick<PlanNode, 'id' | 'parent_id' | 'name_ar' | 'plan_id'>[]>([])
  const [plans,     setPlans]     = useState<Pick<Plan, 'id' | 'name_ar'>[]>([])
  const [teams,     setTeams]     = useState<Pick<Team, 'id' | 'name_ar' | 'color' | 'leader_id'>[]>([])
  const [loading,   setLoading]   = useState(true)
  const [activeTab, setActiveTab] = useState<'assigned' | 'team' | 'reviewer' | 'department'>('assigned')
  const [userDept,  setUserDept]  = useState<string | null>(null)
  const [savingId,  setSavingId]  = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)

      /* ── جلب بيانات المستخدم ── */
      const { data: profile } = await supabase
        .from('profiles').select('full_name_ar, name_ar, department').eq('id', user.id).single()
      setUserName(profile?.full_name_ar || profile?.name_ar || '')
      const myDept = profile?.department || null
      setUserDept(myDept)

      /* ── الفرق التي ينتمي إليها (كقائد أو عضو) ── */
      const { data: teamsData } = await supabase
        .from('teams').select('id, name_ar, color, leader_id')
      const leaderTeams = (teamsData || []).filter((t: any) => t.leader_id === user.id)

      /* جلب عضوية الفرق — يتجاهل الخطأ إذا لم يكن الجدول موجوداً */
      let memberTeamIds: string[] = []
      try {
        const { data: memberTeams } = await supabase
          .from('team_members').select('team_id').eq('profile_id', user.id)
        memberTeamIds = (memberTeams || []).map((m: any) => m.team_id)
      } catch { /* جدول team_members غير موجود بعد */ }

      const allTeamIds = [...new Set([
        ...leaderTeams.map((t: any) => t.id),
        ...memberTeamIds,
      ])]
      setTeams(teamsData || [])

      /* ── جلب جميع المهام المرتبطة بالمستخدم ── */
      let allTasks: Task[] = []

      /* المهام المكلَّف بها مباشرة */
      const { data: directTasks } = await supabase
        .from('tasks')
        .select('id, name_ar, status, task_type, priority, start_date, end_date, node_id, assigned_to_user_id, assigned_to_team_id, reviewer_id, rating, rated_at')
        .eq('assigned_to_user_id', user.id)
        .order('end_date', { ascending: true, nullsFirst: false })
      ;(directTasks || []).forEach(t => {
        if (!allTasks.find(x => x.id === t.id))
          allTasks.push({ ...t, _source: 'assigned' })
      })

      /* المهام المكلَّف بها كمقيّم */
      const { data: reviewerTasks } = await supabase
        .from('tasks')
        .select('id, name_ar, status, task_type, priority, start_date, end_date, node_id, assigned_to_user_id, assigned_to_team_id, reviewer_id, rating, rated_at')
        .eq('reviewer_id', user.id)
        .order('end_date', { ascending: true, nullsFirst: false })
      ;(reviewerTasks || []).forEach(t => {
        if (!allTasks.find(x => x.id === t.id))
          allTasks.push({ ...t, _source: 'reviewer' })
      })

      /* المهام المكلَّف بها قسمه (تكليف القسم كله) → تُعدّ ضمن مهامه المباشرة */
      if (myDept) {
        const { data: deptTasks } = await supabase
          .from('tasks')
          .select('id, name_ar, status, task_type, priority, start_date, end_date, node_id, assigned_to_user_id, assigned_to_team_id, reviewer_id, rating, rated_at')
          .eq('assigned_to_department', myDept)
          .order('end_date', { ascending: true, nullsFirst: false })
        ;(deptTasks || []).forEach(t => {
          if (!allTasks.find(x => x.id === t.id))
            allTasks.push({ ...t, _source: 'department' })
        })
      }

      /* مهام الفرق */
      if (allTeamIds.length > 0) {
        const { data: teamTasks } = await supabase
          .from('tasks')
          .select('id, name_ar, status, task_type, priority, start_date, end_date, node_id, assigned_to_user_id, assigned_to_team_id, reviewer_id, rating, rated_at')
          .in('assigned_to_team_id', allTeamIds)
          .order('end_date', { ascending: true, nullsFirst: false })
        ;(teamTasks || []).forEach(t => {
          if (!allTasks.find(x => x.id === t.id))
            allTasks.push({ ...t, _source: 'team' })
        })
      }

      setTasks(allTasks)

      /* ── بيانات مسار العقدة ── */
      const { data: nodesData } = await supabase
        .from('plan_nodes').select('id, parent_id, name_ar, plan_id')
      const { data: plansData } = await supabase
        .from('plans').select('id, name_ar')
      setNodes(nodesData || [])
      setPlans(plansData || [])

      setLoading(false)
    })()
  }, [])

  /* ── تحديث حالة المهمة ── */
  const updateStatus = async (taskId: string, newStatus: string) => {
    setSavingId(taskId)
    await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId)
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
    setSavingId(null)
  }

  /* ── بناء المسار النصي ── */
  const buildPath = (nodeId: string | null): string => {
    if (!nodeId) return ''
    const path: string[] = []
    let cur = nodes.find(n => n.id === nodeId)
    while (cur) {
      path.unshift(cur.name_ar)
      cur = nodes.find(n => n.id === cur?.parent_id)
    }
    const plan = plans.find(p => p.id === nodes.find(n => n.id === nodeId)?.plan_id)
    if (plan) path.unshift(plan.name_ar)
    return path.join(' › ')
  }

  /* ── إحصائيات ── */
  const myTasks      = tasks.filter(t => t._source === 'assigned')
  const teamTasks    = tasks.filter(t => t._source === 'team')
  const reviewTasks  = tasks.filter(t => t._source === 'reviewer')
  const deptTasks    = tasks.filter(t => t._source === 'department')

  /* البطاقات العلوية = مهامي المباشرة + مهام قسمي (كلها مهام يؤدّيها المستخدم) */
  const mineAll = [...myTasks, ...deptTasks]
  const done    = mineAll.filter(t => t.status === 'completed').length
  const overdue = mineAll.filter(t =>
    t.status !== 'completed' && t.end_date && new Date(t.end_date) < new Date()
  ).length
  const toReview = reviewTasks.filter(t => t.rating == null).length
  const inProgress = mineAll.filter(t => t.status === 'in_progress').length

  /* ── تبويبات ── */
  const TABS = [
    { key: 'assigned' as const, label: 'مهامي المباشرة', Icon: UserRound,  count: myTasks.length,     color: 'violet' },
    ...(userDept ? [{ key: 'department' as const, label: `مهام قسمي · ${userDept}`, Icon: BookOpen, count: deptTasks.length, color: 'violet' }] : []),
    { key: 'team'     as const, label: 'مهام فريقي',      Icon: Users,      count: teamTasks.length,   color: 'blue'   },
    { key: 'reviewer' as const, label: 'أقيّمها',          Icon: Search,     count: reviewTasks.length, color: 'amber'  },
  ]

  const currentTasks =
    activeTab === 'assigned'   ? myTasks :
    activeTab === 'department'  ? deptTasks :
    activeTab === 'team'       ? teamTasks :
    reviewTasks

  if (loading) return (
    <div>
      <SkeletonTaskList />
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* ══ رأس الصفحة ══ */}
      <div className="bg-gradient-to-l from-violet-600 to-indigo-700 text-white rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold">
            {(userName || 'م')[0]}
          </div>
          <div>
            <p className="text-violet-200 text-xs">مرحباً،</p>
            <h1 className="text-xl font-bold">{userName || 'المستخدم'}</h1>
          </div>
        </div>
        <p className="text-violet-200 text-sm mt-1">هذه المهام الموكلة إليك — يمكنك تحديث حالتها ورفع الأدلة عليها</p>
      </div>

      {/* ══ صدارة الشهر ══ */}
      <RecognitionPodium />

      {/* ══ بطاقات الإحصائيات ══ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'إجمالي مهامي', value: mineAll.length, Icon: ClipboardList,  bg: 'linear-gradient(135deg,#5a0d22,#8a1538)', fg: '#fff',     iconFg: 'rgba(255,255,255,0.8)' },
          { label: 'جارية',         value: inProgress,     Icon: Zap,            bg: '#f4dde2',                                  fg: '#8a1538',  iconFg: '#c25c74' },
          { label: 'منجزة',         value: done,           Icon: CheckCircle2,   bg: '#fbf2f4',                                  fg: '#8a1538',  iconFg: '#d98ea0' },
          { label: 'متأخرة',        value: overdue,        Icon: AlertTriangle,  bg: '#f4dde2',                                  fg: '#6f1029',  iconFg: '#a83356' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border border-transparent p-4 text-center"
            style={{ background: s.bg, color: s.fg }}>
            <s.Icon size={24} style={{ color: s.iconFg, margin: '0 auto 6px' }} />
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-xs font-medium mt-0.5 opacity-80">{s.label}</div>
          </div>
        ))}
      </div>

      {/* تنبيه انتظار التقييم */}
      {toReview > 0 && (
        <div className="flex items-center gap-3 rounded-2xl p-4 cursor-pointer"
          style={{ background: 'var(--maroon-50)', border: '1px solid var(--maroon-200)' }}
          onClick={() => setActiveTab('reviewer')}>
          <Search size={22} style={{ color: 'var(--maroon-600)', flexShrink: 0 }} />
          <div>
            <p className="font-semibold" style={{ color: 'var(--maroon-800)' }}>لديك {toReview} مهمة بانتظار تقييمك</p>
            <p className="text-xs" style={{ color: 'var(--maroon-600)' }}>انقر هنا للانتقال إلى مهام التقييم</p>
          </div>
          <span className="mr-auto text-amber-400 text-xl">←</span>
        </div>
      )}

      {/* ══ التبويبات ══ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

        {/* شريط التبويبات */}
        <div className="flex border-b border-slate-100">
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-medium transition-colors
                ${activeTab === tab.key
                  ? 'text-violet-700 border-b-2 border-violet-600 bg-violet-50/50'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
              <tab.Icon size={15} />
              <span>{tab.label}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold
                ${activeTab === tab.key ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* قائمة المهام */}
        {currentTasks.length === 0 ? (
          <div className="py-16 text-center">
            <div className="flex justify-center mb-3" style={{ color: 'var(--maroon-300)' }}>
              {activeTab === 'assigned' ? <PartyPopper size={40} /> : activeTab === 'team' ? <Users size={40} /> : <Search size={40} />}
            </div>
            <p className="text-slate-500 font-medium">
              {activeTab === 'assigned' ? 'لا توجد مهام مكلَّف بها' :
               activeTab === 'team'     ? 'لا توجد مهام لفريقك' :
               'لا توجد مهام للتقييم'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {currentTasks.map(task => {
              const statusInfo = STATUS_INFO[task.status] || STATUS_INFO.not_started
              const isOverdue  = task.status !== 'completed' && task.end_date && new Date(task.end_date) < new Date()
              const path       = buildPath(task.node_id)
              const isSaving   = savingId === task.id

              return (
                <div key={task.id} className="p-4">
                  {/* سطر العنوان */}
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 mt-0.5"><TaskTypeIcon type={task.task_type} /></span>

                    <div className="flex-1 min-w-0">
                      <Link href={`/dashboard/tasks/${task.id}`}
                        className="font-semibold text-slate-800 hover:text-violet-700 transition-colors leading-snug block truncate">
                        {task.name_ar}
                      </Link>

                      {path && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{path}</p>
                      )}

                      {/* الأولوية والتاريخ */}
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <span className="text-xs text-slate-500">
                          {PRIORITY_LABEL[task.priority]?.icon} {PRIORITY_LABEL[task.priority]?.label}
                        </span>
                        {task.end_date && (
                          <span className={`text-xs font-medium ${isOverdue ? 'text-red-600' : 'text-slate-400'}`}>
                            {isOverdue
                              ? <AlertTriangle size={11} className="inline ml-1" />
                              : <CalendarDays  size={11} className="inline ml-1" />}
                            {new Date(task.end_date).toLocaleDateString('ar-QA')}
                            {isOverdue && ' (متأخرة)'}
                          </span>
                        )}
                        {/* شارة التقييم إن وُجدت */}
                        {task.rating != null && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RATING_INFO[task.rating]?.badge}`}>
                            {RATING_INFO[task.rating]?.label}
                          </span>
                        )}
                        {activeTab === 'reviewer' && task.rating == null && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-medium">
                            <Clock size={12} className="inline ml-1" /> بانتظار تقييمك
                          </span>
                        )}
                      </div>
                    </div>

                    {/* شارة الحالة */}
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 border ${statusInfo.badge}`}>
                      {statusInfo.label}
                    </span>
                  </div>

                  {/* الإجراءات — سير العمل يُدار من صفحة المهمة */}
                  {(task._source === 'assigned' || task._source === 'team') && (
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <Link href={`/dashboard/tasks/${task.id}`}
                        className="flex items-center gap-1 text-xs text-white px-3 py-1.5 rounded-xl font-medium transition-all hover:brightness-110"
                        style={{ background: 'var(--gradient-button)' }}>
                        فتح المهمة لإدارة الحالة ←
                      </Link>
                      <Link href={`/dashboard/tasks/${task.id}/evidence/new`}
                        className="mr-auto flex items-center gap-1 text-xs text-violet-600 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-xl border border-violet-200 transition-colors">
                        📎 رفع دليل
                      </Link>
                    </div>
                  )}

                  {/* لمهام التقييم: رابط تقييم مباشر */}
                  {task._source === 'reviewer' && task.rating == null && (
                    <div className="mt-3">
                      <Link href={`/dashboard/tasks/${task.id}#rating`}
                        className="inline-flex items-center gap-2 text-xs bg-amber-500 hover:bg-amber-600 text-white px-4 py-1.5 rounded-xl font-semibold transition-colors">
                        <Star size={13} className="inline ml-1" /> تقييم هذه المهمة
                      </Link>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {currentTasks.length > 0 && (
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-400">
            {currentTasks.length} مهمة
          </div>
        )}
      </div>

    </div>
  )
}

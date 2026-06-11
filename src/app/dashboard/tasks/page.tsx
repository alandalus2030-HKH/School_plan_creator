'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { usePermissions } from '@/lib/PermissionsContext'
import KanbanBoard  from '@/components/KanbanBoard'
import GanttChart   from '@/components/GanttChart'
import {
  BookOpen, Archive, Pin, AlertTriangle, Lock, Unlock, Users,
  CheckCircle2, List, LayoutGrid, GanttChartSquare, Star,
  CheckCheck, Circle, UserRound, CalendarDays,
} from 'lucide-react'
import TaskCalendar from '@/components/TaskCalendar'
import {
  STATUS_META, RATING_META, PRIORITY_META,
} from '@/lib/constants/tasks'
import { toast } from '@/components/Toast'
import { logActivity } from '@/lib/activity'
import type { Task, Profile, Team, PlanNode, Plan } from '@/lib/types'

/* ── مصفوفة الحالات للفلاتر والـ tabs ── */
const STATUS_LIST = Object.entries(STATUS_META).map(([value, m]) => ({
  value,
  label: m.ar,
  bg:    `${m.light} ${m.text}`,
}))

function TaskTypeIcon({ type }: { type: string }) {
  const props = { size: 17, style: { color: 'var(--maroon-400)', flexShrink: 0 } as any }
  if (type === 'academic')       return <BookOpen {...props} />
  if (type === 'administrative') return <Archive  {...props} />
  return <Pin {...props} />
}

/* aliases للتوافق مع الكود الموجود في هذا الملف */
const PRIORITY_DOT: Record<string, string> = Object.fromEntries(
  Object.entries(PRIORITY_META).map(([k, v]) => [k, v.dot])
)
const RATING_INFO = RATING_META

export default function TasksPage() {
  const supabase = createClient()
  const { can, loading: permsLoading, userId: permUserId } = usePermissions()

  const [tasks,         setTasks]         = useState<Task[]>([])
  const [profiles,      setProfiles]      = useState<Profile[]>([])
  const [teams,         setTeams]         = useState<Team[]>([])
  const [nodes,         setNodes]         = useState<PlanNode[]>([])
  const [plans,         setPlans]         = useState<Plan[]>([])
  const [loading,       setLoading]       = useState(true)
  const [myId,          setMyId]          = useState('')
  const [canManage,     setCanManage]     = useState(false)
  const [savingId,      setSavingId]      = useState<string | null>(null)
  const [savedId,       setSavedId]       = useState<string | null>(null) // flash تأكيد

  /* ── وضع العرض ── */
  const [viewMode, setViewMode] = useState<'list' | 'kanban' | 'gantt' | 'calendar'>('list')

  /* ── فلاتر — تُحفظ في localStorage ── */
  const FILTERS_KEY = 'tasks_filters_v1'
  const savedFilters = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem(FILTERS_KEY) || '{}') : {}

  const [search,    setSearch]    = useState('')
  const [statusF,   setStatusF]   = useState(savedFilters.statusF   || '')
  const [priorityF, setPriorityF] = useState(savedFilters.priorityF || '')
  const [planF,     setPlanF]     = useState(savedFilters.planF     || '')
  const [teamF,     setTeamF]     = useState(savedFilters.teamF     || '')
  const [onlyMine,  setOnlyMine]  = useState(savedFilters.onlyMine  || false)
  const [ratingF,   setRatingF]   = useState(savedFilters.ratingF   || '')
  /* فلتر طلبات إعادة الفتح — لا يُحفظ (فلتر إجرائي مؤقت)، ويُفعَّل من ?filter=reopen */
  const [reopenF,   setReopenF]   = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (new URLSearchParams(window.location.search).get('filter') === 'reopen') setReopenF(true)
  }, [])

  /* حفظ الفلاتر عند كل تغيير */
  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem(FILTERS_KEY, JSON.stringify({ statusF, priorityF, planF, teamF, onlyMine, ratingF }))
  }, [statusF, priorityF, planF, teamF, onlyMine, ratingF])

  useEffect(() => {
    if (permsLoading) return   // انتظر تحميل الصلاحيات أولاً
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setMyId(user.id)

      const manage = can('manage_tasks')
      setCanManage(manage)

      const [
        { data: tasksData },
        { data: nodesData },
        { data: plansData },
        { data: profsData },
        { data: teamsData },
      ] = await Promise.all([
        supabase.from('tasks').select(`
          id, name_ar, status, task_type, priority,
          start_date, end_date, order_num, node_id,
          rating, rated_at, depends_on_task_id
        `).order('created_at', { ascending: false }).limit(1000),
        supabase.from('plan_nodes').select('id, parent_id, name_ar, plan_id, order_num, level_num').limit(2000),
        supabase.from('plans').select('id, name_ar').limit(100),
        supabase.from('profiles').select('id, name_ar').limit(500),
        supabase.from('teams').select('id, name_ar, color').limit(100),
      ])

      // جلب حقول التكليف وطلب إعادة الفتح إذا كانت موجودة
      let tasksWithAssign = tasksData || []
      try {
        const { data: ta } = await supabase
          .from('tasks').select('id, assigned_to_user_id, assigned_to_team_id, reviewer_id, reopen_requested_by')
          .order('created_at', { ascending: false }).limit(1000)
        if (ta) {
          const map = Object.fromEntries(ta.map(x => [x.id, x]))
          tasksWithAssign = tasksWithAssign.map(t => ({ ...t, ...map[t.id] }))
        }
      } catch { /* العمود غير موجود بعد */ }

      /* إذا لم يكن مديراً، نعرض مهامه فقط */
      if (!manage && user) {
        tasksWithAssign = tasksWithAssign.filter((t: any) =>
          t.assigned_to_user_id === user.id || t.reviewer_id === user.id
        )
      }
      setTasks(tasksWithAssign)
      setNodes(nodesData   || [])
      setPlans(plansData   || [])
      setProfiles(profsData|| [])
      setTeams(teamsData   || [])
      setLoading(false)
    })()
  }, [permsLoading])

  /* ── بناء مسار المهمة ── */
  const buildPath = (nodeId: string | null | undefined): string => {
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

  /* ── تصفية ── */
  const filtered = tasks.filter(t => {
    if (search    && !t.name_ar.toLowerCase().includes(search.toLowerCase())) return false
    if (statusF   && t.status   !== statusF)   return false
    if (priorityF && t.priority !== priorityF) return false
    if (onlyMine  && t.assigned_to_user_id !== myId) return false
    if (teamF     && t.assigned_to_team_id  !== teamF) return false
    if (planF) {
      const node = nodes.find(n => n.id === t.node_id)
      if (!node || node.plan_id !== planF) return false
    }
    if (reopenF   && !(t as any).reopen_requested_by) return false
    if (ratingF === 'rated')   return t.rating != null
    if (ratingF === 'unrated') return t.rating == null
    if (ratingF && ['1','2','3','4','5'].includes(ratingF)) {
      return t.rating === Number(ratingF)
    }
    return true
  })

  /* ── إحصائيات التقييم ── */
  const ratedCount   = tasks.filter(t => t.rating != null).length
  const unratedCount = tasks.length - ratedCount

  /* ── إحصائيات ── */
  const stats = STATUS_LIST.map(s => ({
    ...s, count: tasks.filter(t => t.status === s.value).length
  }))

  /* ── هل المهمة متأخرة؟ ── */
  const isOverdue = (t: any) =>
    t.status !== 'completed' && t.end_date && new Date(t.end_date) < new Date()

  /* ── تحديث الحالة Inline (بدون فتح صفحة المهمة) ── */
  const updateStatus = async (e: React.MouseEvent, taskId: string, newStatus: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (savingId) return
    setSavingId(taskId)
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus as Task['status'] } : t))
    await supabase.from('tasks').update({
      status:     newStatus,
      updated_by: permUserId || null,
    }).eq('id', taskId)
    setSavingId(null)
    setSavedId(taskId)
    setTimeout(() => setSavedId(null), 1500)
    const label   = STATUS_LIST.find(s => s.value === newStatus)?.label || newStatus
    const taskObj = tasks.find(t => t.id === taskId)
    toast(`تم تحديث الحالة: ${label}`)
    logActivity({
      action:    'task_status_changed',
      tableName: 'tasks',
      recordId:  taskId,
      summary:   `${taskObj?.name_ar || ''} → ${label}`,
      newValues: { status: newStatus },
    })
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="space-y-5">

      {/* ── رأس الصفحة ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">
            {canManage ? 'كل المهام' : 'مهامي'}
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            {canManage
              ? `${tasks.length} مهمة إجمالاً`
              : `${tasks.length} مهمة مكلَّف بها`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* مبدّل العرض */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('list')}
              title="عرض قائمة"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'list'
                  ? 'bg-white text-violet-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}>
              <List size={14} /> قائمة
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              title="عرض كانبان"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'kanban'
                  ? 'bg-white text-violet-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}>
              <LayoutGrid size={14} /> كانبان
            </button>
            <button
              onClick={() => setViewMode('gantt')}
              title="عرض جانت"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'gantt'
                  ? 'bg-white text-violet-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}>
              <GanttChartSquare size={14} /> جانت
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              title="عرض تقويم"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'calendar'
                  ? 'bg-white text-violet-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}>
              <CalendarDays size={14} /> تقويم
            </button>
          </div>
          {canManage && (
            <Link href="/dashboard/tasks/new"
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-lg shadow-violet-200">
              ➕ مهمة جديدة
            </Link>
          )}
        </div>
      </div>

      {/* ── إحصائيات الحالة ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map(s => (
          <button key={s.value}
            onClick={() => setStatusF(statusF === s.value ? '' : s.value)}
            className={`rounded-2xl border p-4 text-center transition-all shadow-sm
              ${statusF === s.value ? 'border-violet-400 ring-2 ring-violet-200' : 'bg-white border-slate-200 hover:border-violet-200'}`}>
            <div className="text-2xl font-bold text-slate-800">{s.count}</div>
            <div className={`text-xs font-medium mt-1 px-2 py-0.5 rounded-full inline-block ${s.bg}`}>{s.label}</div>
          </button>
        ))}
      </div>

      {/* ── فلاتر ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 بحث..."
          className="flex-1 min-w-[160px] px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-sm" />

        <select value={priorityF} onChange={e => setPriorityF(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
          <option value="">كل الأولويات</option>
          <option value="high">🔴 عالية</option>
          <option value="medium">🟡 متوسطة</option>
          <option value="low">🟢 منخفضة</option>
        </select>

        <select value={planF} onChange={e => setPlanF(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
          <option value="">كل الخطط</option>
          {plans.map(p => <option key={p.id} value={p.id}>{p.name_ar}</option>)}
        </select>

        <select value={teamF} onChange={e => setTeamF(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
          <option value="">كل الفرق</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name_ar}</option>)}
        </select>

        <button onClick={() => setOnlyMine(!onlyMine)}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors
            ${onlyMine ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}>
          <UserRound size={14} /> المكلّفة لي
        </button>

        {/* طلبات إعادة الفتح المعلّقة — لمن يملك manage_tasks */}
        {canManage && (() => {
          const reopenCount = tasks.filter(t => (t as any).reopen_requested_by).length
          return (
            <button onClick={() => setReopenF(!reopenF)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors
                ${reopenF ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-50 text-amber-700 border-amber-200 hover:border-amber-400'}`}>
              <Unlock size={14} /> بانتظار إعادة فتح
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${reopenF ? 'bg-white/25' : 'bg-amber-100'}`}>
                {reopenCount}
              </span>
            </button>
          )
        })()}

        <select value={ratingF} onChange={e => setRatingF(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
          <option value="">كل التقييمات</option>
          <option value="rated">تم تقييمها</option>
          <option value="unrated">لم تُقيَّم بعد</option>
          <option value="5">★★★★★ ممتاز</option>
          <option value="4">★★★★☆ جيد جداً</option>
          <option value="3">★★★☆☆ جيد</option>
          <option value="2">★★☆☆☆ مقبول</option>
          <option value="1">★☆☆☆☆ ضعيف</option>
        </select>
      </div>

      {/* ── شريط ملخص التقييم ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => setRatingF(ratingF === 'rated' ? '' : 'rated')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all"
          style={ratingF === 'rated'
            ? { background: 'var(--maroon-700)', color: '#fff', borderColor: 'var(--maroon-700)' }
            : { background: 'var(--maroon-50)', color: 'var(--maroon-700)', borderColor: 'var(--maroon-200)' }}>
          <CheckCheck size={12} /> مُقيَّمة <span className="font-bold">{ratedCount}</span>
        </button>
        <button onClick={() => setRatingF(ratingF === 'unrated' ? '' : 'unrated')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all"
          style={ratingF === 'unrated'
            ? { background: '#475569', color: '#fff', borderColor: '#475569' }
            : { background: '#f8fafc', color: '#64748b', borderColor: '#e2e8f0' }}>
          <Circle size={12} /> لم تُقيَّم <span className="font-bold">{unratedCount}</span>
        </button>
        {ratedCount > 0 && [5,4,3,2,1].map(r => {
          const cnt = tasks.filter(t => t.rating === r).length
          if (cnt === 0) return null
          const info = RATING_INFO[r]
          return (
            <button key={r} onClick={() => setRatingF(ratingF === String(r) ? '' : String(r))}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all hover:scale-105"
              style={{
                background: info.bg, color: info.fg,
                borderColor: info.bg,
                outline: ratingF === String(r) ? `2px solid ${info.bg}` : 'none',
                outlineOffset: '2px',
              }}>
              <Star size={10} /> {info.label} <span className="font-bold">{cnt}</span>
            </button>
          )
        })}
      </div>

      {/* ── عرض جانت ── */}
      {viewMode === 'gantt' && (
        <GanttChart
          tasks={filtered}
          nodes={nodes}
          plans={plans}
          profiles={profiles}
          planFilter={planF}
        />
      )}

      {/* ── عرض التقويم ── */}
      {viewMode === 'calendar' && <TaskCalendar tasks={filtered} />}

      {/* ── عرض الكانبان ── */}
      {viewMode === 'kanban' && (
        <KanbanBoard
          tasks={filtered}
          profiles={profiles}
          nodeMap={Object.fromEntries(nodes.map(n => [n.id, n]))}
          canManage={canManage}
          planFilter={planF}
        />
      )}

      {/* ── قائمة المهام ── */}
      {viewMode === 'list' && (
        filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
          <div className="flex justify-center mb-3" style={{ color: 'var(--maroon-300)' }}><CheckCircle2 size={48} /></div>
          <p className="text-slate-500 font-medium">لا توجد مهام</p>
          {(search || statusF || priorityF || planF || teamF || onlyMine || ratingF || reopenF) && (
            <button onClick={() => { setSearch(''); setStatusF(''); setPriorityF(''); setPlanF(''); setTeamF(''); setOnlyMine(false); setRatingF(''); setReopenF(false) }}
              className="mt-3 text-sm text-violet-600 hover:underline">مسح الفلاتر</button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-50">
            {filtered.map(task => {
              const statusInfo  = STATUS_LIST.find(s => s.value === task.status)
              const assignee    = profiles.find(p => p.id === task.assigned_to_user_id)
              const assignTeam  = teams.find(t => t.id === task.assigned_to_team_id)
              const overdue     = isOverdue(task)
              const path        = buildPath(task.node_id ?? null)

              return (
                <Link key={task.id} href={`/dashboard/tasks/${task.id}`}
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors group">

                  {/* نوع المهمة */}
                  <TaskTypeIcon type={task.task_type} />

                  {/* المعلومات */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 group-hover:text-violet-700 transition-colors truncate">
                      {task.name_ar}
                    </p>
                    {path && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{path}</p>
                    )}

                    {/* التكليف */}
                    {(assignee || assignTeam) && (
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {assignee && (
                          <span className="flex items-center gap-1 text-xs bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full">
                            <span className="w-4 h-4 rounded-full bg-violet-400 flex items-center justify-center text-white text-[9px] font-bold">
                              {assignee.name_ar?.[0]}
                            </span>
                            {assignee.name_ar}
                          </span>
                        )}
                        {assignTeam && (
                          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full text-white font-medium"
                            style={{ backgroundColor: assignTeam.color || '#7c3aed' }}>
                            <Users size={10} className="inline ml-1" />{assignTeam.name_ar}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* التاريخ */}
                  {task.end_date && (
                    <span className={`text-xs flex-shrink-0 ${overdue ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
                      {overdue && <AlertTriangle size={11} className="inline ml-1" />}
                      {new Date(task.end_date).toLocaleDateString('ar-QA')}
                    </span>
                  )}

                  {/* الأولوية */}
                  <span className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ background: PRIORITY_DOT[task.priority] || '#f4dde2' }} />

                  {/* التبعية */}
                  {task.depends_on_task_id && (() => {
                    const dep = tasks.find((t: any) => t.id === task.depends_on_task_id)
                    const blocked = dep && dep.status !== 'completed'
                    return (
                      <span
                        title={blocked
                          ? `محجوبة — تنتظر: ${dep?.name_ar || '...'}`
                          : `التبعية مكتملة ✓`}
                        className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 border ${
                          blocked
                            ? 'bg-orange-50 text-orange-600 border-orange-200'
                            : 'bg-green-50 text-green-600 border-green-200'
                        }`}>
                        {blocked ? <><Lock size={10} className="inline ml-1" />محجوبة</> : <><Unlock size={10} className="inline ml-1" />متاحة</>}
                      </span>
                    )
                  })()}

                  {/* التقييم */}
                  {task.rating != null ? (
                    <span className="text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 flex items-center gap-1"
                      style={{ background: RATING_INFO[task.rating]?.bg, color: RATING_INFO[task.rating]?.fg }}>
                      <Star size={9} /> {RATING_INFO[task.rating]?.label}
                    </span>
                  ) : (
                    <span className="text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 bg-slate-100 text-slate-400 border border-slate-200">
                      لم تُقيَّم
                    </span>
                  )}

                  {/* الحالة — للعرض فقط (سير العمل يُدار من صفحة المهمة) */}
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${statusInfo?.bg}`}>
                    {statusInfo?.label || task.status}
                  </span>
                </Link>
              )
            })}
          </div>
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-400">
            {filtered.length} مهمة معروضة من {tasks.length}
          </div>
        </div>
      )
      )}
    </div>
  )
}

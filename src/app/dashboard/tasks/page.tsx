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
  CheckCheck, Circle, UserRound,
} from 'lucide-react'

const STATUS_LIST = [
  { value: 'not_started', label: 'لم تبدأ',  bg: 'bg-slate-100  text-slate-600'  },
  { value: 'in_progress', label: 'جارية',    bg: 'bg-blue-100   text-blue-700'   },
  { value: 'completed',   label: 'منجزة',    bg: 'bg-green-100  text-green-700'  },
  { value: 'delayed',     label: 'متأخرة',   bg: 'bg-red-100    text-red-700'    },
]
function TaskTypeIcon({ type }: { type: string }) {
  const props = { size: 17, style: { color: 'var(--maroon-400)', flexShrink: 0 } as any }
  if (type === 'academic')       return <BookOpen {...props} />
  if (type === 'administrative') return <Archive  {...props} />
  return <Pin {...props} />
}
const PRIORITY_DOT: Record<string, string> = {
  high:   '#8a1538',
  medium: '#d98ea0',
  low:    '#f4dde2',
}

/* ── بيانات التقييم (كلاسات Tailwind كاملة لتجنب حذف JIT) ── */
const RATING_INFO: Record<number, { label: string; bg: string; fg: string }> = {
  5: { label: 'ممتاز',    bg: '#46091a', fg: '#ffffff' },
  4: { label: 'جيد جداً', bg: '#8a1538', fg: '#ffffff' },
  3: { label: 'جيد',      bg: '#a83356', fg: '#ffffff' },
  2: { label: 'مقبول',    bg: '#d98ea0', fg: '#46091a' },
  1: { label: 'ضعيف',     bg: '#f4dde2', fg: '#8a1538' },
}

export default function TasksPage() {
  const supabase = createClient()
  const { can, loading: permsLoading, userId: permUserId } = usePermissions()

  const [tasks,         setTasks]         = useState<any[]>([])
  const [profiles,      setProfiles]      = useState<any[]>([])
  const [teams,         setTeams]         = useState<any[]>([])
  const [nodes,         setNodes]         = useState<any[]>([])
  const [plans,         setPlans]         = useState<any[]>([])
  const [loading,       setLoading]       = useState(true)
  const [myId,          setMyId]          = useState('')
  const [canManage,     setCanManage]     = useState(false)

  /* ── وضع العرض ── */
  const [viewMode, setViewMode] = useState<'list' | 'kanban' | 'gantt'>('list')

  /* ── فلاتر ── */
  const [search,     setSearch]     = useState('')
  const [statusF,    setStatusF]    = useState('')
  const [priorityF,  setPriorityF]  = useState('')
  const [planF,      setPlanF]      = useState('')
  const [teamF,      setTeamF]      = useState('')
  const [onlyMine,   setOnlyMine]   = useState(false)
  const [ratingF,    setRatingF]    = useState('')   // '' | 'rated' | 'unrated' | '1'..'5'

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
        `).order('created_at', { ascending: false }),
        supabase.from('plan_nodes').select('id, parent_id, name_ar, plan_id, order_num, level_num'),
        supabase.from('plans').select('id, name_ar'),
        supabase.from('profiles').select('id, name_ar'),
        supabase.from('teams').select('id, name_ar, color'),
      ])

      // جلب حقول التكليف إذا كانت موجودة
      let tasksWithAssign = tasksData || []
      try {
        const { data: ta } = await supabase
          .from('tasks').select('id, assigned_to_user_id, assigned_to_team_id')
          .order('created_at', { ascending: false })
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
  const buildPath = (nodeId: string): string => {
    if (!nodeId) return ''
    const path: string[] = []
    let cur = nodes.find(n => n.id === nodeId)
    while (cur) {
      path.unshift(cur.name_ar)
      cur = nodes.find(n => n.id === cur.parent_id)
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
          {(search || statusF || priorityF || planF || teamF || onlyMine || ratingF) && (
            <button onClick={() => { setSearch(''); setStatusF(''); setPriorityF(''); setPlanF(''); setTeamF(''); setOnlyMine(false); setRatingF('') }}
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
              const path        = buildPath(task.node_id)

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

                  {/* الحالة */}
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${statusInfo?.bg}`}>
                    {statusInfo?.label}
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

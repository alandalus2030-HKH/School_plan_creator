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
  UserRound, CalendarDays,
} from 'lucide-react'
import TaskCalendar from '@/components/TaskCalendar'
import {
  STATUS_META, RATING_META, PRIORITY_META,
} from '@/lib/constants/tasks'
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
  const { can, loading: permsLoading } = usePermissions()

  const [tasks,         setTasks]         = useState<Task[]>([])
  const [profiles,      setProfiles]      = useState<Profile[]>([])
  const [teams,         setTeams]         = useState<Team[]>([])
  const [nodes,         setNodes]         = useState<PlanNode[]>([])
  const [plans,         setPlans]         = useState<Plan[]>([])
  const [deptOptions,   setDeptOptions]   = useState<string[]>([])
  const [loading,       setLoading]       = useState(true)
  const [myId,          setMyId]          = useState('')
  const [myDept,        setMyDept]        = useState<string | null>(null)
  const [myTeamIds,     setMyTeamIds]     = useState<string[]>([])
  const [canManage,     setCanManage]     = useState(false)

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
  const [deptF,     setDeptF]     = useState(savedFilters.deptF     || '')
  const [onlyMine,  setOnlyMine]  = useState(savedFilters.onlyMine  || false)
  const [ratingF,   setRatingF]   = useState(savedFilters.ratingF   || '')
  /* فلتر طلبات إعادة الفتح — لا يُحفظ (فلتر إجرائي مؤقت)، ويُفعَّل من ?filter=reopen */
  const [reopenF,   setReopenF]   = useState(false)
  /* فلتر «محجوبة» — مهام تنتظر تبعية غير منجزة (محسوب، لا يُحفظ) */
  const [blockedF,  setBlockedF]  = useState(false)

  /* ── ترقيم عرض القائمة ── */
  const PAGE_SIZE = 50
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const q = new URLSearchParams(window.location.search)
    if (q.get('filter') === 'reopen') setReopenF(true)
    /* غوص من لوحة التجميع: ?dept=...&status=...&plan=... */
    if (q.get('dept'))   setDeptF(q.get('dept')!)
    if (q.get('status')) setStatusF(q.get('status')!)
    if (q.get('plan'))   setPlanF(q.get('plan')!)
  }, [])

  /* حفظ الفلاتر عند كل تغيير */
  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem(FILTERS_KEY, JSON.stringify({ statusF, priorityF, planF, teamF, deptF, onlyMine, ratingF }))
  }, [statusF, priorityF, planF, teamF, deptF, onlyMine, ratingF])

  /* العودة للصفحة الأولى عند تغيّر أي مرشّح/بحث */
  useEffect(() => { setPage(1) }, [search, statusF, priorityF, planF, teamF, deptF, onlyMine, ratingF, reopenF, blockedF])

  useEffect(() => {
    if (permsLoading) return   // انتظر تحميل الصلاحيات أولاً
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setMyId(user.id)

      const manage = can('manage_tasks')
      setCanManage(manage)

      /* قسم المستخدم + فرقه — لتوسيع تعريف «المكلّفة لي» */
      let dept: string | null = null
      let teamIds: string[] = []
      if (user) {
        const { data: prof } = await supabase.from('profiles').select('department').eq('id', user.id).maybeSingle()
        dept = prof?.department || null
        try {
          const { data: tm } = await supabase.from('team_members').select('team_id').eq('profile_id', user.id)
          teamIds = (tm || []).map((m: any) => m.team_id)
        } catch { /* الجدول غير موجود بعد */ }
      }
      setMyDept(dept)
      setMyTeamIds(teamIds)

      /* جلب كل المهام على دفعات (تجاوز سقف الـ1000 لكيلا تُخفى أي مهمة) */
      const fetchAllTasks = async () => {
        const SIZE = 1000
        const all: any[] = []
        for (let from = 0; ; from += SIZE) {
          const { data } = await supabase.from('tasks').select(`
            id, name_ar, status, task_type, priority,
            start_date, end_date, order_num, node_id,
            rating, rated_at, depends_on_task_id,
            assigned_to_user_id, assigned_to_team_id, assigned_to_department,
            reviewer_id, reopen_requested_by
          `).order('created_at', { ascending: false }).range(from, from + SIZE - 1)
          if (!data || data.length === 0) break
          all.push(...data)
          if (data.length < SIZE) break
        }
        return all
      }

      const [
        tasksData,
        { data: nodesData },
        { data: plansData },
        { data: profsData },
        { data: teamsData },
        { data: deptOpts },
      ] = await Promise.all([
        fetchAllTasks(),
        supabase.from('plan_nodes').select('id, parent_id, name_ar, plan_id, order_num, level_num, standard_code').limit(5000),
        supabase.from('plans').select('id, name_ar').limit(200),
        supabase.from('profiles').select('id, name_ar').limit(1000),
        supabase.from('teams').select('id, name_ar, color').limit(200),
        supabase.from('dropdown_options').select('value').eq('category', 'department').eq('is_active', true).order('sort_order'),
      ])

      let tasksWithAssign = tasksData || []
      /* إذا لم يكن مديراً، نعرض ما يخصّه: مكلَّف له / مقيّم / قسمه / فِرَقه */
      if (!manage && user) {
        const teamSet = new Set(teamIds)
        tasksWithAssign = tasksWithAssign.filter((t: any) =>
          t.assigned_to_user_id === user.id ||
          t.reviewer_id === user.id ||
          (dept && t.assigned_to_department === dept) ||
          (t.assigned_to_team_id && teamSet.has(t.assigned_to_team_id))
        )
      }
      setTasks(tasksWithAssign)
      setNodes(nodesData   || [])
      setPlans(plansData   || [])
      setProfiles(profsData|| [])
      setTeams(teamsData   || [])
      setDeptOptions((deptOpts || []).map((o: any) => o.value))
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

  /* ── الرقم الهرمي الفريد للمهمة (نفس منطق صفحة التفاصيل، محلياً بلا استعلام) ──
     أعمق سلف له كود معيار رسمي يؤسس البادئة، وما بعده بترتيب العقد ثم المهمة */
  const taskNumber = (nodeId: string | null | undefined, taskOrderNum: number | null | undefined): string | null => {
    if (!nodeId) return null
    const chain: { order_num: number; standard_code: string | null }[] = []
    let cur: any = nodes.find(n => n.id === nodeId)
    while (cur) {
      chain.unshift({ order_num: cur.order_num ?? 0, standard_code: (cur as any).standard_code || null })
      cur = nodes.find(n => n.id === cur.parent_id)
    }
    if (chain.length === 0) return null
    let baseIdx = -1
    for (let i = chain.length - 1; i >= 0; i--) {
      if (chain[i].standard_code) { baseIdx = i; break }
    }
    const path: (string | number)[] = []
    if (baseIdx >= 0) {
      path.push(chain[baseIdx].standard_code as string)
      for (let i = baseIdx + 1; i < chain.length; i++) path.push(chain[i].order_num)
    } else {
      for (const n of chain) path.push(n.order_num)
    }
    path.push(taskOrderNum ?? 0)
    return path.join('.')
  }

  /* ── هل المهمة محجوبة؟ (تنتظر تبعية غير منجزة) ── */
  const isBlocked = (t: any) => {
    if (!t.depends_on_task_id) return false
    const dep = tasks.find(x => x.id === t.depends_on_task_id)
    return !!dep && dep.status !== 'completed'
  }

  /* ── تصفية ── */
  const filtered = tasks.filter(t => {
    if (search    && !t.name_ar.toLowerCase().includes(search.toLowerCase())) return false
    if (statusF   && t.status   !== statusF)   return false
    if (blockedF  && !isBlocked(t))            return false
    if (priorityF && t.priority !== priorityF) return false
    if (deptF     && (t as any).assigned_to_department !== deptF) return false
    if (onlyMine) {
      const mine =
        t.assigned_to_user_id === myId ||
        (t as any).reviewer_id === myId ||
        (!!myDept && (t as any).assigned_to_department === myDept) ||
        (!!t.assigned_to_team_id && myTeamIds.includes(t.assigned_to_team_id))
      if (!mine) return false
    }
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

  /* ── شريحة الصفحة الحالية (عرض القائمة فقط — الكانبان/جانت/التقويم تعرض الكل المُصفّى) ── */
  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageClamped = Math.min(page, totalPages)
  const pageStart   = (pageClamped - 1) * PAGE_SIZE
  const pageTasks   = filtered.slice(pageStart, pageStart + PAGE_SIZE)

  /* ── إحصائيات التقييم ── */
  const ratedCount   = tasks.filter(t => t.rating != null).length
  const unratedCount = tasks.length - ratedCount

  /* ── إحصائيات ── */
  const stats = STATUS_LIST.map(s => ({
    ...s, count: tasks.filter(t => t.status === s.value).length
  }))
  const statByValue = (v: string) => stats.find(s => s.value === v)
  /* بطاقات مجمّعة حسب الموضوع (بترتيب ثابت) */
  const completionCards = ['not_started', 'in_progress', 'completed'].map(statByValue).filter(Boolean) as typeof stats
  const reviewCards     = ['submitted', 'returned'].map(statByValue).filter(Boolean) as typeof stats
  const blockedCount    = tasks.filter(isBlocked).length
  const reopenCount     = tasks.filter(t => (t as any).reopen_requested_by).length

  /* ── هل المهمة متأخرة؟ ── */
  const isOverdue = (t: any) =>
    t.status !== 'completed' && t.end_date && new Date(t.end_date) < new Date()

  /* ── إدارة الفلاتر ── */
  const anyFilter = !!(search || statusF || priorityF || planF || teamF || deptF || onlyMine || ratingF || reopenF || blockedF)
  const clearAllFilters = () => {
    setSearch(''); setStatusF(''); setPriorityF(''); setPlanF(''); setTeamF('')
    setDeptF(''); setOnlyMine(false); setRatingF(''); setReopenF(false); setBlockedF(false)
  }

  /* تغيير الحالة يُدار حصراً من صفحة المهمة عبر آلة الحالات (سير العمل + بوّابة الأدلة) */

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

      {/* ── فلاتر الحالة مجمّعة حسب الموضوع (بالنقر) ── */}
      <div className="space-y-3">

        {/* حالة الإنجاز */}
        <div>
          <span className="block text-xs font-bold text-slate-400 mb-1.5">حالة الإنجاز</span>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {completionCards.map(s => (
              <button key={s.value}
                onClick={() => setStatusF(statusF === s.value ? '' : s.value)}
                className={`rounded-xl border px-2 py-2.5 text-center transition-all shadow-sm
                  ${statusF === s.value ? 'border-violet-400 ring-2 ring-violet-200' : 'bg-white border-slate-200 hover:border-violet-200'}`}>
                <div className="text-xl font-bold text-slate-800 leading-none">{s.count}</div>
                <div className={`text-[11px] font-medium mt-1.5 px-1.5 py-0.5 rounded-full inline-block ${s.bg}`}>{s.label}</div>
              </button>
            ))}
            {/* محجوبة (تنتظر تبعية) */}
            <button onClick={() => setBlockedF(!blockedF)}
              className={`rounded-xl border px-2 py-2.5 text-center transition-all shadow-sm
                ${blockedF ? 'border-violet-400 ring-2 ring-violet-200' : 'bg-white border-slate-200 hover:border-violet-200'}`}>
              <div className="text-xl font-bold text-slate-800 leading-none">{blockedCount}</div>
              <div className="text-[11px] font-medium mt-1.5 px-1.5 py-0.5 rounded-full inline-block bg-orange-50 text-orange-600">محجوبة</div>
            </button>
            {/* بانتظار إعادة فتح — لمن يملك إدارة المهام */}
            {canManage && (
              <button onClick={() => setReopenF(!reopenF)}
                className={`rounded-xl border px-2 py-2.5 text-center transition-all shadow-sm
                  ${reopenF ? 'border-amber-400 ring-2 ring-amber-200' : 'bg-white border-slate-200 hover:border-amber-200'}`}>
                <div className="text-xl font-bold text-slate-800 leading-none">{reopenCount}</div>
                <div className="text-[11px] font-medium mt-1.5 px-1.5 py-0.5 rounded-full inline-block bg-amber-50 text-amber-700">بانتظار إعادة فتح</div>
              </button>
            )}
          </div>
        </div>

        {/* حالة التقييم */}
        <div>
          <span className="block text-xs font-bold text-slate-400 mb-1.5">حالة التقييم</span>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {/* لم تُقيّم */}
            <button onClick={() => setRatingF(ratingF === 'unrated' ? '' : 'unrated')}
              className={`rounded-xl border px-2 py-2.5 text-center transition-all shadow-sm
                ${ratingF === 'unrated' ? 'border-violet-400 ring-2 ring-violet-200' : 'bg-white border-slate-200 hover:border-violet-200'}`}>
              <div className="text-xl font-bold text-slate-800 leading-none">{unratedCount}</div>
              <div className="text-[11px] font-medium mt-1.5 px-1.5 py-0.5 rounded-full inline-block bg-slate-100 text-slate-500">لم تُقيَّم</div>
            </button>
            {/* مرفوعة للتقييم + معادة للتعديل */}
            {reviewCards.map(s => (
              <button key={s.value}
                onClick={() => setStatusF(statusF === s.value ? '' : s.value)}
                className={`rounded-xl border px-2 py-2.5 text-center transition-all shadow-sm
                  ${statusF === s.value ? 'border-violet-400 ring-2 ring-violet-200' : 'bg-white border-slate-200 hover:border-violet-200'}`}>
                <div className="text-xl font-bold text-slate-800 leading-none">{s.count}</div>
                <div className={`text-[11px] font-medium mt-1.5 px-1.5 py-0.5 rounded-full inline-block ${s.bg}`}>{s.label}</div>
              </button>
            ))}
            {/* مُقيَّمة */}
            <button onClick={() => setRatingF(ratingF === 'rated' ? '' : 'rated')}
              className={`rounded-xl border px-2 py-2.5 text-center transition-all shadow-sm
                ${ratingF === 'rated' ? 'border-violet-400 ring-2 ring-violet-200' : 'bg-white border-slate-200 hover:border-violet-200'}`}>
              <div className="text-xl font-bold text-slate-800 leading-none">{ratedCount}</div>
              <div className="text-[11px] font-medium mt-1.5 px-1.5 py-0.5 rounded-full inline-block" style={{ background: 'var(--maroon-50)', color: 'var(--maroon-700)' }}>مُقيَّمة</div>
            </button>
          </div>

          {/* درجة التقييم (فرعي — يُعطَّل عند اختيار «لم تُقيَّم») */}
          {ratedCount > 0 && (() => {
            const gradesDisabled = ratingF === 'unrated'
            return (
              <div className={`flex items-center gap-2 flex-wrap mt-2 ${gradesDisabled ? 'opacity-40' : ''}`}>
                <span className="text-xs font-bold text-slate-400 flex-shrink-0">درجة التقييم:</span>
                {[5,4,3,2,1].map(r => {
                  const cnt = tasks.filter(t => t.rating === r).length
                  if (cnt === 0) return null
                  const info = RATING_INFO[r]
                  return (
                    <button key={r} disabled={gradesDisabled}
                      onClick={() => setRatingF(ratingF === String(r) ? '' : String(r))}
                      className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium border transition-all disabled:cursor-not-allowed enabled:hover:scale-105"
                      style={{
                        background: info.bg, color: info.fg, borderColor: info.bg,
                        outline: ratingF === String(r) ? `2px solid ${info.bg}` : 'none',
                        outlineOffset: '2px',
                      }}>
                      <Star size={10} /> {info.label} <span className="font-bold">{cnt}</span>
                    </button>
                  )
                })}
              </div>
            )
          })()}
        </div>
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

        <select value={deptF} onChange={e => setDeptF(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
          <option value="">كل الأقسام</option>
          {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        <button onClick={() => setOnlyMine(!onlyMine)}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors
            ${onlyMine ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}>
          <UserRound size={14} /> المكلّفة لي
        </button>

        {anyFilter && (
          <button onClick={clearAllFilters}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
            ✕ إزالة كل الفلاتر
          </button>
        )}
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
          {(search || statusF || priorityF || planF || teamF || deptF || onlyMine || ratingF || reopenF) && (
            <button onClick={() => { setSearch(''); setStatusF(''); setPriorityF(''); setPlanF(''); setTeamF(''); setDeptF(''); setOnlyMine(false); setRatingF(''); setReopenF(false) }}
              className="mt-3 text-sm text-violet-600 hover:underline">مسح الفلاتر</button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-50">
            {pageTasks.map((task, idx) => {
              const statusInfo  = STATUS_LIST.find(s => s.value === task.status)
              const assignee    = profiles.find(p => p.id === task.assigned_to_user_id)
              const assignTeam  = teams.find(t => t.id === task.assigned_to_team_id)
              const assignDept  = (task as any).assigned_to_department as string | null
              const overdue     = isOverdue(task)
              const path        = buildPath(task.node_id ?? null)

              return (
                <Link key={task.id} href={`/dashboard/tasks/${task.id}`}
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors group">

                  {/* الرقم الهرمي الفريد للمهمة (مثل 1.1.2.2) */}
                  {(() => {
                    const num = taskNumber(task.node_id ?? null, (task as any).order_num)
                    return num ? (
                      <span className="flex-shrink-0 min-w-[2.5rem] text-center text-xs font-bold text-violet-700 bg-violet-50 border border-violet-100 rounded-md px-1.5 py-0.5 tabular-nums"
                        title="رقم المهمة في الخطة">
                        {num}
                      </span>
                    ) : (
                      <span className="flex-shrink-0 w-7 text-center text-xs font-semibold text-slate-300 tabular-nums">
                        {pageStart + idx + 1}
                      </span>
                    )
                  })()}

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
                    {(assignee || assignTeam || assignDept) && (
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
                        {assignDept && (
                          <span className="flex items-center gap-1 text-xs bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full border border-violet-200">
                            🏷️ {assignDept}
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
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs text-slate-400">
              {filtered.length === 0
                ? 'لا مهام'
                : `عرض ${pageStart + 1}–${pageStart + pageTasks.length} من ${filtered.length}`}
              {filtered.length !== tasks.length && <span className="text-slate-300"> · (الإجمالي {tasks.length})</span>}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={pageClamped <= 1}
                  className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:border-violet-300 transition-colors">
                  السابق
                </button>
                <span className="text-xs text-slate-500">صفحة {pageClamped} من {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={pageClamped >= totalPages}
                  className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:border-violet-300 transition-colors">
                  التالي
                </button>
              </div>
            )}
          </div>
        </div>
      )
      )}
    </div>
  )
}

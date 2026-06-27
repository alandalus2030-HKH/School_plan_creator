'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { LayoutGrid, Loader2, CircleCheckBig, Clock, AlertTriangle, Star, Paperclip, FolderOpen, BadgeCheck, User, ChevronDown, Bell, Download, ListChecks, TrendingUp, Lock, Map as MapIcon } from 'lucide-react'
import NoAccess from '@/components/NoAccess'
import { usePermissions } from '@/lib/PermissionsContext'
import { toast } from '@/components/Toast'

type TaskRow = { id: string; name_ar: string; status: string; end_date: string | null; overdue: boolean }
type Metrics = {
  total: number; completed: number; inProgress: number; notStarted: number
  overdue: number; progress: number; avgRating: number | null; evidence: number
  ratingSum?: number; ratingCount?: number
}
type PlanRow = {
  id: string; name_ar: string; department: string | null; plan_category: string | null
  owner_id: string | null; owner_name: string | null; approved_at: string | null; frozen_at: string | null
  tasks: TaskRow[]; metrics: Metrics
}

const NO_DEPT = 'غير مصنّفة'

/* مرشّحات الحالة (متأخرة وسم محسوب لا حالة فعلية) */
type StatusFilter = 'all' | 'completed' | 'in_progress' | 'not_started' | 'overdue'
const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all',         label: 'الكل' },
  { key: 'completed',   label: 'منجزة' },
  { key: 'in_progress', label: 'جارية' },
  { key: 'not_started', label: 'لم تبدأ' },
  { key: 'overdue',     label: 'متأخرة' },
]
const STATUS_META: Record<string, { ar: string; cls: string }> = {
  completed:   { ar: 'منجزة',  cls: 'bg-violet-100 text-violet-800' },
  in_progress: { ar: 'جارية',  cls: 'bg-violet-50 text-violet-700' },
  not_started: { ar: 'لم تبدأ', cls: 'bg-slate-100 text-slate-600' },
}

function matchTask(t: TaskRow, f: StatusFilter): boolean {
  if (f === 'all')     return true
  if (f === 'overdue') return t.overdue
  return t.status === f
}

function rollup(plans: PlanRow[]): Metrics {
  const m: Metrics = { total: 0, completed: 0, inProgress: 0, notStarted: 0, overdue: 0, progress: 0, avgRating: null, evidence: 0 }
  let rSum = 0, rCount = 0
  for (const p of plans) {
    m.total += p.metrics.total; m.completed += p.metrics.completed
    m.inProgress += p.metrics.inProgress; m.notStarted += p.metrics.notStarted
    m.overdue += p.metrics.overdue; m.evidence += p.metrics.evidence
    /* تقييم مرجّح بعدد المهام المُقيَّمة (لا متوسط المتوسطات) */
    rSum += p.metrics.ratingSum ?? 0
    rCount += p.metrics.ratingCount ?? 0
  }
  m.progress = m.total > 0 ? Math.round((m.completed / m.total) * 100) : 0
  m.avgRating = rCount > 0 ? Math.round((rSum / rCount) * 10) / 10 : null
  return m
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all"
        style={{ width: `${value}%`, background: 'var(--gradient-button, linear-gradient(90deg,#8a1538,#a83356))' }} />
    </div>
  )
}

type TrendPoint = {
  captured_on: string; department: string
  total: number; completed: number; overdue: number
  rating_sum: number; rating_count: number; evidence_accepted: number
}

/* رسم خطّي بسيط لنسبة الإنجاز عبر الزمن (SVG، بلا مكتبات) */
function TrendChart({ series }: { series: { date: string; progress: number; completed: number; total: number }[] }) {
  if (series.length < 2) {
    return (
      <p className="text-sm text-slate-400 py-6 text-center">
        نقطة بيانات واحدة حتى الآن — سيتشكّل خط الاتجاه تلقائياً بعد لقطات الأسابيع القادمة (تُلتقط كل اثنين).
      </p>
    )
  }
  const W = 720, H = 200, padX = 44, padY = 22
  const xs = (i: number) => padX + (i * (W - 2 * padX)) / (series.length - 1)
  const ys = (v: number) => padY + (1 - v / 100) * (H - 2 * padY)
  const linePts = series.map((s, i) => `${xs(i)},${ys(s.progress)}`).join(' ')
  const areaPts = `${xs(0)},${ys(0)} ${linePts} ${xs(series.length - 1)},${ys(0)}`
  const fmt = (d: string) => new Date(d).toLocaleDateString('ar-QA', { month: 'numeric', day: 'numeric' })
  const last = series[series.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 220 }}>
      {[0, 50, 100].map(g => (
        <g key={g}>
          <line x1={padX} x2={W - padX} y1={ys(g)} y2={ys(g)} stroke="#e2e8f0" strokeWidth={1} />
          <text x={padX - 6} y={ys(g) + 4} textAnchor="end" fontSize={11} fill="#94a3b8">{g}%</text>
        </g>
      ))}
      <polygon points={areaPts} fill="var(--maroon-600, #8a1538)" opacity={0.08} />
      <polyline points={linePts} fill="none" stroke="var(--maroon-600, #8a1538)" strokeWidth={2.5}
        strokeLinejoin="round" strokeLinecap="round" />
      {series.map((s, i) => (
        <g key={s.date}>
          <circle cx={xs(i)} cy={ys(s.progress)} r={3.5} fill="var(--maroon-600, #8a1538)" />
          {(i === 0 || i === series.length - 1 || i % Math.ceil(series.length / 8) === 0) && (
            <text x={xs(i)} y={H - 4} textAnchor="middle" fontSize={10} fill="#94a3b8">{fmt(s.date)}</text>
          )}
        </g>
      ))}
      <text x={xs(series.length - 1)} y={ys(last.progress) - 8} textAnchor="end" fontSize={12}
        fontWeight="bold" fill="var(--maroon-700, #6f1029)">{last.progress}%</text>
    </svg>
  )
}

function StatChip({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg ${tone || 'bg-slate-50 text-slate-600'}`}>
      {icon} <span className="font-semibold">{value}</span> {label && <span className="opacity-70">{label}</span>}
    </span>
  )
}

export default function AggregatePage() {
  const [plans,    setPlans]    = useState<PlanRow[]>([])
  const { userId, can } = usePermissions()
  const [loading,  setLoading]  = useState(true)
  const [denied,   setDenied]   = useState(false)
  const [selDepts, setSelDepts] = useState<string[]>([])
  const [status,   setStatus]   = useState<StatusFilter>('all')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [mineOnly, setMineOnly] = useState(false)   // مرشّح «خططي»
  const [planState, setPlanState] = useState<'all' | 'approved' | 'unapproved' | 'frozen' | 'active'>('all')  // حالة الخطة
  const [notifying, setNotifying] = useState<string | null>(null)
  const [groupBy,  setGroupBy]  = useState<'department' | 'plan_category' | 'owner' | 'approval'>('department')
  const [trend,    setTrend]    = useState<TrendPoint[]>([])

  useEffect(() => {
    ;(async () => {
      const [res, tRes] = await Promise.all([
        fetch('/api/aggregate'),
        fetch('/api/aggregate/trend'),
      ])
      if (res.status === 403) { setDenied(true); setLoading(false); return }
      const j = await res.json().catch(() => ({ plans: [] }))
      setPlans(j.plans || [])
      const tj = await tRes.json().catch(() => ({ points: [] }))
      setTrend(tj.points || [])
      setLoading(false)
    })()
  }, [])

  const ownsAny = useMemo(() => plans.some(p => p.owner_id === userId), [plans, userId])

  const notifyOwner = async (planId: string) => {
    setNotifying(planId)
    const res = await fetch(`/api/plans/${planId}/notify-owner`, { method: 'POST' })
    const j = await res.json().catch(() => ({}))
    setNotifying(null)
    if (!res.ok) { toast(j.error || 'تعذّر إرسال التنبيه', 'error'); return }
    toast('تم تنبيه صاحب الخطة')
  }

  const departments = useMemo(() => {
    const s = new Set<string>()
    plans.forEach(p => s.add(p.department || NO_DEPT))
    return [...s].sort()
  }, [plans])

  const shown = plans
    .filter(p => selDepts.length === 0 || selDepts.includes(p.department || NO_DEPT))
    .filter(p => !mineOnly || p.owner_id === userId)
    .filter(p => {
      if (planState === 'approved')   return !!p.approved_at
      if (planState === 'unapproved') return !p.approved_at
      if (planState === 'frozen')     return !!p.frozen_at
      if (planState === 'active')     return !p.frozen_at
      return true
    })
  const overall = useMemo(() => rollup(shown), [shown])

  /* عدد المهام المطابقة لمرشّح الحالة عبر الخطط المعروضة */
  const matchCount = useMemo(() => {
    if (status === 'all') return null
    return shown.reduce((n, p) => n + p.tasks.filter(t => matchTask(t, status)).length, 0)
  }, [shown, status])

  /* مفتاح التجميع حسب البُعد المختار */
  const groupLabelOf = (p: PlanRow): string => {
    if (groupBy === 'plan_category') return p.plan_category || 'بلا نوع'
    if (groupBy === 'owner')         return p.owner_name || 'بلا صاحب'
    if (groupBy === 'approval')      return p.approved_at ? 'خطط معتمدة' : 'خطط غير معتمدة'
    return p.department || NO_DEPT
  }

  /* تجميع: بُعد → خطط (تُخفى الخطط بلا مهام مطابقة عند تفعيل مرشّح حالة) */
  const byDept = useMemo(() => {
    const groups: { dept: string; plans: PlanRow[] }[] = []
    const map = new Map<string, PlanRow[]>()
    for (const p of shown) {
      if (status !== 'all' && !p.tasks.some(t => matchTask(t, status))) continue
      const d = groupLabelOf(p)
      if (!map.has(d)) { map.set(d, []); groups.push({ dept: d, plans: map.get(d)! }) }
      map.get(d)!.push(p)
    }
    groups.sort((a, b) => a.dept.localeCompare(b.dept, 'ar'))
    return groups
  }, [shown, status, groupBy])

  /* سلسلة الاتجاه: نسبة الإنجاز عبر التواريخ (تحترم مرشّح الأقسام) */
  const trendSeries = useMemo(() => {
    const pts = trend.filter(p => selDepts.length === 0 || selDepts.includes(p.department))
    const byDate = new Map<string, { completed: number; total: number }>()
    for (const p of pts) {
      const cur = byDate.get(p.captured_on) || { completed: 0, total: 0 }
      cur.completed += p.completed; cur.total += p.total
      byDate.set(p.captured_on, cur)
    }
    return [...byDate.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, v]) => ({
        date, completed: v.completed, total: v.total,
        progress: v.total > 0 ? Math.round((v.completed * 100) / v.total) : 0,
      }))
  }, [trend, selDepts])

  /* تصدير الخطط المعروضة Excel (للتقارير) — عبر route التصدير العام */
  const [exporting, setExporting] = useState(false)
  const exportXlsx = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const rows = shown.map(p => ({
        'القسم': p.department || NO_DEPT,
        'الخطة': p.name_ar,
        'النوع': p.plan_category || '',
        'صاحب الخطة': p.owner_name || '',
        'نسبة الإنجاز %': p.metrics.progress,
        'منجزة': p.metrics.completed,
        'إجمالي المهام': p.metrics.total,
        'متأخرة': p.metrics.overdue,
        'متوسط التقييم': p.metrics.avgRating ?? '',
        'أدلة مقبولة': p.metrics.evidence,
        'معتمدة': p.approved_at ? 'نعم' : 'لا',
        'مجمّدة': p.frozen_at ? 'نعم' : 'لا',
      }))
      const fileBase = `لوحة-التجميع-${new Date().toISOString().slice(0, 10)}`
      const res = await fetch('/api/export/xlsx', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, fileName: fileBase, sheetName: 'لوحة التجميع' }),
      })
      if (!res.ok) { toast('تعذّر تصدير الملف', 'error'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `${fileBase}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch { toast('تعذّر تصدير الملف', 'error') }
    finally { setExporting(false) }
  }

  /* رابط الغوص إلى «كل المهام» مع تمرير المرشّحات (الحالة الفعلية فقط — «متأخرة» وسم محسوب) */
  const drillUrl = (extra: Record<string, string>) => {
    const q = new URLSearchParams(extra)
    if (status !== 'all' && status !== 'overdue') q.set('status', status)
    return `/dashboard/tasks?${q.toString()}`
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64"><Loader2 size={28} className="animate-spin text-violet-500" /></div>
  )
  if (denied) return <NoAccess />

  const filterActive = status !== 'all'

  const TaskList = ({ p }: { p: PlanRow }) => {
    const list = p.tasks.filter(t => matchTask(t, status))
    if (list.length === 0) return <p className="text-xs text-slate-400 px-1 py-2">لا مهام مطابقة</p>
    return (
      <div className="space-y-1.5 mt-2">
        {list.map(t => {
          const meta = STATUS_META[t.status] || STATUS_META.not_started
          return (
            <Link key={t.id} href={`/dashboard/tasks/${t.id}`}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${meta.cls}`}>{meta.ar}</span>
              {t.overdue && <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 inline-flex items-center gap-1"><AlertTriangle size={10} /> متأخرة</span>}
              <span className="text-sm text-slate-700 flex-1 truncate">{t.name_ar}</span>
              {t.end_date && <span className="text-[11px] text-slate-400">{new Date(t.end_date).toLocaleDateString('ar-QA')}</span>}
            </Link>
          )
        })}
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* ═══ الجزء المثبّت: الترويسة + المؤشرات + الفلاتر ═══ */}
      <div className="sticky top-0 z-20 bg-slate-50 -mt-6 pt-6 pb-4 mb-4 border-b border-slate-200 space-y-4">
      {/* الترويسة */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white flex-shrink-0"
          style={{ background: 'var(--gradient-button, #8a1538)' }}>
          <LayoutGrid size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">لوحة التجميع</h1>
          <p className="text-sm text-slate-500">متابعة خطط الأقسام ومؤشراتها المجمّعة</p>
        </div>
        <div className="mr-auto flex items-center gap-2">
          {can('manage_plans') && (
            <Link href="/dashboard/plans"
              className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700 transition-colors">
              <MapIcon size={16} /> إدارة الخطط
            </Link>
          )}
          {plans.length > 0 && (
            <button onClick={exportXlsx} disabled={exporting}
              className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <span className="inline-flex">{exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}</span>
              <span>تصدير Excel</span>
            </button>
          )}
        </div>
      </div>

      {plans.length > 0 && (
        <>
          {/* مؤشرات إجمالية */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs text-slate-400 mb-1">الخطط</p>
              <p className="text-2xl font-bold text-slate-800">{shown.length}</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs text-slate-400 mb-1">نسبة الإنجاز</p>
              <p className="text-2xl font-bold text-violet-700">{overall.progress}%</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs text-slate-400 mb-1">المهام</p>
              <p className="text-2xl font-bold text-slate-800">{overall.completed}<span className="text-sm text-slate-400">/{overall.total}</span></p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs text-slate-400 mb-1">متأخرة</p>
              <p className={`text-2xl font-bold ${overall.overdue > 0 ? 'text-red-600' : 'text-slate-800'}`}>{overall.overdue}</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs text-slate-400 mb-1">أدلة مقبولة</p>
              <p className="text-2xl font-bold text-slate-800">{overall.evidence}</p>
            </div>
          </div>

          {/* فلاتر مضغوطة — صفّ واحد (قوائم منسدلة) */}
          <div className="flex flex-wrap items-center gap-2">
            <select value={groupBy} onChange={e => setGroupBy(e.target.value as 'department' | 'plan_category' | 'owner' | 'approval')}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
              <option value="department">التجميع: حسب القسم</option>
              <option value="plan_category">التجميع: حسب النوع</option>
              <option value="owner">التجميع: حسب صاحب الخطة</option>
              <option value="approval">التجميع: حسب الاعتماد</option>
            </select>
            <select value={status} onChange={e => setStatus(e.target.value as StatusFilter)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
              {STATUS_FILTERS.map(f => (
                <option key={f.key} value={f.key}>{f.key === 'all' ? 'كل الحالات' : f.label}</option>
              ))}
            </select>
            <select value={planState} onChange={e => setPlanState(e.target.value as 'all' | 'approved' | 'unapproved' | 'frozen' | 'active')}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
              <option value="all">حالة الخطة: الكل</option>
              <option value="approved">معتمدة</option>
              <option value="unapproved">غير معتمدة</option>
              <option value="frozen">مجمّدة</option>
              <option value="active">نشطة (غير مجمّدة)</option>
            </select>
            {ownsAny && (
              <button onClick={() => setMineOnly(v => !v)}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm border transition-colors ${mineOnly ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}>
                <User size={13} /> خططي فقط
              </button>
            )}
            {matchCount != null && <span className="text-xs text-slate-500">({matchCount} مهمة مطابقة)</span>}
            {selDepts.length > 0 && (
              <button onClick={() => setSelDepts([])} className="text-xs text-violet-600 hover:underline mr-auto">مسح تحديد الأقسام</button>
            )}
          </div>

          {/* مرشّح الأقسام — صفّ مستقل (يظهر عند وجود أكثر من قسم) */}
          {departments.length > 1 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs text-slate-400">الأقسام:</span>
              <button onClick={() => setSelDepts([])}
                className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${selDepts.length === 0 ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}>
                الكل
              </button>
              {departments.map(d => {
                const on = selDepts.includes(d)
                return (
                  <button key={d} onClick={() => setSelDepts(prev => on ? prev.filter(x => x !== d) : [...prev, d])}
                    className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${on ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}>
                    {d}
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}
      </div>{/* ═══ نهاية الجزء المثبّت ═══ */}

      {plans.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center">
          <FolderOpen size={40} className="mx-auto mb-3" style={{ color: 'var(--maroon-300)' }} />
          <p className="text-sm font-semibold text-slate-700 mb-1">لا توجد خطط ضمن نطاقك</p>
          <p className="text-xs text-slate-400">صنّف الخطط (قسم/نوع) أو راجع إشراف الأقسام في الإعدادات.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* اتجاه نسبة الإنجاز عبر الزمن */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={18} className="text-violet-600" />
              <h2 className="font-bold text-slate-800">اتجاه نسبة الإنجاز</h2>
              <span className="text-xs text-slate-400">
                {selDepts.length === 0 ? 'كل الأقسام ضمن نطاقك' : `الأقسام المحددة (${selDepts.length})`}
              </span>
            </div>
            <TrendChart series={trendSeries} />
          </div>

          {/* المجموعات حسب القسم */}
          {byDept.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-sm text-slate-400">
              لا مهام مطابقة للمرشّح الحالي.
            </div>
          ) : (
            <div className="space-y-5">
              {byDept.map(({ dept, plans: dplans }) => {
                const r = rollup(dplans)
                return (
                  <div key={dept} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* رأس المجموعة */}
                    <div className="flex items-center gap-3 p-4 border-b border-slate-100 bg-gradient-to-l from-violet-50 to-white flex-wrap">
                      <h2 className="font-bold text-slate-800 flex-1 inline-flex items-center gap-2">
                        {dept}
                        <span className="text-xs font-normal text-slate-400">({dplans.length} خطة)</span>
                        {groupBy === 'department' && dept !== NO_DEPT && (
                          <Link href={drillUrl({ dept })} title="عرض مهام القسم في «كل المهام»"
                            className="text-xs font-normal text-violet-600 hover:underline inline-flex items-center gap-1">
                            <ListChecks size={13} /> المهام
                          </Link>
                        )}
                      </h2>
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatChip icon={<CircleCheckBig size={12} />} label="إنجاز" value={`${r.progress}%`} tone="bg-violet-50 text-violet-700" />
                        <StatChip icon={<Clock size={12} />} label="مهام" value={`${r.completed}/${r.total}`} />
                        {r.overdue > 0 && <StatChip icon={<AlertTriangle size={12} />} label="متأخرة" value={r.overdue} tone="bg-red-50 text-red-600" />}
                        {r.avgRating != null && <StatChip icon={<Star size={12} />} label="تقييم" value={r.avgRating} tone="bg-amber-50 text-amber-700" />}
                      </div>
                    </div>

                    {/* خطط القسم */}
                    <div className="divide-y divide-slate-100">
                      {dplans.map(p => {
                        const open = filterActive || expanded[p.id]
                        return (
                          <div key={p.id} className="p-4">
                            <div className="flex items-center gap-3">
                              {/* زر التوسيع */}
                              <button onClick={() => setExpanded(e => ({ ...e, [p.id]: !e[p.id] }))}
                                className="p-1 text-slate-400 hover:text-violet-600 flex-shrink-0"
                                title="عرض المهام">
                                <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
                              </button>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                  <span className="text-sm font-semibold text-slate-800 truncate">{p.name_ar}</span>
                                  {p.plan_category && <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{p.plan_category}</span>}
                                  {p.approved_at && <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 inline-flex items-center gap-1"><BadgeCheck size={11} /> معتمدة</span>}
                                  {p.frozen_at && <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 inline-flex items-center gap-1"><Lock size={11} /> مجمّدة</span>}
                                  {p.metrics.total === 0 && <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200"><AlertTriangle size={11} /> لا مهام</span>}
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="flex-1 max-w-xs"><ProgressBar value={p.metrics.progress} /></div>
                                  <span className="text-xs text-slate-500 font-mono">{p.metrics.progress}%</span>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap mt-1.5">
                                  <StatChip icon={<Clock size={12} />} label="مهام" value={`${p.metrics.completed}/${p.metrics.total}`} />
                                  {p.metrics.overdue > 0 && <StatChip icon={<AlertTriangle size={12} />} label="متأخرة" value={p.metrics.overdue} tone="bg-red-50 text-red-600" />}
                                  {p.metrics.avgRating != null && <StatChip icon={<Star size={12} />} label="" value={p.metrics.avgRating} tone="bg-amber-50 text-amber-700" />}
                                  <StatChip icon={<Paperclip size={12} />} label="أدلة مقبولة" value={p.metrics.evidence} />
                                  {p.owner_name && <StatChip icon={<User size={12} />} label="" value={p.owner_name} tone="bg-slate-50 text-slate-500" />}
                                  {p.owner_id && p.owner_id !== userId && (
                                    <button onClick={() => notifyOwner(p.id)} disabled={notifying === p.id}
                                      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition-colors"
                                      title="تنبيه صاحب الخطة">
                                      <Bell size={12} /> {notifying === p.id ? '...' : 'تنبيه'}
                                    </button>
                                  )}
                                  <div className="mr-auto inline-flex items-center gap-3">
                                    {p.metrics.total > 0 && (
                                      <Link href={drillUrl({ plan: p.id })} className="text-xs text-violet-600 hover:underline inline-flex items-center gap-1" title="عرض مهام هذه الخطة">
                                        <ListChecks size={13} /> المهام
                                      </Link>
                                    )}
                                    <Link href={`/dashboard/plans/${p.id}`} className="text-xs text-violet-600 hover:underline">فتح الخطة ←</Link>
                                  </div>
                                </div>
                                {/* قائمة المهام عند التوسيع/التصفية */}
                                {open && <TaskList p={p} />}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

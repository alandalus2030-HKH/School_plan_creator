'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { LayoutGrid, Loader2, CircleCheckBig, Clock, AlertTriangle, Star, Paperclip, FolderOpen, BadgeCheck, User } from 'lucide-react'
import NoAccess from '@/components/NoAccess'

type Metrics = {
  total: number; completed: number; inProgress: number; notStarted: number
  overdue: number; progress: number; avgRating: number | null; evidence: number
}
type PlanRow = {
  id: string; name_ar: string; department: string | null; plan_category: string | null
  owner_id: string | null; owner_name: string | null; approved_at: string | null; metrics: Metrics
}

const NO_DEPT = 'غير مصنّفة'

function rollup(plans: PlanRow[]): Metrics {
  const m: Metrics = { total: 0, completed: 0, inProgress: 0, notStarted: 0, overdue: 0, progress: 0, avgRating: null, evidence: 0 }
  let rSum = 0, rCount = 0
  for (const p of plans) {
    m.total += p.metrics.total; m.completed += p.metrics.completed
    m.inProgress += p.metrics.inProgress; m.notStarted += p.metrics.notStarted
    m.overdue += p.metrics.overdue; m.evidence += p.metrics.evidence
    if (p.metrics.avgRating != null) { rSum += p.metrics.avgRating; rCount++ }
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

function StatChip({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg ${tone || 'bg-slate-50 text-slate-600'}`}>
      {icon} <span className="font-semibold">{value}</span> <span className="opacity-70">{label}</span>
    </span>
  )
}

export default function AggregatePage() {
  const [plans,    setPlans]    = useState<PlanRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [denied,   setDenied]   = useState(false)
  const [selDepts, setSelDepts] = useState<string[]>([])

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/aggregate')
      if (res.status === 403) { setDenied(true); setLoading(false); return }
      const j = await res.json().catch(() => ({ plans: [] }))
      setPlans(j.plans || [])
      setLoading(false)
    })()
  }, [])

  /* الأقسام المتاحة */
  const departments = useMemo(() => {
    const s = new Set<string>()
    plans.forEach(p => s.add(p.department || NO_DEPT))
    return [...s].sort()
  }, [plans])

  const shown = selDepts.length === 0 ? plans : plans.filter(p => selDepts.includes(p.department || NO_DEPT))
  const overall = useMemo(() => rollup(shown), [shown])

  /* تجميع: قسم → نوع */
  const byDept = useMemo(() => {
    const groups: { dept: string; plans: PlanRow[] }[] = []
    const map = new Map<string, PlanRow[]>()
    for (const p of shown) {
      const d = p.department || NO_DEPT
      if (!map.has(d)) { map.set(d, []); groups.push({ dept: d, plans: map.get(d)! }) }
      map.get(d)!.push(p)
    }
    groups.sort((a, b) => a.dept.localeCompare(b.dept, 'ar'))
    return groups
  }, [shown])

  if (loading) return (
    <div className="flex items-center justify-center h-64"><Loader2 size={28} className="animate-spin text-violet-500" /></div>
  )
  if (denied) return <NoAccess />

  return (
    <div className="max-w-6xl mx-auto space-y-5">
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
      </div>

      {plans.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center">
          <FolderOpen size={40} className="mx-auto mb-3" style={{ color: 'var(--maroon-300)' }} />
          <p className="text-sm font-semibold text-slate-700 mb-1">لا توجد خطط ضمن نطاقك</p>
          <p className="text-xs text-slate-400">صنّف الخطط (قسم/نوع) أو راجع إشراف الأقسام في الإعدادات.</p>
        </div>
      ) : (
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
              <p className="text-xs text-slate-400 mb-1">الأدلة</p>
              <p className="text-2xl font-bold text-slate-800">{overall.evidence}</p>
            </div>
          </div>

          {/* مرشّح الأقسام */}
          {departments.length > 1 && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-slate-400">ترشيح:</span>
              <button onClick={() => setSelDepts([])}
                className={`px-3 py-1.5 rounded-xl text-sm border transition-colors ${selDepts.length === 0 ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}>
                الكل
              </button>
              {departments.map(d => {
                const on = selDepts.includes(d)
                return (
                  <button key={d} onClick={() => setSelDepts(prev => on ? prev.filter(x => x !== d) : [...prev, d])}
                    className={`px-3 py-1.5 rounded-xl text-sm border transition-colors ${on ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}>
                    {d}
                  </button>
                )
              })}
            </div>
          )}

          {/* المجموعات حسب القسم */}
          <div className="space-y-5">
            {byDept.map(({ dept, plans: dplans }) => {
              const r = rollup(dplans)
              return (
                <div key={dept} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  {/* رأس القسم */}
                  <div className="flex items-center gap-3 p-4 border-b border-slate-100 bg-gradient-to-l from-violet-50 to-white flex-wrap">
                    <h2 className="font-bold text-slate-800 flex-1">{dept}
                      <span className="text-xs font-normal text-slate-400 mr-2">({dplans.length} خطة)</span>
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
                    {dplans.map(p => (
                      <Link key={p.id} href={`/dashboard/plans/${p.id}`}
                        className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <span className="text-sm font-semibold text-slate-800 truncate">{p.name_ar}</span>
                            {p.plan_category && <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{p.plan_category}</span>}
                            {p.approved_at && <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 inline-flex items-center gap-1"><BadgeCheck size={11} /> معتمدة</span>}
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex-1 max-w-xs"><ProgressBar value={p.metrics.progress} /></div>
                            <span className="text-xs text-slate-500 font-mono">{p.metrics.progress}%</span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap mt-1.5">
                            <StatChip icon={<Clock size={12} />} label="مهام" value={`${p.metrics.completed}/${p.metrics.total}`} />
                            {p.metrics.overdue > 0 && <StatChip icon={<AlertTriangle size={12} />} label="متأخرة" value={p.metrics.overdue} tone="bg-red-50 text-red-600" />}
                            {p.metrics.avgRating != null && <StatChip icon={<Star size={12} />} label="" value={p.metrics.avgRating} tone="bg-amber-50 text-amber-700" />}
                            <StatChip icon={<Paperclip size={12} />} label="أدلة" value={p.metrics.evidence} />
                            {p.owner_name && <StatChip icon={<User size={12} />} label="" value={p.owner_name} tone="bg-slate-50 text-slate-500" />}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

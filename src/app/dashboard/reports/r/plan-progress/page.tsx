'use client'

import { useEffect, useState } from 'react'
import ReportShell from '@/components/reports/ReportShell'
import NoAccess from '@/components/NoAccess'

type Branch = { id: string; name_ar: string; total: number; completed: number; overdue: number; progress: number }
type Data = {
  plan: { name_ar: string; department: string | null; academic_year: string | null }
  overall: { total: number; completed: number; overdue: number; progress: number }
  branches: Branch[]
}

export default function PlanProgressReport() {
  const [plans, setPlans] = useState<{ id: string; name_ar: string }[]>([])
  const [planId, setPlanId] = useState('')
  const [d, setD] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/reports?type=plans-list')
      if (res.status === 403) { setDenied(true); setLoading(false); return }
      const j = await res.json().catch(() => ({ plans: [] }))
      setPlans(j.plans || [])
      if (j.plans?.[0]) setPlanId(j.plans[0].id)
      setLoading(false)
    })()
  }, [])

  useEffect(() => {
    if (!planId) return
    setD(null)
    fetch(`/api/reports?type=plan-progress&planId=${planId}`).then(r => r.json()).then(setD).catch(() => {})
  }, [planId])

  if (denied) return <NoAccess />

  const th = 'px-2 py-2 text-right font-semibold text-slate-600 border-b-2 border-slate-200'
  const td = 'px-2 py-1.5 text-slate-700 border-b border-slate-100'

  return (
    <>
      {/* منتقي الخطة — لا يُطبع */}
      <div className="no-print max-w-[820px] mx-auto mb-3">
        <select value={planId} onChange={e => setPlanId(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-300">
          {plans.map(p => <option key={p.id} value={p.id}>{p.name_ar}</option>)}
        </select>
      </div>

      <ReportShell
        title="تقرير تقدّم الخطة"
        subtitle={d?.plan ? `${d.plan.name_ar}${d.plan.academic_year ? ` · ${d.plan.academic_year}` : ''}` : undefined}
        loading={loading || (!!planId && !d)}>
        {d && (
          <>
            <div className="grid grid-cols-4 gap-2 mb-5 text-center">
              <div className="border border-slate-200 rounded-lg py-2"><div className="text-lg font-bold text-slate-800">{d.overall.progress}%</div><div className="text-[11px] text-slate-500">نسبة الإنجاز</div></div>
              <div className="border border-slate-200 rounded-lg py-2"><div className="text-lg font-bold text-slate-800">{d.overall.completed}/{d.overall.total}</div><div className="text-[11px] text-slate-500">منجزة/إجمالي</div></div>
              <div className="border border-slate-200 rounded-lg py-2"><div className="text-lg font-bold text-slate-800" style={{ color: d.overall.overdue > 0 ? '#dc2626' : undefined }}>{d.overall.overdue}</div><div className="text-[11px] text-slate-500">متأخرة</div></div>
              <div className="border border-slate-200 rounded-lg py-2"><div className="text-lg font-bold text-slate-800">{d.branches.length}</div><div className="text-[11px] text-slate-500">المحاور</div></div>
            </div>

            <h3 className="font-bold text-slate-800 mb-2 text-sm">التقدّم حسب المحور</h3>
            {d.branches.length === 0 ? (
              <p className="text-center text-slate-400 py-6 text-sm">لا محاور/مهام في هذه الخطة.</p>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr><th className={th}>المحور</th><th className={th}>الإجمالي</th><th className={th}>منجزة</th><th className={th}>متأخرة</th><th className={th}>نسبة الإنجاز</th></tr>
                </thead>
                <tbody>
                  {d.branches.map(b => (
                    <tr key={b.id} className="break-inside-avoid">
                      <td className={td + ' font-medium'}>{b.name_ar}</td>
                      <td className={td}>{b.total}</td>
                      <td className={td}>{b.completed}</td>
                      <td className={td} style={{ color: b.overdue > 0 ? '#dc2626' : undefined }}>{b.overdue}</td>
                      <td className={td + ' font-bold'}>{b.progress}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </ReportShell>
    </>
  )
}

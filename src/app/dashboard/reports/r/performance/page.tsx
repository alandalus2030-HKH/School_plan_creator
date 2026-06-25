'use client'

import { useEffect, useState } from 'react'
import ReportShell from '@/components/reports/ReportShell'
import { reportQuery } from '@/lib/reportParams'
import NoAccess from '@/components/NoAccess'

type Metrics = { total: number; completed: number; overdue: number; progress: number; avgRating: number | null }
type Data = { overall: Metrics; byDept: ({ dept: string } & Metrics)[] }

export default function PerformanceReport() {
  const [d, setD] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/reports?type=performance' + reportQuery())
      if (res.status === 403) { setDenied(true); setLoading(false); return }
      setD(await res.json().catch(() => null))
      setLoading(false)
    })()
  }, [])

  if (denied) return <NoAccess />

  const th = 'px-2 py-2 text-right font-semibold text-slate-600 border-b-2 border-slate-200'
  const td = 'px-2 py-1.5 text-slate-700 border-b border-slate-100'

  return (
    <ReportShell title="تقرير تحليل الأداء" subtitle="الإنجاز والجودة على مستوى المدرسة والأقسام" loading={loading}>
      {d && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-5 text-center">
            {[
              { l: 'نسبة الإنجاز', v: `${d.overall.progress}%` },
              { l: 'منجزة/إجمالي', v: `${d.overall.completed}/${d.overall.total}` },
              { l: 'متأخرة', v: d.overall.overdue },
              { l: 'متوسط التقييم', v: d.overall.avgRating ?? '—' },
              { l: 'عدد المهام', v: d.overall.total },
            ].map(s => (
              <div key={s.l} className="border border-slate-200 rounded-lg py-2">
                <div className="text-lg font-bold text-slate-800">{s.v}</div>
                <div className="text-[11px] text-slate-500">{s.l}</div>
              </div>
            ))}
          </div>

          <h3 className="font-bold text-slate-800 mb-2 text-sm">الأداء حسب القسم (مرتّب بنسبة الإنجاز)</h3>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className={th}>القسم</th><th className={th}>الإجمالي</th><th className={th}>منجزة</th>
                <th className={th}>متأخرة</th><th className={th}>نسبة الإنجاز</th><th className={th}>متوسط التقييم</th>
              </tr>
            </thead>
            <tbody>
              {d.byDept.map(g => (
                <tr key={g.dept} className="break-inside-avoid">
                  <td className={td + ' font-medium'}>{g.dept}</td>
                  <td className={td}>{g.total}</td>
                  <td className={td}>{g.completed}</td>
                  <td className={td} style={{ color: g.overdue > 0 ? '#dc2626' : undefined }}>{g.overdue}</td>
                  <td className={td}>{g.progress}%</td>
                  <td className={td}>{g.avgRating ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </ReportShell>
  )
}

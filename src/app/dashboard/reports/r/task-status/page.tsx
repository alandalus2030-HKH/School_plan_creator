'use client'

import { useEffect, useState } from 'react'
import ReportShell from '@/components/reports/ReportShell'
import { reportQuery } from '@/lib/reportParams'
import NoAccess from '@/components/NoAccess'

const STATUS_AR: Record<string, string> = {
  not_started: 'لم تبدأ', in_progress: 'جارية', submitted: 'مرفوعة للتقييم',
  returned: 'مُعادة للتعديل', completed: 'منجزة',
}

type Data = {
  total: number
  counts: Record<string, number>
  overdue: number
  byDept: { dept: string; total: number; completed: number; overdue: number; progress: number }[]
}

export default function TaskStatusReport() {
  const [d, setD] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/reports?type=task-status' + reportQuery())
      if (res.status === 403) { setDenied(true); setLoading(false); return }
      setD(await res.json().catch(() => null))
      setLoading(false)
    })()
  }, [])

  if (denied) return <NoAccess />

  const th = 'px-2 py-2 text-right font-semibold text-slate-600 border-b-2 border-slate-200'
  const td = 'px-2 py-1.5 text-slate-700 border-b border-slate-100'

  return (
    <ReportShell title="تقرير حالة المهام" subtitle="توزيع المهام على المراحل والأقسام" loading={loading}>
      {d && (
        <>
          {/* البطاقات */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-5 text-center">
            <div className="border border-slate-200 rounded-lg py-2">
              <div className="text-lg font-bold text-slate-800">{d.total}</div>
              <div className="text-[11px] text-slate-500">الإجمالي</div>
            </div>
            {Object.keys(STATUS_AR).map(k => (
              <div key={k} className="border border-slate-200 rounded-lg py-2">
                <div className="text-lg font-bold text-slate-800">{d.counts[k] || 0}</div>
                <div className="text-[11px] text-slate-500">{STATUS_AR[k]}</div>
              </div>
            ))}
          </div>
          <p className="text-sm mb-4">
            المتأخرة: <span className="font-bold" style={{ color: d.overdue > 0 ? '#dc2626' : undefined }}>{d.overdue}</span> مهمة
          </p>

          {/* حسب القسم */}
          <h3 className="font-bold text-slate-800 mb-2 text-sm">التوزيع حسب القسم</h3>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className={th}>القسم</th><th className={th}>الإجمالي</th>
                <th className={th}>منجزة</th><th className={th}>متأخرة</th><th className={th}>نسبة الإنجاز</th>
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
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </ReportShell>
  )
}

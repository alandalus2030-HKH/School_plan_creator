'use client'

import { useEffect, useState } from 'react'
import ReportShell from '@/components/reports/ReportShell'
import { reportQuery } from '@/lib/reportParams'
import NoAccess from '@/components/NoAccess'

type Row = {
  id: string; name_ar: string; department: string | null
  total: number; active: number; completed: number; overdue: number
}

const HEAVY = 6 // عتبة الحِمل المرتفع (مهام نشطة)

export default function WorkloadReport() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/reports?type=workload' + reportQuery())
      if (res.status === 403) { setDenied(true); setLoading(false); return }
      const j = await res.json().catch(() => ({ rows: [] }))
      setRows((j.rows || []).sort((a: Row, b: Row) => b.active - a.active))
      setLoading(false)
    })()
  }, [])

  if (denied) return <NoAccess />

  const th = 'px-2 py-2 text-right font-semibold text-slate-600 border-b-2 border-slate-200'
  const td = 'px-2 py-1.5 text-slate-700 border-b border-slate-100'
  const withTasks = rows.filter(r => r.total > 0)

  return (
    <ReportShell title="تقرير عبء العمل" subtitle="توزيع المهام النشطة على الأفراد (لعدالة التوزيع ومنع الإرهاق)" loading={loading}>
      {withTasks.length === 0 ? (
        <p className="text-center text-slate-400 py-8 text-sm">لا توجد مهام مُكلَّفة لأفراد بعد.</p>
      ) : (
        <>
          <p className="text-xs text-slate-500 mb-3">يُميَّز باللون الأحمر من تجاوز {HEAVY} مهام نشطة.</p>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className={th}>الموظف</th><th className={th}>القسم</th>
                <th className={th}>نشطة</th><th className={th}>متأخرة</th>
                <th className={th}>منجزة</th><th className={th}>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {withTasks.map(r => {
                const heavy = r.active >= HEAVY
                return (
                  <tr key={r.id} className="break-inside-avoid" style={heavy ? { background: '#fef2f2' } : undefined}>
                    <td className={td + ' font-medium'}>{r.name_ar}</td>
                    <td className={td}>{r.department || '—'}</td>
                    <td className={td + ' font-bold'} style={{ color: heavy ? '#dc2626' : undefined }}>{r.active}</td>
                    <td className={td} style={{ color: r.overdue > 0 ? '#dc2626' : undefined }}>{r.overdue}</td>
                    <td className={td}>{r.completed}</td>
                    <td className={td}>{r.total}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
    </ReportShell>
  )
}

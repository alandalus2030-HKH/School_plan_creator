'use client'

import { useEffect, useState } from 'react'
import ReportShell from '@/components/reports/ReportShell'
import { reportQuery } from '@/lib/reportParams'
import NoAccess from '@/components/NoAccess'

type Row = {
  id: string; name_ar: string; department: string | null; job_title: string | null
  total: number; active: number; completed: number; overdue: number
  progress: number; avgRating: number | null
}

export default function StaffPerformanceReport() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/reports?type=staff-performance' + reportQuery())
      if (res.status === 403) { setDenied(true); setLoading(false); return }
      const j = await res.json().catch(() => ({ rows: [] }))
      setRows((j.rows || []).filter((r: Row) => r.total > 0))
      setLoading(false)
    })()
  }, [])

  if (denied) return <NoAccess />

  const th = 'px-2 py-2 text-right font-semibold text-slate-600 border-b-2 border-slate-200'
  const td = 'px-2 py-1.5 text-slate-700 border-b border-slate-100'

  return (
    <ReportShell title="تقرير أداء الموظفين" subtitle="المهام المكلَّفة والمنجزة وجودة التنفيذ لكل موظف" loading={loading}>
      {rows.length === 0 ? (
        <p className="text-center text-slate-400 py-8 text-sm">لا توجد مهام مُكلَّفة لأفراد بعد.</p>
      ) : (
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className={th}>الموظف</th><th className={th}>القسم</th>
              <th className={th}>الإجمالي</th><th className={th}>منجزة</th><th className={th}>متأخرة</th>
              <th className={th}>نسبة الإنجاز</th><th className={th}>متوسط التقييم</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="break-inside-avoid">
                <td className={td + ' font-medium'}>{r.name_ar}</td>
                <td className={td}>{r.department || '—'}</td>
                <td className={td}>{r.total}</td>
                <td className={td}>{r.completed}</td>
                <td className={td} style={{ color: r.overdue > 0 ? '#dc2626' : undefined }}>{r.overdue}</td>
                <td className={td}>{r.progress}%</td>
                <td className={td}>{r.avgRating ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ReportShell>
  )
}

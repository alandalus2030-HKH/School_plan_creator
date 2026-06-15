'use client'

import { useEffect, useState } from 'react'
import ReportShell from '@/components/reports/ReportShell'
import NoAccess from '@/components/NoAccess'

const STATUS_AR: Record<string, string> = {
  not_started: 'لم تبدأ', in_progress: 'جارية', submitted: 'مرفوعة للتقييم', returned: 'مُعادة للتعديل',
}

type Row = {
  id: string; name_ar: string; status: string; end_date: string
  plan: string | null; dept: string | null; assignee: string | null; daysLate: number
}

export default function OverdueReport() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/reports?type=overdue')
      if (res.status === 403) { setDenied(true); setLoading(false); return }
      const j = await res.json().catch(() => ({ rows: [] }))
      setRows(j.rows || [])
      setLoading(false)
    })()
  }, [])

  if (denied) return <NoAccess />

  const th = 'px-2 py-2 text-right font-semibold text-slate-600 border-b-2 border-slate-200'
  const td = 'px-2 py-1.5 text-slate-700 border-b border-slate-100'
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('ar-QA', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <ReportShell title="تقرير المهام المتأخرة" subtitle={`${rows.length} مهمة تجاوزت موعدها`} loading={loading}>
      {rows.length === 0 ? (
        <p className="text-center text-slate-400 py-8 text-sm">لا مهام متأخرة — أحسنتم!</p>
      ) : (
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className={th}>المهمة</th><th className={th}>الخطة</th><th className={th}>القسم</th>
              <th className={th}>المكلَّف</th><th className={th}>الحالة</th>
              <th className={th}>الموعد</th><th className={th}>أيام التأخّر</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="break-inside-avoid">
                <td className={td + ' font-medium'}>{r.name_ar}</td>
                <td className={td}>{r.plan || '—'}</td>
                <td className={td}>{r.dept || '—'}</td>
                <td className={td}>{r.assignee || '—'}</td>
                <td className={td}>{STATUS_AR[r.status] || r.status}</td>
                <td className={td}>{fmt(r.end_date)}</td>
                <td className={td + ' font-bold'} style={{ color: '#dc2626' }}>{r.daysLate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ReportShell>
  )
}

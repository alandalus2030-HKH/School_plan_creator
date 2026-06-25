'use client'

import { useEffect, useState } from 'react'
import ReportShell from '@/components/reports/ReportShell'
import { reportQuery } from '@/lib/reportParams'
import NoAccess from '@/components/NoAccess'

type Row = { id: string; name_ar: string; taskCount: number }

export default function LocationsReport() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/reports?type=locations' + reportQuery())
      if (res.status === 403) { setDenied(true); setLoading(false); return }
      const j = await res.json().catch(() => ({ rows: [] }))
      setRows(j.rows || [])
      setLoading(false)
    })()
  }, [])

  if (denied) return <NoAccess />

  const th = 'px-2 py-2 text-right font-semibold text-slate-600 border-b-2 border-slate-200'
  const td = 'px-2 py-1.5 text-slate-700 border-b border-slate-100'
  const totalUse = rows.reduce((a, r) => a + r.taskCount, 0)

  return (
    <ReportShell title="تقرير استخدام الأماكن" subtitle="عدد المهام المرتبطة بكل مكان" loading={loading}>
      {rows.length === 0 ? (
        <p className="text-center text-slate-400 py-8 text-sm">لا توجد أماكن مُعرّفة — أضفها من الإعدادات ← الأماكن.</p>
      ) : (
        <>
          <p className="text-sm mb-4">إجمالي الارتباطات: <span className="font-bold">{totalUse}</span> · عدد الأماكن: <span className="font-bold">{rows.length}</span></p>
          <table className="w-full text-xs border-collapse">
            <thead><tr><th className={th}>المكان</th><th className={th}>عدد المهام</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="break-inside-avoid">
                  <td className={td + ' font-medium'}>{r.name_ar}</td>
                  <td className={td}>{r.taskCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </ReportShell>
  )
}

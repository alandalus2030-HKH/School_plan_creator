'use client'

import { useEffect, useState } from 'react'
import ReportShell from '@/components/reports/ReportShell'
import NoAccess from '@/components/NoAccess'

type Row = { task_id: string; name_ar: string; plan: string | null; count: number; lastNote: string | null; lastActor: string | null; lastAt: string | null }

export default function ReworkReport() {
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [period, setPeriod] = useState<{ from?: string; to?: string }>({})

  useEffect(() => {
    ;(async () => {
      const q = new URLSearchParams(window.location.search)
      const from = q.get('from') || undefined, to = q.get('to') || undefined
      setPeriod({ from, to })
      const res = await fetch(`/api/reports?type=rework${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`)
      if (res.status === 403) { setDenied(true); setLoading(false); return }
      const j = await res.json().catch(() => ({ rows: [], totalReturns: 0 }))
      setRows(j.rows || []); setTotal(j.totalReturns || 0)
      setLoading(false)
    })()
  }, [])

  if (denied) return <NoAccess />

  const th = 'px-2 py-2 text-right font-semibold text-slate-600 border-b-2 border-slate-200'
  const td = 'px-2 py-1.5 text-slate-700 border-b border-slate-100 align-top'
  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('ar-QA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

  return (
    <ReportShell title="تقرير المهام المُعادة" subtitle={`${rows.length} مهمة أُعيدت للتعديل · ${total} مرة إعادة إجمالاً`} period={period} loading={loading}>
      {rows.length === 0 ? (
        <p className="text-center text-slate-400 py-8 text-sm">لا مهام مُعادة — جودة عالية في التنفيذ.</p>
      ) : (
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className={th}>المهمة</th><th className={th}>الخطة</th>
              <th className={th}>مرات الإعادة</th><th className={th}>آخر مُقيّم</th>
              <th className={th}>تاريخ آخر إعادة</th><th className={th}>آخر سبب</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.task_id} className="break-inside-avoid">
                <td className={td + ' font-medium'}>{r.name_ar}</td>
                <td className={td}>{r.plan || '—'}</td>
                <td className={td + ' font-bold'} style={{ color: r.count > 1 ? '#dc2626' : undefined }}>{r.count}</td>
                <td className={td}>{r.lastActor || '—'}</td>
                <td className={td}>{fmt(r.lastAt)}</td>
                <td className={td}>{r.lastNote || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ReportShell>
  )
}

'use client'

import { useEffect, useState } from 'react'
import ReportShell from '@/components/reports/ReportShell'
import { reportQuery } from '@/lib/reportParams'
import NoAccess from '@/components/NoAccess'

type Pt = { date: string; completed: number; total: number; overdue: number; progress: number }

function Chart({ series }: { series: Pt[] }) {
  if (series.length < 2) return null
  const W = 720, H = 220, padX = 44, padY = 22
  const xs = (i: number) => padX + (i * (W - 2 * padX)) / (series.length - 1)
  const ys = (v: number) => padY + (1 - v / 100) * (H - 2 * padY)
  const line = series.map((s, i) => `${xs(i)},${ys(s.progress)}`).join(' ')
  const area = `${xs(0)},${ys(0)} ${line} ${xs(series.length - 1)},${ys(0)}`
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('ar-QA', { month: 'numeric', day: 'numeric' })
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 240 }}>
      {[0, 50, 100].map(g => (
        <g key={g}>
          <line x1={padX} x2={W - padX} y1={ys(g)} y2={ys(g)} stroke="#e2e8f0" strokeWidth={1} />
          <text x={padX - 6} y={ys(g) + 4} textAnchor="end" fontSize={11} fill="#94a3b8">{g}%</text>
        </g>
      ))}
      <polygon points={area} fill="var(--maroon-600, #8a1538)" opacity={0.08} />
      <polyline points={line} fill="none" stroke="var(--maroon-600, #8a1538)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {series.map((s, i) => (
        <g key={s.date}>
          <circle cx={xs(i)} cy={ys(s.progress)} r={3.5} fill="var(--maroon-600, #8a1538)" />
          {(i === 0 || i === series.length - 1 || i % Math.ceil(series.length / 8) === 0) && (
            <text x={xs(i)} y={H - 4} textAnchor="middle" fontSize={10} fill="#94a3b8">{fmt(s.date)}</text>
          )}
        </g>
      ))}
    </svg>
  )
}

export default function TrendReport() {
  const [series, setSeries] = useState<Pt[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [period, setPeriod] = useState<{ from?: string; to?: string }>({})

  useEffect(() => {
    ;(async () => {
      const q = new URLSearchParams(window.location.search)
      const from = q.get('from') || undefined, to = q.get('to') || undefined
      setPeriod({ from, to })
      const res = await fetch(`/api/reports?type=trend${reportQuery()}`)
      if (res.status === 403) { setDenied(true); setLoading(false); return }
      const j = await res.json().catch(() => ({ series: [] }))
      setSeries(j.series || [])
      setLoading(false)
    })()
  }, [])

  if (denied) return <NoAccess />

  const th = 'px-2 py-2 text-right font-semibold text-slate-600 border-b-2 border-slate-200'
  const td = 'px-2 py-1.5 text-slate-700 border-b border-slate-100'
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('ar-QA', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <ReportShell title="تقرير الاتجاه الزمني" subtitle="تطوّر نسبة الإنجاز عبر اللقطات الأسبوعية" period={period} loading={loading}>
      {series.length < 2 ? (
        <p className="text-center text-slate-400 py-8 text-sm">تحتاج لقطتين على الأقل لرسم الاتجاه — تُلتقط أسبوعياً.</p>
      ) : (
        <>
          <Chart series={series} />
          <table className="w-full text-xs border-collapse mt-5">
            <thead><tr><th className={th}>التاريخ</th><th className={th}>منجزة/إجمالي</th><th className={th}>نسبة الإنجاز</th><th className={th}>متأخرة</th></tr></thead>
            <tbody>
              {series.map(s => (
                <tr key={s.date} className="break-inside-avoid">
                  <td className={td}>{fmt(s.date)}</td>
                  <td className={td}>{s.completed}/{s.total}</td>
                  <td className={td}>{s.progress}%</td>
                  <td className={td} style={{ color: s.overdue > 0 ? '#dc2626' : undefined }}>{s.overdue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </ReportShell>
  )
}

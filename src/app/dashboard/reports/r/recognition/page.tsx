'use client'

import { useEffect, useState } from 'react'
import ReportShell from '@/components/reports/ReportShell'
import NoAccess from '@/components/NoAccess'

type Row = { id: string; name_ar: string; department: string | null; badges: number; points: number }
type Data = { rows: Row[]; featured: { name: string | null; note: string | null } | null }

export default function RecognitionReport() {
  const [d, setD] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [period, setPeriod] = useState<{ from?: string; to?: string }>({})

  useEffect(() => {
    ;(async () => {
      const q = new URLSearchParams(window.location.search)
      const from = q.get('from') || undefined, to = q.get('to') || undefined
      setPeriod({ from, to })
      const res = await fetch(`/api/reports?type=recognition${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`)
      if (res.status === 403) { setDenied(true); setLoading(false); return }
      setD(await res.json().catch(() => null))
      setLoading(false)
    })()
  }, [])

  if (denied) return <NoAccess />

  const th = 'px-2 py-2 text-right font-semibold text-slate-600 border-b-2 border-slate-200'
  const td = 'px-2 py-1.5 text-slate-700 border-b border-slate-100'

  return (
    <ReportShell title="تقرير التقدير والتحفيز" subtitle="الأوسمة والنقاط وموظف الشهر" period={period} loading={loading}>
      {d && (
        <>
          {d.featured?.name && (
            <div className="border border-amber-200 bg-amber-50 rounded-xl p-3 mb-5 text-center">
              <p className="text-xs text-amber-700">⭐ الموظف المميَّز</p>
              <p className="font-bold text-slate-800">{d.featured.name}</p>
              {d.featured.note && <p className="text-xs text-slate-500 mt-1">{d.featured.note}</p>}
            </div>
          )}

          <h3 className="font-bold text-slate-800 mb-2 text-sm">لوحة الصدارة</h3>
          {d.rows.length === 0 ? (
            <p className="text-center text-slate-400 py-6 text-sm">لا أوسمة ممنوحة بعد.</p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr><th className={th}>#</th><th className={th}>الموظف</th><th className={th}>القسم</th><th className={th}>الأوسمة</th><th className={th}>النقاط</th></tr>
              </thead>
              <tbody>
                {d.rows.map((r, i) => (
                  <tr key={r.id} className="break-inside-avoid">
                    <td className={td}>{i + 1}</td>
                    <td className={td + ' font-medium'}>{r.name_ar}</td>
                    <td className={td}>{r.department || '—'}</td>
                    <td className={td}>{r.badges}</td>
                    <td className={td + ' font-bold'}>{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </ReportShell>
  )
}

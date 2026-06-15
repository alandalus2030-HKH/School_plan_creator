'use client'

import { useEffect, useState } from 'react'
import ReportShell from '@/components/reports/ReportShell'
import NoAccess from '@/components/NoAccess'

type ByPlan = { plan: string; budget: number; count: number }
type Item = { id: string; name_ar: string; plan: string | null; budget: number; resources: string | null }
type Data = { total: number; byPlan: ByPlan[]; items: Item[] }

export default function ResourcesReport() {
  const [d, setD] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/reports?type=resources')
      if (res.status === 403) { setDenied(true); setLoading(false); return }
      setD(await res.json().catch(() => null))
      setLoading(false)
    })()
  }, [])

  if (denied) return <NoAccess />

  const th = 'px-2 py-2 text-right font-semibold text-slate-600 border-b-2 border-slate-200'
  const td = 'px-2 py-1.5 text-slate-700 border-b border-slate-100 align-top'
  const money = (n: number) => `${n.toLocaleString('ar-QA')} ر.ق`

  return (
    <ReportShell title="تقرير الموارد والميزانية" subtitle="الميزانيات والموارد المرصودة للمهام" loading={loading}>
      {d && (
        <>
          <p className="text-sm mb-4">إجمالي الميزانية المرصودة: <span className="font-bold">{money(d.total)}</span></p>

          {d.byPlan.length > 0 && (
            <>
              <h3 className="font-bold text-slate-800 mb-2 text-sm">حسب الخطة</h3>
              <table className="w-full text-xs border-collapse mb-5">
                <thead><tr><th className={th}>الخطة</th><th className={th}>عدد المهام</th><th className={th}>الميزانية</th></tr></thead>
                <tbody>
                  {d.byPlan.map(g => (
                    <tr key={g.plan} className="break-inside-avoid">
                      <td className={td + ' font-medium'}>{g.plan}</td>
                      <td className={td}>{g.count}</td>
                      <td className={td}>{money(g.budget)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h3 className="font-bold text-slate-800 mb-2 text-sm">تفاصيل المهام ذات الموارد</h3>
          {d.items.length === 0 ? (
            <p className="text-center text-slate-400 py-6 text-sm">لا توجد مهام برصيد ميزانية أو موارد.</p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead><tr><th className={th}>المهمة</th><th className={th}>الخطة</th><th className={th}>الميزانية</th><th className={th}>موارد أخرى</th></tr></thead>
              <tbody>
                {d.items.map(it => (
                  <tr key={it.id} className="break-inside-avoid">
                    <td className={td + ' font-medium'}>{it.name_ar}</td>
                    <td className={td}>{it.plan || '—'}</td>
                    <td className={td}>{it.budget > 0 ? money(it.budget) : '—'}</td>
                    <td className={td}>{it.resources || '—'}</td>
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

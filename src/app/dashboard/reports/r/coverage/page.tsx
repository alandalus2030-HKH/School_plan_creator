'use client'

import { useEffect, useState } from 'react'
import ReportShell from '@/components/reports/ReportShell'
import NoAccess from '@/components/NoAccess'

type Std = { code: string | null; name: string; plan: string; department: string | null; total: number; covered: number; coverage: number }
type Data = { standards: Std[]; overall: { totalTasks: number; coveredTasks: number; coverage: number } }

export default function CoverageReport() {
  const [d, setD] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/reports?type=coverage')
      if (res.status === 403) { setDenied(true); setLoading(false); return }
      setD(await res.json().catch(() => null))
      setLoading(false)
    })()
  }, [])

  if (denied) return <NoAccess />

  const th = 'px-2 py-2 text-right font-semibold text-slate-600 border-b-2 border-slate-200'
  const td = 'px-2 py-1.5 text-slate-700 border-b border-slate-100'

  return (
    <ReportShell title="تقرير تغطية المعايير والفجوات" subtitle="نسبة المهام المدعومة بأدلة معتمدة لكل معيار" loading={loading}>
      {d && (
        <>
          <div className="grid grid-cols-3 gap-2 mb-5 text-center">
            <div className="border border-slate-200 rounded-lg py-2"><div className="text-lg font-bold text-slate-800">{d.overall.coverage}%</div><div className="text-[11px] text-slate-500">التغطية الكلية</div></div>
            <div className="border border-slate-200 rounded-lg py-2"><div className="text-lg font-bold text-slate-800">{d.overall.coveredTasks}/{d.overall.totalTasks}</div><div className="text-[11px] text-slate-500">مهام مغطّاة</div></div>
            <div className="border border-slate-200 rounded-lg py-2"><div className="text-lg font-bold text-slate-800">{d.standards.length}</div><div className="text-[11px] text-slate-500">عدد المعايير</div></div>
          </div>

          {d.standards.length === 0 ? (
            <p className="text-center text-slate-400 py-8 text-sm">لا معايير/مهام بعد.</p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr><th className={th}>المعيار</th><th className={th}>الخطة</th><th className={th}>القسم</th><th className={th}>مغطّاة/إجمالي</th><th className={th}>نسبة التغطية</th></tr>
              </thead>
              <tbody>
                {d.standards.map((s, i) => (
                  <tr key={i} className="break-inside-avoid">
                    <td className={td}><span className="font-mono text-slate-400 ml-1">{s.code || ''}</span> {s.name}</td>
                    <td className={td}>{s.plan}</td>
                    <td className={td}>{s.department || '—'}</td>
                    <td className={td}>{s.covered}/{s.total}</td>
                    <td className={td + ' font-bold'} style={{ color: s.coverage === 100 ? '#16a34a' : s.coverage < 50 ? '#dc2626' : '#d97706' }}>{s.coverage}%</td>
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

'use client'

import { useEffect, useState } from 'react'
import ReportShell from '@/components/reports/ReportShell'
import { reportQuery } from '@/lib/reportParams'
import NoAccess from '@/components/NoAccess'

type Std = { code: string | null; name: string; plan: string; department: string | null; total: number; covered: number; coverage: number }
type Data = { standards: Std[]; overall: { totalTasks: number; coveredTasks: number; coverage: number } }

export default function AccreditationReport() {
  const [d, setD] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/reports?type=coverage' + reportQuery())
      if (res.status === 403) { setDenied(true); setLoading(false); return }
      setD(await res.json().catch(() => null))
      setLoading(false)
    })()
  }, [])

  if (denied) return <NoAccess />

  const th = 'px-2 py-2 text-right font-semibold text-slate-600 border-b-2 border-slate-200'
  const td = 'px-2 py-1.5 text-slate-700 border-b border-slate-100'
  const gaps = (d?.standards || []).filter(s => s.coverage < 100)
  const ready = (d?.standards || []).filter(s => s.coverage === 100)

  return (
    <ReportShell title="تقرير جاهزية الاعتماد" subtitle="مدى اكتمال أدلة المعايير استعداداً للاعتماد (QNSA)" loading={loading}>
      {d && (
        <>
          <div className="text-center my-4">
            <div className="text-4xl font-bold" style={{ color: d.overall.coverage >= 80 ? '#16a34a' : d.overall.coverage < 50 ? '#dc2626' : '#d97706' }}>
              {d.overall.coverage}%
            </div>
            <p className="text-sm text-slate-500">الجاهزية الكلية · {ready.length} معيار مكتمل من {d.standards.length}</p>
          </div>

          <h3 className="font-bold text-slate-800 mb-2 text-sm">المعايير التي تحتاج معالجة (فجوات)</h3>
          {gaps.length === 0 ? (
            <p className="text-center py-4 text-sm" style={{ color: '#16a34a' }}>كل المعايير مكتملة الأدلة — جاهزية تامة 🎯</p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr><th className={th}>المعيار</th><th className={th}>الخطة</th><th className={th}>القسم</th><th className={th}>الناقص</th><th className={th}>التغطية</th></tr>
              </thead>
              <tbody>
                {gaps.map((s, i) => (
                  <tr key={i} className="break-inside-avoid">
                    <td className={td}><span className="font-mono text-slate-400 ml-1">{s.code || ''}</span> {s.name}</td>
                    <td className={td}>{s.plan}</td>
                    <td className={td}>{s.department || '—'}</td>
                    <td className={td + ' font-bold'} style={{ color: '#dc2626' }}>{s.total - s.covered}</td>
                    <td className={td}>{s.coverage}%</td>
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

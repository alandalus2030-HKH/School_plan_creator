'use client'

import { useEffect, useState } from 'react'
import ReportShell from '@/components/reports/ReportShell'
import NoAccess from '@/components/NoAccess'

type Row = {
  id: string; name_ar: string; department: string | null; plan_category: string | null
  owner_name: string | null; approved: boolean
  total: number; completed: number; overdue: number; progress: number
  avgRating: number | null; evidence: number
}

export default function PlansPortfolioReport() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/reports?type=plans-portfolio')
      if (res.status === 403) { setDenied(true); setLoading(false); return }
      const j = await res.json().catch(() => ({ plans: [] }))
      setRows(j.plans || [])
      setLoading(false)
    })()
  }, [])

  if (denied) return <NoAccess />

  /* إجماليات */
  const t = rows.reduce((a, r) => ({
    total: a.total + r.total, completed: a.completed + r.completed, overdue: a.overdue + r.overdue,
    evidence: a.evidence + r.evidence,
  }), { total: 0, completed: 0, overdue: 0, evidence: 0 })
  const overallProgress = t.total ? Math.round((t.completed / t.total) * 100) : 0

  const th = 'px-2 py-2 text-right font-semibold text-slate-600 border-b-2 border-slate-200'
  const td = 'px-2 py-1.5 text-slate-700 border-b border-slate-100 align-middle'

  return (
    <ReportShell title="تقرير محفظة الخطط" subtitle="ملخّص الخطط ومؤشرات تنفيذها" loading={loading}>
      {/* مؤشرات إجمالية */}
      <div className="grid grid-cols-4 gap-2 mb-4 text-center">
        {[
          { l: 'عدد الخطط', v: rows.length },
          { l: 'نسبة الإنجاز', v: `${overallProgress}%` },
          { l: 'مهام منجزة', v: `${t.completed}/${t.total}` },
          { l: 'متأخرة', v: t.overdue },
        ].map(s => (
          <div key={s.l} className="border border-slate-200 rounded-lg py-2">
            <div className="text-lg font-bold text-slate-800">{s.v}</div>
            <div className="text-[11px] text-slate-500">{s.l}</div>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-center text-slate-400 py-8 text-sm">لا توجد خطط ضمن مدرستك.</p>
      ) : (
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className={th}>القسم</th>
              <th className={th}>الخطة</th>
              <th className={th}>النوع</th>
              <th className={th}>صاحب الخطة</th>
              <th className={th}>الإنجاز</th>
              <th className={th}>منجزة/إجمالي</th>
              <th className={th}>متأخرة</th>
              <th className={th}>التقييم</th>
              <th className={th}>أدلة مقبولة</th>
              <th className={th}>معتمدة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="break-inside-avoid">
                <td className={td}>{r.department || '—'}</td>
                <td className={td + ' font-medium'}>{r.name_ar}</td>
                <td className={td}>{r.plan_category || '—'}</td>
                <td className={td}>{r.owner_name || '—'}</td>
                <td className={td}>{r.progress}%</td>
                <td className={td}>{r.completed}/{r.total}</td>
                <td className={td} style={{ color: r.overdue > 0 ? '#dc2626' : undefined }}>{r.overdue}</td>
                <td className={td}>{r.avgRating ?? '—'}</td>
                <td className={td}>{r.evidence}</td>
                <td className={td}>{r.approved ? 'نعم' : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <td className={td} colSpan={4}>الإجمالي</td>
              <td className={td}>{overallProgress}%</td>
              <td className={td}>{t.completed}/{t.total}</td>
              <td className={td}>{t.overdue}</td>
              <td className={td}>—</td>
              <td className={td}>{t.evidence}</td>
              <td className={td}>—</td>
            </tr>
          </tfoot>
        </table>
      )}
    </ReportShell>
  )
}

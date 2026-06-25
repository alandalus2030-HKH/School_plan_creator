'use client'

import { useEffect, useState } from 'react'
import ReportShell from '@/components/reports/ReportShell'
import { reportQuery } from '@/lib/reportParams'
import NoAccess from '@/components/NoAccess'

const ACTION_AR: Record<string, string> = {
  task_created: 'إنشاء مهمة', task_status_changed: 'تغيير حالة مهمة', task_updated: 'تعديل مهمة',
  task_deleted: 'حذف مهمة', plan_created: 'إنشاء خطة', plan_updated: 'تعديل خطة',
  evidence_added: 'إضافة دليل', evidence_status_changed: 'تغيير حالة دليل',
}
const TABLE_AR: Record<string, string> = {
  tasks: 'المهام', plans: 'الخطط', plan_nodes: 'العقد', evidence: 'الأدلة',
  profiles: 'المستخدمون', teams: 'الفرق', meetings: 'الاجتماعات',
}

type Row = { id: string; action: string; table_name: string; user: string; created_at: string }

export default function AuditReport() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [period, setPeriod] = useState<{ from?: string; to?: string }>({})

  useEffect(() => {
    ;(async () => {
      const q = new URLSearchParams(window.location.search)
      const from = q.get('from') || undefined, to = q.get('to') || undefined
      setPeriod({ from, to })
      const res = await fetch(`/api/reports?type=audit${reportQuery()}`)
      if (res.status === 403) { setDenied(true); setLoading(false); return }
      const j = await res.json().catch(() => ({ rows: [] }))
      setRows(j.rows || [])
      setLoading(false)
    })()
  }, [])

  if (denied) return <NoAccess />

  const th = 'px-2 py-2 text-right font-semibold text-slate-600 border-b-2 border-slate-200'
  const td = 'px-2 py-1.5 text-slate-700 border-b border-slate-100'
  const fmt = (d: string) => new Date(d).toLocaleString('ar-QA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <ReportShell title="سجل التدقيق" subtitle={`${rows.length} عملية مسجّلة`} period={period} loading={loading}>
      {rows.length === 0 ? (
        <p className="text-center text-slate-400 py-8 text-sm">لا عمليات مسجّلة بعد.</p>
      ) : (
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr><th className={th}>الإجراء</th><th className={th}>الجدول</th><th className={th}>المنفِّذ</th><th className={th}>التاريخ والوقت</th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="break-inside-avoid">
                <td className={td}>{ACTION_AR[r.action] || r.action}</td>
                <td className={td}>{TABLE_AR[r.table_name] || r.table_name}</td>
                <td className={td}>{r.user}</td>
                <td className={td}>{fmt(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ReportShell>
  )
}

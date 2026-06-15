'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePermissions } from '@/lib/PermissionsContext'
import NoAccess from '@/components/NoAccess'
import { generateQnsaReport } from '@/lib/qnsaReport'
import { FileText, ArrowRight, Printer, Loader2 } from 'lucide-react'

export default function SipReport() {
  const { can, loading: permsLoading } = usePermissions()
  const [plans, setPlans] = useState<{ id: string; name_ar: string }[]>([])
  const [planId, setPlanId] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/reports?type=plans-list').then(r => r.ok ? r.json() : { plans: [] }).then(j => {
      setPlans(j.plans || [])
      if (j.plans?.[0]) setPlanId(j.plans[0].id)
    }).catch(() => {})
  }, [])

  if (permsLoading) return null
  if (!can('view_reports')) return <NoAccess />

  const run = async () => {
    if (!planId) return
    setBusy(true)
    try { await generateQnsaReport(planId) } finally { setBusy(false) }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <Link href="/dashboard/reports/official" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-violet-700">
          <ArrowRight size={16} /> مركز التقارير
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white flex-shrink-0" style={{ background: 'var(--gradient-button, #8a1538)' }}>
            <FileText size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">تقرير خطة التحسين المدرسي (QNSA)</h1>
            <p className="text-sm text-slate-500">تقرير اعتماد شامل: المحاور والمبادرات والأهداف والمهام والأدلة والمؤشرات</p>
          </div>
        </div>

        <label className="block text-xs font-semibold text-slate-600 mb-1.5">اختر الخطة</label>
        <select value={planId} onChange={e => setPlanId(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 mb-4">
          {plans.length === 0 && <option value="">لا توجد خطط</option>}
          {plans.map(p => <option key={p.id} value={p.id}>{p.name_ar}</option>)}
        </select>

        <button onClick={run} disabled={!planId || busy}
          className="inline-flex items-center gap-2 text-sm text-white px-5 py-2.5 rounded-xl font-medium transition-all hover:brightness-110 disabled:opacity-50"
          style={{ background: 'var(--gradient-button, #8a1538)' }}>
          <span className="inline-flex">{busy ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}</span>
          <span>{busy ? 'جارٍ التحضير...' : 'إصدار التقرير (طباعة / PDF)'}</span>
        </button>
        <p className="text-[11px] text-slate-400 mt-3">يفتح التقرير في نافذة طباعة جاهزة للحفظ بصيغة PDF بترويسة المدرسة.</p>
      </div>
    </div>
  )
}

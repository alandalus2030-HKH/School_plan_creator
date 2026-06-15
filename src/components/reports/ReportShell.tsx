'use client'

import { useEffect, useState } from 'react'
import { Printer, ArrowRight, Loader2 } from 'lucide-react'
import Link from 'next/link'

/**
 * غلاف التقارير الرسمية: ترويسة (شعار + مدرسة + عنوان + فترة + تاريخ إصدار)
 * وتذييل (اسم المدير + توقيع + ختم). يطبع A4 عبر «حفظ كـ PDF».
 * يجلب علامة المدرسة من /api/school-profile (يحترم المدرسة الفعّالة).
 */

type School = {
  name_ar?: string | null; logo_url?: string | null
  principal_name?: string | null; signature_url?: string | null; stamp_url?: string | null
  report_header?: string | null; report_footer?: string | null
  ministry_number?: string | null
}

export type ReportPeriod = { from?: string; to?: string }

function fmtDate(d?: string) {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('ar-QA', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function ReportShell({
  title, subtitle, period, loading, children,
}: {
  title: string
  subtitle?: string
  period?: ReportPeriod
  loading?: boolean
  children: React.ReactNode
}) {
  const [school, setSchool] = useState<School | null>(null)
  const issuedAt = new Date().toLocaleDateString('ar-QA', { day: 'numeric', month: 'long', year: 'numeric' })

  useEffect(() => {
    fetch('/api/school-profile').then(r => r.ok ? r.json() : null).then(j => setSchool(j?.school || null)).catch(() => {})
  }, [])

  const hasPeriod = period && (period.from || period.to)

  return (
    <div className="max-w-[820px] mx-auto">
      {/* شريط أدوات — لا يُطبع */}
      <div className="no-print flex items-center justify-between mb-4">
        <Link href="/dashboard/reports" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-violet-700">
          <ArrowRight size={16} /> مركز التقارير
        </Link>
        <button onClick={() => window.print()}
          className="inline-flex items-center gap-2 text-sm text-white px-4 py-2 rounded-xl font-medium transition-all hover:brightness-110"
          style={{ background: 'var(--gradient-button, #8a1538)' }}>
          <Printer size={16} /> طباعة / حفظ PDF
        </button>
      </div>

      {/* الورقة */}
      <div className="report-sheet bg-white border border-slate-200 rounded-2xl print:border-0 print:rounded-none shadow-sm print:shadow-none p-8 print:p-0">

        {/* الترويسة */}
        <header className="flex items-start gap-4 pb-4 border-b-2 border-slate-200">
          {school?.logo_url
            ? <img src={school.logo_url} alt="شعار" className="w-16 h-16 object-contain flex-shrink-0" />
            : <div className="w-16 h-16 flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            {school?.report_header && <p className="text-[11px] text-slate-500">{school.report_header}</p>}
            <h1 className="text-lg font-bold text-slate-900">{school?.name_ar || 'المدرسة'}</h1>
            {school?.ministry_number && <p className="text-[11px] text-slate-400">الرقم الوزاري: {school.ministry_number}</p>}
          </div>
          <div className="text-left text-[11px] text-slate-500 flex-shrink-0">
            <p>تاريخ الإصدار: {issuedAt}</p>
            {hasPeriod && <p>الفترة: {period!.from ? fmtDate(period!.from) : '—'} ← {period!.to ? fmtDate(period!.to) : '—'}</p>}
          </div>
        </header>

        {/* عنوان التقرير */}
        <div className="text-center my-5">
          <h2 className="text-xl font-bold" style={{ color: 'var(--maroon-700, #6f1029)' }}>{title}</h2>
          {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
        </div>

        {/* المحتوى */}
        {loading ? (
          <div className="flex items-center justify-center h-40 no-print"><Loader2 size={26} className="animate-spin text-violet-500" /></div>
        ) : (
          <div className="report-body">{children}</div>
        )}

        {/* التذييل: التوقيع والختم */}
        <footer className="mt-10 pt-4 border-t border-slate-200 break-inside-avoid">
          {school?.report_footer && <p className="text-[11px] text-slate-500 text-center mb-4">{school.report_footer}</p>}
          <div className="flex items-end justify-between gap-6">
            <div className="text-center flex-1">
              <p className="text-xs text-slate-500 mb-1">مدير المدرسة</p>
              {school?.signature_url
                ? <img src={school.signature_url} alt="توقيع" className="h-12 mx-auto object-contain" />
                : <div className="h-12" />}
              <p className="text-sm font-semibold text-slate-800 border-t border-slate-300 pt-1 mt-1 inline-block px-6">
                {school?.principal_name || '............................'}
              </p>
            </div>
            <div className="text-center flex-shrink-0">
              <p className="text-xs text-slate-500 mb-1">ختم المدرسة</p>
              {school?.stamp_url
                ? <img src={school.stamp_url} alt="ختم" className="h-20 w-20 mx-auto object-contain" />
                : <div className="h-20 w-20 border border-dashed border-slate-300 rounded-full" />}
            </div>
          </div>
        </footer>
      </div>

      {/* أنماط الطباعة A4 */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4; margin: 14mm; }
          body { background: #fff !important; }
          .report-sheet { box-shadow: none !important; border: 0 !important; }
        }
        .break-inside-avoid { break-inside: avoid; }
      `}</style>
    </div>
  )
}

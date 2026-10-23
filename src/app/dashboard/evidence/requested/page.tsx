'use client'

/* ════════════════════════════════════════════════════════════
   «أدلة مطلوبة» — قائمة المكلَّف (الوثيقة 3.1 · 10)

   «ويظهر للمكلَّف في قائمة «أدلة مطلوبة» **بجوار «مهامي»**.»
   ودور الموظّف فيها سطرٌ واحد: «رفع أدلة · تلبية أدلة مطلوبة» (10).

   فلا إطارَ يُتصفَّح هنا ولا مرساةً تُختار: «الطلب يحمل مرساته سلفاً
   — والموظّف **يرفع الملفّ فقط**». وكلّ ما يُعرَض: ما المطلوب، ولأيّ
   معيار، وإلى متى — وزرٌّ واحد.
   ════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Loader2, Upload, Clock, AlertTriangle, CheckCircle2,
         FileQuestion, CornerUpLeft } from 'lucide-react'
import { toast } from '@/components/Toast'
import { usePermissions } from '@/lib/PermissionsContext'

type Req = {
  id: string; status: 'open' | 'in_review'
  what_is_asked: string; expected_type: string | null
  academic_year: string | null; due_date: string | null
  last_reject: string | null; diverted_note: string | null
  overdue: boolean; whole: boolean
  sub: { code: string; name_ar: string } | null
  indicators: { code: string; name_ar: string }[]
  requester: { id: string; name_ar: string } | null
  evidence: { id: string; name: string; status: string } | null
}

export default function RequestedPage() {
  const { loading: permsLoading } = usePermissions()
  const [rows, setRows] = useState<Req[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const r = await fetch('/api/evidence/requests?scope=mine')
    if (r.ok) setRows((await r.json()).requests || [])
    else toast('تعذّر تحميل الأدلة المطلوبة', 'error')
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const open     = rows.filter(r => r.status === 'open')
  const inReview = rows.filter(r => r.status === 'in_review')

  if (permsLoading || loading) {
    return <div className="p-10 text-center text-slate-400"><Loader2 className="animate-spin inline" /></div>
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <span className="inline-flex text-sky-600"><FileQuestion size={20} /></span>
          <span>أدلة مطلوبة</span>
        </h1>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
          طُلبت منك أدلّةٌ بعينها. <strong>المعيار محدَّدٌ سلفاً</strong> — فلا يلزمك إلا رفع الملفّ.
        </p>
      </div>

      {!rows.length && (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <span className="inline-flex text-emerald-500 mb-2"><CheckCircle2 size={28} /></span>
          <p className="text-sm text-slate-500">لا شيء مطلوبٌ منك الآن</p>
        </div>
      )}

      {open.map(r => (
        <div key={r.id} className={`bg-white rounded-2xl border p-4 ${r.overdue ? 'border-red-200' : 'border-slate-200'}`}>
          <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
            <span className="text-sm font-bold text-slate-800">{r.what_is_asked}</span>
            {r.overdue && (
              <span className="text-[11px] px-2 py-0.5 rounded-full border border-red-200 bg-red-50 text-red-700 inline-flex items-center gap-1">
                <span className="inline-flex"><AlertTriangle size={11} /></span>
                <span>تجاوز المهلة</span>
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
            <span><span className="font-mono text-sky-700">{r.sub?.code}</span> {r.sub?.name_ar}</span>
            {!r.whole && !!r.indicators.length && (
              <span>المؤشرات: {r.indicators.map(i => i.code).join(' · ')}</span>
            )}
            {r.academic_year && <span>العام {r.academic_year}</span>}
            {r.expected_type && <span>النوع المتوقَّع: {r.expected_type}</span>}
            {r.due_date && (
              <span className="inline-flex items-center gap-1">
                <span className="inline-flex"><Clock size={11} /></span><span>المهلة {r.due_date}</span>
              </span>
            )}
            {r.requester && <span>طلبه: {r.requester.name_ar}</span>}
          </div>

          {/* الرفض يعود بسببه — «ومعه سبب الرفض من القائمة المغلقة» (3.1) */}
          {r.last_reject && (
            <p className="mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-2.5 py-1.5 flex items-start gap-1.5">
              <span className="inline-flex mt-0.5"><CornerUpLeft size={12} /></span>
              <span>رُفض ما رفعتَه بسبب «{r.last_reject}» — والطلب ما زال مفتوحاً.</span>
            </p>
          )}
          {r.diverted_note && (
            <p className="mt-2 text-[11px] text-violet-800 bg-violet-50 border border-violet-100 rounded-xl px-2.5 py-1.5">
              {r.diverted_note}
            </p>
          )}

          <Link href={`/dashboard/evidence/new?request=${r.id}`}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:brightness-95">
            <span className="inline-flex"><Upload size={15} /></span><span>ارفع الدليل</span>
          </Link>
        </div>
      ))}

      {/* قيد التقييم: يخرج من قائمة العمل ولا يختفي — فيعرف أنه أدّى ما عليه */}
      {!!inReview.length && (
        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-600 mb-2">رُفعت وتنتظر الحكم</p>
          <div className="space-y-1.5">
            {inReview.map(r => (
              <p key={r.id} className="text-[11px] text-slate-500 flex items-start gap-1.5">
                <span className="inline-flex mt-0.5 text-sky-600"><Clock size={12} /></span>
                <span>
                  <strong className="text-slate-700">{r.what_is_asked}</strong>
                  {r.evidence ? ` — «${r.evidence.name}»` : ''} · {r.sub?.code}
                </span>
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

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
         FileQuestion, CornerUpLeft, Users, MinusCircle, X, Repeat } from 'lucide-react'
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
  target: 'person' | 'department' | 'job'
  targetName: string | null
  cycle: { id: string; period_label: string; recurring_task_id: string } | null
}

export default function RequestedPage() {
  const { loading: permsLoading } = usePermissions()
  const [rows, setRows] = useState<Req[]>([])
  const [loading, setLoading] = useState(true)
  const [skipping, setSkipping] = useState<Req | null>(null)
  const [why,      setWhy]      = useState('')
  const [busy,     setBusy]     = useState(false)

  const load = useCallback(async () => {
    const r = await fetch('/api/evidence/requests?scope=mine')
    if (r.ok) setRows((await r.json()).requests || [])
    else toast('تعذّر تحميل الأدلة المطلوبة', 'error')
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  /* «لم تُنفَّذ هذه الدورة — والسبب…» إجابةٌ مشروعة تُسجَّل (5.2) */
  const skip = async () => {
    if (!skipping?.cycle || !why.trim()) return
    setBusy(true)
    const r = await fetch('/api/recurring-tasks/cycles', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cycleId: skipping.cycle.id, action: 'skip', justification: why.trim() }),
    })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { toast(j.error || 'تعذّر التسجيل', 'error'); return }
    toast('سُجّل المبرّر — والدورة مقبولةٌ لا مهملة', 'success')
    setSkipping(null); setWhy(''); await load()
  }

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
            {r.target !== 'person' && (
              <span className="inline-flex items-center gap-1 text-slate-600"
                title="مُسنَدٌ إلى وجهةٍ مؤسسية لا إلى شخص — فلا يموت برحيل أحد">
                <span className="inline-flex"><Users size={11} /></span>
                <span>مطلوبٌ من {r.target === 'job' ? 'منصب' : 'قسم'} «{r.targetName}»</span>
              </span>
            )}
            {r.cycle && (
              <span className="inline-flex items-center gap-1 text-[#8a1538]">
                <span className="inline-flex"><Repeat size={11} /></span>
                <span>دورة {r.cycle.period_label}</span>
              </span>
            )}
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

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link href={`/dashboard/evidence/new?request=${r.id}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:brightness-95">
              <span className="inline-flex"><Upload size={15} /></span><span>ارفع الدليل</span>
            </Link>
            {r.cycle && (
              <button onClick={() => { setSkipping(r); setWhy('') }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs hover:border-slate-400">
                <span className="inline-flex"><MinusCircle size={14} /></span>
                <span>لم تُنفَّذ — سجّل المبرّر</span>
              </button>
            )}
          </div>
        </div>
      ))}

      {/* نافذة المبرّر — والصدق أسهلُ من التحايل، وهو ما يحمي المخزن (5.2) */}
      {skipping && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-md my-8">
            <div className="p-4 border-b border-slate-100 flex items-center gap-2">
              <span className="inline-flex text-slate-500"><MinusCircle size={17} /></span>
              <h2 className="font-bold text-slate-800 text-sm">دورةٌ لم تُنفَّذ</h2>
              <button onClick={() => setSkipping(null)} className="ms-auto text-slate-400 hover:text-slate-700">
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <p className="text-xs text-slate-600"><strong>{skipping.what_is_asked}</strong></p>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">المبرّر *</span>
                <textarea value={why} onChange={e => setWhy(e.target.value)} rows={3}
                  placeholder="مثال: أُلغي الاجتماع لتعارضه مع زيارة الوزارة، ونُقل إلى الفصل الثاني"
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200" />
              </label>
              <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-2.5 py-2 leading-relaxed">
                الدورة غير المنفَّذة بمبرّرٍ مسجَّل <strong>مقبولة لا مهملة</strong> —
                <strong> والمبرّر جزء من السجل يقرؤه المقيّم</strong>. فلا تُرفَع أدلّةٌ بلا قيمة
                لتُغلق دورة، والمهملة وحدها تُعدّ فجوة (5.3).
              </p>
            </div>
            <div className="p-4 border-t border-slate-100 flex items-center gap-2">
              <button onClick={skip} disabled={!why.trim() || busy}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-bold disabled:opacity-40">
                <span className="inline-flex">{busy ? <Loader2 size={14} className="animate-spin" /> : <MinusCircle size={14} />}</span>
                <span>سجّل المبرّر</span>
              </button>
              <button onClick={() => setSkipping(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600">إلغاء</button>
            </div>
          </div>
        </div>
      )}

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

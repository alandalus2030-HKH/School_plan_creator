'use client'

/* ════════════════════════════════════════════════════════════
   مصفوفة التغطية (الوثيقة 3.3 · 3.4 · 14)

   «الفهرس يقول ماذا عندك، **ومصفوفة التغطية تقول أين يقع**.»

   وثلاثة أحكام تحكم هذه الشاشة:

   ١ **عدّادان منفصلان** للمخصوص والضمنيّ — «لأن المقيّم يفرّق بين
     «عندنا سياسة» و«عندنا دليل تطبيق»». فلا رقمَ واحداً يجمعهما.

   ٢ **عدد الأدلة المتفرّدة بجوار عدد المراسي**، لأن تضخيم الإسناد
     «أثرٌ جانبيّ متوقَّع»: «يُغري ذلك بإسناد الدليل الواحد إلى عشرين
     مؤشّراً: **فتبدو المصفوفة خضراء وهي جوفاء**». وحاجزه **عرضٌ لا
     منع** — «حسابٌ محض بلا ذكاء اصطناعي… **أداةٌ داخلية للفريق لا
     تُعرض للجهة**».

   ٣ **المحسوب لا يُخزَّن** — فكلّ رقمٍ هنا يُحسب عند العرض.
   ════════════════════════════════════════════════════════════ */

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Loader2, LayoutGrid, AlertTriangle, ChevronDown, ChevronLeft,
         Inbox, Target, Layers, EyeOff, Clock } from 'lucide-react'
import NoAccess from '@/components/NoAccess'
import { usePermissions } from '@/lib/PermissionsContext'

type Ind = {
  id: string; code: string; name: string
  specific: number; implicit: number; anchors: number; unique: number
  waiting: number; allShared: boolean; covered: boolean
}
type Sub = {
  id: string; code: string; name: string
  implicitHere: number; specificHere: number; waitingHere: number
  indicators: Ind[]; covered: number; total: number
}
type Asp = { id: string; code: string; name: string; subs: Sub[]; covered: number; total: number }
type Std = { id: string; code: string; name: string; aspects: Asp[]; covered: number; total: number }

type Lens = 'all' | 'gaps' | 'inflated' | 'implicit'

export default function CoveragePage() {
  const { can, isSuperAdmin, loading: permsLoading } = usePermissions()
  const [tree,   setTree]   = useState<Std[]>([])
  const [totals, setTotals] = useState<any>(null)
  const [err,    setErr]    = useState('')
  const [loading, setLoading] = useState(true)
  const [open,   setOpen]   = useState<Record<string, boolean>>({})
  const [lens,   setLens]   = useState<Lens>('all')

  const allowed = isSuperAdmin || can('view_evidence') || can('triage_evidence')

  useEffect(() => {
    if (!allowed) return
    ;(async () => {
      const r = await fetch('/api/evidence/coverage')
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setErr(j.error || 'تعذّر حساب التغطية')
      else { setTree(j.tree || []); setTotals(j.totals) }
      setLoading(false)
    })()
  }, [allowed])

  /* العدسة تُرشّح المؤشرات، والأبواب تُفتح على ما بقي */
  const keep = (i: Ind) =>
    lens === 'all'      ? true
    : lens === 'gaps'     ? !i.covered
    : lens === 'inflated' ? i.allShared
    :                       i.implicit > 0 && i.specific === 0

  const shown = useMemo(() => tree.map(s => ({
    ...s,
    aspects: s.aspects.map(a => ({
      ...a,
      subs: a.subs.map(sb => ({ ...sb, indicators: sb.indicators.filter(keep) }))
                   .filter(sb => sb.indicators.length > 0),
    })).filter(a => a.subs.length > 0),
  })).filter(s => s.aspects.length > 0), [tree, lens])

  if (permsLoading) return <div className="p-10 text-center text-slate-400"><Loader2 className="animate-spin inline" /></div>
  if (!allowed) return <NoAccess message="مصفوفة التغطية تتطلّب صلاحية خزانة الأدلة." />

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <span className="inline-flex text-violet-600"><LayoutGrid size={20} /></span>
            <span>مصفوفة التغطية</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            الفهرس يقول ماذا عندك، <strong>والمصفوفة تقول أين يقع</strong>.
            وكلّ رقمٍ هنا <strong>يُحسب عند العرض</strong> — فالمخزَّن يكذب بعد حين.
          </p>
        </div>
        <Link href="/dashboard/evidence"
          className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm border border-slate-200 bg-white text-slate-600 hover:border-violet-300">
          <span className="inline-flex"><Inbox size={14} /></span><span>الخزانة</span>
        </Link>
      </div>

      {loading ? (
        <p className="text-center text-slate-400 py-10"><Loader2 className="animate-spin inline" /></p>
      ) : err ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">{err}</div>
      ) : (
        <>
          {/* ── الإجماليات: والعدّادان لا يُجمعان ── */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <div>
                <p className="text-3xl font-bold text-violet-700 font-latin">{totals.pct}%</p>
                <p className="text-[11px] text-slate-500">
                  {totals.covered} من {totals.indicators} مؤشّراً له دليلٌ مقبول
                </p>
              </div>
              <div className="h-10 w-px bg-slate-100" />
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
                <span className="text-slate-600">
                  <strong className="text-sky-700 font-latin">{totals.specificOnly}</strong> بدليلٍ مخصوص وحده
                </span>
                <span className="text-slate-600">
                  <strong className="text-violet-700 font-latin">{totals.implicitOnly}</strong> بتغطيةٍ ضمنية وحدها
                </span>
                <span className="text-slate-600">
                  <strong className="text-emerald-700 font-latin">{totals.bothKinds}</strong> بالاثنين
                </span>
                <span className="text-slate-600">
                  <strong className="text-slate-700 font-latin">{totals.gaps}</strong> بلا دليل
                </span>
              </div>
            </div>

            {/* ما ينتظر الفرز يُعرَض ولا يُحتسب */}
            {totals.waiting > 0 && (
              <p className="mt-3 text-[11px] text-sky-800 bg-sky-50 border border-sky-100 rounded-xl px-2.5 py-1.5 flex items-start gap-1.5">
                <span className="inline-flex mt-0.5"><Clock size={12} /></span>
                <span>
                  {totals.waiting} مؤشّراً عليه أدلّةٌ <strong>تنتظر الفرز</strong> ({totals.pendingEvidence} دليلاً معلّقاً) —
                  تُعرَض ولا تُحتسب، فالفجوة الظاهرة أنفع من المستورة.
                </span>
              </p>
            )}

            {/* حاجز تضخيم الإسناد — عرضٌ لا منع، وأداةٌ داخلية */}
            {totals.inflated > 0 && (
              <p className="mt-2 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-1.5 flex items-start gap-1.5">
                <span className="inline-flex mt-0.5"><AlertTriangle size={12} /></span>
                <span>
                  <strong>{totals.inflated} مؤشّراً كلّ أدلّته مشتركة</strong> مع مؤشّراتٍ أخرى — لا دليلَ يخصّه وحده.
                  وهذا ما يجعل المصفوفة «تبدو خضراء وهي جوفاء». <strong>حسابٌ محض لا حكم</strong>،
                  <span className="inline-flex items-center gap-1 ms-1">
                    <span className="inline-flex"><EyeOff size={10} /></span>
                    <span>أداةٌ داخلية للفريق لا تُعرض للجهة (3.3 · 12)</span>
                  </span>
                </span>
              </p>
            )}
          </div>

          {/* ── العدسات ── */}
          <div className="flex flex-wrap gap-2 text-xs">
            {([
              ['all', `الكلّ (${totals.indicators})`],
              ['gaps', `بلا دليل (${totals.gaps})`],
              ['inflated', `كلّ أدلّته مشتركة (${totals.inflated})`],
              ['implicit', `بالضمنيّ وحده (${totals.implicitOnly})`],
            ] as const).map(([k, label]) => (
              <button key={k} onClick={() => setLens(k as Lens)}
                className={`px-3 py-1.5 rounded-full border transition ${
                  lens === k ? 'bg-violet-600 text-white border-violet-600'
                             : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* ── الشجرة ── */}
          {!shown.length ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-sm text-slate-400">
              لا مؤشّر في هذه العدسة
            </div>
          ) : shown.map(std => {
            const sOpen = open[std.id] !== false
            return (
              <div key={std.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <button onClick={() => setOpen(p => ({ ...p, [std.id]: sOpen ? false : true }))}
                  className="w-full text-right p-3.5 flex items-center gap-2 hover:bg-slate-50">
                  <span className="inline-flex text-slate-400">
                    {sOpen ? <ChevronDown size={16} /> : <ChevronLeft size={16} />}
                  </span>
                  <span className="font-mono text-sm text-violet-700">{std.code}</span>
                  <span className="text-sm font-bold text-slate-800 truncate">{std.name}</span>
                  <span className="ms-auto text-[11px] text-slate-500 font-latin flex-shrink-0">
                    {std.covered}/{std.total}
                  </span>
                  <span className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden flex-shrink-0">
                    <span className="block h-full bg-violet-500 rounded-full"
                      style={{ width: `${std.total ? (std.covered / std.total) * 100 : 0}%` }} />
                  </span>
                </button>

                {sOpen && (
                  <div className="border-t border-slate-100 divide-y divide-slate-50">
                    {std.aspects.map(asp => (
                      <div key={asp.id} className="p-3">
                        <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                          <span className="inline-flex text-slate-300"><Layers size={12} /></span>
                          <span className="font-mono text-slate-400">{asp.code}</span>
                          <span>{asp.name}</span>
                        </p>

                        {asp.subs.map(sub => (
                          <div key={sub.id} className="mb-3 last:mb-0 ps-4">
                            <p className="text-[11px] text-slate-500 mb-1 flex flex-wrap items-center gap-x-2">
                              <span className="font-mono text-sky-700">{sub.code}</span>
                              <span className="text-slate-600">{sub.name}</span>
                              {sub.implicitHere > 0 && (
                                <span className="px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100"
                                  title="دليلٌ وُسم «يغطّي المعيار الفرعي كاملاً» — تغطيةٌ ضمنية تسري على مؤشراته">
                                  {sub.implicitHere} ضمنيّ على المعيار
                                </span>
                              )}
                            </p>

                            <div className="space-y-1">
                              {sub.indicators.map(ind => <IndicatorRow key={ind.id} ind={ind} />)}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          <p className="text-[11px] text-slate-400 leading-relaxed">
            <strong>المخصوص</strong> دليلٌ أُسند إلى هذا المؤشّر بعينه · <strong>الضمنيّ</strong> دليلٌ
            وُسم «يغطّي المعيار الفرعي كاملاً» فسرى على مؤشراته — ولا يُجمعان في رقمٍ واحد، «لأن
            المقيّم يفرّق بين «عندنا سياسة» و«عندنا دليل تطبيق»». و<strong>المراسي ≠ الأدلة</strong>:
            دليلٌ واحد قد يُسند مرّتين، فالعدد الثاني هو ما يُعتدّ به.
          </p>
        </>
      )}
    </div>
  )
}

/* ── صفّ المؤشّر: العدّادان ثمّ التفرّد ثمّ الوسم ── */
function IndicatorRow({ ind }: { ind: Ind }) {
  const tone = ind.covered
    ? ind.allShared ? 'bg-amber-50 border-amber-200'
      : ind.specific > 0 ? 'bg-emerald-50 border-emerald-100'
      : 'bg-violet-50 border-violet-100'
    : 'bg-slate-50 border-slate-100'

  return (
    <div className={`rounded-lg border px-2.5 py-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] ${tone}`}>
      <span className="font-mono text-slate-500">{ind.code}</span>
      <span className="text-slate-700 flex-1 min-w-[140px]">{ind.name}</span>

      {/* العدّادان — منفصلان أبداً (3.3) */}
      {ind.specific > 0 && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-800"
          title="مخصوص: أُسند إلى هذا المؤشّر بعينه">
          <span className="inline-flex"><Target size={10} /></span>
          <span className="font-latin">{ind.specific}</span>
        </span>
      )}
      {ind.implicit > 0 && (
        <span className="px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-800"
          title="ضمنيّ: دليلٌ يغطّي المعيار الفرعي كاملاً">
          ضمنيّ <span className="font-latin">{ind.implicit}</span>
        </span>
      )}

      {/* المراسي بجوار الأدلة المتفرّدة — حاجز التضخيم */}
      {ind.anchors > 0 && (
        <span className="text-slate-500 font-latin"
          title="عدد المراسي / عدد الأدلة المتفرّدة — واختلافهما يعني دليلاً أُسند مرّتين">
          {ind.anchors} مرساة · {ind.unique} دليلاً
        </span>
      )}

      {ind.allShared && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-900"
          title="كلّ أدلّته مشتركة مع مؤشّراتٍ أخرى — لا دليلَ يخصّه وحده">
          <span className="inline-flex"><AlertTriangle size={10} /></span>
          <span>مشتركٌ كلّه</span>
        </span>
      )}
      {ind.waiting > 0 && (
        <span className="px-1.5 py-0.5 rounded-full bg-white text-sky-700 border border-sky-200"
          title="أدلّةٌ عليه تنتظر الفرز — تُعرَض ولا تُحتسب">
          {ind.waiting} ينتظر
        </span>
      )}
      {!ind.covered && ind.waiting === 0 && <span className="text-slate-400">بلا دليل</span>}
    </div>
  )
}

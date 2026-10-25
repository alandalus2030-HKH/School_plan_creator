'use client'

/* ════════════════════════════════════════════════════════════
   القناة المباشرة — رفع دليل إلى مخزن الاعتماد بلا مهمّة ولا خطة.
   المرجع: docs/QNSA_ACCREDITATION_ARCHITECTURE.html §3.1 · 3.2 · 3.8

   • المعيار الفرعي **إلزاميّ** — ومنه يُشتقّ الفريق المالك آلياً.
   • العام المنسوب **حكمٌ لا تاريخ** (3.8): يُقترح من تاريخ الوثيقة،
     ويُسأل عنه صراحةً في النافذة الانتقالية (1 يوليو ← 30 سبتمبر).
   • البصمة تُحسب هنا لكشف المكرّر قبل الرفع؛ والمعتمدة ما يحسبه الخادم.
   • الدليل يدخل «قيد الفرز» ولا يُحتسب في تغطية حتى يُقبل.

   ── وتخدم هذه الشاشة قناتين (3.1) ──
   فإن جاءت بـ`?request=<id>` فهي **تلبية طلبٍ موجَّه**: المرساة تُعرَض
   ولا تُختار، والعام يأتي من الطلب — «الطلب يحمل مرساته سلفاً، والموظّف
   يرفع الملفّ فقط». وبذلك «ينتقل عبء الدقّة إلى من يملكها، **ويُرفع عن
   المعلّم تماماً**».
   ════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowRight, FolderOpen, X, Paperclip, FileText, Loader2, TriangleAlert,
  CopyCheck, CalendarClock, Save, Info, FileQuestion, Repeat, Undo2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fetchFrameworkLevel, type FrameworkNode } from '@/lib/framework'
import { currentAcademicYear, todayInput, academicYearOptions, inTransitionWindow } from '@/lib/dates'
import { sha256 } from '@/lib/hash'

type Picked = { file: File; hash: string | null }
type Dup    = { hash: string; fileName: string; evidenceId: string; name: string; code: string | null; status: string }

const ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx'

/* الأعوام والنافذة الانتقالية من `@/lib/dates` — مصدرٌ واحد (3.8). */

type ReqBrief = {
  id: string; what_is_asked: string; expected_type: string | null
  academic_year: string | null; due_date: string | null; whole: boolean
  sub: { code: string; name_ar: string } | null
  indicators: { code: string; name_ar: string }[]
  requester: { name_ar: string } | null
}

/* الغلاف: `useSearchParams` يلزمه حدُّ Suspense في الصفحات المُولّدة
   سلفاً — وبغيره **يُخفق البناء كلّه** عند التوليد المسبق لا عند العرض.
   وهو النمط نفسه في `plans` و`tasks/new` و`login`. */
export default function NewDirectEvidencePage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-slate-400">…</div>}>
      <NewDirectEvidenceInner />
    </Suspense>
  )
}

type OpenCycle = {
  cycleId: string; requestId: string; period: string
  dueDate: string | null; year: string; taskName: string; frequency: string
}

function NewDirectEvidenceInner() {
  const router   = useRouter()
  const params   = useSearchParams()
  const requestId = params.get('request') || ''
  const [reqBrief, setReqBrief] = useState<ReqBrief | null>(null)
  /* دوراتٌ مفتوحة على المعيار نفسه — علاج «ازدواج الدليل» (5.2) */
  const [openCycles, setOpenCycles] = useState<OpenCycle[]>([])
  const [cycleReq,   setCycleReq]   = useState<OpenCycle | null>(null)
  const supabase = createClient()
  const fileRef  = useRef<HTMLInputElement>(null)

  /* الملفّات */
  const [picked,  setPicked]  = useState<Picked[]>([])
  const [hashing, setHashing] = useState(false)
  const [dups,    setDups]    = useState<Dup[]>([])

  /* الوصف */
  const [name,        setName]        = useState('')
  const [description, setDescription] = useState('')

  /* المرساة — ثلاث قوائم متتالية */
  const [l1, setL1] = useState<FrameworkNode[]>([])
  const [l2, setL2] = useState<FrameworkNode[]>([])
  const [l3, setL3] = useState<FrameworkNode[]>([])
  const [selL1, setSelL1] = useState('')
  const [selL2, setSelL2] = useState('')
  const [selL3, setSelL3] = useState('')   // كود المعيار الفرعي

  /* التصنيف */
  const [academicYear, setAcademicYear] = useState(currentAcademicYear())
  const [documentDate, setDocumentDate] = useState('')
  const [evidenceType, setEvidenceType] = useState('')
  const [reasonCode,   setReasonCode]   = useState('')
  const [typeOptions,   setTypeOptions]   = useState<string[]>([])
  const [reasonOptions, setReasonOptions] = useState<string[]>([])

  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  /* ── القوائم والمستوى الأول ── */
  useEffect(() => {
    ;(async () => {
      const [roots, { data: types }, { data: reasons }] = await Promise.all([
        fetchFrameworkLevel(1, null),
        supabase.from('dropdown_options').select('value')
          .eq('category', 'evidence_type').eq('is_active', true).order('sort_order'),
        supabase.from('dropdown_options').select('value')
          .eq('category', 'evidence_reason').eq('is_active', true).order('sort_order'),
      ])
      setL1(roots)
      setTypeOptions((types || []).map((t: any) => t.value))
      setReasonOptions((reasons || []).map((r: any) => r.value))
    })()
  }, [])

  /* ── الطلب الموجَّه: مرساته تُعرَض ولا تُختار ── */
  useEffect(() => {
    if (!requestId) return
    ;(async () => {
      const r = await fetch(`/api/evidence/requests?scope=mine&id=${requestId}`)
      if (!r.ok) { setError('تعذّر تحميل الطلب — أو ليس مفتوحاً لك'); return }
      const one = ((await r.json()).requests || [])[0]
      if (!one) { setError('هذا الطلب ليس مفتوحاً لك'); return }
      setReqBrief(one)
      if (one.academic_year) setAcademicYear(one.academic_year)
      if (one.expected_type) setEvidenceType(one.expected_type)
    })()
  }, [requestId])

  useEffect(() => {
    setSelL2(''); setSelL3(''); setL2([]); setL3([])
    if (selL1) fetchFrameworkLevel(2, selL1).then(setL2)
  }, [selL1])

  useEffect(() => {
    setSelL3(''); setL3([])
    if (selL2) fetchFrameworkLevel(3, selL2).then(setL3)
  }, [selL2])

  const subNodeId = useMemo(
    () => l3.find(n => n.code === selL3)?.id || '',
    [l3, selL3],
  )

  /* ── «أهذا دليل دورة أكتوبر من مهمة كذا؟» (5.2) ──
     يُسأل بعد اختيار المعيار، فالسؤال قبله بلا معنى. والسؤالُ لا منع:
     الرفع المباشر حقٌّ قائم (3.1)، وقد يكون الدليل لشيءٍ آخر في
     المعيار نفسه — فيُجاب بنقرة ولا يُحوَّل الرافع قسراً. */
  useEffect(() => {
    setCycleReq(null); setOpenCycles([])
    if (requestId || !subNodeId) return
    fetch(`/api/evidence/open-cycles?subNodeId=${encodeURIComponent(subNodeId)}`)
      .then(r => r.json()).then(j => setOpenCycles(j.cycles || [])).catch(() => setOpenCycles([]))
  }, [subNodeId, requestId])

  /* ── اختيار الملفّات: بصمة فورية ثم فحص التكرار ── */
  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setHashing(true); setError('')

    const added: Picked[] = []
    for (const f of files) added.push({ file: f, hash: await sha256(f) })
    const next = [...picked, ...added]
    setPicked(next)
    if (!name && next.length) setName(next[0].file.name.replace(/\.[^.]+$/, ''))

    const hashes = next.map(p => p.hash).filter(Boolean).join(',')
    if (hashes) {
      try {
        const res = await fetch(`/api/evidence/direct?hash=${encodeURIComponent(hashes)}`)
        if (res.ok) setDups((await res.json()).duplicates || [])
      } catch { /* الشبكة — الخادم يكشف التكرار على أيّ حال */ }
    }
    setHashing(false)
  }

  const removeFile = (i: number) => {
    const next = picked.filter((_, idx) => idx !== i)
    setPicked(next)
    setDups(d => d.filter(x => next.some(p => p.hash === x.hash)))
  }

  /* ── تاريخ الوثيقة يقترح العام، ولا يفرضه في النافذة الانتقالية ── */
  const onDocDate = (v: string) => {
    setDocumentDate(v)
    if (!v) return
    const d = new Date(v)
    if (isNaN(d.getTime())) return
    if (!inTransitionWindow(d)) setAcademicYear(currentAcademicYear(d))
  }

  const docInWindow  = !!documentDate && inTransitionWindow(new Date(documentDate))
  const isRetroactive = academicYear < currentAcademicYear()
  /* مرساة الطلب تُعفي من الاختيار — والخادم يفرضها على أيّ حال */
  const anchored = requestId ? !!reqBrief : !!subNodeId
  const canSave = !!name.trim() && anchored && !!academicYear && picked.length > 0 && !saving && !hashing

  /* ── الحفظ ── */
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    setSaving(true); setError('')

    const fd = new FormData()
    fd.append('name', name.trim())
    fd.append('description', description.trim())
    fd.append('sub_node_id', subNodeId)
    const effRequest = requestId || cycleReq?.requestId || ''
    if (effRequest) fd.append('request_id', effRequest)
    fd.append('academic_year', academicYear)
    fd.append('document_date', documentDate)
    fd.append('evidence_type', evidenceType)
    fd.append('reason_code', reasonCode)
    picked.forEach(p => { fd.append('files', p.file); fd.append('hashes', p.hash || '') })

    try {
      const res  = await fetch('/api/evidence/direct', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'تعذّر الحفظ')
      router.push((requestId || cycleReq) ? '/dashboard/evidence/requested' : '/dashboard/evidence')
    } catch (err: any) {
      setError(err.message || 'تعذّر الحفظ')
      setSaving(false)
    }
  }

  const fieldCls = 'w-full text-sm px-3 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400'
  const labelCls = 'block text-xs font-semibold text-slate-600 mb-1.5'

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">

      <Link href="/dashboard/evidence"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowRight size={18} /> خزانة الأدلة
      </Link>

      <header className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">
          {requestId ? 'تلبية دليلٍ مطلوب' : 'رفع دليل إلى المخزن'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {requestId
            ? 'المعيار محدَّدٌ في الطلب — فلا يلزمك إلا الملفّ واسمه.'
            : <>دليلٌ غير مرتبط بمهمّة أو خطة. يدخل <strong>قيد الفرز</strong> ولا يُحتسب في التغطية حتى يقبله فريق التركيز.</>}
        </p>
      </header>

      {/* ما طُلب — يُقرأ ولا يُحرَّر */}
      {!!reqBrief && (
        <section className="mb-5 bg-sky-50 border border-sky-200 rounded-2xl p-4">
          <h2 className="text-sm font-bold text-sky-900 flex items-center gap-1.5">
            <span className="inline-flex"><FileQuestion size={15} /></span>
            <span>{reqBrief.what_is_asked}</span>
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-sky-800">
            <span><span className="font-mono">{reqBrief.sub?.code}</span> {reqBrief.sub?.name_ar}</span>
            <span>
              {reqBrief.whole
                ? 'المعيار الفرعي كاملاً'
                : `المؤشرات: ${reqBrief.indicators.map(i => i.code).join(' · ')}`}
            </span>
            {reqBrief.due_date && <span>المهلة {reqBrief.due_date}</span>}
            {reqBrief.requester && <span>طلبه: {reqBrief.requester.name_ar}</span>}
          </div>
          <p className="mt-2 text-[11px] text-sky-700">
            المرساة من الطلب — والعام منه إن حدّده. وما ترفعه يدخل طابور الفرز، ولا يُغلق الطلب إلا بقبوله.
          </p>
        </section>
      )}

      <form onSubmit={submit} className="space-y-5">

        {/* ── الملفّات ── */}
        <section className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <label className={labelCls}>الملفّات <span className="text-rose-500">*</span></label>

          <button type="button" onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed border-slate-200 rounded-xl py-6 hover:border-violet-300 hover:bg-violet-50/40 transition-colors">
            <span className="flex flex-col items-center gap-2 text-slate-500">
              <FolderOpen size={32} style={{ color: 'var(--maroon-300)' }} />
              <span className="text-sm">اختر ملفّاً أو أكثر</span>
              <span className="text-[11px] text-slate-400">صور · PDF · Word · Excel · PowerPoint — حتى 25م.ب للملفّ</span>
            </span>
          </button>
          <input ref={fileRef} type="file" multiple accept={ACCEPT} onChange={onPick} className="hidden" />

          {hashing && (
            <p className="mt-3 text-xs text-slate-500 flex items-center gap-1.5">
              <span className="inline-flex"><Loader2 size={14} className="animate-spin" /></span>
              <span>حساب البصمة وفحص التكرار…</span>
            </p>
          )}

          {picked.length > 0 && (
            <ul className="mt-3 space-y-2">
              {picked.map((p, i) => (
                <li key={i} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="inline-flex text-slate-400">
                    {p.file.type === 'application/pdf' ? <FileText size={18} /> : <Paperclip size={18} />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-slate-700 truncate">{p.file.name}</span>
                    <span className="block text-[11px] text-slate-400 font-latin">
                      {(p.file.size / 1024).toFixed(0)} KB
                      {p.hash ? ` · ${p.hash.slice(0, 12)}` : ''}
                    </span>
                  </span>
                  <button type="button" onClick={() => removeFile(i)}
                    className="text-slate-400 hover:text-rose-500 p-1">
                    <X size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {dups.length > 0 && (
            <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
              <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                <span className="inline-flex"><CopyCheck size={14} /></span>
                <span>ملفّ مرفوع من قبل</span>
              </p>
              <ul className="mt-1.5 space-y-1">
                {dups.map((d, i) => (
                  <li key={i} className="text-[11px] text-amber-700">
                    «{d.fileName}» يطابق الدليل <strong>{d.name}</strong>
                    {d.code ? <span className="font-latin"> ({d.code})</span> : null}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-amber-600">
                البصمة نفسها تعني الملفّ نفسه بايتاً بايتاً. لك أن تمضي — والتكرار يُعرَض ولا يُمنع.
              </p>
            </div>
          )}
        </section>

        {/* ── التعريف ── */}
        <section className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4">
          <div>
            <label className={labelCls}>اسم الدليل <span className="text-rose-500">*</span></label>
            <input value={name} onChange={e => setName(e.target.value)} className={fieldCls}
              placeholder="محضر اجتماع مجلس الأمناء — الفصل الأول" />
          </div>
          <div>
            <label className={labelCls}>وصف مختصر</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              className={fieldCls} placeholder="ما الذي يشهد له هذا الدليل؟" />
          </div>
        </section>

        {/* ── المرساة — وتُخفى في قناة الطلب: «الموظّف يرفع الملفّ فقط» ── */}
        {!requestId && (
        <section className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-700">موضعه من إطار الاعتماد <span className="text-rose-500">*</span></h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              يكفي المعيار الفرعي — ويكمل المقيّم المؤشرات عند القبول.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>المعيار الرئيس</label>
              <select value={selL1} onChange={e => setSelL1(e.target.value)} className={fieldCls}>
                <option value="">— اختر —</option>
                {l1.map(n => <option key={n.id} value={n.code}>{n.code} — {n.name_ar}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>الجانب</label>
              <select value={selL2} onChange={e => setSelL2(e.target.value)} disabled={!selL1}
                className={`${fieldCls} disabled:bg-slate-50 disabled:text-slate-400`}>
                <option value="">— اختر —</option>
                {l2.map(n => <option key={n.id} value={n.code}>{n.code} — {n.name_ar}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>المعيار الفرعي</label>
              <select value={selL3} onChange={e => setSelL3(e.target.value)} disabled={!selL2}
                className={`${fieldCls} disabled:bg-slate-50 disabled:text-slate-400`}>
                <option value="">— اختر —</option>
                {l3.map(n => <option key={n.id} value={n.code}>{n.code} — {n.name_ar}</option>)}
              </select>
            </div>
          </div>
        </section>
        )}

        {/* ── «أهذا دليل دورة أكتوبر من مهمة كذا؟» — بنقرة (5.2) ──
             وبغيره سجلّان لحدثٍ واحد: المدرسة تظنّ أنها وثّقت والطابور
             يظنّ أنها لم تفعل، فتُوسَم الدورة مهملةً وقد نُفِّذت. */}
        {!requestId && openCycles.length > 0 && (
          <section className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
            <p className="inline-flex items-center gap-1.5 text-sm font-bold text-sky-900 mb-1">
              <span className="inline-flex"><Repeat size={15} /></span>
              <span>{cycleReq ? 'سيُسجَّل دليلاً لهذه الدورة' : 'لهذا المعيار دورةٌ مفتوحة تنتظر دليلاً'}</span>
            </p>

            {!cycleReq ? (
              <>
                <p className="text-[11px] text-sky-800/80 mb-2.5 leading-relaxed">
                  إن كان هذا دليلها فاختَرها — <strong>فيُغلق طلبها ولا يبقى سجلّان لحدثٍ واحد</strong>.
                  وإن كان لشيءٍ آخر في المعيار نفسه فامضِ، والرفع المباشر حقٌّ قائم.
                </p>
                <div className="space-y-1.5">
                  {openCycles.map(c => (
                    <div key={c.cycleId}
                      className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-sky-100">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-700 truncate">{c.taskName}</p>
                        <p className="text-[11px] text-slate-500">
                          <span>{c.period}</span>
                          {c.dueDate && <span> · مهلتها {c.dueDate}</span>}
                        </p>
                      </div>
                      <button type="button" onClick={() => setCycleReq(c)}
                        className="px-3 py-1.5 rounded-lg bg-sky-700 text-white text-xs font-bold flex-shrink-0">
                        نعم، هذا دليلها
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="p-2.5 rounded-xl bg-white border border-sky-100 flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-700 truncate">{cycleReq.taskName}</p>
                    <p className="text-[11px] text-slate-500">{cycleReq.period}</p>
                  </div>
                  <button type="button" onClick={() => setCycleReq(null)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs flex-shrink-0">
                    <span className="inline-flex"><Undo2 size={12} /></span>
                    <span>تراجع</span>
                  </button>
                </div>
                <p className="text-[11px] text-sky-800/80 mt-2 leading-relaxed">
                  ويرث الدليل <strong>مراسي المهمّة كلّها</strong>، وعامُه من الدورة
                  (<span className="font-latin">{cycleReq.year}</span>) لا من اختيارك —
                  «فالعام المنسوب حكمٌ لا تاريخ» (3.8). وبقبوله تُغلق الدورة موثّقةً.
                </p>
              </>
            )}
          </section>
        )}

        {/* ── التصنيف ── */}
        <section className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>تاريخ الوثيقة</label>
              <input type="date" value={documentDate} max={todayInput()}
                onChange={e => onDocDate(e.target.value)} className={`${fieldCls} font-latin`} />
            </div>
            <div>
              <label className={labelCls}>العام المنسوب <span className="text-rose-500">*</span></label>
              <select value={academicYear} onChange={e => setAcademicYear(e.target.value)}
                className={`${fieldCls} font-latin`}>
                {academicYearOptions().map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {docInWindow && (
            <div className="p-3 rounded-xl bg-sky-50 border border-sky-200">
              <p className="text-xs text-sky-800 flex items-start gap-1.5">
                <span className="inline-flex mt-0.5"><CalendarClock size={14} /></span>
                <span>
                  تاريخ الوثيقة يقع بين يوليو وسبتمبر — <strong>وهي فترة تخدم العامين</strong>.
                  فنشاط صيفيّ يُنسب للعام المنصرم، وتجهيزٌ للعام القادم يُنسب له. <strong>حدّد العام بنفسك.</strong>
                </span>
              </p>
            </div>
          )}

          {isRetroactive && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
              <p className="text-xs text-amber-800 flex items-start gap-1.5">
                <span className="inline-flex mt-0.5"><TriangleAlert size={14} /></span>
                <span>
                  <strong>بأثر رجعيّ:</strong> يُنسب إلى <span className="font-latin">{academicYear}</span> ويُحتسب في عامه،
                  ويظهر في سجلّه أنه رُفع اليوم. <strong>الإفصاح يبني ثقةً أكثر ممّا يكلّف.</strong>
                </span>
              </p>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>نوع الدليل</label>
              <select value={evidenceType} onChange={e => setEvidenceType(e.target.value)} className={fieldCls}>
                <option value="">— غير محدّد —</option>
                {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>سبب الرفع خارج خطة</label>
              <select value={reasonCode} onChange={e => setReasonCode(e.target.value)} className={fieldCls}>
                <option value="">— غير محدّد —</option>
                {reasonOptions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
        </section>

        {error && (
          <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl p-3">{error}</p>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={!canSave}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold disabled:opacity-50 hover:brightness-95 transition">
            <span className="inline-flex">{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}</span>
            <span>{saving ? 'جارٍ الرفع…' : 'رفع الدليل'}</span>
          </button>
          <Link href="/dashboard/evidence"
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 text-sm hover:bg-slate-50">
            إلغاء
          </Link>
        </div>

        <p className="text-[11px] text-slate-400 flex items-start gap-1.5">
          <span className="inline-flex mt-0.5"><Info size={13} /></span>
          <span>
            عند الرفع يُختم الدليل بمن رفعه وتاريخه وبصمة كل ملفّ، ويُوجَّه إلى فريق التركيز
            المالك للمعيار الرئيس. ولا يُعدَّل بعد قبوله إلا بسجلّ.
          </span>
        </p>
      </form>
    </div>
  )
}

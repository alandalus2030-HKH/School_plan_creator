'use client'

/* ════════════════════════════════════════════════════════════
   القناة المباشرة — رفع دليل إلى مخزن الاعتماد بلا مهمّة ولا خطة.
   المرجع: docs/QNSA_ACCREDITATION_ARCHITECTURE.html §3.1 · 3.2 · 3.8

   • المعيار الفرعي **إلزاميّ** — ومنه يُشتقّ الفريق المالك آلياً.
   • العام المنسوب **حكمٌ لا تاريخ** (3.8): يُقترح من تاريخ الوثيقة،
     ويُسأل عنه صراحةً في النافذة الانتقالية (1 يوليو ← 30 سبتمبر).
   • البصمة تُحسب هنا لكشف المكرّر قبل الرفع؛ والمعتمدة ما يحسبه الخادم.
   • الدليل يدخل «قيد الفرز» ولا يُحتسب في تغطية حتى يُقبل.
   ════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowRight, FolderOpen, X, Paperclip, FileText, Loader2, TriangleAlert,
  CopyCheck, CalendarClock, Save, Info,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fetchFrameworkLevel, type FrameworkNode } from '@/lib/framework'
import { currentAcademicYear, todayInput } from '@/lib/dates'
import { sha256 } from '@/lib/hash'

type Picked = { file: File; hash: string | null }
type Dup    = { hash: string; fileName: string; evidenceId: string; name: string; code: string | null; status: string }

const ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx'

/** الأعوام المعروضة: الجاري وأربعة قبله وواحد بعده. */
function yearOptions(): string[] {
  const cur   = currentAcademicYear()
  const start = parseInt(cur.split('-')[0], 10)
  const out: string[] = []
  for (let y = start + 1; y >= start - 4; y--) out.push(`${y}-${y + 1}`)
  return out
}

/** النافذة الانتقالية (3.8): يوليو ← سبتمبر، حيث لا يُنسَب العام صامتاً. */
function inTransitionWindow(d: Date = new Date()): boolean {
  const m = d.getMonth() + 1
  return m >= 7 && m <= 9
}

export default function NewDirectEvidencePage() {
  const router   = useRouter()
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
  const canSave = !!name.trim() && !!subNodeId && !!academicYear && picked.length > 0 && !saving && !hashing

  /* ── الحفظ ── */
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    setSaving(true); setError('')

    const fd = new FormData()
    fd.append('name', name.trim())
    fd.append('description', description.trim())
    fd.append('sub_node_id', subNodeId)
    fd.append('academic_year', academicYear)
    fd.append('document_date', documentDate)
    fd.append('evidence_type', evidenceType)
    fd.append('reason_code', reasonCode)
    picked.forEach(p => { fd.append('files', p.file); fd.append('hashes', p.hash || '') })

    try {
      const res  = await fetch('/api/evidence/direct', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'تعذّر الحفظ')
      router.push('/dashboard/evidence/store')
    } catch (err: any) {
      setError(err.message || 'تعذّر الحفظ')
      setSaving(false)
    }
  }

  const fieldCls = 'w-full text-sm px-3 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400'
  const labelCls = 'block text-xs font-semibold text-slate-600 mb-1.5'

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">

      <Link href="/dashboard/evidence/store"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowRight size={18} /> مخزن الاعتماد
      </Link>

      <header className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">رفع دليل إلى المخزن</h1>
        <p className="text-sm text-slate-500 mt-1">
          دليلٌ غير مرتبط بمهمّة أو خطة. يدخل <strong>قيد الفرز</strong> ولا يُحتسب في التغطية حتى يقبله فريق التركيز.
        </p>
      </header>

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

        {/* ── المرساة ── */}
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
                {yearOptions().map(y => <option key={y} value={y}>{y}</option>)}
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
          <Link href="/dashboard/evidence/store"
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

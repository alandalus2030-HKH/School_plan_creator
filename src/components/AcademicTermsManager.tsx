'use client'

import { useState, useEffect, useCallback } from 'react'
import { CalendarRange, Plus, Trash2, Save, Loader2, Copy, AlertTriangle } from 'lucide-react'
import { toast } from '@/components/Toast'
import { academicYearOptions, currentAcademicYear } from '@/lib/dates'

/**
 * فصول العام الدراسي — تُعرَّف هنا مرّةً، ويقرؤها كلُّ ما يحتاج تاريخاً
 * فصليّاً: المهامّ الدورية أوّلاً، وما بعدها.
 *
 * ── ولماذا لا تُثبَّت في الكود ──
 * كان محرّك الدورات يحمل الفصول مكتوبةً فيه (أغسطس←نوفمبر …)، **وهي
 * تختلف من مدرسة إلى مدرسة** بل من عامٍ إلى عام. فكلُّ دورةٍ تُفتح
 * بتاريخٍ لا يطابق واقع المدرسة طلبٌ في غير وقته — ومن طلبٍ في غير
 * وقته يتعلّم الناس تجاهل الطابور (5.2).
 *
 * ── ونصف الفصل يُدخَل ولا يُحسب ──
 * منتصف المدّة ليس نصف الفصل: الأوّل حسابٌ والثاني قرارٌ مدرسيّ.
 */

type Term = {
  term_no: number
  name_ar: string
  start_date: string
  end_date: string
  mid_date: string
}

const YEARS = academicYearOptions()
const NAMES = ['الفصل الأول', 'الفصل الثاني', 'الفصل الثالث', 'الفصل الرابع', 'الفصل الخامس', 'الفصل السادس']

const blank = (n: number): Term => ({
  term_no: n, name_ar: NAMES[n - 1] || `الفصل ${n}`,
  start_date: '', end_date: '', mid_date: '',
})

/** نقل تاريخٍ عاماً كاملاً إلى الأمام — لنسخ تقويم عامٍ إلى الذي يليه. */
const shiftYear = (d: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return ''
  return `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`
}

export default function AcademicTermsManager() {
  const [year,  setYear]  = useState(currentAcademicYear())
  const [terms, setTerms] = useState<Term[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)

  const load = useCallback(async (y: string) => {
    setLoading(true)
    const r = await fetch(`/api/academic-terms?year=${encodeURIComponent(y)}`)
    const j = await r.json().catch(() => ({}))
    setTerms((j.terms || []).map((t: any) => ({
      term_no: t.term_no, name_ar: t.name_ar,
      start_date: t.start_date || '', end_date: t.end_date || '', mid_date: t.mid_date || '',
    })))
    setLoading(false)
  }, [])

  useEffect(() => { load(year) }, [year, load])

  const patch = (i: number, k: keyof Term, v: string) =>
    setTerms(ts => ts.map((t, j) => j === i ? { ...t, [k]: v } : t))

  const addTerm = () =>
    setTerms(ts => ts.length >= 6 ? ts : [...ts, blank(ts.length + 1)])

  const removeTerm = (i: number) =>
    setTerms(ts => ts.filter((_, j) => j !== i).map((t, j) => ({ ...t, term_no: j + 1 })))

  /* نسخُ العام السابق مع إزاحة التواريخ سنةً — فالتقويم يتكرّر بنمطه */
  const copyPrev = async () => {
    const prev = `${Number(year.split('-')[0]) - 1}-${Number(year.split('-')[1]) - 1}`
    const r = await fetch(`/api/academic-terms?year=${encodeURIComponent(prev)}`)
    const j = await r.json().catch(() => ({}))
    const rows: any[] = j.terms || []
    if (!rows.length) { toast(`لا فصولَ معرّفة في ${prev}`, 'error'); return }
    setTerms(rows.map((t: any) => ({
      term_no: t.term_no, name_ar: t.name_ar,
      start_date: shiftYear(t.start_date), end_date: shiftYear(t.end_date),
      mid_date: t.mid_date ? shiftYear(t.mid_date) : '',
    })))
    toast(`نُسخت فصول ${prev} — راجع تواريخها قبل الحفظ`, 'success')
  }

  const save = async () => {
    setSaving(true)
    const r = await fetch('/api/academic-terms', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, terms }),
    })
    const j = await r.json().catch(() => ({}))
    setSaving(false)
    if (!r.ok) { toast(j.error || 'تعذّر الحفظ', 'error'); return }
    toast(`حُفظت فصول ${year}`, 'success')
    load(year)
  }

  const missingMid = terms.some(t => !t.mid_date)

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-5">
      <div className="flex items-center gap-3 p-5 border-b border-slate-100 bg-gradient-to-l from-violet-50 to-white">
        <span className="inline-flex" style={{ color: 'var(--maroon-600)' }}><CalendarRange size={26} /></span>
        <div className="min-w-0">
          <h3 className="font-bold text-slate-800">فصول العام الدراسي</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            منها تُحسب مواعيد المهامّ الدورية الفصلية ونصف الفصلية والسنوية — فلا تاريخَ مفترَضاً في النظام.
          </p>
        </div>
        <select value={year} onChange={e => setYear(e.target.value)}
          className="ms-auto px-3 py-2 rounded-xl border border-slate-200 text-sm font-latin bg-white">
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="p-4">
        {loading ? (
          <p className="text-sm text-slate-400 text-center py-6">…</p>
        ) : (
          <>
            {!terms.length && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-3 leading-relaxed">
                <strong>لا فصولَ معرّفة لهذا العام</strong> — ولن تُفتح دورةٌ فصلية أو سنوية حتى تُعرَّف،
                فالنظام لا يخترع تاريخاً.
              </p>
            )}

            {!!terms.length && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-slate-500">
                    <tr className="border-b border-slate-100">
                      <th className="p-2 text-start font-semibold">الفصل</th>
                      <th className="p-2 text-start font-semibold">يبدأ</th>
                      <th className="p-2 text-start font-semibold">ينتهي</th>
                      <th className="p-2 text-start font-semibold">آخر يوم في نصفه الأول</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {terms.map((t, i) => (
                      <tr key={i} className="border-b border-slate-50">
                        <td className="p-2">
                          <input value={t.name_ar} onChange={e => patch(i, 'name_ar', e.target.value)}
                            className="w-full min-w-[120px] px-2 py-1.5 rounded-lg border border-slate-200" />
                        </td>
                        <td className="p-2">
                          <input type="date" value={t.start_date} onChange={e => patch(i, 'start_date', e.target.value)}
                            className="px-2 py-1.5 rounded-lg border border-slate-200 font-latin" />
                        </td>
                        <td className="p-2">
                          <input type="date" value={t.end_date} onChange={e => patch(i, 'end_date', e.target.value)}
                            className="px-2 py-1.5 rounded-lg border border-slate-200 font-latin" />
                        </td>
                        <td className="p-2">
                          <input type="date" value={t.mid_date} onChange={e => patch(i, 'mid_date', e.target.value)}
                            className={`px-2 py-1.5 rounded-lg border font-latin ${
                              t.mid_date ? 'border-slate-200' : 'border-amber-300'}`} />
                        </td>
                        <td className="p-2 text-end">
                          <button onClick={() => removeTerm(i)} title="احذف الفصل"
                            className="text-slate-400 hover:text-rose-600">
                            <span className="inline-flex"><Trash2 size={15} /></span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {missingMid && !!terms.length && (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-2 mt-3 inline-flex items-start gap-1.5 leading-relaxed">
                <span className="inline-flex mt-0.5"><AlertTriangle size={12} /></span>
                <span>
                  فصلٌ بلا نصفٍ محدَّد لا تُفتح له دورةٌ <strong>نصف فصلية</strong> — وبقيّة الدوريات تعمل.
                  <strong> ونصف الفصل قرارٌ مدرسيّ لا منتصفُ المدّة</strong>، فلذلك يُدخَل ولا يُحسب.
                </span>
              </p>
            )}

            <div className="flex items-center gap-2 mt-4 flex-wrap">
              <button onClick={save} disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-40"
                style={{ background: 'var(--maroon-600)' }}>
                <span className="inline-flex">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}</span>
                <span>احفظ فصول {year}</span>
              </button>
              <button onClick={addTerm} disabled={terms.length >= 6}
                className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 disabled:opacity-40">
                <span className="inline-flex"><Plus size={14} /></span>
                <span>أضف فصلاً</span>
              </button>
              <button onClick={copyPrev}
                className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600">
                <span className="inline-flex"><Copy size={14} /></span>
                <span>انسخ العام السابق</span>
              </button>
              <span className="text-[11px] text-slate-400">
                عددُ الفصول ما تُدخله مدرستك — فصلان أو ثلاثة أو أكثر.
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

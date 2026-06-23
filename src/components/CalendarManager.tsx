'use client'

import { useState, useEffect, useRef } from 'react'
import { CalendarDays, Plus, Trash2, Pencil, X, Save, FileSpreadsheet, Sparkles, Upload, AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from '@/components/Toast'
import { KIND_LABEL, KIND_COLOR, type CalendarEvent } from '@/lib/calendar'
import ConfirmDialog from '@/components/ConfirmDialog'

const KINDS = ['holiday', 'break', 'national', 'eid', 'exam', 'other'] as const
const WEEK_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

/* ── نوع الفترة الواحدة في نموذج الإضافة/التعديل ── */
type FormState = {
  id?: string
  title: string
  kind: CalendarEvent['kind']
  enforcement: 'block' | 'warn'
  start_date: string
  end_date: string
}

/* ── فترة في قائمة الاستيراد (معاينة قبل الحفظ) ── */
type ImportedEvent = {
  title: string
  kind: CalendarEvent['kind']
  enforcement: 'block' | 'warn'
  start_date: string
  end_date: string
  selected: boolean
  error?: string
}

const EMPTY: FormState = { title: '', kind: 'holiday', enforcement: 'block', start_date: '', end_date: '' }

/* ── تحويل نص النوع (عربي/إنجليزي) إلى kind ── */
function parseKind(raw: string): CalendarEvent['kind'] {
  const s = (raw || '').trim().toLowerCase()
  if (s.includes('عطلة') || s.includes('إجازة') || s.includes('holiday')) return 'holiday'
  if (s.includes('استراحة') || s.includes('break') || s.includes('منتصف')) return 'break'
  if (s.includes('وطني') || s.includes('national')) return 'national'
  if (s.includes('عيد') || s.includes('eid')) return 'eid'
  if (s.includes('اختبار') || s.includes('امتحان') || s.includes('exam')) return 'exam'
  return 'other'
}

/* ── تحويل قيمة تاريخ Excel (رقم تسلسلي أو نص أو Date) إلى YYYY-MM-DD ── */
function parseDate(val: any): string {
  if (!val) return ''
  if (val instanceof Date) {
    const y = val.getFullYear()
    const m = String(val.getMonth() + 1).padStart(2, '0')
    const d = String(val.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = String(val).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  /* DD/MM/YYYY أو DD-MM-YYYY */
  const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return ''
}

/* ── تنسيق التاريخ للعرض ── */
const fmt = (d: string) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('ar-QA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export default function CalendarManager() {
  const [events,     setEvents]     = useState<CalendarEvent[]>([])
  const [weekend,    setWeekend]    = useState<number[]>([5, 6])
  const [loading,    setLoading]    = useState(true)
  const [form,       setForm]       = useState<FormState | null>(null)
  const [saving,     setSaving]     = useState(false)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  /* ── حالة الاستيراد ── */
  const [importMode,   setImportMode]   = useState<null | 'excel' | 'ai'>(null)
  const [importEvents, setImportEvents] = useState<ImportedEvent[]>([])
  const [aiLoading,    setAiLoading]    = useState(false)
  const [bulkSaving,   setBulkSaving]   = useState(false)
  const excelRef = useRef<HTMLInputElement>(null)
  const aiRef    = useRef<HTMLInputElement>(null)

  /* ════ تحميل البيانات ════ */
  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/calendar')
    const j = await res.json().catch(() => ({ events: [], weekend: [5, 6] }))
    setEvents(j.events || [])
    setWeekend(j.weekend || [5, 6])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  /* ════ حفظ فترة واحدة ════ */
  const save = async () => {
    if (!form) return
    if (!form.title.trim())           { toast('العنوان مطلوب', 'error'); return }
    if (!form.start_date || !form.end_date) { toast('التواريخ مطلوبة', 'error'); return }
    if (form.end_date < form.start_date)    { toast('تاريخ الانتهاء قبل البدء', 'error'); return }
    setSaving(true)
    const url = form.id ? `/api/calendar/${form.id}` : '/api/calendar'
    const res = await fetch(url, {
      method: form.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { toast(j.error || 'تعذّر الحفظ', 'error'); return }
    toast(form.id ? 'تم التحديث' : 'تمت الإضافة')
    setForm(null); load()
  }

  /* ════ حذف فترة ════ */
  const remove = async (id: string) => {
    const res = await fetch(`/api/calendar/${id}`, { method: 'DELETE' })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { toast(j.error || 'تعذّر الحذف', 'error'); return }
    toast('تم الحذف'); setConfirmDel(null); load()
  }

  /* ════ أيام نهاية الأسبوع ════ */
  const toggleWeekend = async (day: number) => {
    const next = weekend.includes(day) ? weekend.filter(d => d !== day) : [...weekend, day].sort()
    setWeekend(next)
    const res = await fetch('/api/calendar', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekend: next }),
    })
    if (!res.ok) { toast('تعذّر حفظ نهاية الأسبوع', 'error'); load() }
    else toast('تم حفظ أيام نهاية الأسبوع')
  }

  /* ════ استيراد Excel ════ */
  const handleExcelFile = async (file: File) => {
    try {
      const XLSX = await import('xlsx')
      const buf  = await file.arrayBuffer()
      const wb   = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, blankrows: false })
      if (!rows.length) { toast('الملف فارغ', 'error'); return }

      /* تخطّ صف الرأس إن كان النص يبدو كوصف عمود */
      const firstCell = String(rows[0]?.[0] || '').trim()
      const startRow  = /عنوان|نوع|title|kind|من|إلى|date/i.test(firstCell) ? 1 : 0

      const parsed: ImportedEvent[] = []
      for (let i = startRow; i < rows.length; i++) {
        const row = rows[i]
        if (!row || !row[0]) continue
        const title       = String(row[0] || '').trim()
        const kind        = parseKind(String(row[1] || 'عطلة'))
        const start_date  = parseDate(row[2])
        const end_date    = parseDate(row[3]) || start_date
        const enforcement = /تنبيه|warn/i.test(String(row[4] || '')) ? 'warn' : 'block'

        const error = !title        ? 'العنوان مفقود'
          : !start_date             ? 'تاريخ البدء مفقود'
          : !end_date               ? 'تاريخ الانتهاء مفقود'
          : end_date < start_date   ? 'تاريخ الانتهاء قبل البدء'
          : undefined

        parsed.push({ title, kind, start_date, end_date, enforcement, selected: !error, error })
      }

      if (!parsed.length) { toast('لم يُعثر على صفوف في الملف', 'error'); return }
      setImportEvents(parsed)
      setImportMode('excel')
    } catch (err) {
      console.error('[excel-import]', err)
      toast('تعذّر قراءة الملف — تأكد من صيغة Excel (.xlsx / .xls)', 'error')
    }
  }

  /* ════ استيراد بالذكاء الاصطناعي (صورة) ════ */
  const handleAIFile = async (file: File) => {
    setAiLoading(true)
    setImportMode('ai')
    setImportEvents([])
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/calendar/ai-import', { method: 'POST', body: fd })
      const j   = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast(j.error || 'تعذّر التحليل', 'error')
        setImportMode(null); setAiLoading(false); return
      }
      const events: ImportedEvent[] = (j.events || []).map((e: any) => ({
        ...e,
        selected: true,
        error: (!e.start_date || !e.end_date) ? 'تاريخ مفقود' : undefined,
      }))
      if (!events.length) {
        toast('لم يُستخرج أي حدث — جرّب صورة أوضح أو استخدم Excel', 'error')
        setImportMode(null); setAiLoading(false); return
      }
      setImportEvents(events)
    } catch {
      toast('تعذّر التحليل', 'error'); setImportMode(null)
    }
    setAiLoading(false)
  }

  /* ════ حفظ جماعي للاستيراد ════ */
  const bulkSave = async () => {
    const toSave = importEvents.filter(e => e.selected && !e.error)
    if (!toSave.length) { toast('لا توجد فترات صالحة محددة', 'error'); return }
    setBulkSaving(true)
    let ok = 0
    for (const ev of toSave) {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ev),
      })
      if (res.ok) ok++
    }
    setBulkSaving(false)
    toast(`تم استيراد ${ok} من ${toSave.length} فترة`)
    setImportMode(null); setImportEvents([])
    load()
  }

  const toggleImportSelect = (idx: number) =>
    setImportEvents(prev => prev.map((e, i) => i === idx ? { ...e, selected: !e.selected } : e))

  const cancelImport = () => { setImportMode(null); setImportEvents([]) }

  /* ════ الواجهة ════ */
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

      {/* الرأس */}
      <div className="flex items-center gap-3 p-5 border-b border-slate-100 bg-gradient-to-l from-violet-50 to-white flex-wrap">
        <CalendarDays size={28} style={{ color: 'var(--maroon-600)', flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-slate-800">التقويم المدرسي</h2>
          <p className="text-xs text-slate-500">عطلات واختبارات تُظهَر وتمنع/تنبّه عند تحديد تواريخ المهام</p>
        </div>
        {!form && !importMode && (
          <div className="flex items-center gap-2 flex-wrap">
            {/* استيراد Excel */}
            <button
              onClick={() => excelRef.current?.click()}
              title="استيراد من ملف Excel"
              className="inline-flex items-center gap-1.5 text-xs text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-3 py-2 rounded-xl font-medium transition-colors">
              <FileSpreadsheet size={14} /> Excel
            </button>
            <input ref={excelRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleExcelFile(f); e.target.value = '' }} />

            {/* تحليل بالذكاء الاصطناعي */}
            <button
              onClick={() => aiRef.current?.click()}
              title="تحليل صورة التقويم بالذكاء الاصطناعي"
              className="inline-flex items-center gap-1.5 text-xs text-violet-700 border border-violet-200 bg-violet-50 hover:bg-violet-100 px-3 py-2 rounded-xl font-medium transition-colors">
              <Sparkles size={14} /> ذكاء اصطناعي
            </button>
            <input ref={aiRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleAIFile(f); e.target.value = '' }} />

            {/* إضافة يدوية */}
            <button onClick={() => setForm({ ...EMPTY })}
              className="inline-flex items-center gap-1.5 text-sm text-white px-3 py-2 rounded-xl font-medium transition-all hover:brightness-110"
              style={{ background: 'var(--gradient-button)' }}>
              <Plus size={15} /> إضافة فترة
            </button>
          </div>
        )}
      </div>

      <div className="p-5 space-y-5">

        {/* ══ لوحة الاستيراد (معاينة) ══ */}
        {importMode && (
          <div className="border border-violet-200 bg-violet-50/30 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-violet-200 bg-violet-50">
              <p className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                <span className="inline-flex">
                  {importMode === 'excel'
                    ? <FileSpreadsheet size={15} className="text-emerald-600" />
                    : <Sparkles size={15} className="text-violet-600" />}
                </span>
                {importMode === 'excel' ? 'استيراد من Excel' : 'تحليل بالذكاء الاصطناعي'}
              </p>
              <button onClick={cancelImport} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>

            {/* حالة التحليل */}
            {aiLoading ? (
              <div className="flex flex-col items-center gap-3 py-10 text-slate-500">
                <Loader2 size={28} className="animate-spin text-violet-500" />
                <p className="text-sm">جارٍ تحليل الصورة بالذكاء الاصطناعي...</p>
              </div>
            ) : importEvents.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-slate-400">
                <Upload size={28} />
                <p className="text-sm">لم تُستخرج فترات بعد</p>
              </div>
            ) : (
              <>
                {/* جدول المعاينة */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-violet-100 text-xs text-slate-500 bg-violet-50/60">
                        <th className="px-3 py-2 text-right w-8">
                          <input type="checkbox"
                            checked={importEvents.filter(e => !e.error).every(e => e.selected)}
                            onChange={e => setImportEvents(prev =>
                              prev.map(ev => ev.error ? ev : { ...ev, selected: e.target.checked }))}
                            className="accent-violet-600" />
                        </th>
                        <th className="px-3 py-2 text-right">العنوان</th>
                        <th className="px-3 py-2 text-right">النوع</th>
                        <th className="px-3 py-2 text-right">من</th>
                        <th className="px-3 py-2 text-right">إلى</th>
                        <th className="px-3 py-2 text-right">الإلزام</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-violet-50">
                      {importEvents.map((ev, idx) => (
                        <tr key={idx} className={`${ev.error ? 'bg-red-50/40 opacity-70' : ev.selected ? '' : 'opacity-40'}`}>
                          <td className="px-3 py-2">
                            <input type="checkbox" checked={ev.selected && !ev.error} disabled={!!ev.error}
                              onChange={() => toggleImportSelect(idx)}
                              className="accent-violet-600" />
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-medium text-slate-800 truncate max-w-[180px]">{ev.title}</p>
                            {ev.error && (
                              <p className="text-[11px] text-red-500 flex items-center gap-1 mt-0.5">
                                <span className="inline-flex"><AlertTriangle size={11} /></span>
                                {ev.error}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                              style={{ background: (KIND_COLOR[ev.kind] || '#64748b') + '22', color: KIND_COLOR[ev.kind] || '#64748b' }}>
                              {KIND_LABEL[ev.kind]}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{fmt(ev.start_date)}</td>
                          <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{fmt(ev.end_date)}</td>
                          <td className="px-3 py-2">
                            <span className={`text-[11px] px-2 py-0.5 rounded-full ${ev.enforcement === 'block' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
                              {ev.enforcement === 'block' ? 'منع' : 'تنبيه'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* أزرار الاستيراد */}
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-violet-100 bg-violet-50/40">
                  <p className="text-xs text-slate-500">
                    {importEvents.filter(e => e.selected && !e.error).length} فترة محددة من أصل {importEvents.length}
                    {importEvents.some(e => e.error) && (
                      <span className="text-red-500 mr-2">
                        ({importEvents.filter(e => e.error).length} بأخطاء — لن تُستورَد)
                      </span>
                    )}
                  </p>
                  <div className="flex gap-2">
                    <button onClick={cancelImport}
                      className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs hover:bg-slate-50">
                      إلغاء
                    </button>
                    <button onClick={bulkSave} disabled={bulkSaving || !importEvents.some(e => e.selected && !e.error)}
                      className="inline-flex items-center gap-1.5 text-xs text-white px-4 py-2 rounded-xl font-medium disabled:opacity-50 transition-all hover:brightness-110"
                      style={{ background: 'var(--gradient-button)' }}>
                      <span className="inline-flex">
                        {bulkSaving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                      </span>
                      {bulkSaving ? 'جارٍ الاستيراد...' : 'استيراد المحدد'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* أيام نهاية الأسبوع */}
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-2">أيام نهاية الأسبوع (تُنبّه عند اختيارها)</p>
          <div className="flex flex-wrap gap-1.5">
            {WEEK_DAYS.map((name, i) => {
              const on = weekend.includes(i)
              return (
                <button key={i} onClick={() => toggleWeekend(i)}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${on ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}>
                  {name}
                </button>
              )
            })}
          </div>
        </div>

        {/* نموذج الإضافة/التعديل */}
        {form && (
          <div className="border border-violet-200 bg-violet-50/40 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-slate-800 text-sm">{form.id ? 'تعديل فترة' : 'فترة جديدة'}</p>
              <button onClick={() => setForm(null)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="العنوان (مثل: إجازة منتصف الفصل)"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">النوع</label>
                <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-300">
                  {KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">مستوى الإلزام</label>
                <select value={form.enforcement} onChange={e => setForm({ ...form, enforcement: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-300">
                  <option value="block">منع (لا يُسمح ببدء/انتهاء مهمة)</option>
                  <option value="warn">تنبيه فقط</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">من</label>
                <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} dir="ltr"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">إلى</label>
                <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} dir="ltr"
                  min={form.start_date || undefined}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
              </div>
            </div>
            <button onClick={save} disabled={saving}
              className="inline-flex items-center gap-1.5 text-sm text-white px-4 py-2 rounded-xl font-medium disabled:opacity-50"
              style={{ background: 'var(--gradient-button)' }}>
              <Save size={15} /> {saving ? 'جارٍ الحفظ...' : 'حفظ'}
            </button>
          </div>
        )}

        {/* قائمة الفترات */}
        {loading ? (
          <p className="text-sm text-slate-400 py-6 text-center">جارٍ التحميل...</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">لا فترات بعد — أضف عطلة أو نافذة اختبارات.</p>
        ) : (
          <div className="divide-y divide-slate-50 border border-slate-100 rounded-xl overflow-hidden">
            {events.map(ev => (
              <div key={ev.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: KIND_COLOR[ev.kind] || '#64748b' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{ev.title}</p>
                  <p className="text-xs text-slate-400">{fmt(ev.start_date)} — {fmt(ev.end_date)}</p>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 flex-shrink-0">{KIND_LABEL[ev.kind]}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full flex-shrink-0 ${ev.enforcement === 'block' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
                  {ev.enforcement === 'block' ? 'منع' : 'تنبيه'}
                </span>
                <span className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => setForm({ id: ev.id, title: ev.title, kind: ev.kind, enforcement: ev.enforcement, start_date: ev.start_date, end_date: ev.end_date })}
                    className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg" title="تعديل">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => setConfirmDel(ev.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="حذف">
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {(() => {
        const d = confirmDel ? events.find(e => e.id === confirmDel) : null
        return (
          <ConfirmDialog
            open={!!d}
            title="حذف الحدث"
            message={d ? <>سيتم حذف «<strong>{d.title}</strong>» من التقويم نهائياً.</> : null}
            onConfirm={() => confirmDel && remove(confirmDel)}
            onCancel={() => setConfirmDel(null)}
          />
        )
      })()}
    </div>
  )
}

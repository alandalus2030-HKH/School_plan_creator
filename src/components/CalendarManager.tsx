'use client'

import { useState, useEffect } from 'react'
import { CalendarDays, Plus, Trash2, Pencil, X, Save } from 'lucide-react'
import { toast } from '@/components/Toast'
import { KIND_LABEL, KIND_COLOR, type CalendarEvent } from '@/lib/calendar'

const KINDS = ['holiday', 'break', 'national', 'eid', 'exam', 'other'] as const
const WEEK_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] // index = getDay

type FormState = {
  id?: string
  title: string
  kind: CalendarEvent['kind']
  enforcement: 'block' | 'warn'
  start_date: string
  end_date: string
}

const EMPTY: FormState = { title: '', kind: 'holiday', enforcement: 'block', start_date: '', end_date: '' }

export default function CalendarManager() {
  const [events, setEvents]   = useState<CalendarEvent[]>([])
  const [weekend, setWeekend] = useState<number[]>([5, 6])
  const [loading, setLoading] = useState(true)
  const [form, setForm]       = useState<FormState | null>(null)
  const [saving, setSaving]   = useState(false)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/calendar')
    const j = await res.json().catch(() => ({ events: [], weekend: [5, 6] }))
    setEvents(j.events || [])
    setWeekend(j.weekend || [5, 6])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const save = async () => {
    if (!form) return
    if (!form.title.trim()) { toast('العنوان مطلوب', 'error'); return }
    if (!form.start_date || !form.end_date) { toast('التواريخ مطلوبة', 'error'); return }
    if (form.end_date < form.start_date) { toast('تاريخ الانتهاء قبل البدء', 'error'); return }
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
    setForm(null)
    load()
  }

  const remove = async (id: string) => {
    const res = await fetch(`/api/calendar/${id}`, { method: 'DELETE' })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { toast(j.error || 'تعذّر الحذف', 'error'); return }
    toast('تم الحذف')
    setConfirmDel(null)
    load()
  }

  const toggleWeekend = async (day: number) => {
    const next = weekend.includes(day) ? weekend.filter(d => d !== day) : [...weekend, day].sort()
    setWeekend(next)
    const res = await fetch('/api/calendar', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekend: next }),
    })
    if (!res.ok) { toast('تعذّر حفظ نهاية الأسبوع', 'error'); load(); return }
    toast('تم حفظ أيام نهاية الأسبوع')
  }

  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('ar-QA', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* الرأس */}
      <div className="flex items-center gap-3 p-5 border-b border-slate-100 bg-gradient-to-l from-violet-50 to-white">
        <CalendarDays size={28} style={{ color: 'var(--maroon-600)', flexShrink: 0 }} />
        <div className="flex-1">
          <h2 className="font-bold text-slate-800">التقويم المدرسي</h2>
          <p className="text-xs text-slate-500">عطلات واختبارات تُظهَر وتمنع/تنبّه عند تحديد تواريخ المهام</p>
        </div>
        {!form && (
          <button onClick={() => setForm({ ...EMPTY })}
            className="inline-flex items-center gap-1.5 text-sm text-white px-3 py-2 rounded-xl font-medium transition-all hover:brightness-110"
            style={{ background: 'var(--gradient-button)' }}>
            <Plus size={15} /> إضافة فترة
          </button>
        )}
      </div>

      <div className="p-5 space-y-5">
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
                <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} dir="ltr" min={form.start_date || undefined}
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
                {confirmDel === ev.id ? (
                  <span className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => remove(ev.id)} className="text-xs px-2 py-1 rounded-lg bg-red-600 text-white">تأكيد</button>
                    <button onClick={() => setConfirmDel(null)} className="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-600">إلغاء</button>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => setForm({ id: ev.id, title: ev.title, kind: ev.kind, enforcement: ev.enforcement, start_date: ev.start_date, end_date: ev.end_date })}
                      className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg" title="تعديل"><Pencil size={14} /></button>
                    <button onClick={() => setConfirmDel(ev.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="حذف"><Trash2 size={14} /></button>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

/* ════════════════════════════════════════════════════════════
   مؤشّر استهلاك التخزين (الوثيقة 16)

   «القرار: لا تُرفَع الباقة إلى Pro حتى يكتمل تصميم النظام… **والمراقَبة
    تحلّ محلّ المنع**: مؤشّر استهلاك التخزين في أدوات المشرف، وتنبيهٌ عند
    70٪ — فتُرقَّى الباقة قبل الامتلاء لا بعده.»

   وهو ليس زينةً في لوحة: الدفعة الجماعية تُفحص عليه **قبل** أن يُرفع
   منها بايت، لأن «الامتلاء المفاجئ هو الخطر الحقيقيّ: رفعٌ يتوقّف في
   منتصف دفعة، فتبقى ملفّات في المخزن وأخرى خارجه».
   ════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react'
import { Loader2, AlertTriangle, HardDrive, Save } from 'lucide-react'
import { toast } from '@/components/Toast'

const MB = 1048576
const GB = 1073741824
const human = (n: number) =>
  n >= GB ? `${(n / GB).toFixed(2)} غ.ب` : `${Math.round(n / MB)} م.ب`

export default function StorageMeter() {
  const [data,    setData]    = useState<any>(null)
  const [err,     setErr]     = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [planName, setPlanName] = useState('')
  const [quotaGb,  setQuotaGb]  = useState('')
  const [warnPct,  setWarnPct]  = useState('')
  const [saving,   setSaving]   = useState(false)

  const load = async () => {
    const r = await fetch('/api/admin/storage')
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(j.error || 'تعذّر قياس التخزين'); setData(null) }
    else {
      setData(j); setErr('')
      setPlanName(j.plan.name); setQuotaGb(String(j.plan.quotaBytes / GB))
      setWarnPct(String(j.plan.warnPct))
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const save = async () => {
    setSaving(true)
    const r = await fetch('/api/admin/storage', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planName, quotaGb: Number(quotaGb), warnPct: Number(warnPct) }),
    })
    const j = await r.json().catch(() => ({}))
    setSaving(false)
    if (!r.ok) { toast(j.error || 'تعذّر الحفظ', 'error'); return }
    toast('حُدِّثت الباقة', 'success'); setEditing(false); await load()
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center text-slate-400">
        <span className="inline-flex"><Loader2 size={16} className="animate-spin" /></span>
      </div>
    )
  }
  if (err) {
    return (
      <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4 flex items-start gap-2">
        <span className="inline-flex text-amber-600 mt-0.5"><AlertTriangle size={16} /></span>
        <div className="text-xs text-amber-900">
          <p className="font-bold">مؤشّر التخزين غير متاح</p>
          <p className="mt-0.5">{err}</p>
        </div>
      </div>
    )
  }

  const critical = data.pct >= 90
  const barCls = critical ? 'bg-red-600' : data.warn ? 'bg-amber-500' : 'bg-emerald-500'

  return (
    <div className={`bg-white rounded-2xl border p-5 ${
      critical ? 'border-red-300' : data.warn ? 'border-amber-300' : 'border-slate-200'}`}>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="inline-flex text-slate-500"><HardDrive size={18} /></span>
        <h2 className="font-bold text-slate-800">استهلاك التخزين</h2>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
          باقة {data.plan.name}
        </span>
        <button onClick={() => setEditing(v => !v)}
          className="ms-auto text-[11px] text-slate-400 hover:text-slate-700">
          {editing ? 'إلغاء' : 'تعديل الباقة'}
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        المراقَبة تحلّ محلّ المنع — والترقية <strong>بندٌ في قائمة ما قبل الإطلاق</strong>، لا قرارٌ منسيّ.
      </p>

      <div className="flex items-end justify-between gap-3 mb-1.5">
        <span className="text-2xl font-bold text-slate-800 font-latin">{data.pct}%</span>
        <span className="text-xs text-slate-500 font-latin">
          {human(data.used)} / {human(data.plan.quotaBytes)} · متاح {human(data.free)}
        </span>
      </div>
      <div className="h-3 bg-slate-100 rounded-full overflow-hidden relative">
        <div className={`h-full rounded-full transition-all ${barCls}`} style={{ width: `${data.pct}%` }} />
        {/* علامةُ حدّ التنبيه — تُرى قبل أن تُجاوَز */}
        <div className="absolute top-0 bottom-0 w-px bg-slate-400"
          style={{ right: `${data.plan.warnPct}%` }} title={`حدّ التنبيه ${data.plan.warnPct}٪`} />
      </div>

      {data.warn && (
        <p className={`mt-3 text-xs rounded-xl px-3 py-2 flex items-start gap-1.5 ${
          critical ? 'bg-red-50 border border-red-200 text-red-800'
                   : 'bg-amber-50 border border-amber-200 text-amber-900'}`}>
          <span className="inline-flex mt-0.5"><AlertTriangle size={13} /></span>
          <span>
            تجاوز حدّ التنبيه ({data.plan.warnPct}٪). <strong>رقِّ الباقة قبل أيّ رفعٍ جماعيّ</strong> —
            فالدفعة التي لا تسعها الباقة تُرَدّ كلّها، والرفع لا يُبدأ ليتوقّف في منتصفه.
          </span>
        </p>
      )}

      {editing && (
        <div className="mt-3 grid sm:grid-cols-3 gap-2 text-xs border-t border-slate-100 pt-3">
          <label className="block">
            <span className="text-slate-500">اسم الباقة</span>
            <input value={planName} onChange={e => setPlanName(e.target.value)}
              className="mt-1 w-full px-2 py-1.5 rounded-lg border border-slate-200" />
          </label>
          <label className="block">
            <span className="text-slate-500">الحدّ (غيغابايت)</span>
            <input value={quotaGb} onChange={e => setQuotaGb(e.target.value)} inputMode="decimal"
              className="mt-1 w-full px-2 py-1.5 rounded-lg border border-slate-200 font-latin" />
          </label>
          <label className="block">
            <span className="text-slate-500">حدّ التنبيه (٪)</span>
            <input value={warnPct} onChange={e => setWarnPct(e.target.value)} inputMode="numeric"
              className="mt-1 w-full px-2 py-1.5 rounded-lg border border-slate-200 font-latin" />
          </label>
          <button onClick={save} disabled={saving}
            className="sm:col-span-3 py-2 rounded-xl bg-slate-800 text-white font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
            <span className="inline-flex">{saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}</span>
            <span>حفظ الباقة</span>
          </button>
        </div>
      )}

      {/* التوزيع: الترقية قرارٌ يحتاج أن يُعرف من يستهلك */}
      <div className="mt-3 grid sm:grid-cols-2 gap-3 text-[11px]">
        <div>
          <p className="font-semibold text-slate-600 mb-1">الدلاء</p>
          {data.buckets.length ? data.buckets.map((b: any) => (
            <p key={b.bucket} className="text-slate-500 flex justify-between gap-2">
              <span className="font-latin">{b.bucket}</span>
              <span className="font-latin">{b.objects} ملفّ · {human(b.bytes)}</span>
            </p>
          )) : <p className="text-slate-400">لا شيء بعد</p>}
        </div>
        <div>
          <p className="font-semibold text-slate-600 mb-1">مخزن الأدلة بالمدارس</p>
          {data.schools.length ? data.schools.map((sc: any) => (
            <p key={sc.id || sc.name} className="text-slate-500 flex justify-between gap-2">
              <span className="truncate">{sc.name}</span>
              <span className="font-latin flex-shrink-0">{sc.files} · {human(sc.bytes)}</span>
            </p>
          )) : <p className="text-slate-400">لا أدلة بعد</p>}
        </div>
      </div>

      {data.unaccounted > MB && (
        <p className="mt-2.5 text-[11px] text-slate-400 border-t border-slate-100 pt-2">
          و<strong className="font-latin">{human(data.unaccounted)}</strong> في القرص لا صفَّ لها في مخزن
          الأدلة — شعاراتٌ وصورٌ شخصية، أو بقايا رفعٍ انكسر إدراجُ صفّه. والفرق بين ما في القرص وما
          نعرفه <strong>معلومةٌ لا خطأ</strong>: هو ما يستهلك الباقة ولا يظهر في المخزن.
        </p>
      )}
    </div>
  )
}

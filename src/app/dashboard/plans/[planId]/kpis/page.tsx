'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { BarChart3 } from 'lucide-react'

/* ── أنواع البيانات ── */
type Kpi = {
  id:             string
  name_ar:        string
  kpi_type:       string
  frequency:      string
  target_value:   number | null
  unit:           string
  baseline_value: number | null
  description:    string | null
  node_id:        string
  node_name:      string
  node_level:     number
  latest_reading: number | null
  latest_date:    string | null
}

type Reading = {
  id:           string
  reading_date: string
  actual_value: number
  notes:        string | null
}

/* ── ثوابت ── */
const KPI_TYPE_LABEL: Record<string, string> = {
  impact:  'أثر بعيد',
  outcome: 'نتيجة مباشرة',
  output:  'مخرج',
}
const KPI_TYPE_COLOR: Record<string, string> = {
  impact:  'bg-purple-100 text-purple-700 border-purple-200',
  outcome: 'bg-blue-100   text-blue-700   border-blue-200',
  output:  'bg-teal-100   text-teal-700   border-teal-200',
}
const FREQ_LABEL: Record<string, string> = {
  monthly:   'شهري',
  quarterly: 'ربع سنوي',
  semester:  'فصلي',
  yearly:    'سنوي',
}
const LEVEL_COLORS = [
  'bg-violet-100 text-violet-700 border-violet-200',
  'bg-indigo-100 text-indigo-700 border-indigo-200',
  'bg-blue-100   text-blue-700   border-blue-200',
  'bg-cyan-100   text-cyan-700   border-cyan-200',
  'bg-teal-100   text-teal-700   border-teal-200',
]

/* ── حساب التقدم والحالة ── */
function getProgress(actual: number | null, target: number | null): number | null {
  if (actual === null || target === null || target === 0) return null
  return Math.round((actual / target) * 100)
}

type StatusInfo = {
  label: string; shortLabel: string
  textColor: string; barColor: string; bgColor: string; borderColor: string
}
function getStatus(progress: number | null): StatusInfo {
  if (progress === null) return { label: 'لا توجد قراءات', shortLabel: '—',           textColor: 'text-slate-400',   barColor: 'bg-slate-200',   bgColor: 'bg-slate-50',   borderColor: 'border-slate-200'  }
  if (progress >= 100)  return { label: 'تجاوز الهدف',    shortLabel: `${progress}%`, textColor: 'text-blue-700',    barColor: 'bg-blue-500',    bgColor: 'bg-blue-50',    borderColor: 'border-blue-200'   }
  if (progress >= 80)   return { label: 'على المسار',     shortLabel: `${progress}%`, textColor: 'text-emerald-700', barColor: 'bg-emerald-500', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200' }
  if (progress >= 50)   return { label: 'تحت المستهدف',   shortLabel: `${progress}%`, textColor: 'text-amber-700',   barColor: 'bg-amber-400',   bgColor: 'bg-amber-50',   borderColor: 'border-amber-200'  }
  return                       { label: 'بعيد عن الهدف', shortLabel: `${progress}%`, textColor: 'text-red-700',     barColor: 'bg-red-500',     bgColor: 'bg-red-50',     borderColor: 'border-red-200'    }
}

/* ════════════════════════════════
   بطاقة مؤشر الأداء
   ════════════════════════════════ */
function KpiCard({ kpi, onAddReading }: { kpi: Kpi; onAddReading: (kpi: Kpi) => void }) {
  const progress  = getProgress(kpi.latest_reading, kpi.target_value)
  const status    = getStatus(progress)
  const barWidth  = progress !== null ? Math.min(progress, 100) : 0
  const typeColor = KPI_TYPE_COLOR[kpi.kpi_type] || 'bg-slate-100 text-slate-600 border-slate-200'

  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${status.bgColor} ${status.borderColor} flex flex-col`}>

      {/* رأس البطاقة */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 leading-snug">{kpi.name_ar}</p>
          {kpi.description && (
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{kpi.description}</p>
          )}
        </div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium flex-shrink-0 ${typeColor}`}>
          {KPI_TYPE_LABEL[kpi.kpi_type] || kpi.kpi_type}
        </span>
      </div>

      {/* شريط التقدم */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className={`text-xs font-bold ${status.textColor}`}>{status.label}</span>
          <span className={`text-sm font-bold ${status.textColor}`}>{status.shortLabel}</span>
        </div>
        <div className="h-2.5 bg-white/70 rounded-full overflow-hidden border border-white/50">
          <div className={`h-full rounded-full transition-all duration-500 ${status.barColor}`}
               style={{ width: `${barWidth}%` }} />
        </div>
      </div>

      {/* أرقام: خط أساسي / هدف / فعلي */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-white/60 rounded-xl p-2">
          <p className="text-[10px] text-slate-400 mb-0.5">الخط الأساسي</p>
          <p className="text-sm font-bold text-slate-500">
            {kpi.baseline_value !== null ? `${kpi.baseline_value}${kpi.unit}` : '—'}
          </p>
        </div>
        <div className="bg-white/60 rounded-xl p-2">
          <p className="text-[10px] text-slate-400 mb-0.5">الهدف</p>
          <p className="text-sm font-bold text-slate-700">
            {kpi.target_value !== null ? `${kpi.target_value}${kpi.unit}` : '—'}
          </p>
        </div>
        <div className="bg-white/80 rounded-xl p-2">
          <p className="text-[10px] text-slate-400 mb-0.5">آخر قراءة</p>
          <p className={`text-sm font-bold ${status.textColor}`}>
            {kpi.latest_reading !== null ? `${kpi.latest_reading}${kpi.unit}` : '—'}
          </p>
        </div>
      </div>

      {/* تذييل */}
      <div className="flex items-center justify-between pt-1 border-t border-white/40 mt-auto">
        <span className="text-[10px] text-slate-400">🔄 {FREQ_LABEL[kpi.frequency] || kpi.frequency}</span>
        {kpi.latest_date
          ? <span className="text-[10px] text-slate-400">{new Date(kpi.latest_date).toLocaleDateString('ar-QA')}</span>
          : <span className="text-[10px] text-slate-400">لم تُسجَّل قراءة</span>
        }
      </div>

      {/* زر تسجيل قراءة */}
      <button
        onClick={() => onAddReading(kpi)}
        className="w-full py-2 rounded-xl bg-white/80 hover:bg-white border border-white/60 hover:border-violet-300
                   text-xs font-semibold text-violet-700 hover:text-violet-800 transition-all shadow-sm hover:shadow">
        📝 تسجيل قراءة
      </button>
    </div>
  )
}

/* ════════════════════════════════
   مودال تسجيل القراءة
   ════════════════════════════════ */
function ReadingModal({
  kpi, onClose, onSaved,
}: {
  kpi: Kpi
  onClose: () => void
  onSaved: () => void
}) {
  const supabase    = createClient()
  const inputRef    = useRef<HTMLInputElement>(null)
  const progress    = getProgress(kpi.latest_reading, kpi.target_value)
  const status      = getStatus(progress)

  const [value,    setValue]    = useState('')
  const [date,     setDate]     = useState(new Date().toISOString().split('T')[0])
  const [notes,    setNotes]    = useState('')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [history,  setHistory]  = useState<Reading[]>([])
  const [loadingH, setLoadingH] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  /* تحميل السجل السابق */
  useEffect(() => {
    inputRef.current?.focus()
    supabase
      .from('kpi_readings')
      .select('id, reading_date, actual_value, notes')
      .eq('kpi_id', kpi.id)
      .order('reading_date', { ascending: false })
      .limit(8)
      .then(({ data }) => { setHistory(data || []); setLoadingH(false) })
  }, [kpi.id])

  /* حفظ القراءة */
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (value === '') return
    setSaving(true); setError('')
    const { error: err } = await supabase.from('kpi_readings').insert({
      kpi_id:       kpi.id,
      reading_date: date,
      actual_value: parseFloat(value),
      notes:        notes.trim() || null,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
    onClose()
  }

  /* حذف قراءة */
  const deleteReading = async (id: string) => {
    setDeleting(id)
    await supabase.from('kpi_readings').delete().eq('id', id)
    setHistory(prev => prev.filter(r => r.id !== id))
    setDeleting(null)
    onSaved()
  }

  /* معاينة التقدم بعد الإدخال */
  const previewProgress = value !== '' && kpi.target_value
    ? getProgress(parseFloat(value), kpi.target_value)
    : null
  const previewStatus = getStatus(previewProgress)

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* رأس المودال */}
        <div className={`px-5 py-4 rounded-t-2xl ${status.bgColor} border-b ${status.borderColor}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-500 mb-0.5">{kpi.node_name}</p>
              <p className="text-sm font-bold text-slate-800 leading-snug">{kpi.name_ar}</p>
            </div>
            <button onClick={onClose}
              className="w-7 h-7 rounded-full bg-white/60 hover:bg-white flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0">
              ✕
            </button>
          </div>
          {/* شريط الوضع الحالي */}
          <div className="flex items-center gap-3 mt-3">
            <div className="flex-1 h-2 bg-white/60 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${status.barColor}`}
                   style={{ width: `${progress !== null ? Math.min(progress, 100) : 0}%` }} />
            </div>
            <span className={`text-xs font-bold ${status.textColor} flex-shrink-0`}>
              {kpi.latest_reading !== null
                ? `${kpi.latest_reading}${kpi.unit} / ${kpi.target_value}${kpi.unit}`
                : `الهدف: ${kpi.target_value ?? '—'}${kpi.unit}`}
            </span>
          </div>
        </div>

        {/* نموذج الإدخال */}
        <form onSubmit={save} className="px-5 py-4 space-y-3 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-700">📝 تسجيل قراءة جديدة</p>

          <div className="grid grid-cols-2 gap-3">
            {/* القيمة الفعلية */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                القيمة الفعلية <span className="text-red-400">*</span>
              </label>
              <div className="flex">
                <input ref={inputRef} type="number" step="any" value={value}
                  onChange={e => setValue(e.target.value)}
                  placeholder="0"
                  className="flex-1 min-w-0 px-3 py-2 border border-l-0 border-slate-200 rounded-r-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-slate-50" />
                <span className="px-2.5 py-2 bg-slate-100 border border-slate-200 rounded-l-xl text-xs text-slate-500 font-medium">
                  {kpi.unit}
                </span>
              </div>
              {/* معاينة التقدم */}
              {previewProgress !== null && (
                <p className={`text-[10px] mt-1 font-semibold ${previewStatus.textColor}`}>
                  → {previewStatus.label} ({previewProgress}%)
                </p>
              )}
            </div>

            {/* التاريخ */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">تاريخ القراءة</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} dir="ltr"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-slate-50" />
            </div>
          </div>

          {/* ملاحظة */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">ملاحظة (اختياري)</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="سبب الانخفاض / الارتفاع..."
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-slate-50" />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">⚠️ {error}</p>
          )}

          <button type="submit" disabled={saving || value === ''}
            className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl
                       disabled:opacity-50 transition-colors shadow-lg shadow-violet-200">
            {saving ? '⏳ جارٍ الحفظ...' : '💾 حفظ القراءة'}
          </button>
        </form>

        {/* سجل القراءات السابقة */}
        <div className="px-5 py-4 overflow-y-auto flex-1">
          <p className="text-xs font-semibold text-slate-500 mb-3">
            📅 سجل القراءات السابقة
          </p>
          {loadingH ? (
            <div className="flex justify-center py-4">
              <div className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">لا توجد قراءات سابقة</p>
          ) : (
            <div className="space-y-2">
              {history.map((r, i) => {
                const p   = getProgress(r.actual_value, kpi.target_value)
                const st  = getStatus(p)
                const isLatest = i === 0
                return (
                  <div key={r.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border
                      ${isLatest ? `${st.bgColor} ${st.borderColor}` : 'bg-slate-50 border-slate-100'}`}>
                    {/* شريط صغير */}
                    <div className="w-1 h-8 rounded-full flex-shrink-0 bg-slate-200 overflow-hidden">
                      <div className={`w-full rounded-full ${st.barColor}`}
                           style={{ height: `${p !== null ? Math.min(p, 100) : 0}%`, marginTop: 'auto' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${st.textColor}`}>
                          {r.actual_value}{kpi.unit}
                        </span>
                        {p !== null && (
                          <span className={`text-[10px] font-semibold ${st.textColor} opacity-70`}>
                            ({p}%)
                          </span>
                        )}
                        {isLatest && (
                          <span className="text-[10px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full font-medium">
                            الأحدث
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-slate-400" dir="ltr">
                          {new Date(r.reading_date).toLocaleDateString('ar-QA')}
                        </span>
                        {r.notes && (
                          <span className="text-[10px] text-slate-400 truncate">— {r.notes}</span>
                        )}
                      </div>
                    </div>
                    {/* حذف */}
                    <button
                      onClick={() => deleteReading(r.id)}
                      disabled={deleting === r.id}
                      className="w-6 h-6 rounded-lg hover:bg-red-100 text-slate-300 hover:text-red-500 flex items-center justify-center transition-colors flex-shrink-0 text-xs">
                      {deleting === r.id ? '…' : '🗑'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

/* ════════════════════════════════
   الصفحة الرئيسية للوحة KPI
   ════════════════════════════════ */
export default function KpiDashboardPage() {
  const params   = useParams()
  const planId   = params.planId as string
  const supabase = createClient()

  const [plan,         setPlan]         = useState<any>(null)
  const [kpis,         setKpis]         = useState<Kpi[]>([])
  const [loading,      setLoading]      = useState(true)
  const [filter,       setFilter]       = useState<'all'|'on_track'|'below'|'far'|'no_data'>('all')
  const [activeKpi,    setActiveKpi]    = useState<Kpi | null>(null)
  const [mounted,      setMounted]      = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const load = useCallback(async () => {
    setLoading(true)

    const { data: planData } = await supabase
      .from('plans').select('id, name_ar, academic_year').eq('id', planId).single()
    setPlan(planData)

    const { data: nodesData } = await supabase
      .from('plan_nodes').select('id, name_ar, level_num').eq('plan_id', planId)

    if (!nodesData?.length) { setLoading(false); return }

    const nodeMap = Object.fromEntries(nodesData.map(n => [n.id, n]))
    const nodeIds = nodesData.map(n => n.id)

    const { data: kpisData } = await supabase
      .from('kpis')
      .select('id, name_ar, kpi_type, frequency, target_value, unit, baseline_value, description, node_id')
      .in('node_id', nodeIds).order('created_at')

    if (!kpisData?.length) { setLoading(false); return }

    const { data: readingsData } = await supabase
      .from('kpi_readings')
      .select('kpi_id, actual_value, reading_date')
      .in('kpi_id', kpisData.map(k => k.id))
      .order('reading_date', { ascending: false })

    const latestMap: Record<string, { actual_value: number; reading_date: string }> = {}
    for (const r of readingsData || []) {
      if (!latestMap[r.kpi_id]) latestMap[r.kpi_id] = r
    }

    setKpis(kpisData.map(k => ({
      ...k,
      node_name:      nodeMap[k.node_id]?.name_ar  || '—',
      node_level:     nodeMap[k.node_id]?.level_num || 0,
      latest_reading: latestMap[k.id]?.actual_value  ?? null,
      latest_date:    latestMap[k.id]?.reading_date  ?? null,
    })))
    setLoading(false)
  }, [planId])

  useEffect(() => { load() }, [load])

  /* ── إحصائيات ── */
  const stats = {
    total:    kpis.length,
    on_track: kpis.filter(k => { const p = getProgress(k.latest_reading, k.target_value); return p !== null && p >= 80 }).length,
    below:    kpis.filter(k => { const p = getProgress(k.latest_reading, k.target_value); return p !== null && p >= 50 && p < 80 }).length,
    far:      kpis.filter(k => { const p = getProgress(k.latest_reading, k.target_value); return p !== null && p < 50 }).length,
    no_data:  kpis.filter(k => k.latest_reading === null).length,
  }

  /* ── تصفية ── */
  const filtered = kpis.filter(k => {
    if (filter === 'all')      return true
    const p = getProgress(k.latest_reading, k.target_value)
    if (filter === 'on_track') return p !== null && p >= 80
    if (filter === 'below')    return p !== null && p >= 50 && p < 80
    if (filter === 'far')      return p !== null && p < 50
    if (filter === 'no_data')  return k.latest_reading === null
    return true
  })

  /* ── تجميع حسب العقدة ── */
  const grouped = filtered.reduce((acc, kpi) => {
    if (!acc[kpi.node_id]) acc[kpi.node_id] = { node_name: kpi.node_name, node_level: kpi.node_level, kpis: [] }
    acc[kpi.node_id].kpis.push(kpi)
    return acc
  }, {} as Record<string, { node_name: string; node_level: number; kpis: Kpi[] }>)

  /* ── متوسط التقدم الكلي ── */
  const progressValues = kpis.map(k => getProgress(k.latest_reading, k.target_value)).filter(p => p !== null) as number[]
  const avgProgress = progressValues.length
    ? Math.round(progressValues.reduce((a, b) => a + b, 0) / progressValues.length) : null

  /* بعد حفظ قراءة: تحديث الكارت المفتوح وإعادة تحميل البيانات */
  const handleSaved = useCallback(async () => {
    await load()
  }, [load])

  if (loading) return (
    <div className="flex items-center justify-center min-h-64">
      <div className="w-8 h-8 border-4 border-violet-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* ── رأس الصفحة ── */}
      <div className="flex items-center gap-3">
        <Link href={`/dashboard/plans/${planId}`}
          className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-400 hover:text-violet-600 hover:border-violet-300 transition-colors">
          ←
        </Link>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-slate-800">📊 لوحة مؤشرات الأداء</h2>
          <p className="text-slate-500 text-sm">{plan?.name_ar} · {plan?.academic_year}</p>
        </div>
        {avgProgress !== null && (
          <div className="text-center bg-white border border-slate-200 rounded-2xl px-5 py-2.5 shadow-sm">
            <p className={`text-2xl font-bold ${getStatus(avgProgress).textColor}`}>{avgProgress}%</p>
            <p className="text-[10px] text-slate-400">متوسط التقدم الكلي</p>
          </div>
        )}
      </div>

      {/* ── بطاقات الإحصاء / فلاتر ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { key: 'all',      label: 'جميع المؤشرات',  value: stats.total,    icon: '📊', bg: 'bg-white',      border: 'border-slate-200',   text: 'text-slate-800'   },
          { key: 'on_track', label: 'على المسار',      value: stats.on_track, icon: '✅', bg: 'bg-emerald-50', border: 'border-emerald-200',  text: 'text-emerald-700' },
          { key: 'below',    label: 'تحت المستهدف',    value: stats.below,    icon: '⚠️', bg: 'bg-amber-50',   border: 'border-amber-200',    text: 'text-amber-700'   },
          { key: 'far',      label: 'بعيد عن الهدف',  value: stats.far,      icon: '❌', bg: 'bg-red-50',     border: 'border-red-200',      text: 'text-red-700'     },
          { key: 'no_data',  label: 'لا توجد قراءات', value: stats.no_data,  icon: '⏳', bg: 'bg-slate-50',   border: 'border-slate-200',    text: 'text-slate-500'   },
        ].map(s => (
          <button key={s.key} onClick={() => setFilter(s.key as any)}
            className={`rounded-2xl border p-4 text-center transition-all
              ${s.bg} ${s.border}
              ${filter === s.key ? 'ring-2 ring-violet-400 ring-offset-1 shadow-md' : 'hover:shadow-sm'}`}>
            <div className={`text-2xl font-bold ${s.text}`}>{s.value}</div>
            <div className={`text-[11px] mt-1 font-medium ${s.text} opacity-80`}>{s.icon} {s.label}</div>
          </button>
        ))}
      </div>

      {/* ── محتوى الصفحة ── */}
      {kpis.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
          <div className="flex justify-center mb-4" style={{ color: 'var(--maroon-300)' }}><BarChart3 size={48} /></div>
          <p className="text-slate-600 font-semibold text-lg">لا توجد مؤشرات أداء بعد</p>
          <p className="text-slate-400 text-sm mt-2">أضف مؤشرات من صفحات الأهداف والمبادرات</p>
          <Link href={`/dashboard/plans/${planId}`}
            className="inline-block mt-5 px-5 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 transition-colors">
            ← العودة للخطة
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <p className="text-slate-400">لا توجد مؤشرات في هذه الفئة</p>
          <button onClick={() => setFilter('all')} className="mt-3 text-violet-600 text-sm underline">عرض الكل</button>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([nodeId, { node_name, node_level, kpis: nodeKpis }]) => {
            const levelColor = LEVEL_COLORS[node_level - 1] || LEVEL_COLORS[4]
            const progresses = nodeKpis.map(k => getProgress(k.latest_reading, k.target_value)).filter(p => p !== null) as number[]
            const nodeAvg    = progresses.length ? Math.round(progresses.reduce((a, b) => a + b, 0) / progresses.length) : null

            return (
              <div key={nodeId} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* رأس المجموعة */}
                <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-100 flex items-center gap-3">
                  <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${levelColor}`}>م{node_level}</span>
                  <span className="text-sm font-semibold text-slate-700 flex-1">{node_name}</span>
                  <span className="text-xs text-slate-400">{nodeKpis.length} مؤشر</span>
                  {nodeAvg !== null && (
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg border
                      ${getStatus(nodeAvg).bgColor} ${getStatus(nodeAvg).textColor} ${getStatus(nodeAvg).borderColor}`}>
                      {nodeAvg}%
                    </span>
                  )}
                </div>
                {/* بطاقات المؤشرات */}
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {nodeKpis.map(kpi => (
                    <KpiCard key={kpi.id} kpi={kpi} onAddReading={setActiveKpi} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── مودال تسجيل القراءة ── */}
      {mounted && activeKpi && (
        <ReadingModal
          kpi={activeKpi}
          onClose={() => setActiveKpi(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

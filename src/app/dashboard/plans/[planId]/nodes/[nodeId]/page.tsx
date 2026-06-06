'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { calcNodeRating } from '@/lib/rating'
import { FolderOpen } from 'lucide-react'

/* كلاسات التقييم كنصوص ثابتة لضمان إدراجها في CSS */
function ratingBadgeClass(avg: number): { label: string; icon: string; cls: string } {
  if (avg >= 4.5) return { label: 'ممتاز',    icon: '🌟', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
  if (avg >= 3.5) return { label: 'جيد جداً', icon: '⭐', cls: 'bg-blue-50 text-blue-700 border-blue-200'          }
  if (avg >= 2.5) return { label: 'جيد',      icon: '✅', cls: 'bg-violet-50 text-violet-700 border-violet-200'    }
  if (avg >= 1.5) return { label: 'مقبول',    icon: '⚠️', cls: 'bg-amber-50 text-amber-700 border-amber-200'       }
  return                  { label: 'ضعيف',     icon: '❌', cls: 'bg-red-50 text-red-700 border-red-200'             }
}

const statusColor: Record<string,string> = {
  not_started:'bg-slate-100 text-slate-600', in_progress:'bg-blue-100 text-blue-700',
  completed:'bg-green-100 text-green-700', delayed:'bg-red-100 text-red-700',
}
const statusAr: Record<string,string> = {
  not_started:'لم تبدأ', in_progress:'جارية', completed:'منجزة', delayed:'متأخرة',
}

type PlanNode = { id:string; plan_id:string; parent_id:string|null; level_num:number; name_ar:string; order_num:number }
type Task     = { id:string; name_ar:string; status:string; priority:string; end_date:string|null; task_type:string; node_id:string; rating:number|null }
type KpiLevelConf = { levelIndex:number; levelName:string; kpiType:string; frequency:string }

const KPI_TYPE_LABEL: Record<string,string> = {
  impact: 'مؤشر الأثر', outcome: 'مؤشر النتائج', output: 'مؤشر المخرجات',
}
const KPI_TYPE_COLOR: Record<string,string> = {
  impact: 'bg-purple-100 text-purple-700', outcome: 'bg-blue-100 text-blue-700', output: 'bg-teal-100 text-teal-700',
}
const KPI_FREQ_LABEL: Record<string,string> = {
  monthly: 'شهري', quarterly: 'ربع سنوي', semester: 'فصلي', yearly: 'سنوي',
}

/* ═══════════════════════════════════════════
   مكوّن قسم مؤشرات الأداء KPI لعقدة محددة
   ═══════════════════════════════════════════ */
type KpiSuggestion = {
  name_ar:        string
  target_value:   number | null
  unit:           string
  baseline_value: number | null
  description:    string
  _accepted?:     boolean
  _editing?:      boolean
}

function KpiSection({ nodeId, kpiConf, nodeName, planName }: {
  nodeId: string; kpiConf: KpiLevelConf; nodeName: string; planName: string
}) {
  const supabase  = createClient()
  const [mounted, setMounted] = useState(false)   // لـ createPortal
  const [kpis,    setKpis]    = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [adding,  setAdding]  = useState(false)
  const [saving,  setSaving]  = useState(false)

  /* حقول نموذج الإضافة اليدوي */
  const [kpiName,    setKpiName]    = useState('')
  const [targetVal,  setTargetVal]  = useState('')
  const [unit,       setUnit]       = useState('%')
  const [baseline,   setBaseline]   = useState('')
  const [description,setDescription]= useState('')

  /* ── توليد AI ── */
  const [generating,   setGenerating]   = useState(false)
  const [aiError,      setAiError]      = useState('')
  const [suggestions,  setSuggestions]  = useState<KpiSuggestion[]>([])
  const [showAiPanel,  setShowAiPanel]  = useState(false)
  const [savingAll,    setSavingAll]    = useState(false)

  /* إضافة قراءة */
  const [readingKpiId,  setReadingKpiId]  = useState<string|null>(null)
  const [readingVal,    setReadingVal]    = useState('')
  const [readingDate,   setReadingDate]   = useState(new Date().toISOString().split('T')[0])
  const [readingNote,   setReadingNote]   = useState('')
  const [savingReading, setSavingReading] = useState(false)
  const [readings,      setReadings]      = useState<any[]>([])

  /* حذف */
  const [confirmDelKpi, setConfirmDelKpi] = useState<string|null>(null)

  const loadKpis = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('kpis')
      .select('id, name_ar, kpi_type, frequency, target_value, unit, baseline_value, description')
      .eq('node_id', nodeId)
      .order('created_at')
    setKpis(data || [])
    setLoading(false)
  }, [nodeId])

  /* ── توليد AI ── */
  const generateKpis = async () => {
    setGenerating(true)
    setAiError('')
    setSuggestions([])
    setShowAiPanel(true)
    setAdding(false)
    try {
      const res = await fetch('/api/kpis/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeName,
          planName,
          levelName:   kpiConf.levelName,
          kpiType:     kpiConf.kpiType,
          frequency:   kpiConf.frequency,
          existingKpis: kpis.map(k => k.name_ar),
        }),
      })
      const json = await res.json()
      if (!res.ok) { setAiError(json.error || 'خطأ في التوليد'); return }
      setSuggestions((json.suggestions || []).map((s: KpiSuggestion) => ({
        ...s, _accepted: true, _editing: false,
      })))
    } catch (e: any) {
      setAiError('تعذّر الاتصال بالخادم')
    } finally {
      setGenerating(false)
    }
  }

  const updateSuggestion = (idx: number, patch: Partial<KpiSuggestion>) => {
    setSuggestions(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s))
  }

  const saveAccepted = async () => {
    const accepted = suggestions.filter(s => s._accepted)
    if (!accepted.length) return
    setSavingAll(true)
    for (const s of accepted) {
      await supabase.from('kpis').insert({
        node_id:        nodeId,
        name_ar:        s.name_ar.trim(),
        kpi_type:       kpiConf.kpiType,
        frequency:      kpiConf.frequency,
        target_value:   s.target_value ?? null,
        unit:           s.unit || '%',
        baseline_value: s.baseline_value ?? null,
        description:    s.description || null,
      })
    }
    setSavingAll(false)
    setShowAiPanel(false)
    setSuggestions([])
    await loadKpis()
  }

  useEffect(() => { setMounted(true); loadKpis() }, [loadKpis])

  const [saveError, setSaveError] = useState('')

  const addKpi = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!kpiName.trim()) return
    setSaving(true)
    setSaveError('')
    const { error } = await supabase.from('kpis').insert({
      node_id:        nodeId,
      name_ar:        kpiName.trim(),
      kpi_type:       kpiConf.kpiType,
      frequency:      kpiConf.frequency,
      target_value:   targetVal !== '' ? parseFloat(targetVal) : null,
      unit:           unit.trim() || '%',
      baseline_value: baseline !== '' ? parseFloat(baseline) : null,
      description:    description.trim() || null,
    })
    setSaving(false)
    if (error) {
      setSaveError(error.message)
      console.error('[addKpi]', error)
      return
    }
    setKpiName(''); setTargetVal(''); setUnit('%'); setBaseline(''); setDescription('')
    setAdding(false)
    await loadKpis()
  }

  const deleteKpi = async (kpiId: string) => {
    await supabase.from('kpis').delete().eq('id', kpiId)
    setConfirmDelKpi(null)
    await loadKpis()
  }

  const openReadingModal = async (kpiId: string) => {
    setReadingKpiId(kpiId)
    setReadingVal('')
    setReadingDate(new Date().toISOString().split('T')[0])
    setReadingNote('')
    const { data } = await supabase
      .from('kpi_readings')
      .select('id, reading_date, actual_value, notes')
      .eq('kpi_id', kpiId)
      .order('reading_date', { ascending: false })
      .limit(6)
    setReadings(data || [])
  }

  const saveReading = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!readingKpiId || readingVal === '') return
    setSavingReading(true)
    await supabase.from('kpi_readings').insert({
      kpi_id:       readingKpiId,
      reading_date: readingDate,
      actual_value: parseFloat(readingVal),
      notes:        readingNote.trim() || null,
    })
    setSavingReading(false)
    // تحديث القراءات في المودال
    const { data } = await supabase
      .from('kpi_readings')
      .select('id, reading_date, actual_value, notes')
      .eq('kpi_id', readingKpiId)
      .order('reading_date', { ascending: false })
      .limit(6)
    setReadings(data || [])
    setReadingVal(''); setReadingNote('')
    await loadKpis()
  }

  return (
    <div className="mx-3 mt-2 mb-2 rounded-xl border border-emerald-200 bg-emerald-50/60 overflow-hidden">

      {/* حالة التحميل — داخل نفس الـ wrapper دائماً */}
      {loading && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400">
          <div className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <span>جارٍ تحميل المؤشرات...</span>
        </div>
      )}

      {!loading && (<>

      {/* رأس القسم */}
      <div className="flex items-center justify-between px-3 py-2 bg-emerald-50 border-b border-emerald-200 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base">📊</span>
          <span className="text-xs font-bold text-emerald-800">مؤشرات الأداء</span>
          <span className="text-xs bg-emerald-200 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold">{kpis.length}</span>
          <span className="text-xs text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
            {KPI_TYPE_LABEL[kpiConf.kpiType] || kpiConf.kpiType} · {KPI_FREQ_LABEL[kpiConf.frequency] || kpiConf.frequency}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* زر التوليد بالذكاء الاصطناعي */}
          <button
            onClick={generateKpis}
            disabled={generating}
            className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 bg-violet-100 hover:bg-violet-200 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-60">
            {generating
              ? <><span className="w-3 h-3 border-2 border-violet-500 border-t-transparent rounded-full animate-spin inline-block" /> جارٍ التوليد...</>
              : <>🤖 توليد بالذكاء الاصطناعي</>
            }
          </button>
          {/* إضافة يدوية */}
          {!adding && !showAiPanel && (
            <button onClick={() => setAdding(true)}
              className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-2.5 py-1 rounded-lg transition-colors">
              ➕ إضافة يدوي
            </button>
          )}
        </div>
      </div>

      {/* ══ لوحة اقتراحات الذكاء الاصطناعي ══ */}
      {showAiPanel && (
        <div className="border-b border-violet-200 bg-violet-50/80">

          {/* رأس اللوحة */}
          <div className="flex items-center justify-between px-3 py-2 bg-violet-100 border-b border-violet-200">
            <div className="flex items-center gap-2">
              <span>🤖</span>
              <span className="text-xs font-bold text-violet-800">مقترحات الذكاء الاصطناعي</span>
              {suggestions.length > 0 && (
                <span className="text-xs bg-violet-200 text-violet-700 px-1.5 py-0.5 rounded-full">
                  {suggestions.filter(s => s._accepted).length} / {suggestions.length} محدد
                </span>
              )}
            </div>
            <button onClick={() => { setShowAiPanel(false); setSuggestions([]); setAiError('') }}
              className="text-violet-400 hover:text-violet-600 text-xs w-6 h-6 flex items-center justify-center rounded-lg hover:bg-violet-200 transition-colors">✕</button>
          </div>

          {/* خطأ */}
          {aiError && (
            <div className="px-3 py-3 text-xs text-red-700 bg-red-50 border-b border-red-200 flex items-center gap-2">
              <span>⚠️</span> {aiError}
              <button onClick={generateKpis} className="underline font-semibold hover:text-red-800">إعادة المحاولة</button>
            </div>
          )}

          {/* حالة التوليد */}
          {generating && (
            <div className="px-3 py-6 text-center text-xs text-violet-600">
              <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              يقوم الذكاء الاصطناعي بتحليل الهدف وإنشاء مؤشرات الأداء...
            </div>
          )}

          {/* الاقتراحات */}
          {!generating && suggestions.length > 0 && (
            <div className="p-3 space-y-2">
              <p className="text-xs text-violet-600 mb-2">راجع الاقتراحات وعدّلها حسب الحاجة — ثم اضغط <strong>حفظ المحدد</strong></p>
              {suggestions.map((s, idx) => (
                <div key={idx}
                  className={`rounded-xl border-2 transition-all overflow-hidden
                    ${s._accepted ? 'border-violet-300 bg-white' : 'border-slate-200 bg-slate-50 opacity-60'}`}>

                  {/* شريط الحالة */}
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      {/* checkbox قبول/رفض */}
                      <button
                        onClick={() => updateSuggestion(idx, { _accepted: !s._accepted })}
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors flex-shrink-0
                          ${s._accepted ? 'bg-violet-600 border-violet-600 text-white' : 'border-slate-300 bg-white'}`}>
                        {s._accepted && <span className="text-xs">✓</span>}
                      </button>
                      <span className="text-xs font-semibold text-slate-600">اقتراح {idx + 1}</span>
                    </div>
                    <button
                      onClick={() => updateSuggestion(idx, { _editing: !s._editing })}
                      className="text-xs text-slate-400 hover:text-amber-600 transition-colors px-2 py-0.5 rounded hover:bg-amber-50">
                      {s._editing ? '✓ إغلاق التعديل' : '✏️ تعديل'}
                    </button>
                  </div>

                  {/* محتوى الاقتراح */}
                  <div className="p-3 space-y-2">
                    {s._editing ? (
                      /* وضع التعديل */
                      <>
                        <input
                          value={s.name_ar}
                          onChange={e => updateSuggestion(idx, { name_ar: e.target.value })}
                          className="w-full px-3 py-2 text-sm rounded-xl border border-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white font-semibold"
                          placeholder="اسم المؤشر"
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-xs text-slate-400 mb-1">الهدف</label>
                            <input type="number"
                              value={s.target_value ?? ''}
                              onChange={e => updateSuggestion(idx, { target_value: e.target.value ? parseFloat(e.target.value) : null })}
                              className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-400 mb-1">الوحدة</label>
                            <input
                              value={s.unit}
                              onChange={e => updateSuggestion(idx, { unit: e.target.value })}
                              className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-400 mb-1">القاعدة</label>
                            <input type="number"
                              value={s.baseline_value ?? ''}
                              onChange={e => updateSuggestion(idx, { baseline_value: e.target.value ? parseFloat(e.target.value) : null })}
                              className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400"
                            />
                          </div>
                        </div>
                        <input
                          value={s.description}
                          onChange={e => updateSuggestion(idx, { description: e.target.value })}
                          className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400"
                          placeholder="وصف المؤشر"
                        />
                      </>
                    ) : (
                      /* وضع العرض */
                      <>
                        <p className="text-sm font-semibold text-slate-700">{s.name_ar}</p>
                        <div className="flex items-center gap-3 flex-wrap">
                          {s.target_value != null && (
                            <span className="text-xs text-slate-500">
                              الهدف: <strong className="text-slate-700">{s.target_value} {s.unit}</strong>
                            </span>
                          )}
                          {s.baseline_value != null && (
                            <span className="text-xs text-slate-400">القاعدة: {s.baseline_value}</span>
                          )}
                        </div>
                        {s.description && (
                          <p className="text-xs text-slate-400 leading-relaxed">{s.description}</p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}

              {/* أزرار الحفظ */}
              <div className="flex gap-2 pt-1">
                <button onClick={saveAccepted} disabled={savingAll || !suggestions.some(s => s._accepted)}
                  className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl disabled:opacity-50 transition-colors">
                  {savingAll
                    ? '⏳ جارٍ الحفظ...'
                    : `💾 حفظ المحدد (${suggestions.filter(s => s._accepted).length})`}
                </button>
                <button onClick={generateKpis} disabled={generating}
                  className="px-4 py-2.5 border border-violet-300 text-violet-600 text-sm font-semibold rounded-xl hover:bg-violet-50 disabled:opacity-50">
                  🔄 إعادة التوليد
                </button>
                <button onClick={() => { setShowAiPanel(false); setSuggestions([]) }}
                  className="px-4 py-2.5 border border-slate-200 text-slate-500 text-sm rounded-xl hover:bg-slate-50">
                  إلغاء
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* قائمة المؤشرات */}
      {kpis.length > 0 && (
        <div className="divide-y divide-emerald-100">
          {kpis.map(kpi => (
            <div key={kpi.id} className="px-3 py-2.5 flex items-center gap-2 group hover:bg-emerald-50/80 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700 truncate">{kpi.name_ar}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${KPI_TYPE_COLOR[kpi.kpi_type] || 'bg-slate-100 text-slate-600'}`}>
                    {KPI_TYPE_LABEL[kpi.kpi_type] || kpi.kpi_type}
                  </span>
                  <span className="text-xs text-slate-400">{KPI_FREQ_LABEL[kpi.frequency] || kpi.frequency}</span>
                  {kpi.target_value != null && (
                    <span className="text-xs text-slate-500">
                      الهدف: <strong className="text-slate-700">{kpi.target_value} {kpi.unit}</strong>
                    </span>
                  )}
                  {kpi.baseline_value != null && (
                    <span className="text-xs text-slate-400">القاعدة: {kpi.baseline_value}</span>
                  )}
                </div>
                {kpi.description && (
                  <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{kpi.description}</p>
                )}
              </div>

              {/* أزرار */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => openReadingModal(kpi.id)}
                  className="text-xs px-2.5 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg font-medium transition-colors">
                  📈 قراءة
                </button>
                {confirmDelKpi === kpi.id ? (
                  <div className="flex items-center gap-1">
                    <button onClick={() => deleteKpi(kpi.id)}
                      className="text-xs px-2 py-1 bg-red-500 text-white rounded-lg">حذف</button>
                    <button onClick={() => setConfirmDelKpi(null)}
                      className="text-xs px-2 py-1 border border-slate-200 text-slate-500 rounded-lg">إلغاء</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDelKpi(kpi.id)}
                    className="w-6 h-6 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 text-xs">
                    🗑️
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* حالة فارغة */}
      {kpis.length === 0 && !adding && (
        <div className="px-3 py-4 text-center text-xs text-emerald-600/70">
          لم يتم إضافة مؤشرات أداء بعد — اضغط <strong>إضافة مؤشر</strong> للبدء
        </div>
      )}

      {/* نموذج الإضافة */}
      {adding && (
        <form onSubmit={addKpi} className="p-3 border-t border-emerald-200 bg-white/70 space-y-2">
          <p className="text-xs font-bold text-emerald-800 mb-1.5">➕ مؤشر أداء جديد</p>

          {/* اسم المؤشر */}
          <input
            autoFocus
            value={kpiName}
            onChange={e => setKpiName(e.target.value)}
            required
            placeholder="اسم المؤشر مثال: نسبة تحقق الهدف الاستراتيجي"
            className="w-full px-3 py-2 text-sm rounded-xl border border-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
          />

          <div className="grid grid-cols-3 gap-2">
            {/* القيمة المستهدفة */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">القيمة المستهدفة</label>
              <input
                type="number"
                value={targetVal}
                onChange={e => setTargetVal(e.target.value)}
                placeholder="مثال: 80"
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
              />
            </div>
            {/* وحدة القياس */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">وحدة القياس</label>
              <input
                value={unit}
                onChange={e => setUnit(e.target.value)}
                placeholder="مثال: %"
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
              />
            </div>
            {/* القيمة الأساسية */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">القيمة الأساسية</label>
              <input
                type="number"
                value={baseline}
                onChange={e => setBaseline(e.target.value)}
                placeholder="اختياري"
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
              />
            </div>
          </div>

          {/* وصف */}
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="وصف المؤشر أو طريقة الحساب (اختياري)"
            className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
          />

          {/* نوع + دورية (تلقائية من إعدادات الخطة) */}
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-emerald-50 px-3 py-1.5 rounded-lg">
            <span>⚙️</span>
            <span>النوع: <strong>{KPI_TYPE_LABEL[kpiConf.kpiType]}</strong></span>
            <span>·</span>
            <span>الدورية: <strong>{KPI_FREQ_LABEL[kpiConf.frequency]}</strong></span>
            <span className="text-emerald-400">(حسب إعدادات المستوى)</span>
          </div>

          {saveError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-xl">
              ⚠️ خطأ في الحفظ: {saveError}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving || !kpiName.trim()}
              className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
              {saving ? '⏳ جارٍ الحفظ...' : '💾 حفظ المؤشر'}
            </button>
            <button type="button" onClick={() => { setAdding(false); setKpiName(''); setSaveError('') }}
              className="px-4 py-2 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50">
              إلغاء
            </button>
          </div>
        </form>
      )}

      {/* ══ مودال إضافة قراءة — خارج شجرة DOM عبر Portal ══ */}
      {mounted && readingKpiId && createPortal(
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setReadingKpiId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}>

            {/* رأس */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">
                  📈 {kpis.find(k => k.id === readingKpiId)?.name_ar}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  الهدف: <strong>{kpis.find(k => k.id === readingKpiId)?.target_value ?? '—'} {kpis.find(k => k.id === readingKpiId)?.unit}</strong>
                </p>
              </div>
              <button onClick={() => setReadingKpiId(null)}
                className="text-slate-400 hover:text-slate-600 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100">✕</button>
            </div>

            {/* نموذج قراءة جديدة */}
            <form onSubmit={saveReading} className="p-4 border-b border-slate-100 space-y-3">
              <p className="text-xs font-bold text-slate-600">إضافة قراءة جديدة</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">القيمة الفعلية *</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="any"
                      required
                      value={readingVal}
                      onChange={e => setReadingVal(e.target.value)}
                      placeholder="أدخل القيمة"
                      className="flex-1 px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <span className="text-xs text-slate-400">
                      {kpis.find(k => k.id === readingKpiId)?.unit || ''}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">تاريخ القراءة *</label>
                  <input
                    type="date"
                    required
                    value={readingDate}
                    onChange={e => setReadingDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              </div>
              <input
                value={readingNote}
                onChange={e => setReadingNote(e.target.value)}
                placeholder="ملاحظات (اختياري)"
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button type="submit" disabled={savingReading || readingVal === ''}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
                {savingReading ? '⏳ جارٍ الحفظ...' : '📥 تسجيل القراءة'}
              </button>
            </form>

            {/* سجل القراءات */}
            <div className="flex-1 overflow-y-auto p-4">
              <p className="text-xs font-bold text-slate-600 mb-2">سجل القراءات</p>
              {readings.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">لا توجد قراءات مسجلة بعد</p>
              ) : (
                <div className="space-y-2">
                  {readings.map(r => {
                    const target = kpis.find(k => k.id === readingKpiId)?.target_value
                    const pct    = target ? Math.min(100, Math.round((r.actual_value / target) * 100)) : null
                    return (
                      <div key={r.id} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-700">
                              {r.actual_value} {kpis.find(k => k.id === readingKpiId)?.unit}
                            </span>
                            {pct !== null && (
                              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold
                                ${pct >= 100 ? 'bg-emerald-100 text-emerald-700'
                                : pct >= 70  ? 'bg-blue-100 text-blue-700'
                                : pct >= 50  ? 'bg-amber-100 text-amber-700'
                                              : 'bg-red-100 text-red-700'}`}>
                                {pct}%
                              </span>
                            )}
                          </div>
                          {r.notes && <p className="text-xs text-slate-400 truncate mt-0.5">{r.notes}</p>}
                        </div>
                        <span className="text-xs text-slate-400 flex-shrink-0">
                          {new Date(r.reading_date).toLocaleDateString('ar-QA')}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
      </>)}
    </div>
  )
}

/* ── بناء الشجرة ── */
function buildTree(nodes: PlanNode[], tasks: Task[], parentId: string|null, levelCount: number): any[] {
  return nodes
    .filter(n => n.parent_id === parentId)
    .sort((a,b) => a.order_num - b.order_num)
    .map(n => ({
      ...n,
      children: buildTree(nodes, tasks, n.id, levelCount),
      tasks: n.level_num === levelCount ? tasks.filter(t => t.node_id === n.id) : [],
    }))
}

/* ── مكوّن العقدة القابلة للتوسع ── */
function NodeItem({ node, levelNames, levelCount, planId, planName, onRefresh, kpiLevelConfigs, depth=0 }: {
  node: any; levelNames: string[]; levelCount: number
  planId: string; planName: string; onRefresh: ()=>void
  kpiLevelConfigs: KpiLevelConf[]
  depth?: number
}) {
  const supabase = createClient()
  const [isOpen,    setIsOpen]    = useState(true)
  const [adding,    setAdding]    = useState(false)
  const [newName,   setNewName]   = useState('')
  const [editing,   setEditing]   = useState(false)
  const [editName,  setEditName]  = useState(node.name_ar)
  const [saving,    setSaving]    = useState(false)
  const [confirming,setConfirming]= useState(false)

  const nextLevelName = levelNames[node.level_num] || `المستوى ${node.level_num + 1}`
  const isLeaf = node.level_num === levelCount

  // هل هذا المستوى مُفعَّل للـ KPI؟
  const kpiConf = kpiLevelConfigs.find(k => k.levelIndex === node.level_num - 1) || null

  const addChild = async (e: React.FormEvent) => {
    e.preventDefault(); if (!newName.trim()) return
    setSaving(true)
    const maxOrder = node.children.length > 0 ? Math.max(...node.children.map((c:any) => c.order_num)) + 1 : 1
    await supabase.from('plan_nodes').insert({
      plan_id: planId, parent_id: node.id,
      level_num: node.level_num + 1,
      name_ar: newName.trim(), order_num: maxOrder
    })
    setNewName(''); setAdding(false); setSaving(false); onRefresh()
  }

  const saveEdit = async () => {
    if (!editName.trim()) return
    setSaving(true)
    await supabase.from('plan_nodes').update({ name_ar: editName.trim() }).eq('id', node.id)
    setEditing(false); setSaving(false); onRefresh()
  }

  const deleteNode = async () => {
    setSaving(true)
    await supabase.from('plan_nodes').delete().eq('id', node.id)
    setSaving(false); onRefresh()
  }

  const totalTasks = isLeaf ? node.tasks.length : countAllTasks(node)
  const doneTasks  = isLeaf
    ? node.tasks.filter((t:any) => t.status === 'completed').length
    : countDoneTasks(node)
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

  return (
    <div>
      {/* ── رأس العقدة (قابل للطي) ── */}
      <div
        className="flex items-center gap-2 p-3 rounded-xl cursor-pointer select-none hover:bg-slate-50 transition-colors"
        onClick={() => { if (!editing && !confirming) setIsOpen(o => !o) }}>

        <span className={`text-slate-300 transition-transform inline-block text-xs flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`}>▶</span>

        {/* الاسم */}
        {editing ? (
          <div className="flex items-center gap-2 flex-1" onClick={e => e.stopPropagation()}>
            <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
              className="flex-1 px-2 py-1 rounded-lg border border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm bg-white" />
            <button onClick={saveEdit} disabled={saving}
              className="px-2 py-1 bg-amber-500 text-white text-xs rounded-lg">{saving?'...':'حفظ'}</button>
            <button onClick={() => setEditing(false)}
              className="px-2 py-1 border border-slate-200 text-slate-500 text-xs rounded-lg">إلغاء</button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-sm font-semibold text-slate-700 flex-1">{node.name_ar}</span>
            {kpiConf && (
              <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">
                📊 KPI
              </span>
            )}
          </div>
        )}

        {/* الإحصائيات وأزرار التعديل */}
        {!editing && (
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            {(() => {
              const nodeRating = calcNodeRating(node)
              if (nodeRating == null) return null
              const info = ratingBadgeClass(nodeRating)
              return (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${info.cls}`}>
                  {info.icon} {info.label}
                </span>
              )
            })()}

            <div className="flex items-center gap-2">
              {totalTasks > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-16 h-1 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-500 rounded-full" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="text-xs text-violet-600 font-bold">{progress}%</span>
                </div>
              )}
              <span className="text-xs text-slate-400">{totalTasks} مهمة</span>
              <button onClick={() => { setEditing(true); setEditName(node.name_ar) }}
                className="w-6 h-6 flex items-center justify-center hover:text-amber-500 text-slate-300 rounded transition-colors text-xs">✏️</button>
              {!confirming ? (
                <button onClick={() => setConfirming(true)}
                  className="w-6 h-6 flex items-center justify-center hover:text-red-500 text-slate-300 rounded transition-colors text-xs">🗑️</button>
              ) : (
                <div className="flex items-center gap-1">
                  <button onClick={deleteNode} disabled={saving}
                    className="px-2 py-0.5 bg-red-500 text-white text-xs rounded">{saving?'...':'حذف'}</button>
                  <button onClick={() => setConfirming(false)}
                    className="px-2 py-0.5 border text-slate-500 text-xs rounded">إلغاء</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── المحتوى (يُعرض/يُخفى بـ React) ── */}
      {isOpen && (
      <div className={`mr-5 mt-1 space-y-1 pb-2 ${depth > 0 ? 'border-r-2 border-slate-100 pr-3' : ''}`}>

        {/* ══ قسم مؤشرات الأداء KPI ══ */}
        {kpiConf && (
          <KpiSection
            nodeId={node.id}
            kpiConf={kpiConf}
            nodeName={node.name_ar}
            planName={planName}
          />
        )}

        {/* عقد أبناء */}
        {node.children.map((child: any) => (
          <NodeItem key={child.id} node={child} levelNames={levelNames} levelCount={levelCount}
            planId={planId} planName={planName} onRefresh={onRefresh} kpiLevelConfigs={kpiLevelConfigs} depth={depth + 1} />
        ))}

        {/* المهام (في المستوى الأخير) */}
        {isLeaf && node.tasks.length > 0 && (
          <div className="space-y-1 mr-2">
            {node.tasks.map((task: any) => (
              <Link key={task.id} href={`/dashboard/tasks/${task.id}`}
                className="flex items-center gap-2 p-2.5 rounded-xl hover:bg-violet-50 transition-colors border border-transparent hover:border-violet-100">
                <span className="text-sm">{task.task_type==='academic'?'📚':task.task_type==='administrative'?'🗃️':'📌'}</span>
                <span className="text-sm text-slate-700 flex-1">{task.name_ar}</span>
                {task.end_date && (
                  <span className="text-xs text-slate-400">{new Date(task.end_date).toLocaleDateString('ar-QA')}</span>
                )}
                {task.rating != null && (() => {
                  const info = ratingBadgeClass(task.rating!)
                  return (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${info.cls}`}>
                      {info.icon} {info.label}
                    </span>
                  )
                })()}
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[task.status]||'bg-slate-100'}`}>
                  {statusAr[task.status]}
                </span>
              </Link>
            ))}
          </div>
        )}

        {/* زر إضافة */}
        {!adding ? (
          <button onClick={() => setAdding(true)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors w-full
              ${isLeaf
                ? 'text-violet-500 hover:bg-violet-50'
                : `text-indigo-500 hover:bg-indigo-50`
              }`}>
            ➕ {isLeaf ? 'إضافة مهمة' : `إضافة ${nextLevelName}`}
          </button>
        ) : isLeaf ? (
          <div className="flex items-center gap-2 p-2">
            <Link href={`/dashboard/tasks/new?node=${node.id}&plan=${planId}`}
              className="flex-1 px-3 py-2 bg-violet-600 text-white text-xs rounded-xl text-center font-medium">
              ➕ فتح نموذج إضافة مهمة
            </Link>
            <button onClick={() => setAdding(false)}
              className="px-3 py-2 border border-slate-200 text-slate-500 text-xs rounded-xl">إلغاء</button>
          </div>
        ) : (
          <form onSubmit={addChild} className="flex items-center gap-2 p-2">
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              placeholder={`اسم ${nextLevelName}...`}
              className="flex-1 px-3 py-2 text-sm rounded-xl border border-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white" />
            <button type="submit" disabled={saving||!newName.trim()}
              className="px-3 py-2 bg-violet-600 text-white text-xs rounded-xl disabled:opacity-50 font-medium">
              {saving?'...':'إضافة'}
            </button>
            <button type="button" onClick={()=>{setAdding(false);setNewName('')}}
              className="px-3 py-2 border border-slate-200 text-slate-500 text-xs rounded-xl hover:bg-slate-50">
              إلغاء
            </button>
          </form>
        )}
      </div>
      )}
    </div>
  )
}

function countAllTasks(node: any): number {
  if (!node.children || node.children.length === 0) return node.tasks?.length || 0
  return node.children.reduce((acc: number, c: any) => acc + countAllTasks(c), 0)
}
function countDoneTasks(node: any): number {
  if (!node.children || node.children.length === 0)
    return node.tasks?.filter((t:any) => t.status === 'completed').length || 0
  return node.children.reduce((acc: number, c: any) => acc + countDoneTasks(c), 0)
}

/* ══ الصفحة الرئيسية ══ */
export default function NodePage() {
  const params   = useParams()
  const planId   = params.planId as string
  const nodeId   = params.nodeId as string
  const router   = useRouter()
  const supabase = createClient()

  const [plan,           setPlan]           = useState<any>(null)
  const [rootNode,       setRootNode]       = useState<any>(null)
  const [tree,           setTree]           = useState<any[]>([])
  const [loading,        setLoading]        = useState(true)
  const [kpiLevelConfigs,setKpiLevelConfigs]= useState<KpiLevelConf[]>([])

  const load = useCallback(async () => {
    const [{ data: planData }, { data: allNodes }, { data: allTasks }] = await Promise.all([
      supabase.from('plans').select('id, name_ar, level_count, level_names, kpi_levels').eq('id', planId).single(),
      supabase.from('plan_nodes').select('*').eq('plan_id', planId).order('order_num'),
      supabase.from('tasks').select('id, name_ar, status, priority, end_date, task_type, node_id, rating')
        .in('node_id', (await supabase.from('plan_nodes').select('id').eq('plan_id', planId)).data?.map(n=>n.id) || []),
    ])

    if (!planData) { router.push('/dashboard/plans'); return }

    const root = (allNodes || []).find(n => n.id === nodeId)
    if (!root) { router.push(`/dashboard/plans/${planId}`); return }

    setPlan(planData)
    setRootNode(root)
    setKpiLevelConfigs(planData.kpi_levels || [])

    const descendants = allNodes || []
    const tasks = allTasks || []
    const levelCount = planData.level_count || 3
    const subtree = buildTree(descendants, tasks as Task[], nodeId, levelCount)
    setTree(subtree)
    setLoading(false)
  }, [planId, nodeId])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full" />
    </div>
  )
  if (!plan || !rootNode) return null

  const levelNames: string[] = plan.level_names || []

  return (
    <div className="space-y-4">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/dashboard/plans" className="hover:text-violet-600">الخطط</Link>
        <span>›</span>
        <Link href={`/dashboard/plans/${planId}`} className="hover:text-violet-600">{plan.name_ar}</Link>
        <span>›</span>
        <span className="text-violet-700 font-medium">{rootNode.name_ar}</span>
      </div>

      {/* Node Header */}
      <div className="bg-gradient-to-l from-violet-600 to-indigo-700 text-white rounded-2xl p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center font-bold text-lg">
            {rootNode.order_num}
          </div>
          <div>
            <p className="text-violet-200 text-xs">{levelNames[rootNode.level_num - 1] || `المستوى ${rootNode.level_num}`}</p>
            <h2 className="text-xl font-bold">{rootNode.name_ar}</h2>
          </div>
        </div>

        {/* مسار المستويات مع مؤشر KPI */}
        <div className="mt-3 flex items-center gap-1 flex-wrap">
          {levelNames.map((lname: string, idx: number) => {
            const hasKpi = kpiLevelConfigs.some(k => k.levelIndex === idx)
            return (
              <span key={idx} className="flex items-center gap-1">
                <span className={`px-2 py-0.5 rounded text-xs flex items-center gap-1
                  ${idx === rootNode.level_num - 1 ? 'bg-white/30 font-bold' : 'bg-white/10 text-violet-200'}`}>
                  {lname}
                  {hasKpi && <span className="text-emerald-300 text-xs">📊</span>}
                </span>
                {idx < levelNames.length - 1 && <span className="text-violet-300 text-xs">›</span>}
              </span>
            )
          })}
          <span className="text-violet-300 text-xs">›</span>
          <span className="bg-green-400/20 text-green-100 px-2 py-0.5 rounded text-xs">✅ المهمة</span>
        </div>
      </div>

      {/* الهيكل الهرمي */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-1">
        {tree.length > 0 ? (
          tree.map((node: any) => (
            <NodeItem
              key={node.id}
              node={node}
              levelNames={levelNames}
              levelCount={plan.level_count}
              planId={planId}
              planName={plan.name_ar}
              onRefresh={load}
              kpiLevelConfigs={kpiLevelConfigs}
            />
          ))
        ) : (
          <div className="text-center py-8 text-slate-400">
            <FolderOpen size={36} className="mx-auto mb-2" style={{ color: 'var(--maroon-300)' }} />
            <p className="text-sm">لا يوجد محتوى بعد</p>
          </div>
        )}

        {/* إضافة على المستوى الأول */}
        <AddChildToRoot planId={planId} parentId={nodeId} levelNum={rootNode.level_num + 1}
          levelName={levelNames[rootNode.level_num] || `المستوى ${rootNode.level_num + 1}`}
          onRefresh={load} />
      </div>
    </div>
  )
}

function AddChildToRoot({ planId, parentId, levelNum, levelName, onRefresh }: {
  planId:string; parentId:string; levelNum:number; levelName:string; onRefresh:()=>void
}) {
  const supabase = createClient()
  const [open,    setOpen]    = useState(false)
  const [name,    setName]    = useState('')
  const [saving,  setSaving]  = useState(false)

  const add = async (e: React.FormEvent) => {
    e.preventDefault(); if (!name.trim()) return
    setSaving(true)
    const { data: ex } = await supabase.from('plan_nodes').select('order_num')
      .eq('parent_id', parentId).order('order_num', { ascending: false }).limit(1)
    const orderNum = ex?.length ? ex[0].order_num + 1 : 1
    await supabase.from('plan_nodes').insert({ plan_id: planId, parent_id: parentId, level_num: levelNum, name_ar: name.trim(), order_num: orderNum })
    setName(''); setOpen(false); setSaving(false); onRefresh()
  }

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-violet-500 hover:bg-violet-50 text-xs font-medium transition-colors w-full mt-2">
      ➕ إضافة {levelName}
    </button>
  )

  return (
    <form onSubmit={add} className="flex items-center gap-2 p-2 mt-2">
      <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder={`اسم ${levelName}...`}
        className="flex-1 px-3 py-2 text-sm rounded-xl border border-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white" />
      <button type="submit" disabled={saving||!name.trim()} className="px-3 py-2 bg-violet-600 text-white text-xs rounded-xl disabled:opacity-50">{saving?'...':'إضافة'}</button>
      <button type="button" onClick={()=>{setOpen(false);setName('')}} className="px-3 py-2 border border-slate-200 text-slate-500 text-xs rounded-xl">إلغاء</button>
    </form>
  )
}

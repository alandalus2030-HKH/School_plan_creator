'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Target, TrendingUp, Package, BarChart3 } from 'lucide-react'

const ACADEMIC_YEARS = Array.from({ length: 16 }, (_, i) => `${2024 + i}-${2025 + i}`)

const LEVEL_PRESETS: Record<number, string[]> = {
  2: ['المحور', 'المبادرة'],
  3: ['المحور', 'المبادرة', 'الهدف'],
  4: ['المحور', 'الهدف الاستراتيجي', 'الهدف العام', 'الهدف الفرعي'],
  5: ['المجال', 'البرنامج', 'المبادرة', 'الهدف', 'النشاط'],
}

const KPI_TYPES = [
  {
    value: 'impact',
    label: 'أثر بعيد',
    Icon:  Target,
    tooltip: {
      def:      'التحسّن في المؤشر النهائي الناتج عن تراكم النتائج على مدى سنوات',
      example:  'ارتفاع معدل التحصيل في امتحانات الدولة — انخفاض نسبة التسرب المدرسي',
      timing:   'يُقاس بعد 3–5 سنوات من التنفيذ',
      suitable: 'الأهداف الاستراتيجية العليا',
    },
  },
  {
    value: 'outcome',
    label: 'نتيجة مباشرة',
    Icon:  TrendingUp,
    tooltip: {
      def:      'التغيير في سلوك المستفيد الناتج عن الأنشطة والمبادرات',
      example:  'نسبة المعلمين الذين غيّروا طريقة تدريسهم — تحسّن مشاركة الطلاب داخل الفصل',
      timing:   'يُقاس خلال 1–2 سنة من التنفيذ',
      suitable: 'الأهداف العامة والمبادرات',
    },
  },
  {
    value: 'output',
    label: 'مخرج',
    Icon:  Package,
    tooltip: {
      def:      'ما قام به الفريق من إنجازات دون النظر إلى تأثيرها أو أثرها',
      example:  'عدد الدورات المنفّذة — عدد الوثائق المُعدَّة — عدد الطلاب الملتحقين ببرنامج',
      timing:   'يُقاس فور الانتهاء من التنفيذ',
      suitable: 'الأهداف التشغيلية والأنشطة',
    },
  },
]

const KPI_FREQUENCIES = [
  { value: 'monthly',   label: 'شهري' },
  { value: 'quarterly', label: 'ربع سنوي' },
  { value: 'semester',  label: 'فصلي' },
  { value: 'yearly',    label: 'سنوي' },
]

type KpiLevelConfig = {
  levelIndex: number
  enabled:    boolean
  kpiType:    string
  frequency:  string
}

const LEVEL_COLORS = [
  'bg-violet-100 text-violet-700 border-violet-200',
  'bg-indigo-100 text-indigo-700 border-indigo-200',
  'bg-blue-100   text-blue-700   border-blue-200',
  'bg-cyan-100   text-cyan-700   border-cyan-200',
  'bg-teal-100   text-teal-700   border-teal-200',
]

export default function NewPlanPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [step,       setStep]       = useState<1|2|3>(1)
  const [name,       setName]       = useState('')
  const [year,       setYear]       = useState('2025-2026')
  const [startDate,  setStartDate]  = useState('2025-09-01')
  const [endDate,    setEndDate]    = useState('2026-06-30')
  const [levelCount, setLevelCount] = useState(3)
  const [levelNames, setLevelNames] = useState(['المحور', 'المبادرة', 'الهدف'])
  const [kpiLevels,  setKpiLevels]  = useState<KpiLevelConfig[]>([])
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')

  /* ── تغيير عدد المستويات ── */
  const handleLevelCount = (n: number) => {
    setLevelCount(n)
    setLevelNames(LEVEL_PRESETS[n] || Array.from({ length: n }, (_, i) => `المستوى ${i + 1}`))
    setKpiLevels([]) // إعادة تعيين KPIs عند تغيير العدد
  }

  /* ── تسمية مستوى ── */
  const setLevelName = (idx: number, val: string) =>
    setLevelNames(prev => prev.map((v, i) => i === idx ? val : v))

  /* ── الانتقال لخطوة KPI مع توليد الإعدادات الافتراضية ── */
  const goToKpiStep = () => {
    if (kpiLevels.length === 0) {
      // إعداد افتراضي ذكي: المستوى الأول فقط مُقفَل (الحاوي العام)
      // المهام كيان منفصل تحت جميع المستويات — لا "مستوى أخير محجوز"
      const defaults: KpiLevelConfig[] = levelNames.map((_, idx) => ({
        levelIndex: idx,
        enabled:    idx > 0,   // كل المستويات عدا الأول
        kpiType:    idx <= 1 ? 'impact' : 'outcome',
        frequency:  idx <= 1 ? 'yearly' : 'semester',
      }))
      setKpiLevels(defaults)
    }
    setStep(3)
  }

  /* ── تعديل إعداد KPI لمستوى ── */
  const updateKpiLevel = (idx: number, patch: Partial<KpiLevelConfig>) =>
    setKpiLevels(prev => prev.map(k => k.levelIndex === idx ? { ...k, ...patch } : k))

  /* ── إنشاء الخطة ── */
  const handleCreate = async () => {
    setLoading(true); setError('')
    try {
      const { data: school } = await supabase.from('schools').select('id').single()

      const kpiLevelsToSave = kpiLevels
        .filter(k => k.enabled)
        .map(k => ({
          levelIndex: k.levelIndex,
          levelName:  levelNames[k.levelIndex],
          kpiType:    k.kpiType,
          frequency:  k.frequency,
        }))

      const { data: plan, error: planErr } = await supabase
        .from('plans')
        .insert({
          school_id:    school?.id || null,
          name_ar:      name.trim(),
          academic_year: year,
          start_date:   startDate || null,
          end_date:     endDate   || null,
          level_count:  levelCount,
          level_names:  levelNames,
          kpi_levels:   kpiLevelsToSave,
        })
        .select('id')
        .single()

      if (planErr) throw planErr
      router.push(`/dashboard/plans/${plan.id}`)
    } catch (e: any) {
      setError(e.message || 'حدث خطأ')
      setLoading(false)
    }
  }

  /* ── عدد المستويات المفعّلة للـ KPI ── */
  const enabledKpiCount = kpiLevels.filter(k => k.enabled).length

  return (
    <div className="max-w-2xl mx-auto">

      {/* رأس الصفحة */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/plans"
          className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-400 hover:text-violet-600 hover:border-violet-300 transition-colors">
          ←
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-slate-800">خطة جديدة</h2>
          <p className="text-slate-500 text-sm mt-0.5">
            { step === 1 ? 'معلومات الخطة الأساسية'
            : step === 2 ? 'تحديد هيكل المستويات'
            : 'إعداد مستويات قياس الأداء KPIs' }
          </p>
        </div>
      </div>

      {/* مؤشر الخطوات */}
      <div className="flex items-center gap-2 mb-6">
        {[
          { n: 1, label: 'البيانات الأساسية' },
          { n: 2, label: 'هيكل المستويات' },
          { n: 3, label: 'مؤشرات الأداء' },
        ].map(({ n, label }, i) => (
          <div key={n} className="flex items-center gap-2 flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all flex-shrink-0
              ${step > n  ? 'bg-green-500 text-white'
              : step === n ? 'bg-violet-600 text-white ring-4 ring-violet-100'
              : 'bg-slate-100 text-slate-400'}`}>
              {step > n ? '✓' : n}
            </div>
            <span className={`text-xs font-medium hidden sm:block
              ${step >= n ? 'text-violet-700' : 'text-slate-400'}`}>
              {label}
            </span>
            {i < 2 && <div className={`flex-1 h-0.5 mx-1 rounded-full transition-colors ${step > n ? 'bg-green-400' : 'bg-slate-200'}`} />}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">

        {/* ══ الخطوة 1: البيانات الأساسية ══ */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                اسم الخطة <span className="text-red-500">*</span>
              </label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="مثال: الخطة التشغيلية لمدرسة الأندلس 2025-2026"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-slate-50 text-slate-800" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">العام الدراسي</label>
              <select value={year} onChange={e => setYear(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-slate-50 text-slate-800">
                {ACADEMIC_YEARS.map(y => <option key={y} value={y}>📅 {y}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">تاريخ البدء</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  dir="ltr" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-slate-50" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">تاريخ الانتهاء</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  dir="ltr" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-slate-50" />
              </div>
            </div>

            {error && <p className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</p>}

            <button onClick={() => { if (!name.trim()) { setError('اسم الخطة مطلوب'); return }; setError(''); setStep(2) }}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white font-semibold py-3 rounded-xl transition-colors shadow-lg shadow-violet-200">
              التالي: هيكل المستويات ›
            </button>
          </div>
        )}

        {/* ══ الخطوة 2: هيكل المستويات ══ */}
        {step === 2 && (
          <div className="space-y-6">

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-3">
                عدد مستويات الهيكل (قبل المهمة)
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => handleLevelCount(n)}
                    className={`p-3 rounded-xl border-2 text-center transition-all
                      ${levelCount === n
                        ? 'border-violet-500 bg-violet-50 text-violet-700'
                        : 'border-slate-200 text-slate-500 hover:border-violet-200'}`}>
                    <div className="text-2xl font-bold">{n}</div>
                    <div className="text-xs mt-0.5">مستوى</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-3">اسم كل مستوى</label>
              <div className="space-y-2">
                {levelNames.map((lname, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 border ${LEVEL_COLORS[idx] || LEVEL_COLORS[4]}`}>
                      {idx + 1}
                    </div>
                    <input type="text" value={lname} onChange={e => setLevelName(idx, e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-slate-50 text-sm"
                      placeholder={`اسم المستوى ${idx + 1}`} />
                  </div>
                ))}
                <div className="flex items-center gap-3 opacity-40">
                  <div className="w-8 h-8 rounded-lg bg-green-100 text-green-700 border border-green-200 flex items-center justify-center text-sm font-bold flex-shrink-0">✓</div>
                  <div className="flex-1 px-3 py-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 text-slate-400 text-sm">
                    المهمة (ثابت — لا يُعدَّل)
                  </div>
                </div>
              </div>
            </div>

            {/* معاينة */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <p className="text-xs font-semibold text-slate-500 mb-3">📐 معاينة الهيكل</p>
              <div className="space-y-1">
                {levelNames.map((lname, idx) => (
                  <div key={idx} className="flex items-center gap-2" style={{ paddingRight: `${idx * 16}px` }}>
                    <span className="text-slate-300 text-xs">└─</span>
                    <span className="text-sm text-slate-600 font-medium">{lname || `المستوى ${idx+1}`}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2" style={{ paddingRight: `${levelNames.length * 16}px` }}>
                  <span className="text-slate-300 text-xs">└─</span>
                  <span className="text-sm text-green-600 font-medium">✅ المهمة</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={goToKpiStep}
                className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-semibold py-3 rounded-xl transition-colors shadow-lg shadow-violet-200">
                التالي: إعداد مؤشرات الأداء ›
              </button>
              <button onClick={() => setStep(1)}
                className="px-6 py-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                رجوع
              </button>
            </div>
          </div>
        )}

        {/* ══ الخطوة 3: إعداد مستويات KPI ══ */}
        {step === 3 && (
          <div className="space-y-5">

            <div className="bg-violet-50 rounded-xl p-4 border border-violet-100">
              <p className="text-sm font-semibold text-violet-800 mb-1 flex items-center gap-1"><BarChart3 size={14} /> مؤشرات الأداء الرئيسية (KPIs)</p>
              <p className="text-xs text-violet-600">
                حدد المستويات التي ستحتوي على مؤشرات قياس الأداء.
                المستوى الأول محجوز (حاوٍ عام). المهام كيان منفصل أسفل الهيكل.
              </p>
            </div>

            <div className="space-y-3">
              {kpiLevels.map((kl) => {
                const idx      = kl.levelIndex
                const isFirst  = idx === 0
                // المهام كيان منفصل — لا "مستوى أخير محجوز"، فقط المستوى الأول
                const locked   = isFirst
                const lname    = levelNames[idx] || `المستوى ${idx + 1}`

                return (
                  <div key={idx}
                    className={`rounded-xl border-2 transition-all
                      ${locked        ? 'border-slate-200 bg-slate-50 opacity-60'
                      : kl.enabled    ? 'border-violet-300 bg-violet-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'}`}>

                    {/* رأس المستوى */}
                    <div className="flex items-center gap-3 p-3.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 border ${LEVEL_COLORS[idx] || LEVEL_COLORS[4]}`}>
                        {idx + 1}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-700">{lname}</p>
                        <p className="text-xs text-slate-400">
                          {locked
                            ? 'مستوى جذر — حاوٍ عام للخطة'
                            : kl.enabled ? 'مُفعَّل للـ KPIs ✓' : 'بدون مؤشرات أداء'}
                        </p>
                      </div>
                      {!locked && (
                        <button
                          onClick={() => updateKpiLevel(idx, { enabled: !kl.enabled })}
                          className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0
                            ${kl.enabled ? 'bg-violet-600' : 'bg-slate-300'}`}>
                          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all
                            ${kl.enabled ? 'right-0.5' : 'left-0.5'}`} />
                        </button>
                      )}
                      {locked && (
                        <span className="text-slate-400 text-xs px-2 py-1 bg-slate-100 rounded-lg">🔒 محجوز</span>
                      )}
                    </div>

                    {/* إعدادات KPI (إذا مُفعَّل) */}
                    {!locked && kl.enabled && (
                      <div className="px-4 pb-4 pt-1 border-t border-violet-200 bg-white/60 grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5">نوع المؤشر</label>
                          <div className="space-y-1.5">
                            {KPI_TYPES.map(t => (
                              <div key={t.value} className="relative group/tip">
                                <label
                                  className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border text-xs transition-colors
                                    ${kl.kpiType === t.value
                                      ? 'border-violet-300 bg-violet-50 text-violet-700'
                                      : 'border-slate-200 hover:border-violet-200 text-slate-600'}`}>
                                  <input type="radio" name={`type-${idx}`} value={t.value}
                                    checked={kl.kpiType === t.value}
                                    onChange={() => updateKpiLevel(idx, { kpiType: t.value })}
                                    className="accent-violet-600" />
                                  <span className="flex items-center gap-1"><t.Icon size={14} /> {t.label}</span>
                                  <span className="mr-auto flex-shrink-0 w-4 h-4 rounded-full border border-slate-300 text-slate-400 group-hover/tip:border-violet-400 group-hover/tip:text-violet-500 flex items-center justify-center text-[9px] font-bold transition-colors">
                                    ?
                                  </span>
                                </label>
                                {/* Tooltip — يظهر للأعلى */}
                                <div className="absolute z-50 right-0 bottom-full mb-2 w-64
                                                bg-white border border-violet-200 rounded-xl p-3 text-xs leading-relaxed
                                                invisible opacity-0 group-hover/tip:visible group-hover/tip:opacity-100
                                                transition-all duration-150 shadow-xl pointer-events-none">
                                  {/* سهم أسفل التلميح */}
                                  <div className="absolute -bottom-1.5 right-4 w-3 h-3 bg-white border-b border-r border-violet-200 rotate-45 rounded-sm" />
                                  <p className="text-slate-800 font-semibold mb-2 flex items-center gap-1"><t.Icon size={14} /> {t.label}</p>
                                  <p className="text-slate-600 mb-2 leading-relaxed">{t.tooltip.def}</p>
                                  <p className="text-slate-500 mb-1.5">
                                    <span className="text-amber-600 font-semibold">مثال: </span>
                                    {t.tooltip.example}
                                  </p>
                                  <p className="text-slate-500 mb-1">
                                    <span className="text-blue-600 font-semibold">التوقيت: </span>
                                    {t.tooltip.timing}
                                  </p>
                                  <p className="text-slate-500">
                                    <span className="text-green-600 font-semibold">يناسب: </span>
                                    {t.tooltip.suitable}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5">دورة القياس</label>
                          <div className="space-y-1.5">
                            {KPI_FREQUENCIES.map(f => (
                              <label key={f.value}
                                className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border text-xs transition-colors
                                  ${kl.frequency === f.value
                                    ? 'border-violet-300 bg-violet-50 text-violet-700'
                                    : 'border-slate-200 hover:border-violet-200 text-slate-600'}`}>
                                <input type="radio" name={`freq-${idx}`} value={f.value}
                                  checked={kl.frequency === f.value}
                                  onChange={() => updateKpiLevel(idx, { frequency: f.value })}
                                  className="accent-violet-600" />
                                {f.label}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* مستوى المهمة — دائماً محجوز */}
              <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 opacity-50 p-3.5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-100 text-green-700 border border-green-200 flex items-center justify-center text-sm font-bold flex-shrink-0">✓</div>
                <div>
                  <p className="text-sm font-semibold text-slate-500">المهمة</p>
                  <p className="text-xs text-slate-400">تُتابَع بالحالة والتقييم والأدلة</p>
                </div>
                <span className="mr-auto text-slate-400 text-xs px-2 py-1 bg-slate-200 rounded-lg">🔒 محجوز</span>
              </div>
            </div>

            {/* ملخص الاختيار */}
            {enabledKpiCount > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700">
                ✅ سيتم تفعيل KPIs على{' '}
                <strong>{enabledKpiCount} {enabledKpiCount === 1 ? 'مستوى' : 'مستويات'}</strong>:{' '}
                {kpiLevels.filter(k => k.enabled).map(k => levelNames[k.levelIndex]).join(' و ')}
              </div>
            )}
            {enabledKpiCount === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">
                ⚠️ لم تُفعَّل أي مستويات للـ KPIs — يمكنك تغيير ذلك لاحقاً من إعدادات الخطة
              </div>
            )}

            {error && <p className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</p>}

            <div className="flex gap-3">
              <button onClick={handleCreate} disabled={loading}
                className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60 shadow-lg shadow-violet-200">
                {loading ? '⏳ جارٍ الإنشاء...' : '✅ إنشاء الخطة'}
              </button>
              <button onClick={() => setStep(2)}
                className="px-6 py-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                رجوع
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

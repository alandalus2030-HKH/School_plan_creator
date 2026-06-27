'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * منتقي معايير الاعتماد (QNSA) — يُستخدم عند إنشاء عقد الخطة:
 * - المستويات 1-3: قائمة متسلسلة من كتالوج qnsa_standards
 *   (مستوى 2/3 مفلتر بكود الأب) + خيار «بند مخصص» نص حر.
 * - البند المخصص داخل سياق الكتالوج يأخذ الرقم التالي المتاح
 *   في مستواه (معيار مخصص = 6، جانب مخصص تحت 1 = 1.6 ...).
 * - المستويات الأعلى أو أبناء بند مخصص بلا كود: نص حر مباشرة
 *   (standardCode = null → ترقيم محسوب كما السابق).
 */
export type StandardChoice = { name: string; standardCode: string | null }

export default function StandardPicker({
  levelNum, parentStandardCode, excludeCodes = [], placeholder,
  onSubmit, onCancel, saving = false, compact = false,
}: {
  levelNum: number
  parentStandardCode: string | null
  excludeCodes?: string[]
  placeholder: string
  onSubmit: (choice: StandardChoice) => void
  onCancel: () => void
  saving?: boolean
  compact?: boolean
}) {
  const supabase = createClient()
  const catalogContext = levelNum <= 3 && (levelNum === 1 || !!parentStandardCode)
  const [options, setOptions] = useState<{ code: string; name_ar: string }[]>([])
  const [loaded,  setLoaded]  = useState(!catalogContext)
  const [sel,     setSel]     = useState('')
  const [custom,  setCustom]  = useState('')

  useEffect(() => {
    if (!catalogContext) return
    ;(async () => {
      let q = supabase.from('qnsa_standards')
        .select('code, name_ar')
        .eq('level', levelNum)
        .eq('is_active', true)
        .order('sort_order')
      if (levelNum > 1) q = q.eq('parent_code', parentStandardCode)
      const { data } = await q
      setOptions((data || []).filter((o: any) => !excludeCodes.includes(o.code)))
      setLoaded(true)
    })()
    // excludeCodes ليست تبعية عمداً (مصفوفة جديدة كل render)
  }, [levelNum, parentStandardCode])

  const showSelect = catalogContext && (options.length > 0 || !loaded)
  const isCustom   = !showSelect || sel === '__custom__'
  const canSubmit  = isCustom ? !!custom.trim() : !!sel

  /* الرقم التالي المتاح للبند المخصص في مستواه */
  const nextFreeCode = (): string | null => {
    if (!catalogContext) return null
    const used = [...options.map(o => o.code), ...excludeCodes]
    const segs = used
      .map(c => parseInt(String(c).split('.').pop() || '0', 10))
      .filter(n => !isNaN(n))
    const next = (segs.length ? Math.max(...segs) : 0) + 1
    return parentStandardCode ? `${parentStandardCode}.${next}` : String(next)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || saving) return
    if (isCustom) {
      onSubmit({ name: custom.trim(), standardCode: nextFreeCode() })
    } else {
      const opt = options.find(o => o.code === sel)
      if (opt) onSubmit({ name: opt.name_ar, standardCode: opt.code })
    }
  }

  const fieldCls = `flex-1 min-w-[220px] ${compact ? 'text-xs' : 'text-sm'} px-3 py-2 rounded-xl border border-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white`
  const btnCls   = compact ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'

  return (
    <form onSubmit={submit} className="flex items-center gap-2 p-2 flex-wrap" onClick={e => e.stopPropagation()}>
      {showSelect && (
        <select autoFocus value={sel} onChange={e => setSel(e.target.value)} className={fieldCls}>
          <option value="">— اختر من معايير الاعتماد —</option>
          {options.map(o => (
            <option key={o.code} value={o.code}>{o.code} — {o.name_ar}</option>
          ))}
          <option value="__custom__">بند مخصص (نص حر)...</option>
        </select>
      )}
      {isCustom && (
        <input autoFocus={!showSelect} value={custom} onChange={e => setCustom(e.target.value)}
          placeholder={placeholder} className={fieldCls} />
      )}
      <button type="submit" disabled={saving || !canSubmit}
        className={`${btnCls} bg-violet-600 text-white rounded-xl font-medium disabled:opacity-50`}>
        {saving ? '...' : 'إضافة'}
      </button>
      <button type="button" onClick={onCancel}
        className={`${btnCls} border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50`}>
        إلغاء
      </button>
    </form>
  )
}

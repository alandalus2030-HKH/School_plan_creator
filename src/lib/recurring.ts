/**
 * مفردات المهامّ الدورية — **مصدرٌ واحد** لكل شاشة تعرضها.
 *
 * فصلت هذه الأسماء عن شاشة الإعدادات لمّا صارت تُعرَض في بناء الخطة
 * أيضاً (5.1‑2): واسمٌ يُنسخ في شاشتين يتفرّق بينهما عند أوّل تعديل
 * — وهو عين درس «اشتقّ القيمة من مصدرها ولا تنسخها».
 */

/** مرتّبةٌ من الأقصر إلى الأطول — ونصفُ الفصل شهران، فموضعه بينهما. */
export const FREQ_AR: Record<string, string> = {
  weekly: 'أسبوعية', monthly: 'شهرية', semi_termly: 'نصف فصلية',
  termly: 'فصلية', annual: 'سنوية',
}

/** الدوريات التي تلزمها فصولٌ معرَّفة في التقويم — والأسبوعية والشهرية لا. */
export const FREQ_NEEDS_CALENDAR = ['semi_termly', 'termly', 'annual']

export type CycleTally = {
  documented: number; skipped: number; neglected: number; open: number; total: number
}

/**
 * «ولها مؤشّرها الخاص: **12 دورة من 12 وُثّقت**» (5.2) — لا نسبةَ إنجاز.
 * والمهمَل وحده فجوة (5.3)، فيُذكر صريحاً ولا يُدمَج في العدّ.
 */
export function tallyText(t: CycleTally): string {
  if (!t.total) return 'لا دورات بعد'
  const parts = [`${t.documented} دورة من ${t.total} وُثّقت`]
  if (t.skipped)   parts.push(`${t.skipped} بمبرّر`)
  if (t.open)      parts.push(`${t.open} مفتوحة`)
  if (t.neglected) parts.push(`${t.neglected} أُهملت`)
  return parts.join(' · ')
}

/** حالات الدورة الثلاث (ومعها المفتوحة) — وسمٌ ولونٌ لكل شاشة تعرضها. */
export const CYCLE_STATUS: Record<string, { ar: string; cls: string }> = {
  open:       { ar: 'مفتوحة',          cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  documented: { ar: 'وُثّقت',           cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  skipped:    { ar: 'لم تُنفَّذ بمبرّر', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
  neglected:  { ar: 'أُهملت',           cls: 'bg-red-50 text-red-700 border-red-200' },
}

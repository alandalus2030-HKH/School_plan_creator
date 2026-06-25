/* فلاتر التقارير الرسمية المشتركة (الخطة + الفترة) من رابط الصفحة.
   تُمرَّر من مُشغّل التقارير الرسمية: ?plan=<id>&pl=<اسم الخطة>&from=&to= */

export type ReportParams = {
  plan?: string       // معرّف الخطة (للـAPI)
  planLabel?: string  // اسم الخطة (للعرض)
  from?: string
  to?: string
}

export function readReportParams(): ReportParams {
  if (typeof window === 'undefined') return {}
  const q = new URLSearchParams(window.location.search)
  return {
    plan:      q.get('plan')  || undefined,
    planLabel: q.get('pl')    || undefined,
    from:      q.get('from')  || undefined,
    to:        q.get('to')    || undefined,
  }
}

/** سلسلة استعلام تُلحق بـ /api/reports?type=X (تبدأ بـ& أو فارغة) */
export function reportQuery(): string {
  const p = readReportParams()
  const qs = new URLSearchParams()
  if (p.plan) qs.set('plan', p.plan)
  if (p.from) qs.set('from', p.from)
  if (p.to)   qs.set('to', p.to)
  const s = qs.toString()
  return s ? `&${s}` : ''
}

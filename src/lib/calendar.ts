/* التقويم المدرسي: تحميل + فحص حالة يوم (عطلة/اختبارات/نهاية أسبوع) */

export type CalendarEvent = {
  id: string
  title: string
  kind: 'holiday' | 'exam' | 'break' | 'national' | 'eid' | 'other'
  enforcement: 'block' | 'warn'
  start_date: string   // YYYY-MM-DD
  end_date: string     // YYYY-MM-DD (شامل)
  note?: string | null
}

export type CalendarData = {
  events: CalendarEvent[]
  weekend: number[]    // أرقام JS getDay (الجمعة=5، السبت=6)
}

export const KIND_LABEL: Record<string, string> = {
  holiday: 'عطلة', exam: 'اختبارات', break: 'إجازة', national: 'يوم وطني', eid: 'عيد', other: 'أخرى',
}

/* لون كل نوع (للتظليل والشارات) */
export const KIND_COLOR: Record<string, string> = {
  holiday: '#dc2626', break: '#dc2626', national: '#0891b2', eid: '#0891b2',
  exam: '#f59e0b', other: '#64748b',
}

/** تحميل التقويم وأيام نهاية الأسبوع (يحترم المدرسة الفعّالة عبر الخادم) */
export async function loadCalendar(): Promise<CalendarData> {
  try {
    const res = await fetch('/api/calendar')
    if (!res.ok) return { events: [], weekend: [5, 6] }
    const j = await res.json()
    return { events: j.events || [], weekend: j.weekend || [5, 6] }
  } catch {
    return { events: [], weekend: [5, 6] }
  }
}

export type DayStatus = {
  level: 'block' | 'warn'
  reason: string          // وصف موجز للعرض
  kind?: string
} | null

/**
 * حالة يوم بصيغة YYYY-MM-DD:
 *  - عطلة بمستوى block → { level:'block' }
 *  - اختبارات/فترة بمستوى warn → { level:'warn' }
 *  - نهاية الأسبوع → { level:'warn' } (إن لم يُغطَّ بفترة أشد)
 * الأولوية: block ثم warn (الفترة) ثم نهاية الأسبوع.
 */
export function dayStatus(dateStr: string, data: CalendarData): DayStatus {
  if (!dateStr) return null
  const inRange = data.events.filter(e => dateStr >= e.start_date && dateStr <= e.end_date)
  const block = inRange.find(e => e.enforcement === 'block')
  if (block) return { level: 'block', reason: block.title, kind: block.kind }
  const warn = inRange.find(e => e.enforcement === 'warn')
  if (warn) return { level: 'warn', reason: warn.title, kind: warn.kind }
  /* نهاية الأسبوع — تنبيه فقط */
  const d = new Date(dateStr + 'T00:00:00')
  if (data.weekend.includes(d.getDay())) return { level: 'warn', reason: 'عطلة نهاية الأسبوع', kind: 'weekend' }
  return null
}

/** كل الفترات التي تغطّي تاريخاً (للتلميحات في التقويم) */
export function eventsOn(dateStr: string, data: CalendarData): CalendarEvent[] {
  return data.events.filter(e => dateStr >= e.start_date && dateStr <= e.end_date)
}

/** تاريخ اليوم بصيغة YYYY-MM-DD (محلي، بلا إزاحة UTC) — لحقول <input type="date"> */
export function todayInput(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * العام الدراسي الجاري بصيغة «2026-2027».
 * يبدأ العام في أغسطس (الشهر 8) كما هو معمول به في قطر، فما بعد أغسطس
 * يُنسب إلى العام الذي يليه. مثال: 2026-09-16 ⇒ «2026-2027»،
 * و2027-03-01 ⇒ «2026-2027» أيضاً.
 */
export const ACADEMIC_YEAR_START_MONTH = 8

export function currentAcademicYear(now: Date = new Date()): string {
  const y = now.getFullYear()
  const start = now.getMonth() + 1 >= ACADEMIC_YEAR_START_MONTH ? y : y - 1
  return `${start}-${start + 1}`
}

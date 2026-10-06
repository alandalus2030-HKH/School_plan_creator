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

/* ── حدّا العام الدراسي: أغسطس ← 30 يونيو من العام التالي ──
   مصدرٌ واحد للحدّين، فلا تتفرّق تواريخ افتراضية في الشاشات.
   والدوال تقبل تسمية العام «2026-2027» وتُرجع YYYY-MM-DD. */

export const ACADEMIC_YEAR_END_MONTH = 6
export const ACADEMIC_YEAR_END_DAY   = 30

const yearParts = (label: string): [number, number] | null => {
  const m = /^(\d{4})-(\d{4})$/.exec(String(label).trim())
  return m ? [Number(m[1]), Number(m[2])] : null
}

const pad = (n: number) => String(n).padStart(2, '0')

/** أول يوم في العام الدراسي: «2026-2027» ⇒ «2026-08-01» */
export function academicYearStart(label: string): string {
  const p = yearParts(label)
  if (!p) return ''
  return `${p[0]}-${pad(ACADEMIC_YEAR_START_MONTH)}-01`
}

/** آخر يوم في العام الدراسي: «2026-2027» ⇒ «2027-06-30» */
export function academicYearEnd(label: string): string {
  const p = yearParts(label)
  if (!p) return ''
  return `${p[1]}-${pad(ACADEMIC_YEAR_END_MONTH)}-${pad(ACADEMIC_YEAR_END_DAY)}`
}

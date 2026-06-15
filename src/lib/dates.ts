/** تاريخ اليوم بصيغة YYYY-MM-DD (محلي، بلا إزاحة UTC) — لحقول <input type="date"> */
export function todayInput(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

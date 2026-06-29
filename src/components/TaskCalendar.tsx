'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ChevronRight, ChevronLeft, X } from 'lucide-react'
import { STATUS_META } from '@/lib/constants/tasks'
import type { Task } from '@/lib/types'
import { loadCalendar, dayStatus, eventsOn, KIND_COLOR, type CalendarData } from '@/lib/calendar'

const AR_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]
const AR_DAYS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']

export default function TaskCalendar({ tasks }: { tasks: Task[] }) {
  const today = new Date()
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [cal, setCal] = useState<CalendarData>({ events: [], weekend: [5, 6] })
  const [selDay, setSelDay] = useState<number | null>(null)   // ورقة تفاصيل اليوم (جوال)
  useEffect(() => { loadCalendar().then(setCal) }, [])

  const year  = cursor.getFullYear()
  const month = cursor.getMonth()
  const dateStr = (d: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  /* أول يوم في الشهر + عدد الأيام */
  const firstDay   = new Date(year, month, 1).getDay()   // 0=أحد
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  /* تجميع المهام حسب يوم الاستحقاق */
  const tasksByDay: Record<number, Task[]> = {}
  tasks.forEach(t => {
    if (!t.end_date) return
    const d = new Date(t.end_date)
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate()
      ;(tasksByDay[day] ||= []).push(t)
    }
  })

  /* بناء خلايا الشبكة */
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const isToday = (d: number) =>
    today.getFullYear() === year && today.getMonth() === month && today.getDate() === d

  const prevMonth = () => setCursor(new Date(year, month - 1, 1))
  const nextMonth = () => setCursor(new Date(year, month + 1, 1))
  const goToday   = () => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* رأس التنقل */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} aria-label="الشهر السابق"
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">
            <ChevronRight size={18} />
          </button>
          <h3 className="font-bold text-slate-800 min-w-[110px] text-center">
            {AR_MONTHS[month]} {year}
          </h3>
          <button onClick={nextMonth} aria-label="الشهر التالي"
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">
            <ChevronLeft size={18} />
          </button>
        </div>
        <button onClick={goToday}
          className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
          اليوم
        </button>
      </div>

      {/* أسماء الأيام */}
      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50">
        {AR_DAYS.map(d => (
          <div key={d} className="text-center py-2 text-[11px] font-semibold text-slate-400">{d}</div>
        ))}
      </div>

      {/* الشبكة */}
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          const dayTasks = day ? (tasksByDay[day] || []) : []
          const ds  = day ? dayStatus(dateStr(day), cal) : null
          const evs = day ? eventsOn(dateStr(day), cal) : []
          /* خلفية اليوم المحجوز: عطلة (منع) أحمر فاتح، اختبارات/تنبيه أصفر فاتح، نهاية أسبوع رمادي */
          const cellTint =
            ds?.level === 'block' ? 'bg-red-50' :
            ds?.kind === 'weekend' ? 'bg-slate-100/70' :
            ds?.level === 'warn' ? 'bg-amber-50' : ''
          return (
            <div key={i}
              className={`min-h-[92px] border-b border-l border-slate-50 p-1.5 last:border-l-0
                ${day === null ? 'bg-slate-50/50' : cellTint}`}>
              {day !== null && (
                <>
                  <div className="flex items-center gap-1 mb-1">
                    <button onClick={() => setSelDay(day)} title="عرض مهام اليوم"
                      className={`text-xs w-6 h-6 flex items-center justify-center rounded-full transition-colors
                      ${isToday(day)
                        ? 'bg-violet-600 text-white font-bold'
                        : 'text-slate-500 hover:bg-slate-100'}`}>
                      {day}
                    </button>
                  </div>
                  {evs.length > 0 && (
                    <div className="mb-1 space-y-0.5">
                      {evs.slice(0, 1).map(e => (
                        <div key={e.id} title={e.title}
                          className="text-[9px] px-1 py-0.5 rounded truncate font-medium"
                          style={{ background: (KIND_COLOR[e.kind] || '#64748b') + '22', color: KIND_COLOR[e.kind] || '#64748b' }}>
                          {e.title}
                        </div>
                      ))}
                      {evs.length > 1 && <div className="text-[8px] text-slate-400 px-1">+{evs.length - 1}</div>}
                    </div>
                  )}
                  <div className="space-y-0.5">
                    {dayTasks.slice(0, 3).map(t => {
                      const sm = STATUS_META[t.status]
                      return (
                        <Link key={t.id} href={`/dashboard/tasks/${t.id}`}
                          title={t.name_ar}
                          className="block text-[10px] px-1.5 py-0.5 rounded truncate hover:brightness-95 transition-all"
                          style={{ background: sm?.hex + '22', color: sm?.hex }}>
                          {t.name_ar}
                        </Link>
                      )
                    })}
                    {dayTasks.length > 3 && (
                      <button onClick={() => setSelDay(day)}
                        className="text-[9px] text-violet-500 hover:text-violet-700 px-1.5 font-medium">
                        +{dayTasks.length - 3} أخرى
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* ورقة تفاصيل اليوم: قائمة كاملة بأسماء المهام (تحلّ قصّ الأسماء على الجوال) */}
      {selDay !== null && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
          onClick={() => setSelDay(null)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[75vh] overflow-y-auto shadow-2xl"
            dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white">
              <h4 className="font-bold text-slate-800">{selDay} {AR_MONTHS[month]} {year}</h4>
              <button onClick={() => setSelDay(null)} aria-label="إغلاق"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-3 space-y-2">
              {eventsOn(dateStr(selDay), cal).map(e => (
                <div key={e.id} className="text-xs px-3 py-2 rounded-xl font-medium"
                  style={{ background: (KIND_COLOR[e.kind] || '#64748b') + '22', color: KIND_COLOR[e.kind] || '#64748b' }}>
                  {e.title}
                </div>
              ))}
              {(tasksByDay[selDay] || []).length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">لا مهام مستحقّة في هذا اليوم</p>
              ) : (
                (tasksByDay[selDay] || []).map(t => {
                  const sm = STATUS_META[t.status]
                  return (
                    <Link key={t.id} href={`/dashboard/tasks/${t.id}`} onClick={() => setSelDay(null)}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: sm?.hex }} />
                      <span className="flex-1 text-sm text-slate-700 min-w-0">{t.name_ar}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: (sm?.hex || '#64748b') + '22', color: sm?.hex }}>{sm?.ar}</span>
                    </Link>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* مفتاح الألوان */}
      <div className="flex items-center gap-4 px-5 py-2.5 border-t border-slate-100 flex-wrap">
        {Object.entries(STATUS_META).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: v.hex }} />
            {v.ar}
          </span>
        ))}
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { UserRound, AlertTriangle, Inbox } from 'lucide-react'

type Row = {
  id:        string
  name:      string
  job:       string | null
  active:    number   // مهام نشطة (لم تبدأ + جارية)
  dueWeek:   number   // مستحقة هذا الأسبوع
  overdue:   number   // متأخرة
  done:      number   // منجزة
  total:     number
}

/* عتبة التحميل الزائد */
const OVERLOAD = 6

export default function WorkloadView() {
  const supabase = createClient()
  const [rows,    setRows]    = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const today = new Date()
      const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7)
      const todayStr = today.toISOString().split('T')[0]
      const weekStr  = weekEnd.toISOString().split('T')[0]

      const [{ data: tasks }, { data: profs }] = await Promise.all([
        supabase.from('tasks')
          .select('assigned_to_user_id, status, end_date')
          .not('assigned_to_user_id', 'is', null)
          .is('deleted_at', null)
          .limit(2000),
        supabase.from('profiles')
          .select('id, name_ar, job_title')
          .eq('is_active', true)
          .limit(500),
      ])

      const map: Record<string, Row> = {}
      ;(profs || []).forEach(p => {
        map[p.id] = { id: p.id, name: p.name_ar, job: p.job_title, active: 0, dueWeek: 0, overdue: 0, done: 0, total: 0 }
      })

      ;(tasks || []).forEach(t => {
        const uid = t.assigned_to_user_id
        if (!uid || !map[uid]) return
        const r = map[uid]
        r.total++
        if (t.status === 'completed') { r.done++; return }
        if (t.status === 'not_started' || t.status === 'in_progress') r.active++
        if (t.end_date) {
          if (t.end_date < todayStr && t.status !== 'completed') r.overdue++
          else if (t.end_date >= todayStr && t.end_date <= weekStr) r.dueWeek++
        }
      })

      const result = Object.values(map)
        .filter(r => r.total > 0)
        .sort((a, b) => b.active - a.active)

      setRows(result)
      setLoading(false)
    })()
  }, [])

  if (loading) return (
    <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-50">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-4 animate-pulse">
          <div className="w-9 h-9 rounded-full bg-slate-200" />
          <div className="flex-1 h-3 bg-slate-200 rounded-full w-1/3" />
          <div className="h-6 w-32 bg-slate-100 rounded-lg" />
        </div>
      ))}
    </div>
  )

  if (rows.length === 0) return (
    <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
      <Inbox size={40} className="mx-auto mb-3 opacity-40" />
      <p className="font-medium text-slate-500">لا توجد مهام مُكلَّف بها أفراد</p>
    </div>
  )

  const maxActive = Math.max(...rows.map(r => r.active), 1)

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
        <h3 className="font-bold text-slate-700 text-sm">توزيع حِمل العمل على الأفراد</h3>
        <span className="text-[11px] text-slate-400">
          مرتّب حسب المهام النشطة · <span className="text-red-500 font-medium">أحمر = تحميل زائد ({OVERLOAD}+)</span>
        </span>
      </div>

      <div className="divide-y divide-slate-50">
        {rows.map(r => {
          const overloaded = r.active >= OVERLOAD
          const barPct = Math.round((r.active / maxActive) * 100)
          return (
            <div key={r.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors">
              {/* الأفاتار */}
              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold
                ${overloaded ? 'bg-red-100 text-red-700' : 'bg-violet-100 text-violet-700'}`}>
                {r.name?.[0] || <UserRound size={16} />}
              </div>

              {/* الاسم + الوظيفة */}
              <div className="w-40 flex-shrink-0 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{r.name}</p>
                {r.job && <p className="text-[11px] text-slate-400 truncate">{r.job}</p>}
              </div>

              {/* شريط الحمل */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{
                        width: `${barPct}%`,
                        background: overloaded ? '#dc2626' : 'var(--maroon-500)',
                      }} />
                  </div>
                  <span className={`text-xs font-bold w-6 text-center flex-shrink-0
                    ${overloaded ? 'text-red-600' : 'text-slate-600'}`}>
                    {r.active}
                  </span>
                  {overloaded && <AlertTriangle size={13} className="text-red-500 flex-shrink-0" />}
                </div>
              </div>

              {/* إحصائيات مدمجة */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {r.dueWeek > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold whitespace-nowrap">
                    {r.dueWeek} هذا الأسبوع
                  </span>
                )}
                {r.overdue > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-semibold whitespace-nowrap">
                    {r.overdue} متأخرة
                  </span>
                )}
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-semibold whitespace-nowrap">
                  {r.done}/{r.total} منجز
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

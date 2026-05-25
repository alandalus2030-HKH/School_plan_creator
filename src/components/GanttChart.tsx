'use client'

import { useState, useRef, useMemo, useCallback } from 'react'

/* ══════════════════════════════════════════
   الثوابت
══════════════════════════════════════════ */
const ROW_H  = 44   // ارتفاع كل صف بالبكسل
const HDR_H  = 56   // ارتفاع رأس التايم لاين
const LEFT_W = 280  // عرض اللوحة اليسرى

const MONTHS_AR = [
  'يناير','فبراير','مارس','أبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر',
]

const STATUS_COLOR: Record<string, string> = {
  not_started: '#94a3b8',
  in_progress: '#3b82f6',
  completed:   '#22c55e',
  delayed:     '#ef4444',
}
const STATUS_AR: Record<string, string> = {
  not_started: 'لم تبدأ',
  in_progress: 'جارية',
  completed:   'منجزة',
  delayed:     'متأخرة',
}
const STATUS_ICON: Record<string, string> = {
  not_started: '⏳',
  in_progress: '🔄',
  completed:   '✅',
  delayed:     '⚠️',
}

type ZoomLevel = 'year' | 'quarter' | 'month' | 'week'
const ZOOM: Record<ZoomLevel, { dayW: number; label: string }> = {
  year:    { dayW: 2,  label: 'سنوي'     },
  quarter: { dayW: 5,  label: 'ربع سنوي' },
  month:   { dayW: 18, label: 'شهري'     },
  week:    { dayW: 70, label: 'أسبوعي'   },
}

type RowType = 'plan' | 'node' | 'task'
interface Row {
  id:      string
  type:    RowType
  label:   string
  depth:   number
  task?:   any
  nodeId?: string
  planId?: string
}

/* ══════════════════════════════════════════
   المكوّن الرئيسي
══════════════════════════════════════════ */
export default function GanttChart({
  tasks, nodes, plans, profiles, planFilter,
}: {
  tasks:      any[]
  nodes:      any[]
  plans:      any[]
  profiles:   any[]
  planFilter: string
}) {
  const [zoom,         setZoom]         = useState<ZoomLevel>('quarter')
  const [collapsed,    setCollapsed]    = useState<Set<string>>(new Set())
  const [fromDate,     setFromDate]     = useState('')
  const [toDate,       setToDate]       = useState('')
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set())   // فارغة = كل الحالات
  const [priorityF,    setPriorityF]    = useState('')                         // '' | high | medium | low
  const timelineRef = useRef<HTMLDivElement>(null)
  const leftRef     = useRef<HTMLDivElement>(null)

  const dayW  = ZOOM[zoom].dayW
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d }, [])

  /* ════ اختصارات الفترة الزمنية ════ */
  const isoDate = (d: Date) => d.toISOString().split('T')[0]

  const setThisWeek = () => {
    const d = new Date(today)
    // الأحد = 0، نريد السبت–الجمعة (أو الاثنين–الأحد حسب المنطقة)
    const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    setFromDate(isoDate(mon)); setToDate(isoDate(sun))
    setZoom('week')
  }
  const setNextWeek = () => {
    const d = new Date(today)
    const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    setFromDate(isoDate(mon)); setToDate(isoDate(sun))
    setZoom('week')
  }
  const setThisMonth = () => {
    const first = new Date(today.getFullYear(), today.getMonth(), 1)
    const last  = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    setFromDate(isoDate(first)); setToDate(isoDate(last))
    setZoom('month')
  }
  const clearRange = () => { setFromDate(''); setToDate('') }

  /* ════ تصفية المهام (تاريخ + حالة + أولوية) ════ */
  const rangeFilteredTasks = useMemo(() => {
    let result = tasks

    // فلتر الحالة
    if (statusFilter.size > 0)
      result = result.filter(t => statusFilter.has(t.status))

    // فلتر الأولوية
    if (priorityF)
      result = result.filter(t => t.priority === priorityF)

    // فلتر النطاق الزمني
    if (fromDate && toDate) {
      const from = new Date(fromDate).getTime()
      const to   = new Date(toDate).getTime() + 86399999
      result = result.filter(t => {
        if (!t.start_date && !t.end_date) return false
        const tS = t.start_date ? new Date(t.start_date).getTime() : from
        const tE = t.end_date   ? new Date(t.end_date).getTime()   : to
        return tS <= to && tE >= from
      })
    }

    return result
  }, [tasks, fromDate, toDate, statusFilter, priorityF])

  /* ════ نطاق التواريخ ════ */
  const { rangeStart, totalDays } = useMemo(() => {
    // إذا اختار المستخدم نطاقاً محدداً
    if (fromDate && toDate) {
      const s = new Date(fromDate)
      const e = new Date(toDate)
      // padding يوم واحد من كل جهة
      s.setDate(s.getDate() - 1)
      e.setDate(e.getDate() + 1)
      return {
        rangeStart: s,
        totalDays:  Math.max(7, Math.ceil((e.getTime() - s.getTime()) / 86400000)),
      }
    }

    const dates = tasks
      .flatMap(t => [t.start_date, t.end_date].filter(Boolean))
      .map(d => new Date(d).getTime())

    let min = dates.length ? Math.min(...dates) : today.getTime()
    let max = dates.length ? Math.max(...dates) : today.getTime() + 86400000 * 180

    // padding شهر من كل جهة
    const s = new Date(min); s.setMonth(s.getMonth() - 1); s.setDate(1)
    const e = new Date(max); e.setMonth(e.getMonth() + 2); e.setDate(0)

    return {
      rangeStart: s,
      totalDays:  Math.max(60, Math.ceil((e.getTime() - s.getTime()) / 86400000)),
    }
  }, [tasks, today, fromDate, toDate])

  const totalWidth = totalDays * dayW

  /* ════ تاريخ → X ════ */
  const dateToX = useCallback((d: string | Date): number => {
    const ms = (typeof d === 'string' ? new Date(d) : d).getTime()
    return Math.round((ms - rangeStart.getTime()) / 86400000) * dayW
  }, [rangeStart, dayW])

  /* ════ رؤوس الأشهر ════ */
  const monthHeaders = useMemo(() => {
    const out: { label: string; x: number; width: number }[] = []
    const cur = new Date(rangeStart); cur.setDate(1)
    const limit = rangeStart.getTime() + totalDays * 86400000

    while (cur.getTime() < limit) {
      const x    = dateToX(cur)
      const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
      const endX = Math.min(dateToX(next), totalWidth)
      out.push({ label: `${MONTHS_AR[cur.getMonth()]} ${cur.getFullYear()}`, x, width: endX - x })
      cur.setMonth(cur.getMonth() + 1)
    }
    return out
  }, [rangeStart, totalDays, dateToX, totalWidth])

  /* ════ toggle طي/فتح العقد ════ */
  const toggle = useCallback((nodeId: string) => {
    setCollapsed(prev => {
      const s = new Set(prev)
      s.has(nodeId) ? s.delete(nodeId) : s.add(nodeId)
      return s
    })
  }, [])

  /* ════ بناء صفوف الشجرة ════ */
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = []
    const visPlans = (!planFilter || planFilter === 'all') ? plans : plans.filter(p => p.id === planFilter)

    for (const plan of visPlans) {
      const planNodes = nodes.filter(n => n.plan_id === plan.id)
      const topNodes  = planNodes
        .filter(n => !n.parent_id || n.level_num === 1)
        .sort((a: any, b: any) => a.order_num - b.order_num)

      if (topNodes.length === 0) continue
      out.push({ id: `p-${plan.id}`, type: 'plan', label: plan.name_ar, depth: 0, planId: plan.id })

      const addNode = (node: any, depth: number) => {
        out.push({ id: `n-${node.id}`, type: 'node', label: node.name_ar, depth, nodeId: node.id })
        if (collapsed.has(node.id)) return

        planNodes
          .filter((n: any) => n.parent_id === node.id)
          .sort((a: any, b: any) => a.order_num - b.order_num)
          .forEach((child: any) => addNode(child, depth + 1))

        rangeFilteredTasks
          .filter(t => t.node_id === node.id)
          .forEach(task => out.push({ id: `t-${task.id}`, type: 'task', label: task.name_ar, depth: depth + 1, task }))
      }
      topNodes.forEach((n: any) => addNode(n, 1))
    }
    return out
  }, [plans, nodes, rangeFilteredTasks, planFilter, collapsed])

  /* ════ sync scroll عمودي ════ */
  const onTimelineScroll = () => {
    if (leftRef.current && timelineRef.current)
      leftRef.current.scrollTop = timelineRef.current.scrollTop
  }

  const todayX = dateToX(today)

  /* ════ حساب تبعيات للرسم ════ */
  const dependencies = useMemo(() => {
    return rows.flatMap((row, ri) => {
      if (row.type !== 'task' || !row.task?.depends_on_task_id) return []
      if (!row.task.start_date) return []
      const depIdx = rows.findIndex(r => r.task?.id === row.task.depends_on_task_id)
      if (depIdx === -1) return []
      const depTask = rows[depIdx].task
      if (!depTask?.end_date) return []
      return [{ fromRow: depIdx, toRow: ri, fromTask: depTask, toTask: row.task }]
    })
  }, [rows])

  const noDateCount = (fromDate && toDate ? tasks : rangeFilteredTasks)
    .filter(t => !t.start_date && !t.end_date).length

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" dir="ltr">

      {/* ════ شريط التحكم — الصف الأول ════ */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-wrap gap-2" dir="rtl">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-slate-700 text-sm">📅 مخطط جانت</span>
          {/* مستوى التكبير */}
          <div className="flex bg-slate-100 rounded-xl p-0.5">
            {(Object.keys(ZOOM) as ZoomLevel[]).map(z => (
              <button key={z} onClick={() => setZoom(z)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  zoom === z
                    ? 'bg-white text-violet-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}>
                {ZOOM[z].label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* فلتر الحالة — أزرار قابلة للنقر */}
          {Object.entries(STATUS_COLOR).map(([k, c]) => {
            const active = statusFilter.has(k)
            return (
              <button key={k}
                onClick={() => {
                  setStatusFilter(prev => {
                    const s = new Set(prev)
                    s.has(k) ? s.delete(k) : s.add(k)
                    return s
                  })
                }}
                title={active ? `إلغاء فلتر: ${STATUS_AR[k]}` : `فلتر: ${STATUS_AR[k]}`}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-medium border transition-all ${
                  active
                    ? 'text-white shadow-sm scale-105'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                }`}
                style={active ? { backgroundColor: c, borderColor: c } : {}}>
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ background: active ? 'rgba(255,255,255,0.5)' : c }} />
                {STATUS_AR[k]}
              </button>
            )
          })}

          {/* فاصل */}
          <span className="text-slate-300 text-xs">|</span>

          {/* فلتر الأولوية */}
          <select value={priorityF} onChange={e => setPriorityF(e.target.value)}
            className="px-2.5 py-1 rounded-xl border border-slate-200 bg-white text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-400">
            <option value="">كل الأولويات</option>
            <option value="high">🔴 عالية</option>
            <option value="medium">🟡 متوسطة</option>
            <option value="low">🟢 منخفضة</option>
          </select>

          {/* مسح فلاتر الحالة/الأولوية */}
          {(statusFilter.size > 0 || priorityF) && (
            <button
              onClick={() => { setStatusFilter(new Set()); setPriorityF('') }}
              className="px-2.5 py-1 rounded-xl text-[11px] font-medium border bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 transition-all">
              ✕ مسح
            </button>
          )}

          {/* فاصل */}
          <span className="text-slate-300 text-xs">|</span>

          {/* زر اليوم */}
          <button
            onClick={() => {
              if (timelineRef.current) timelineRef.current.scrollLeft = Math.max(0, todayX - 300)
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 text-red-600 text-xs font-semibold border border-red-200 hover:bg-red-100 transition-colors">
            📍 اليوم
          </button>
        </div>
      </div>

      {/* ════ شريط التحكم — الصف الثاني: فلتر التاريخ ════ */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex-wrap" dir="rtl">
        {/* اختصارات سريعة */}
        <span className="text-xs font-semibold text-slate-500 flex-shrink-0">📆 الفترة:</span>
        <button onClick={setThisWeek}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
            fromDate && toDate ? 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'
                               : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'
          }`}>
          هذا الأسبوع
        </button>
        <button onClick={setNextWeek}
          className="px-3 py-1.5 rounded-xl text-xs font-medium border bg-white text-slate-600 border-slate-200 hover:border-violet-300 transition-all">
          الأسبوع القادم
        </button>
        <button onClick={setThisMonth}
          className="px-3 py-1.5 rounded-xl text-xs font-medium border bg-white text-slate-600 border-slate-200 hover:border-violet-300 transition-all">
          هذا الشهر
        </button>

        {/* فاصل */}
        <span className="text-slate-300 text-xs">|</span>

        {/* منتقي تاريخ البداية */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-500 flex-shrink-0">من:</span>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="px-2 py-1 rounded-lg border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
            style={{ direction: 'ltr' }} />
        </div>

        {/* منتقي تاريخ النهاية */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-500 flex-shrink-0">إلى:</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="px-2 py-1 rounded-lg border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
            style={{ direction: 'ltr' }} />
        </div>

        {/* زر مسح الفلتر */}
        {(fromDate || toDate) && (
          <button onClick={clearRange}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium bg-violet-600 text-white border border-violet-600 hover:bg-violet-700 transition-all">
            ✕ مسح الفترة
          </button>
        )}

        {/* عدد المهام في الفترة */}
        {fromDate && toDate && (
          <span className="text-xs text-violet-600 font-semibold mr-auto">
            {rangeFilteredTasks.length} مهمة في هذه الفترة
          </span>
        )}
      </div>

      {/* ════ الجسم الرئيسي ════ */}
      <div className="flex" style={{ maxHeight: '72vh' }}>

        {/* ═══ اللوحة اليسرى (ثابتة عند الاسكرول الأفقي) ═══ */}
        <div className="flex-shrink-0 bg-white z-10 border-r border-slate-200 flex flex-col"
          style={{ width: LEFT_W }}>
          {/* رأس */}
          <div className="flex-shrink-0 flex items-center px-4 bg-slate-50 border-b border-slate-200"
            style={{ height: HDR_H }}>
            <span className="text-xs font-semibold text-slate-500" dir="rtl">المهمة / المستوى</span>
          </div>
          {/* صفوف الأسماء */}
          <div ref={leftRef} className="overflow-y-hidden flex-1" style={{ overflowX: 'hidden' }}>
            {rows.map(row => (
              <LeftCell key={row.id} row={row} collapsed={collapsed} onToggle={toggle} />
            ))}
          </div>
        </div>

        {/* ═══ منطقة التايم لاين ═══ */}
        <div ref={timelineRef}
          className="flex-1 overflow-auto"
          onScroll={onTimelineScroll}>
          <div style={{ width: Math.max(totalWidth, 600), minWidth: '100%', position: 'relative' }}>

            {/* رأس الأشهر */}
            <div className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200"
              style={{ height: HDR_H, position: 'sticky' }}>
              <div className="relative h-full">
                {monthHeaders.map((m, i) => (
                  <div key={i}
                    className="absolute top-0 bottom-0 border-r border-slate-200 flex items-center px-2"
                    style={{ left: m.x, width: m.width }}>
                    <span className="text-xs font-semibold text-slate-600 truncate">{m.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* الشبكة + الأشرطة */}
            <div className="relative" style={{ height: rows.length * ROW_H }}>

              {/* خطوط الشبكة الشهرية */}
              {monthHeaders.map((m, i) => (
                <div key={i} className="absolute top-0 bottom-0 border-r border-slate-100"
                  style={{ left: m.x + m.width }} />
              ))}

              {/* تظليل الصفوف المتناوبة */}
              {rows.map((_, i) => i % 2 === 1 ? (
                <div key={i} className="absolute left-0 right-0 bg-slate-50/60"
                  style={{ top: i * ROW_H, height: ROW_H }} />
              ) : null)}

              {/* خط اليوم */}
              {todayX >= 0 && todayX <= totalWidth && (
                <div className="absolute top-0 bottom-0 z-10 pointer-events-none"
                  style={{ left: todayX - 1, width: 2, background: 'rgba(239,68,68,0.6)' }}>
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-b-lg whitespace-nowrap">
                    اليوم
                  </div>
                </div>
              )}

              {/* SVG: أسهم التبعية */}
              <svg
                className="absolute inset-0 pointer-events-none z-20"
                style={{ width: Math.max(totalWidth, 600), height: rows.length * ROW_H }}>
                {dependencies.map((dep, i) => {
                  const x1 = dateToX(dep.fromTask.end_date) + dayW
                  const y1 = dep.fromRow * ROW_H + ROW_H / 2
                  const x2 = dateToX(dep.toTask.start_date) - 2
                  const y2 = dep.toRow   * ROW_H + ROW_H / 2
                  const mx = x1 + (x2 - x1) * 0.5
                  return (
                    <g key={i}>
                      <path
                        d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                        fill="none" stroke="#a78bfa" strokeWidth="1.5"
                        strokeDasharray="5,3" opacity="0.75"
                      />
                      <polygon
                        points={`${x2},${y2} ${x2-7},${y2-3.5} ${x2-7},${y2+3.5}`}
                        fill="#a78bfa" opacity="0.75"
                      />
                    </g>
                  )
                })}
              </svg>

              {/* أشرطة المهام */}
              {rows.map((row, i) => (
                <TaskBar key={row.id} row={row} rowIndex={i}
                  dateToX={dateToX} dayW={dayW} today={today} tasks={tasks} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ════ تنبيه المهام بدون تواريخ ════ */}
      {noDateCount > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border-t border-amber-100 text-xs text-amber-700" dir="rtl">
          <span>⚠️</span>
          <span>
            <strong>{noDateCount}</strong> مهمة بدون تواريخ لا تظهر على المخطط —
            أضف تاريخ بدء وانتهاء من صفحة تفاصيل المهمة
          </span>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════
   خلية اللوحة اليسرى
══════════════════════════════════════════ */
function LeftCell({ row, collapsed, onToggle }: {
  row:       Row
  collapsed: Set<string>
  onToggle:  (id: string) => void
}) {
  const isCollapsed = row.nodeId ? collapsed.has(row.nodeId) : false
  const indent      = row.depth * 14

  const bg =
    row.type === 'plan' ? 'bg-violet-50 border-b border-violet-100' :
    row.type === 'node' ? 'hover:bg-slate-50 cursor-pointer' :
                          'hover:bg-slate-50'

  return (
    <div
      className={`flex items-center gap-1.5 border-b border-slate-50 pr-2 pl-2 ${bg}`}
      style={{ height: ROW_H, paddingRight: `${indent + 8}px` }}
      dir="rtl"
      onClick={() => row.type === 'node' && row.nodeId && onToggle(row.nodeId)}>

      {/* أيقونة التوسيع/الطي */}
      {row.type === 'node' && (
        <span className={`text-[9px] text-slate-400 transition-transform duration-150 flex-shrink-0 ${
          isCollapsed ? '' : 'rotate-90'
        }`}>▶</span>
      )}

      {/* أيقونة المهمة */}
      {row.type === 'task' && row.task && (
        <span className="text-[11px] flex-shrink-0">
          {STATUS_ICON[row.task.status] || '📌'}
        </span>
      )}

      {/* أيقونة الخطة */}
      {row.type === 'plan' && (
        <span className="text-xs flex-shrink-0">🗺️</span>
      )}

      {/* النص */}
      <span className={`truncate text-xs leading-snug flex-1 min-w-0 ${
        row.type === 'plan' ? 'font-bold text-violet-800' :
        row.type === 'node' ? 'font-semibold text-slate-700' :
                              'text-slate-600'
      }`}>
        {row.label}
      </span>

      {/* رابط المهمة */}
      {row.type === 'task' && row.task && (
        <a
          href={`/dashboard/tasks/${row.task.id}`}
          onClick={e => e.stopPropagation()}
          title="فتح المهمة"
          className="flex-shrink-0 text-slate-300 hover:text-violet-500 transition-colors text-[11px]">
          ↗
        </a>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════
   شريط المهمة على التايم لاين
══════════════════════════════════════════ */
function TaskBar({ row, rowIndex, dateToX, dayW, today, tasks }: {
  row:      Row
  rowIndex: number
  dateToX:  (d: string | Date) => number
  dayW:     number
  today:    Date
  tasks:    any[]
}) {
  if (row.type !== 'task' || !row.task) return null
  const task = row.task

  // مهمة بدون تواريخ
  if (!task.start_date && !task.end_date) return null

  const startD  = task.start_date ? new Date(task.start_date) : today
  const endD    = task.end_date   ? new Date(task.end_date)   : today
  const x       = dateToX(startD)
  const barW    = Math.max(dayW * 1.5, dateToX(endD) - x + dayW)
  const color   = STATUS_COLOR[task.status] || '#94a3b8'

  const isOverdue = task.end_date && task.status !== 'completed' && endD < today
  const depTask   = task.depends_on_task_id
    ? tasks.find((t: any) => t.id === task.depends_on_task_id) : null
  const isBlocked = depTask && depTask.status !== 'completed'

  // نسبة الإنجاز (للمهام الجارية فقط)
  let progressPct = 0
  if (task.status === 'completed') progressPct = 100
  else if (task.status === 'in_progress' && task.start_date && task.end_date) {
    const total   = endD.getTime()   - startD.getTime()
    const elapsed = today.getTime()  - startD.getTime()
    progressPct   = total > 0 ? Math.min(100, Math.max(0, Math.round(elapsed / total * 100))) : 0
  }

  return (
    <a
      href={`/dashboard/tasks/${task.id}`}
      className="absolute flex items-center rounded-lg overflow-hidden transition-all
        hover:brightness-110 hover:shadow-lg hover:z-30 group"
      style={{
        top:    rowIndex * ROW_H + Math.round((ROW_H - 26) / 2),
        left:   x,
        width:  barW,
        height: 26,
        backgroundColor: isBlocked ? '#fdba74' : color,
        border: isOverdue ? '2px solid #dc2626' : '2px solid transparent',
        zIndex: 5,
      }}
      title={`${task.name_ar} | ${STATUS_AR[task.status]}${isBlocked ? ' | 🔒 محجوبة' : ''}${isOverdue ? ' | ⚠️ متأخرة' : ''}`}>

      {/* شريط التقدم الداخلي */}
      {progressPct > 0 && progressPct < 100 && (
        <div
          className="absolute top-0 bottom-0 right-0 bg-white/25"
          style={{ width: `${100 - progressPct}%` }}
        />
      )}

      {/* نص الشريط */}
      {barW > 55 && (
        <span className="relative z-10 text-white text-[10px] font-semibold px-2 truncate">
          {isBlocked ? '🔒 ' : ''}{task.name_ar}
        </span>
      )}
      {barW <= 55 && isBlocked && (
        <span className="relative z-10 text-white text-[10px] px-1">🔒</span>
      )}
    </a>
  )
}

'use client'

/**
 * مكوّنات Loading Skeletons
 * بديل احترافي لـ spinner — بطاقات رمادية متحركة أثناء التحميل
 */

/* ── عنصر وميض مشترك ── */
function Pulse({ className }: { className: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded-lg ${className}`} />
}

/* ── سطر نص ── */
export function SkeletonLine({ w = 'w-full', h = 'h-3.5' }: { w?: string; h?: string }) {
  return <Pulse className={`${w} ${h}`} />
}

/* ── صف جدول ── */
export function SkeletonRow({ cols = 4 }: { cols?: number }) {
  const widths = ['w-2/5', 'w-1/4', 'w-1/6', 'w-1/5', 'w-1/3', 'w-1/4']
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-50">
      <div className="w-8 h-8 bg-slate-200 rounded-full animate-pulse flex-shrink-0" />
      <div className="flex-1 flex items-center gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Pulse key={i} className={`h-3 ${widths[i % widths.length]}`} />
        ))}
      </div>
    </div>
  )
}

/* ── جدول كامل ── */
export function SkeletonTable({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* رأس الجدول */}
      <div className="flex items-center gap-4 px-4 py-3 bg-slate-50 border-b border-slate-100">
        {Array.from({ length: cols }).map((_, i) => (
          <Pulse key={i} className="h-3 w-20" />
        ))}
      </div>
      {/* الصفوف */}
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} cols={cols} />
      ))}
    </div>
  )
}

/* ── بطاقة إحصاء ── */
export function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 animate-pulse">
      <div className="flex items-center justify-between">
        <Pulse className="h-4 w-24" />
        <div className="w-9 h-9 bg-slate-200 rounded-xl" />
      </div>
      <Pulse className="h-8 w-16" />
      <Pulse className="h-3 w-32" />
    </div>
  )
}

/* ── شبكة بطاقات إحصاء ── */
export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-${Math.min(count, 4)} gap-3`}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

/* ── شريط تقدم ── */
export function SkeletonProgress() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 animate-pulse">
      <div className="flex items-center justify-between">
        <Pulse className="h-4 w-36" />
        <Pulse className="h-6 w-16" />
      </div>
      <div className="h-5 bg-slate-200 rounded-full w-full" />
      <div className="flex justify-between">
        {Array.from({ length: 4 }).map((_, i) => (
          <Pulse key={i} className="h-3 w-16" />
        ))}
      </div>
    </div>
  )
}

/* ── صفحة تحميل لوحة التحكم ── */
export function SkeletonDashboard() {
  return (
    <div className="space-y-5">
      <SkeletonCards count={4} />
      <SkeletonProgress />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 h-48 animate-pulse">
          <Pulse className="h-4 w-32 mb-4" />
          <div className="flex items-end gap-3 h-28">
            {[6, 8, 5, 9, 7, 4, 10].map((h, i) => (
              <div key={i} className="bg-slate-200 rounded-t-lg flex-1" style={{ height: `${h * 10}%` }} />
            ))}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 h-48 animate-pulse">
          <Pulse className="h-4 w-32 mb-4" />
          <div className="flex items-center justify-center h-32">
            <div className="w-28 h-28 rounded-full border-[12px] border-slate-200" />
          </div>
        </div>
      </div>
      <SkeletonTable rows={5} />
    </div>
  )
}

/* ── صفحة تحميل المهام ── */
export function SkeletonTaskList() {
  return (
    <div className="space-y-4">
      {/* فلاتر */}
      <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3 animate-pulse">
        <div className="w-32 h-8 bg-slate-200 rounded-xl" />
        <div className="w-24 h-8 bg-slate-200 rounded-xl" />
        <div className="w-24 h-8 bg-slate-200 rounded-xl" />
        <div className="flex-1 h-8 bg-slate-200 rounded-xl" />
      </div>
      <SkeletonTable rows={8} cols={5} />
    </div>
  )
}

'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/components/Toast'

/* ══════════════════ ثوابت ══════════════════ */
export const KANBAN_COLUMNS = [
  { value: 'not_started', label: 'لم تبدأ',  icon: '⏳', color: 'slate',  hex: '#94a3b8',
    bg: 'bg-slate-50', border: 'border-slate-200', header: 'bg-slate-100 text-slate-700',
    badge: 'bg-slate-200 text-slate-700', ring: 'ring-slate-300' },
  { value: 'in_progress', label: 'جارية',    icon: '🔄', color: 'blue',   hex: '#3b82f6',
    bg: 'bg-blue-50',  border: 'border-blue-200',  header: 'bg-blue-100  text-blue-700',
    badge: 'bg-blue-200  text-blue-700',  ring: 'ring-blue-300'  },
  { value: 'submitted',   label: 'مرفوعة للتقييم', icon: '📤', color: 'amber', hex: '#f59e0b',
    bg: 'bg-amber-50', border: 'border-amber-200', header: 'bg-amber-100 text-amber-700',
    badge: 'bg-amber-200 text-amber-700', ring: 'ring-amber-300' },
  { value: 'returned',    label: 'مُعادة للتعديل', icon: '↩️', color: 'orange', hex: '#ea580c',
    bg: 'bg-orange-50', border: 'border-orange-200', header: 'bg-orange-100 text-orange-700',
    badge: 'bg-orange-200 text-orange-700', ring: 'ring-orange-300' },
  { value: 'completed',   label: 'منجزة',    icon: '✅', color: 'green',  hex: '#22c55e',
    bg: 'bg-green-50', border: 'border-green-200', header: 'bg-green-100 text-green-700',
    badge: 'bg-green-200 text-green-700', ring: 'ring-green-300' },
]

const PRIORITY_ICON: Record<string, string> = { high: '🔴', medium: '🟡', low: '🟢' }
const PRIORITY_LABEL: Record<string, string> = { high: 'عالية', medium: 'متوسطة', low: 'منخفضة' }

/* ══════════════════ بطاقة المهمة (قابلة للسحب) ══════════════════ */
function KanbanCard({
  task, profiles, nodeMap, allTasks, isDraggingId,
}: {
  task:          any
  profiles:      any[]
  nodeMap:       Record<string, any>
  allTasks:      any[]
  isDraggingId:  string | null
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { status: task.status },
  })

  const assignee    = task.assigned_to_user_id
    ? profiles.find(p => p.id === task.assigned_to_user_id) : null
  const node        = task.node_id ? nodeMap[task.node_id] : null
  const depTask     = task.depends_on_task_id
    ? allTasks.find(t => t.id === task.depends_on_task_id) : null
  const isBlocked   = depTask && depTask.status !== 'completed'
  const isOverdue   = task.end_date && task.status !== 'completed'
    && new Date(task.end_date) < new Date()

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  if (isDragging) {
    return (
      <div ref={setNodeRef} style={style}
        className="h-2 rounded-xl bg-violet-200 opacity-50 mx-0.5 mb-2" />
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-2xl border shadow-sm mb-2 group
        transition-all duration-150 select-none
        ${isBlocked ? 'border-orange-200 bg-orange-50/40' : 'border-slate-200'}
        ${isDraggingId === task.id ? 'opacity-40' : 'hover:shadow-md hover:border-violet-300'}
      `}
    >
      {/* شريط علوي ملوّن حسب الأولوية */}
      <div className={`h-1 rounded-t-2xl ${
        task.priority === 'high'   ? 'bg-red-400'   :
        task.priority === 'medium' ? 'bg-amber-400' : 'bg-slate-200'
      }`} />

      <div className="px-3 pt-2.5 pb-3">

        {/* رأس البطاقة: حالة الحجب + مقبض السحب */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
            {isBlocked && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 font-semibold flex-shrink-0 border border-orange-200">
                🔒 محجوبة
              </span>
            )}
            {isOverdue && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold flex-shrink-0 border border-red-200">
                ⚠️ متأخرة
              </span>
            )}
          </div>
          {/* مقبض السحب */}
          <div
            {...listeners}
            {...attributes}
            className="flex-shrink-0 cursor-grab active:cursor-grabbing p-1 rounded-lg
              text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors"
            title="اسحب لتغيير الحالة"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="5" cy="4" r="1.5" /><circle cx="11" cy="4" r="1.5" />
              <circle cx="5" cy="8" r="1.5" /><circle cx="11" cy="8" r="1.5" />
              <circle cx="5" cy="12" r="1.5" /><circle cx="11" cy="12" r="1.5" />
            </svg>
          </div>
        </div>

        {/* اسم المهمة */}
        <a
          href={`/dashboard/tasks/${task.id}`}
          className="block text-sm font-semibold text-slate-800 hover:text-violet-700
            transition-colors leading-snug mb-1.5 line-clamp-2"
          onClick={e => e.stopPropagation()}
        >
          {task.name_ar}
        </a>

        {/* مسار العقدة */}
        {node && (
          <p className="text-[10px] text-slate-400 truncate mb-2">
            📂 {node.name_ar}
          </p>
        )}

        {/* ذيل البطاقة */}
        <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100">
          {/* المكلَّف */}
          {assignee ? (
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-5 h-5 rounded-full bg-violet-100 text-violet-700
                flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                {assignee.name_ar?.[0]}
              </div>
              <span className="text-[10px] text-slate-500 truncate">{assignee.name_ar}</span>
            </div>
          ) : (
            <span className="text-[10px] text-slate-300">غير مكلَّف</span>
          )}

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* الأولوية */}
            <span title={PRIORITY_LABEL[task.priority]} className="text-xs">
              {PRIORITY_ICON[task.priority]}
            </span>
            {/* الموعد */}
            {task.end_date && (
              <span className={`text-[10px] font-medium ${isOverdue ? 'text-red-500' : 'text-slate-400'}`}>
                {new Date(task.end_date).toLocaleDateString('ar-QA', { day: 'numeric', month: 'short' })}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════ نسخة الـ overlay أثناء السحب ══════════════════ */
function DragCard({ task, profiles, nodeMap }: { task: any; profiles: any[]; nodeMap: Record<string, any> }) {
  const assignee = task.assigned_to_user_id
    ? profiles.find(p => p.id === task.assigned_to_user_id) : null
  const node = task.node_id ? nodeMap[task.node_id] : null

  return (
    <div className="bg-white rounded-2xl border-2 border-violet-400 shadow-2xl w-64 rotate-2 opacity-95">
      <div className={`h-1 rounded-t-2xl ${
        task.priority === 'high'   ? 'bg-red-400' :
        task.priority === 'medium' ? 'bg-amber-400' : 'bg-slate-200'
      }`} />
      <div className="px-3 pt-2.5 pb-3">
        <p className="text-sm font-semibold text-slate-800 line-clamp-2 mb-1">{task.name_ar}</p>
        {node && <p className="text-[10px] text-slate-400 truncate">📂 {node.name_ar}</p>}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
          {assignee ? (
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-violet-100 text-violet-700
                flex items-center justify-center text-[9px] font-bold">
                {assignee.name_ar?.[0]}
              </div>
              <span className="text-[10px] text-slate-500">{assignee.name_ar}</span>
            </div>
          ) : <span />}
          <span className="text-xs">{PRIORITY_ICON[task.priority]}</span>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════ عمود الكانبان ══════════════════ */
function KanbanColumn({
  col, tasks, profiles, nodeMap, allTasks, isDraggingId, canManage, onQuickAdd,
}: {
  col:          typeof KANBAN_COLUMNS[0]
  tasks:        any[]
  profiles:     any[]
  nodeMap:      Record<string, any>
  allTasks:     any[]
  isDraggingId: string | null
  canManage:    boolean
  onQuickAdd:   (status: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.value })

  return (
    <div className="flex flex-col min-w-[260px] flex-1 max-w-xs">
      {/* رأس العمود */}
      <div className={`flex items-center justify-between px-3 py-2.5 rounded-2xl mb-3 ${col.header}`}>
        <div className="flex items-center gap-2">
          <span>{col.icon}</span>
          <span className="font-bold text-sm">{col.label}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${col.badge}`}>
            {tasks.length}
          </span>
        </div>
        {canManage && (
          <button
            onClick={() => onQuickAdd(col.value)}
            title="إضافة مهمة"
            className="w-6 h-6 flex items-center justify-center rounded-lg
              bg-white/60 hover:bg-white text-current opacity-60 hover:opacity-100
              transition-all text-sm font-bold">
            +
          </button>
        )}
      </div>

      {/* منطقة الإفلات */}
      <div
        ref={setNodeRef}
        className={`flex-1 rounded-2xl p-2 min-h-[200px] transition-all duration-150 border-2 border-dashed
          ${isOver
            ? `${col.bg} border-current ring-2 ${col.ring} scale-[1.01]`
            : 'border-transparent bg-slate-50/50'}
        `}
      >
        {tasks.length === 0 ? (
          <div className={`flex flex-col items-center justify-center h-24 text-xs
            rounded-xl transition-colors ${isOver ? 'text-slate-600' : 'text-slate-300'}`}>
            <span className="text-2xl mb-1">{isOver ? col.icon : '+'}</span>
            <span>{isOver ? `إفلات هنا` : 'لا توجد مهام'}</span>
          </div>
        ) : (
          tasks.map(task => (
            <KanbanCard
              key={task.id}
              task={task}
              profiles={profiles}
              nodeMap={nodeMap}
              allTasks={allTasks}
              isDraggingId={isDraggingId}
            />
          ))
        )}
      </div>
    </div>
  )
}

/* ══════════════════ لوحة الكانبان الرئيسية ══════════════════ */
export default function KanbanBoard({
  tasks: initialTasks,
  profiles,
  nodeMap,
  canManage,
  planFilter,
}: {
  tasks:      any[]
  profiles:   any[]
  nodeMap:    Record<string, any>
  canManage:  boolean
  planFilter: string
}) {
  const supabase = createClient()
  const [tasks, setTasks]           = useState(initialTasks)
  const [activeId, setActiveId]     = useState<string | null>(null)
  const [saving, setSaving]         = useState(false)
  const [lastSaved, setLastSaved]   = useState<string | null>(null)
  const [saveError, setSaveError]   = useState<string | null>(null)

  /* مزامنة المهام فقط عند تغيير الفلتر (تغيّر قائمة المعرّفات) — لا نلمس الحالة المحلية */
  const prevIdsRef = useRef<string>('')
  useEffect(() => {
    const ids = initialTasks.map(t => t.id).sort().join(',')
    if (ids !== prevIdsRef.current) {
      prevIdsRef.current = ids
      setTasks(initialTasks)
    }
  }, [initialTasks])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  )

  const activeTask = activeId ? tasks.find(t => t.id === activeId) : null

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    setActiveId(active.id as string)
  }, [])

  const handleDragEnd = useCallback(async ({ active, over }: DragEndEvent) => {
    setActiveId(null)
    if (!over) return

    const taskId    = active.id as string
    const overId    = over.id as string

    // تحديد العمود المستهدف
    const isColumn  = KANBAN_COLUMNS.some(c => c.value === overId)
    const newStatus = isColumn
      ? overId
      : tasks.find(t => t.id === overId)?.status

    if (!newStatus) return
    const task = tasks.find(t => t.id === taskId)
    if (!task || task.status === newStatus) return
    const from = task.status

    /* السحب يمرّ عبر آلة الحالات (لا تغيير مباشر) — النقلات البسيطة تتم هنا */
    let action: string | null = null
    if (newStatus === 'in_progress') {
      if (from === 'not_started' || from === 'returned') action = 'start'
      else if (from === 'completed') action = 'reopen'
    } else if (newStatus === 'submitted') {
      if (['not_started', 'in_progress', 'returned'].includes(from)) action = 'submit'
    }

    /* نقلات تتطلب إدخالاً (تقييم/سبب) → تفتح المهمة عند المكان الصحيح بدل الفشل الصامت */
    if (newStatus === 'completed' && from === 'submitted') {
      toast('للاعتماد: افتح المهمة وأدخل التقييم', 'info')
      window.location.href = `/dashboard/tasks/${taskId}#rating`
      return
    }
    if (newStatus === 'returned' && from === 'submitted') {
      toast('للإعادة: افتح المهمة واكتب سبب الإعادة', 'info')
      window.location.href = `/dashboard/tasks/${taskId}#rating`
      return
    }

    if (!action) {
      setSaveError('نقلة غير مسموحة في سير العمل — افتح المهمة لاتباع الخطوات')
      setTimeout(() => setSaveError(null), 4000)
      return
    }

    /* تحديث تفاؤلي ثم استدعاء آلة الحالات (تحترم الصلاحيات + البوّابات + تسجّل التحوّل) */
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
    setSaving(true); setSaveError(null)
    try {
      const res = await fetch(`/api/tasks/${taskId}/transition`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const j = await res.json().catch(() => ({}))
      setSaving(false)
      if (!res.ok) {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: from } : t))
        setSaveError(j.error || 'تعذّر تغيير الحالة')
        setTimeout(() => setSaveError(null), 4500)
        return
      }
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: j.status || newStatus } : t))
      setLastSaved(taskId)
      setTimeout(() => setLastSaved(null), 2000)
    } catch {
      setSaving(false)
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: from } : t))
      setSaveError('تعذّر الاتصال بالخادم')
      setTimeout(() => setSaveError(null), 4500)
    }
  }, [tasks])

  const handleQuickAdd = (status: string) => {
    const params = new URLSearchParams({ defaultStatus: status })
    window.location.href = `/dashboard/tasks/new?${params}`
  }

  return (
    <div className="relative">
      {/* شريط الحفظ / الخطأ */}
      <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        saving || lastSaved || saveError ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}>
        {saveError ? (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl shadow-lg text-sm font-medium text-white bg-red-600 max-w-sm">
            <span>❌</span>
            <span>فشل التحديث: {saveError}</span>
          </div>
        ) : (
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full shadow-lg text-sm font-medium text-white ${
            saving ? 'bg-violet-600' : 'bg-green-600'
          }`}>
            {saving
              ? <><span className="animate-spin">⏳</span> جارٍ الحفظ...</>
              : <><span>✅</span> تم تحديث الحالة</>
            }
          </div>
        )}
      </div>

      {/* اللوحة */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-4" dir="rtl">
          {KANBAN_COLUMNS.map(col => (
            <KanbanColumn
              key={col.value}
              col={col}
              tasks={tasks.filter(t => t.status === col.value)}
              profiles={profiles}
              nodeMap={nodeMap}
              allTasks={tasks}
              isDraggingId={activeId}
              canManage={canManage}
              onQuickAdd={handleQuickAdd}
            />
          ))}
        </div>

        {/* الكارت الطائر أثناء السحب */}
        <DragOverlay dropAnimation={{ duration: 200, easing: 'ease' }}>
          {activeTask ? (
            <DragCard task={activeTask} profiles={profiles} nodeMap={nodeMap} />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* إحصائيات */}
      <div className="flex items-center gap-4 mt-2 text-xs text-slate-400 flex-wrap" dir="rtl">
        <span>إجمالي: <strong className="text-slate-600">{tasks.length}</strong> مهمة</span>
        {KANBAN_COLUMNS.map(col => {
          const cnt = tasks.filter(t => t.status === col.value).length
          if (cnt === 0) return null
          return (
            <span key={col.value}>
              {col.icon} {col.label}: <strong className="text-slate-600">{cnt}</strong>
            </span>
          )
        })}
      </div>
    </div>
  )
}

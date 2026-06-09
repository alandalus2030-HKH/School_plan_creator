/**
 * ثوابت المهام المركزية — مرجع واحد لكل التطبيق
 * استيراد: import { STATUS_META, RATING_META, PRIORITY_META, TYPE_META } from '@/lib/constants/tasks'
 */

/* ════════════════════════════════════════════════════════
   حالات المهام
   يستخدم متغيرات CSS المعرَّفة في globals.css
════════════════════════════════════════════════════════ */
export const STATUS_META: Record<string, {
  ar: string; bg: string; fg: string; hex: string
  light: string; text: string; tailwindBorder: string
}> = {
  not_started: {
    ar:           'لم تبدأ',
    bg:           'var(--status-todo-bg)',
    fg:           'var(--status-todo-fg)',
    hex:          '#94a3b8',
    // aliases للتوافق مع الكود القديم
    light:        'bg-slate-100',
    text:         'text-slate-600',
    tailwindBorder: 'border-slate-200',
  },
  in_progress: {
    ar:           'جارية',
    bg:           'var(--status-doing-bg)',
    fg:           'var(--status-doing-fg)',
    hex:          '#8a1538',
    light:        'bg-violet-100',
    text:         'text-violet-700',
    tailwindBorder: 'border-violet-200',
  },
  submitted: {
    ar:           'مرفوعة للتقييم',
    bg:           '#fef3c7',
    fg:           '#b45309',
    hex:          '#f59e0b',
    light:        'bg-amber-100',
    text:         'text-amber-700',
    tailwindBorder: 'border-amber-200',
  },
  returned: {
    ar:           'مُعادة للتعديل',
    bg:           '#ffedd5',
    fg:           '#c2410c',
    hex:          '#ea580c',
    light:        'bg-orange-100',
    text:         'text-orange-700',
    tailwindBorder: 'border-orange-200',
  },
  completed: {
    ar:           'منجزة',
    bg:           'var(--status-done-bg)',
    fg:           'var(--status-done-fg)',
    hex:          '#46091a',
    light:        'bg-violet-200',
    text:         'text-violet-900',
    tailwindBorder: 'border-violet-300',
  },
  delayed: {
    ar:           'متأخرة',
    bg:           'var(--status-late-bg)',
    fg:           'var(--status-late-fg)',
    hex:          '#8a1538',
    light:        'bg-violet-600',
    text:         'text-white',
    tailwindBorder: 'border-violet-700',
  },
}

export type StatusKey = 'not_started' | 'in_progress' | 'submitted' | 'returned' | 'completed' | 'delayed'

/* ════════════════════════════════════════════════════════
   وسم التأخير (overdue) — يُعرض فوق أي حالة، ليس حالة مستقلة
   التأخير = end_date < اليوم AND status ≠ completed
════════════════════════════════════════════════════════ */
export const OVERDUE_META = {
  ar:             'متأخرة',
  hex:            '#dc2626',
  light:          'bg-red-100',
  text:           'text-red-700',
  tailwindBorder: 'border-red-200',
}
export function isOverdue(endDate: string | null, status: string): boolean {
  if (!endDate || status === 'completed') return false
  return new Date(endDate) < new Date(new Date().toISOString().split('T')[0])
}

/* ════════════════════════════════════════════════════════
   تقييم المهام (1-5)
   label = alias لـ ar (للتوافق مع الكود القديم)
════════════════════════════════════════════════════════ */
export const RATING_META: Record<number, {
  ar:    string
  label: string   // alias لـ ar — للتوافق
  stars: string
  bg:    string
  fg:    string
  color: string   // = bg — للتوافق
  badge: string   // Tailwind classes للـ badge — للتوافق مع my-tasks
}> = {
  5: { ar: 'ممتاز',    label: 'ممتاز',    stars: '★★★★★', bg: '#46091a', fg: '#ffffff', color: '#46091a', badge: 'bg-violet-900  text-white       border border-violet-800' },
  4: { ar: 'جيد جداً', label: 'جيد جداً', stars: '★★★★☆', bg: '#8a1538', fg: '#ffffff', color: '#8a1538', badge: 'bg-violet-600  text-white       border border-violet-500' },
  3: { ar: 'جيد',      label: 'جيد',      stars: '★★★☆☆', bg: '#a83356', fg: '#ffffff', color: '#a83356', badge: 'bg-violet-400  text-white       border border-violet-300' },
  2: { ar: 'مقبول',    label: 'مقبول',    stars: '★★☆☆☆', bg: '#d98ea0', fg: '#46091a', color: '#d98ea0', badge: 'bg-violet-200  text-violet-900  border border-violet-300' },
  1: { ar: 'ضعيف',     label: 'ضعيف',     stars: '★☆☆☆☆', bg: '#f4dde2', fg: '#8a1538', color: '#f4dde2', badge: 'bg-violet-50   text-violet-700  border border-violet-200' },
}

/* ════════════════════════════════════════════════════════
   أولوية المهام
════════════════════════════════════════════════════════ */
export const PRIORITY_META: Record<string, {
  ar: string; dot: string; tailwind: string
}> = {
  high:   { ar: 'عالية',   dot: '#8a1538', tailwind: 'bg-maroon-600' },
  medium: { ar: 'متوسطة', dot: '#d98ea0', tailwind: 'bg-maroon-300' },
  low:    { ar: 'منخفضة', dot: '#f4dde2', tailwind: 'bg-maroon-100' },
}

export type PriorityKey = 'high' | 'medium' | 'low'

/* ════════════════════════════════════════════════════════
   نوع المهام
════════════════════════════════════════════════════════ */
export const TYPE_META: Record<string, { ar: string; icon: string }> = {
  academic:       { ar: 'أكاديمية',   icon: 'BookOpen' },
  administrative: { ar: 'إدارية',     icon: 'Archive'  },
  general:        { ar: 'عامة',       icon: 'Pin'      },
}

export type TaskType = 'academic' | 'administrative' | 'general'

/* ════════════════════════════════════════════════════════
   قيم الحالات كمصفوفة (للفلاتر والـ dropdowns)
════════════════════════════════════════════════════════ */
export const STATUS_OPTIONS = Object.entries(STATUS_META).map(
  ([value, meta]) => ({ value, label: meta.ar })
)

export const PRIORITY_OPTIONS = Object.entries(PRIORITY_META).map(
  ([value, meta]) => ({ value, label: meta.ar })
)

export const TYPE_OPTIONS = Object.entries(TYPE_META).map(
  ([value, meta]) => ({ value, label: meta.ar })
)

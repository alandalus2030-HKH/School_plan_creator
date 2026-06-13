import { createClient } from '@/lib/supabase/client'

/**
 * كشف تعارض المهام (تحذير ناعم — غير مانع)
 * يعمل على مستوى تداخل التواريخ [start_date, end_date] لعدم وجود حقول ساعة.
 *   - تعارض المكان: مهمة أخرى تشغل نفس المكان في تواريخ متداخلة
 *   - تعارض الموظف: الموظف مكلّف بمهمة أخرى متداخلة زمنياً
 * القراءة تتم ضمن عزل المدرسة عبر RLS (الأماكن والمهام مقيّدة بالمدرسة أصلاً).
 */

export type ConflictTask = {
  id: string
  name_ar: string
  start_date: string | null
  end_date: string | null
  locations?: string[]   // أسماء الأماكن المتعارضة (لتعارض المكان)
}

export type ConflictResult = {
  location: ConflictTask[]
  assignee: ConflictTask[]
}

export type ConflictInput = {
  startDate: string | null
  endDate: string | null
  locationIds?: string[]
  assigneeId?: string | null
  excludeTaskId?: string | null
}

const EMPTY: ConflictResult = { location: [], assignee: [] }

export async function findConflicts(
  supabase: ReturnType<typeof createClient>,
  input: ConflictInput,
): Promise<ConflictResult> {
  const { startDate, endDate, locationIds = [], assigneeId, excludeTaskId } = input
  const from = startDate
  const to   = endDate || startDate
  if (!from) return EMPTY   // بلا تاريخ بدء لا يمكن قياس التداخل

  /* تداخل مديين: aStart ≤ bEnd && bStart ≤ aEnd (تواريخ ISO تُقارن نصياً) */
  const overlaps = (s: string | null, e: string | null) => {
    const bs = s, be = e || s
    return !!bs && bs <= to! && from <= be!
  }

  const result: ConflictResult = { location: [], assignee: [] }

  /* ── تعارض المكان ── */
  if (locationIds.length > 0) {
    const { data: tls } = await supabase
      .from('task_locations')
      .select('task_id, location_id, school_locations ( name_ar )')
      .in('location_id', locationIds)

    const rows = tls || []
    const taskIds = [...new Set(rows.map((r: any) => r.task_id).filter((id: string) => id !== excludeTaskId))]

    if (taskIds.length > 0) {
      const { data: tasks } = await supabase
        .from('tasks')
        .select('id, name_ar, start_date, end_date, status')
        .in('id', taskIds)

      for (const t of tasks || []) {
        if (t.status === 'completed') continue
        if (overlaps(t.start_date, t.end_date)) {
          const locs = rows
            .filter((r: any) => r.task_id === t.id)
            .map((r: any) => r.school_locations?.name_ar)
            .filter(Boolean)
          result.location.push({ ...t, locations: locs })
        }
      }
    }
  }

  /* ── تعارض الموظف ── */
  if (assigneeId) {
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, name_ar, start_date, end_date, status')
      .eq('assigned_to_user_id', assigneeId)

    for (const t of tasks || []) {
      if (t.id === excludeTaskId) continue
      if (t.status === 'completed') continue
      if (overlaps(t.start_date, t.end_date)) result.assignee.push(t)
    }
  }

  return result
}

export function hasConflicts(r: ConflictResult): boolean {
  return r.location.length > 0 || r.assignee.length > 0
}

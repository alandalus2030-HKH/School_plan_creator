/* ════════════════════════════════════════════
   سجل النشاط — تسجيل الأحداث المهمة في audit_logs
   ════════════════════════════════════════════ */

import { createClient } from './supabase/client'

export type ActivityAction =
  | 'task_created'
  | 'task_status_changed'
  | 'task_deleted'
  | 'task_rated'
  | 'evidence_added'
  | 'plan_created'
  | 'plan_deleted'
  | 'node_created'

/** نصوص عربية لكل نوع نشاط */
export const ACTIVITY_LABELS: Record<string, string> = {
  task_created:        'أنشأ مهمة',
  task_status_changed: 'غيّر حالة مهمة',
  task_deleted:        'حذف مهمة',
  task_rated:          'قيّم مهمة',
  evidence_added:      'أضاف دليلاً',
  plan_created:        'أنشأ خطة',
  plan_deleted:        'حذف خطة',
  node_created:        'أضاف عنصراً للخطة',
  impersonate_enter:   'دخل كمدرسة',
  impersonate_exit:    'خرج من تقمّص مدرسة',
}

type LogParams = {
  action:    ActivityAction
  tableName?: string
  recordId?: string
  /** وصف مختصر يظهر في السجل (اسم المهمة مثلاً) */
  summary?:  string
  newValues?: Record<string, any>
  oldValues?: Record<string, any>
}

/**
 * تسجيل نشاط — تُستدعى بعد أي حدث مهم
 * صامتة تماماً: لا تُوقف العملية عند الفشل
 */
export async function logActivity(params: LogParams) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    /* جلب school_id للمستخدم */
    const { data: profile } = await supabase
      .from('profiles').select('school_id').eq('id', user.id).single()

    await supabase.from('audit_logs').insert({
      school_id:  profile?.school_id ?? null,
      user_id:    user.id,
      action:     params.action,
      table_name: params.tableName ?? null,
      record_id:  params.recordId ?? null,
      old_values: params.oldValues ?? null,
      new_values: {
        ...(params.newValues ?? {}),
        ...(params.summary ? { _summary: params.summary } : {}),
      },
    })
  } catch {
    /* تجاهل أخطاء التسجيل — لا تؤثر على العملية الأساسية */
  }
}

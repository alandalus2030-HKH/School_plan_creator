/* ════════════════════════════════════════════
   خدمة الإشعارات — الدالة المركزية
   تُستدعى من أي مكان في التطبيق
   ════════════════════════════════════════════ */

import { createClient } from './supabase/client'

export type NotifType =
  | 'task_assigned'
  | 'task_due_soon'
  | 'task_overdue'
  | 'task_status_changed'
  | 'task_comment'
  | 'kpi_reading_added'
  | 'badge_earned'
  | 'plan_updated'
  | 'meeting_invite'
  | 'meeting_updated'
  | 'system'

// أسماء مكوّنات Lucide المقابلة لكل نوع إشعار
export const NOTIF_ICONS: Record<string, string> = {
  task_assigned:       'ClipboardList',
  task_due_soon:       'Clock',
  task_overdue:        'AlertTriangle',
  task_status_changed: 'RefreshCw',
  task_comment:        'MessageCircle',
  kpi_reading_added:   'TrendingUp',
  badge_earned:        'Trophy',
  plan_updated:        'Map',
  meeting_invite:      'CalendarDays',
  meeting_updated:     'CalendarDays',
  system:              'Bell',
}

export const NOTIF_LABELS: Record<string, string> = {
  task_assigned:       'مهمة جديدة',
  task_due_soon:       'موعد قريب',
  task_overdue:        'مهمة متأخرة',
  task_status_changed: 'تحديث حالة',
  task_comment:        'تعليق جديد',
  kpi_reading_added:   'قراءة KPI',
  badge_earned:        'وسام جديد',
  plan_updated:        'تحديث خطة',
  meeting_invite:      'دعوة اجتماع',
  meeting_updated:     'تحديث اجتماع',
  system:              'إشعار نظام',
}

type CreateNotifParams = {
  recipientId: string
  type:        NotifType | string
  title:       string
  body?:       string
  link?:       string
  senderId?:   string
  teamId?:     string
}

/**
 * إنشاء إشعار — تُستدعى من أي حدث في التطبيق
 * تتحقق تلقائياً من تفضيلات المستخدم قبل الإرسال
 */
export async function createNotification(params: CreateNotifParams) {
  const supabase = createClient()

  /* تحقق من تفضيلات المستخدم */
  const { data: profile } = await supabase
    .from('profiles')
    .select('notif_enabled, notif_inapp, notif_email, email')
    .eq('id', params.recipientId)
    .single()

  /* مدير النظام أوقف الإشعارات لهذا المستخدم */
  if (profile && profile.notif_enabled === false) return

  /* المستخدم أوقف الإشعارات داخل التطبيق */
  if (profile && profile.notif_inapp === false) return

  const { error } = await supabase.from('notifications').insert({
    recipient_id: params.recipientId,
    sender_id:    params.senderId || null,
    team_id:      params.teamId   || null,
    type:         params.type,
    title:        params.title,
    body:         params.body  || null,
    link:         params.link  || null,
    send_email:   profile?.notif_email ?? false,
    is_read:      false,
  })

  if (error) {
    console.error('[createNotification]', error)
    return
  }

  /* ── إرسال بريد إلكتروني (يتطلب RESEND_API_KEY في .env.local) ── */
  if (profile?.notif_email && profile?.email) {
    try {
      await fetch('/api/notifications/email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:    profile.email,
          title: params.title,
          body:  params.body,
          link:  params.link,
        }),
      })
    } catch (e) {
      /* تجاهل أخطاء البريد — لا تُوقف العملية */
    }
  }
}

/** الوقت النسبي بالعربية */
export function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60)     return 'منذ لحظات'
  if (diff < 3600)   return `منذ ${Math.floor(diff / 60)} دقيقة`
  if (diff < 86400)  return `منذ ${Math.floor(diff / 3600)} ساعة`
  if (diff < 604800) return `منذ ${Math.floor(diff / 86400)} يوم`
  return new Date(dateStr).toLocaleDateString('ar-QA')
}

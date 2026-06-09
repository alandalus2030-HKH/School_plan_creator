import { NextResponse } from 'next/server'
import { createAdminClient, isValidCronRequest } from '@/lib/supabase/admin'

/**
 * GET /api/cron/update-delayed
 * يُشغّله Vercel Cron يومياً
 * يُشعر المكلَّفين بالمهام التي تجاوزت موعدها ولم تُنجَز.
 * ملاحظة: التأخير أصبح وسماً محسوباً (لا حالة) — لذا لا نكتب فوق status.
 */
export async function GET(req: Request) {
  if (!isValidCronRequest(req)) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  }

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  /* ── المهام التي تجاوزت موعدها ولم تكتمل ولم تُعلَّم متأخرة بعد ── */
  const { data: overdue, error: fetchErr } = await admin
    .from('tasks')
    .select('id, name_ar, assigned_to_user_id, end_date')
    .lt('end_date', today)
    .neq('status', 'completed')
    .is('deleted_at', null)
    .limit(2000)

  if (fetchErr) {
    console.error('[cron:update-delayed]', fetchErr)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  if (!overdue || overdue.length === 0) {
    return NextResponse.json({ ok: true, notified: 0 })
  }

  /* ── إشعار المكلَّفين (مع احترام تفضيلاتهم) — التأخير وسم محسوب، لا نكتب status ── */
  const assignees = [...new Set(overdue.map(t => t.assigned_to_user_id).filter(Boolean))]
  const { data: profs } = await admin
    .from('profiles')
    .select('id, notif_enabled, notif_inapp')
    .in('id', assignees as string[])
  const allowed = new Set(
    (profs || [])
      .filter(p => p.notif_enabled !== false && p.notif_inapp !== false)
      .map(p => p.id)
  )

  const notifs = overdue
    .filter(t => t.assigned_to_user_id && allowed.has(t.assigned_to_user_id))
    .map(t => ({
      recipient_id: t.assigned_to_user_id,
      type:         'task_overdue',
      title:        'مهمة تجاوزت موعدها',
      body:         t.name_ar,
      link:         `/dashboard/tasks/${t.id}`,
      is_read:      false,
      send_email:   false,
    }))

  if (notifs.length > 0) {
    await admin.from('notifications').insert(notifs)
  }

  return NextResponse.json({ ok: true, notified: notifs.length })
}

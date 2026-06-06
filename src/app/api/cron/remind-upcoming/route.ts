import { NextResponse } from 'next/server'
import { createAdminClient, isValidCronRequest } from '@/lib/supabase/admin'

/**
 * GET /api/cron/remind-upcoming
 * يُشغّله Vercel Cron يومياً
 * يُذكّر المكلَّفين بالمهام المستحقة خلال اليومين القادمين
 */
export async function GET(req: Request) {
  if (!isValidCronRequest(req)) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  }

  const admin = createAdminClient()
  const today   = new Date()
  const in2days = new Date(today); in2days.setDate(today.getDate() + 2)
  const todayStr = today.toISOString().split('T')[0]
  const limitStr = in2days.toISOString().split('T')[0]

  /* ── مهام مستحقة بين اليوم وبعد يومين، غير مكتملة ── */
  const { data: upcoming, error } = await admin
    .from('tasks')
    .select('id, name_ar, assigned_to_user_id, end_date')
    .gte('end_date', todayStr)
    .lte('end_date', limitStr)
    .in('status', ['not_started', 'in_progress'])
    .is('deleted_at', null)
    .not('assigned_to_user_id', 'is', null)
    .limit(2000)

  if (error) {
    console.error('[cron:remind-upcoming]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!upcoming || upcoming.length === 0) {
    return NextResponse.json({ ok: true, reminded: 0 })
  }

  /* ── تفضيلات المستخدمين ── */
  const assignees = [...new Set(upcoming.map(t => t.assigned_to_user_id).filter(Boolean))]
  const { data: profs } = await admin
    .from('profiles')
    .select('id, notif_enabled, notif_inapp')
    .in('id', assignees as string[])
  const allowed = new Set(
    (profs || [])
      .filter(p => p.notif_enabled !== false && p.notif_inapp !== false)
      .map(p => p.id)
  )

  const notifs = upcoming
    .filter(t => t.assigned_to_user_id && allowed.has(t.assigned_to_user_id))
    .map(t => {
      const days = Math.ceil(
        (new Date(t.end_date!).getTime() - today.getTime()) / 86400000
      )
      const when = days <= 0 ? 'اليوم' : days === 1 ? 'غداً' : `خلال ${days} أيام`
      return {
        recipient_id: t.assigned_to_user_id,
        type:         'task_due_soon',
        title:        `تذكير: مهمة مستحقة ${when}`,
        body:         t.name_ar,
        link:         `/dashboard/tasks/${t.id}`,
        is_read:      false,
        send_email:   false,
      }
    })

  if (notifs.length > 0) {
    await admin.from('notifications').insert(notifs)
  }

  return NextResponse.json({ ok: true, reminded: notifs.length })
}

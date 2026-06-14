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
    .select('id, name_ar, assigned_to_user_id, node_id, end_date')
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

  /* ── ملخّص متأخرات لكل صاحب خطة (إشعار واحد مُجمَّع، لا تكرار لكل مهمة) ── */
  let ownerNotified = 0
  const nodeIds = [...new Set(overdue.map(t => t.node_id).filter(Boolean))] as string[]
  if (nodeIds.length > 0) {
    const { data: pn } = await admin.from('plan_nodes').select('id, plan_id').in('id', nodeIds)
    const nodeToPlan = new Map((pn || []).map((n: any) => [n.id, n.plan_id]))
    const planIds = [...new Set((pn || []).map((n: any) => n.plan_id).filter(Boolean))] as string[]
    const { data: pl } = planIds.length
      ? await admin.from('plans').select('id, owner_id').in('id', planIds)
      : { data: [] as any[] }
    const ownerOf = new Map((pl || []).map((p: any) => [p.id, p.owner_id]))

    const ownerCounts = new Map<string, number>()
    for (const t of overdue) {
      const pid = t.node_id ? nodeToPlan.get(t.node_id) : null
      const oid = pid ? ownerOf.get(pid) : null
      if (oid) ownerCounts.set(oid, (ownerCounts.get(oid) || 0) + 1)
    }
    if (ownerCounts.size > 0) {
      const { data: ownerProfs } = await admin.from('profiles')
        .select('id, notif_enabled, notif_inapp').in('id', [...ownerCounts.keys()])
      const ownerAllowed = new Set((ownerProfs || [])
        .filter(p => p.notif_enabled !== false && p.notif_inapp !== false).map(p => p.id))
      const ownerNotifs = [...ownerCounts.entries()]
        .filter(([oid]) => ownerAllowed.has(oid))
        .map(([oid, count]) => ({
          recipient_id: oid, type: 'task_overdue',
          title: '📋 ملخّص خططك: مهام متأخرة',
          body: `لديك ${count} مهمة متأخرة في خططك — يُرجى المتابعة.`,
          link: '/dashboard/aggregate', is_read: false, send_email: false,
        }))
      if (ownerNotifs.length > 0) {
        await admin.from('notifications').insert(ownerNotifs)
        ownerNotified = ownerNotifs.length
      }
    }
  }

  return NextResponse.json({ ok: true, notified: notifs.length, owners: ownerNotified })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/* POST /api/notifications/send
   يُرسل إشعاراً من المدير لمستخدم محدد أو للجميع أو لمجموعة مختارة
   recipientId: 'me' | 'all' | uuid (مستخدم واحد)
   recipientIds: uuid[]             (مستخدمون محددون) */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { recipientId, recipientIds, title, body, type, link } = await req.json()
  if (!title?.trim()) return NextResponse.json({ error: 'العنوان مطلوب' }, { status: 400 })

  /* ══ مصفوفة مستخدمين محددين ══ */
  if (Array.isArray(recipientIds) && recipientIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, notif_enabled, notif_inapp')
      .in('id', recipientIds)
      .eq('is_active', true)

    const rows = (profiles || [])
      .filter(p => p.notif_enabled !== false && p.notif_inapp !== false)
      .map(p => ({
        recipient_id: p.id,
        sender_id:    user.id,
        type:         type || 'system',
        title:        title.trim(),
        body:         body?.trim() || null,
        link:         link?.trim() || null,
        send_email:   false,
        is_read:      false,
      }))

    if (rows.length) await supabase.from('notifications').insert(rows)
    return NextResponse.json({ ok: true, count: rows.length })
  }

  /* ══ جميع المستخدمين ══ */
  if (recipientId === 'all') {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, notif_enabled, notif_inapp')
      .eq('is_active', true)
      .neq('id', user.id)

    const rows = (profiles || [])
      .filter(p => p.notif_enabled !== false && p.notif_inapp !== false)
      .map(p => ({
        recipient_id: p.id,
        sender_id:    user.id,
        type:         type || 'system',
        title:        title.trim(),
        body:         body?.trim() || null,
        link:         link?.trim() || null,
        send_email:   false,
        is_read:      false,
      }))

    if (rows.length) await supabase.from('notifications').insert(rows)
    return NextResponse.json({ ok: true, count: rows.length })
  }

  /* ══ مستخدم واحد أو نفس المرسِل ══ */
  const targetId = recipientId === 'me' ? user.id : recipientId
  await supabase.from('notifications').insert({
    recipient_id: targetId,
    sender_id:    user.id,
    type:         type || 'system',
    title:        title.trim(),
    body:         body?.trim() || null,
    link:         link?.trim() || null,
    send_email:   false,
    is_read:      false,
  })
  return NextResponse.json({ ok: true, count: 1 })
}

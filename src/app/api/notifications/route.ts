import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/* GET /api/notifications — جلب إشعارات المستخدم الحالي */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const limit  = parseInt(req.nextUrl.searchParams.get('limit')  || '20')
  const unread = req.nextUrl.searchParams.get('unread') === 'true'

  let query = supabase
    .from('notifications')
    .select('id, type, title, body, link, is_read, created_at, sender_id')
    .eq('recipient_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (unread) query = query.eq('is_read', false)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const unreadCount = unread
    ? (data?.length || 0)
    : (await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .eq('is_read', false)
      ).count || 0

  return NextResponse.json({ notifications: data || [], unreadCount })
}

/* PATCH /api/notifications — تحديث حالة القراءة */
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { id, markAllRead } = await req.json()

  if (markAllRead) {
    /* تحديد الكل كمقروء */
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_id', user.id)
      .eq('is_read', false)
  } else if (id) {
    /* تحديد إشعار واحد كمقروء */
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('recipient_id', user.id)
  }

  return NextResponse.json({ ok: true })
}

/* DELETE /api/notifications — حذف الإشعارات المقروءة */
export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  await supabase
    .from('notifications')
    .delete()
    .eq('recipient_id', user.id)
    .eq('is_read', true)

  return NextResponse.json({ ok: true })
}

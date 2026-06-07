import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getOwner(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles').select('is_group_owner, owned_group_id, name_ar')
    .eq('id', userId).single()
  return me?.is_group_owner && me.owned_group_id ? { admin, ...me } : null
}

/* ════ GET: اجتماعات المجموعة ════ */
export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const owner = await getOwner(auth.user.id)
  if (!owner) return NextResponse.json({ error: 'متاح لمالك المجموعة فقط' }, { status: 403 })

  const { data } = await owner.admin
    .from('group_meetings')
    .select('*')
    .eq('group_id', owner.owned_group_id)
    .order('scheduled_at', { ascending: false })

  return NextResponse.json({ meetings: data || [] })
}

/* ════ POST: إنشاء اجتماع مجموعة + إشعار المدعوين ════ */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const owner = await getOwner(auth.user.id)
  if (!owner) return NextResponse.json({ error: 'متاح لمالك المجموعة فقط' }, { status: 403 })

  const body = await req.json()
  const { title, description, meeting_url, platform, scheduled_at, duration_minutes, attendees } = body
  if (!title?.trim()) return NextResponse.json({ error: 'عنوان الاجتماع مطلوب' }, { status: 400 })

  /* تأكيد أن المدعوين مديرو مدارس ضمن المجموعة فقط */
  const { data: groupSchools } = await owner.admin
    .from('schools').select('id').eq('group_id', owner.owned_group_id)
  const schoolIds = (groupSchools || []).map(s => s.id)
  let validAttendees: string[] = []
  if (Array.isArray(attendees) && attendees.length > 0 && schoolIds.length > 0) {
    const { data: valid } = await owner.admin
      .from('profiles').select('id').in('id', attendees).in('school_id', schoolIds)
    validAttendees = (valid || []).map(v => v.id)
  }

  const { data: meeting, error } = await owner.admin
    .from('group_meetings')
    .insert({
      group_id:         owner.owned_group_id,
      title:            title.trim(),
      description:      description?.trim() || null,
      meeting_url:      meeting_url?.trim() || null,
      platform:         platform || 'other',
      scheduled_at:     scheduled_at || null,
      duration_minutes: duration_minutes || 60,
      attendees:        validAttendees,
      created_by:       auth.user.id,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  /* إشعار المديرين المدعوين */
  if (validAttendees.length > 0) {
    const dateLabel = scheduled_at ? new Date(scheduled_at).toLocaleDateString('ar-QA') : ''
    const rows = validAttendees.map(uid => ({
      recipient_id: uid,
      sender_id:    auth.user.id,
      type:         'meeting_invite',
      title:        `دعوة اجتماع من مالك المجموعة: ${title.trim()}`,
      body:         dateLabel || null,
      link:         '/dashboard/meetings',
      is_read:      false,
      send_email:   false,
    }))
    await owner.admin.from('notifications').insert(rows)
  }

  return NextResponse.json({ ok: true, id: meeting?.id })
}

/* ════ DELETE: حذف اجتماع ════ */
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const owner = await getOwner(auth.user.id)
  if (!owner) return NextResponse.json({ error: 'متاح لمالك المجموعة فقط' }, { status: 403 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'معرّف الاجتماع مطلوب' }, { status: 400 })

  await owner.admin.from('group_meetings').delete()
    .eq('id', id).eq('group_id', owner.owned_group_id)

  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * منح/سحب وسام لمستخدم — لمن يملك grant_badges
 * POST   → منح وسام (badge_id, profile_id, note)
 * DELETE → سحب منحة (?id=)
 */

async function getContext(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles').select('school_id, active_school_id, is_super_admin, role')
    .eq('id', userId).single()
  if (!me) return null
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  return { admin, me, schoolId }
}

async function canGrant(ctx: NonNullable<Awaited<ReturnType<typeof getContext>>>) {
  const { data: roleData } = await ctx.admin
    .from('roles').select('permissions').eq('code', ctx.me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleData?.permissions) ? roleData!.permissions : []
  const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']
  return perms.includes('all') || perms.includes('grant_badges')
    || ADMIN_ROLES.includes(ctx.me.role) || ctx.me.is_super_admin
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  if (!(await canGrant(ctx))) return NextResponse.json({ error: 'لا تملك صلاحية منح الأوسمة' }, { status: 403 })

  const body = await req.json()
  const badge_id   = body.badge_id?.toString()
  const profile_id = body.profile_id?.toString()
  if (!badge_id || !profile_id) return NextResponse.json({ error: 'الوسام والمستخدم مطلوبان' }, { status: 400 })

  /* التحقق أن الوسام والمستخدم في مدرسة المُستدعي */
  const { data: badge } = await ctx.admin.from('badges').select('school_id, name_ar').eq('id', badge_id).maybeSingle()
  if (!badge || badge.school_id !== ctx.schoolId) {
    return NextResponse.json({ error: 'الوسام غير موجود' }, { status: 404 })
  }
  const { data: prof } = await ctx.admin.from('profiles').select('school_id, notif_enabled, notif_inapp').eq('id', profile_id).maybeSingle()
  if (!prof || prof.school_id !== ctx.schoolId) {
    return NextResponse.json({ error: 'المستخدم غير موجود في هذه المدرسة' }, { status: 404 })
  }

  const note = body.note?.toString().trim() || null
  const { data, error } = await ctx.admin.from('user_badges').insert({
    badge_id, profile_id,
    granted_by: auth.user.id,
    note,
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  /* إشعار للمستخدم الذي حصل على الوسام */
  if (prof.notif_enabled !== false && prof.notif_inapp !== false) {
    await ctx.admin.from('notifications').insert({
      recipient_id: profile_id,
      sender_id:    auth.user.id,
      type:         'badge_earned',
      title:        `حصلت على وسام: ${badge.name_ar}`,
      body:         note,
      link:         '/dashboard/profile',
      is_read:      false,
      send_email:   false,
    })
  }

  return NextResponse.json({ ok: true, id: data.id })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  if (!(await canGrant(ctx))) return NextResponse.json({ error: 'لا تملك صلاحية منح الأوسمة' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'معرّف المنحة مطلوب' }, { status: 400 })

  /* التحقق عبر مدرسة الوسام المرتبط بالمنحة */
  const { data: ub } = await ctx.admin
    .from('user_badges').select('badge_id, badges!inner(school_id)').eq('id', id).maybeSingle()
  const badgeSchool = (ub as any)?.badges?.school_id
  if (!ub || badgeSchool !== ctx.schoolId) {
    return NextResponse.json({ error: 'المنحة غير موجودة' }, { status: 404 })
  }

  const { error } = await ctx.admin.from('user_badges').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

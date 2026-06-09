import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * الأوسمة — إنشاء/حذف (لمن يملك grant_badges)
 * POST   → إنشاء وسام جديد
 * DELETE → حذف وسام (?id=) + أوسمة المستخدمين المرتبطة
 * يحترم سياق المدرسة (active_school_id للمتقمّص)
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
  if (!(await canGrant(ctx))) return NextResponse.json({ error: 'لا تملك صلاحية إدارة الأوسمة' }, { status: 403 })

  const body = await req.json()
  const name_ar = body.name_ar?.toString().trim()
  if (!name_ar) return NextResponse.json({ error: 'اسم الوسام مطلوب' }, { status: 400 })

  const points = Math.max(0, Math.min(1000, parseInt(body.points, 10) || 10))
  const { data, error } = await ctx.admin.from('badges').insert({
    school_id: ctx.schoolId,
    name_ar,
    name_en: body.name_en?.toString().trim() || null,
    icon:    body.icon?.toString().trim() || 'Award',
    color:   body.color?.toString().trim() || '#8a1538',
    points,
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  if (!(await canGrant(ctx))) return NextResponse.json({ error: 'لا تملك صلاحية إدارة الأوسمة' }, { status: 403 })

  const body = await req.json()
  const id = body.id?.toString()
  if (!id) return NextResponse.json({ error: 'معرّف الوسام مطلوب' }, { status: 400 })

  /* التحقق أن الوسام يخص مدرسة المُستدعي */
  const { data: badge } = await ctx.admin.from('badges').select('school_id').eq('id', id).maybeSingle()
  if (!badge || badge.school_id !== ctx.schoolId) {
    return NextResponse.json({ error: 'الوسام غير موجود' }, { status: 404 })
  }

  const name_ar = body.name_ar?.toString().trim()
  if (!name_ar) return NextResponse.json({ error: 'اسم الوسام مطلوب' }, { status: 400 })
  const points = Math.max(0, Math.min(1000, parseInt(body.points, 10) || 10))

  const { error } = await ctx.admin.from('badges').update({
    name_ar,
    name_en: body.name_en?.toString().trim() || null,
    icon:    body.icon?.toString().trim() || 'Award',
    color:   body.color?.toString().trim() || '#8a1538',
    points,
  }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  if (!(await canGrant(ctx))) return NextResponse.json({ error: 'لا تملك صلاحية إدارة الأوسمة' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'معرّف الوسام مطلوب' }, { status: 400 })

  /* التحقق أن الوسام يخص مدرسة المُستدعي */
  const { data: badge } = await ctx.admin.from('badges').select('school_id').eq('id', id).maybeSingle()
  if (!badge || badge.school_id !== ctx.schoolId) {
    return NextResponse.json({ error: 'الوسام غير موجود' }, { status: 404 })
  }

  await ctx.admin.from('user_badges').delete().eq('badge_id', id)
  const { error } = await ctx.admin.from('badges').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

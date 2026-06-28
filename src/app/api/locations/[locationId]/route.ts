import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAudit } from '@/lib/audit'

/** تعديل/حذف مكان — manage_settings + عزل المدرسة الفعّالة */

const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']

async function getContext(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles').select('school_id, active_school_id, is_super_admin, role').eq('id', userId).single()
  if (!me) return null
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  return { admin, me, schoolId }
}

async function canManage(ctx: NonNullable<Awaited<ReturnType<typeof getContext>>>) {
  const { data: roleData } = await ctx.admin
    .from('roles').select('permissions').eq('code', ctx.me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleData?.permissions) ? roleData!.permissions : []
  return perms.includes('all') || perms.includes('manage_settings')
    || ADMIN_ROLES.includes(ctx.me.role) || ctx.me.is_super_admin
}

async function guard(userId: string, locationId: string) {
  const ctx = await getContext(userId)
  if (!ctx?.schoolId) return { err: NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 }) }
  if (!(await canManage(ctx))) return { err: NextResponse.json({ error: 'لا تملك صلاحية إدارة الإعدادات' }, { status: 403 }) }
  const { data: loc } = await ctx.admin.from('school_locations').select('id, school_id').eq('id', locationId).maybeSingle()
  if (!loc || loc.school_id !== ctx.schoolId) return { err: NextResponse.json({ error: 'المكان غير موجود' }, { status: 404 }) }
  return { ctx }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ locationId: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { locationId } = await context.params
  const { ctx, err } = await guard(auth.user.id, locationId)
  if (err) return err

  const body = await req.json()
  const patch: Record<string, any> = {}
  if (typeof body.name_ar === 'string' && body.name_ar.trim()) patch.name_ar = body.name_ar.trim()
  if (typeof body.is_active === 'boolean') patch.is_active = body.is_active
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'لا تغييرات' }, { status: 400 })

  const { error } = await ctx!.admin.from('school_locations').update(patch).eq('id', locationId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await recordAudit({ req, userId: auth.user.id, schoolId: ctx!.schoolId, action: 'update', table: 'school_locations', recordId: locationId, after: patch })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ locationId: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { locationId } = await context.params
  const { ctx, err } = await guard(auth.user.id, locationId)
  if (err) return err

  const { error } = await ctx!.admin.from('school_locations').delete().eq('id', locationId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await recordAudit({ req, userId: auth.user.id, schoolId: ctx!.schoolId, action: 'delete', table: 'school_locations', recordId: locationId })
  return NextResponse.json({ ok: true })
}

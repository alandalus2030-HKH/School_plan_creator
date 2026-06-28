import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAudit } from '@/lib/audit'

/** تحديث/حذف فترة في التقويم المدرسي — صلاحية إدارة + عزل المدرسة الفعّالة. */

const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']
const KINDS = ['holiday', 'exam', 'break', 'national', 'eid', 'other']
const ENFORCE = ['block', 'warn']

async function getContext(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles').select('school_id, active_school_id, is_super_admin, role').eq('id', userId).single()
  if (!me) return null
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  return { admin, me, schoolId }
}

async function canManage(admin: any, role: string, isSuper: boolean) {
  if (isSuper || ADMIN_ROLES.includes(role)) return true
  const { data: roleData } = await admin.from('roles').select('permissions').eq('code', role).maybeSingle()
  const perms: string[] = Array.isArray(roleData?.permissions) ? roleData!.permissions : []
  return perms.includes('all') || perms.includes('manage_settings') || perms.includes('manage_plans')
}

async function guard(userId: string, id: string) {
  const ctx = await getContext(userId)
  if (!ctx?.schoolId) return { err: NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 }) }
  if (!(await canManage(ctx.admin, ctx.me.role, ctx.me.is_super_admin)))
    return { err: NextResponse.json({ error: 'لا تملك صلاحية إدارة التقويم' }, { status: 403 }) }
  const { data: row } = await ctx.admin.from('school_calendar').select('id, school_id').eq('id', id).maybeSingle()
  if (!row || row.school_id !== ctx.schoolId)
    return { err: NextResponse.json({ error: 'الفترة غير موجودة' }, { status: 404 }) }
  return { ctx }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { id } = await context.params
  const g = await guard(auth.user.id, id)
  if (g.err) return g.err
  const { admin } = g.ctx!

  const b = await req.json().catch(() => ({}))
  const patch: Record<string, any> = {}
  if (b.title !== undefined) { const t = (b.title || '').toString().trim(); if (!t) return NextResponse.json({ error: 'العنوان مطلوب' }, { status: 400 }); patch.title = t }
  if (b.kind !== undefined) { if (!KINDS.includes(b.kind)) return NextResponse.json({ error: 'نوع غير صالح' }, { status: 400 }); patch.kind = b.kind }
  if (b.enforcement !== undefined) { if (!ENFORCE.includes(b.enforcement)) return NextResponse.json({ error: 'مستوى إلزام غير صالح' }, { status: 400 }); patch.enforcement = b.enforcement }
  if (b.start_date !== undefined) patch.start_date = b.start_date
  if (b.end_date !== undefined) patch.end_date = b.end_date
  if (b.note !== undefined) patch.note = b.note?.toString().trim() || null
  if (patch.start_date && patch.end_date && patch.end_date < patch.start_date)
    return NextResponse.json({ error: 'تاريخ الانتهاء قبل البدء' }, { status: 400 })

  const { error } = await admin.from('school_calendar').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await recordAudit({ req, userId: auth.user.id, schoolId: g.ctx!.schoolId, action: 'update', table: 'school_calendar', recordId: id, after: patch })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { id } = await context.params
  const g = await guard(auth.user.id, id)
  if (g.err) return g.err
  const { error } = await g.ctx!.admin.from('school_calendar').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await recordAudit({ req, userId: auth.user.id, schoolId: g.ctx!.schoolId, action: 'delete', table: 'school_calendar', recordId: id })
  return NextResponse.json({ ok: true })
}

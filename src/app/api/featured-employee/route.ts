import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAudit } from '@/lib/audit'

/**
 * موظف الشهر المُثبَّت يدوياً — لمن يملك manage_settings
 * POST   → تثبيت موظف (profile_id, note)
 * DELETE → إلغاء التثبيت (العودة للتلقائي)
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

async function canManage(ctx: NonNullable<Awaited<ReturnType<typeof getContext>>>) {
  const { data: roleData } = await ctx.admin
    .from('roles').select('permissions').eq('code', ctx.me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleData?.permissions) ? roleData!.permissions : []
  const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']
  return perms.includes('all') || perms.includes('manage_settings')
    || ADMIN_ROLES.includes(ctx.me.role) || ctx.me.is_super_admin
}

export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ featured_employee_id: null, featured_note: null })
  const { data } = await ctx.admin
    .from('schools').select('featured_employee_id, featured_note').eq('id', ctx.schoolId).maybeSingle()
  return NextResponse.json({
    featured_employee_id: data?.featured_employee_id || null,
    featured_note: data?.featured_note || null,
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  if (!(await canManage(ctx))) return NextResponse.json({ error: 'لا تملك صلاحية تعيين موظف الشهر' }, { status: 403 })

  const body = await req.json()
  const profile_id = body.profile_id?.toString()
  if (!profile_id) return NextResponse.json({ error: 'المستخدم مطلوب' }, { status: 400 })

  /* التحقق أن المستخدم في مدرسة المُستدعي */
  const { data: prof } = await ctx.admin.from('profiles').select('school_id').eq('id', profile_id).maybeSingle()
  if (!prof || prof.school_id !== ctx.schoolId) {
    return NextResponse.json({ error: 'المستخدم غير موجود في هذه المدرسة' }, { status: 404 })
  }

  const { error } = await ctx.admin.from('schools').update({
    featured_employee_id: profile_id,
    featured_note: body.note?.toString().trim() || null,
  }).eq('id', ctx.schoolId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await recordAudit({ req, userId: auth.user.id, schoolId: ctx.schoolId, action: 'featured_set', table: 'schools', recordId: ctx.schoolId, after: { featured_employee_id: profile_id } })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  if (!(await canManage(ctx))) return NextResponse.json({ error: 'لا تملك صلاحية تعيين موظف الشهر' }, { status: 403 })

  const { error } = await ctx.admin.from('schools')
    .update({ featured_employee_id: null, featured_note: null }).eq('id', ctx.schoolId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await recordAudit({ req, userId: auth.user.id, schoolId: ctx.schoolId, action: 'featured_cleared', table: 'schools', recordId: ctx.schoolId })
  return NextResponse.json({ ok: true })
}

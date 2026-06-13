import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { id } = await context.params
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  if (!(await canManage(ctx))) return NextResponse.json({ error: 'لا تملك صلاحية إدارة الإعدادات' }, { status: 403 })

  const { data: row } = await ctx.admin.from('department_supervisors').select('id, school_id').eq('id', id).maybeSingle()
  if (!row || row.school_id !== ctx.schoolId) return NextResponse.json({ error: 'التعيين غير موجود' }, { status: 404 })

  const { error } = await ctx.admin.from('department_supervisors').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

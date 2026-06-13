import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * إشراف الأقسام — من يشرف على أي قسم (للوحة التجميع)
 * GET       → كل التعيينات في المدرسة (?me=1 → أقسام المستخدم الحالي فقط)
 * POST      → إضافة تعيين (manage_settings)
 * ضمن المدرسة الفعّالة (يحترم التقمّص)
 */

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

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })

  const mine = req.nextUrl.searchParams.get('me') === '1'
  let q = ctx.admin.from('department_supervisors')
    .select('id, user_id, department, profiles:user_id ( name_ar )')
    .eq('school_id', ctx.schoolId)
  if (mine) q = q.eq('user_id', auth.user.id)

  const { data, error } = await q.order('department')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ supervisors: data || [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  if (!(await canManage(ctx))) return NextResponse.json({ error: 'لا تملك صلاحية إدارة الإعدادات' }, { status: 403 })

  const { user_id, department } = await req.json()
  if (!user_id || !department?.trim()) return NextResponse.json({ error: 'المستخدم والقسم مطلوبان' }, { status: 400 })

  const { data, error } = await ctx.admin.from('department_supervisors')
    .upsert({ school_id: ctx.schoolId, user_id, department: department.trim() },
            { onConflict: 'school_id,user_id,department' })
    .select('id, user_id, department, profiles:user_id ( name_ar )').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ supervisor: data })
}

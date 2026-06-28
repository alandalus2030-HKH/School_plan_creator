import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAudit } from '@/lib/audit'

/**
 * أماكن المدرسة (الموارد المكانية)
 * GET  → قائمة أماكن المدرسة الفعّالة (?active=1 للنشطة فقط)
 * POST → إضافة مكان (manage_settings)
 * يعمل ضمن المدرسة الفعّالة (يحترم التقمّص)
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

  const activeOnly = req.nextUrl.searchParams.get('active') === '1'
  let q = ctx.admin.from('school_locations')
    .select('id, name_ar, sort_order, is_active')
    .eq('school_id', ctx.schoolId)
    .order('sort_order').order('name_ar')
  if (activeOnly) q = q.eq('is_active', true)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ locations: data || [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  if (!(await canManage(ctx))) return NextResponse.json({ error: 'لا تملك صلاحية إدارة الإعدادات' }, { status: 403 })

  const { name_ar } = await req.json()
  if (!name_ar || !name_ar.trim()) return NextResponse.json({ error: 'اسم المكان مطلوب' }, { status: 400 })

  const { data: maxRow } = await ctx.admin.from('school_locations')
    .select('sort_order').eq('school_id', ctx.schoolId)
    .order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const sort_order = (maxRow?.sort_order || 0) + 1

  const { data, error } = await ctx.admin.from('school_locations')
    .insert({ school_id: ctx.schoolId, name_ar: name_ar.trim(), sort_order })
    .select('id, name_ar, sort_order, is_active').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await recordAudit({ req, userId: auth.user.id, schoolId: ctx.schoolId, action: 'insert', table: 'school_locations', recordId: data.id, after: { name_ar: data.name_ar } })
  return NextResponse.json({ location: data })
}

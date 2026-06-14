import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/plans → إنشاء خطة جديدة
 * يحسب school_id = المدرسة الفعّالة (يحترم تقمّص مشرف النظام)
 * ويتطلب صلاحية manage_plans. يتجاوز إشكال schools.single() في الواجهة.
 */
async function getContext(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles').select('school_id, active_school_id, is_super_admin, role').eq('id', userId).single()
  if (!me) return null
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  return { admin, me, schoolId }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })

  const { data: roleData } = await ctx.admin.from('roles').select('permissions').eq('code', ctx.me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleData?.permissions) ? roleData!.permissions : []
  const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']
  const canManagePlans = perms.includes('all') || perms.includes('manage_plans')
    || ADMIN_ROLES.includes(ctx.me.role) || ctx.me.is_super_admin
  if (!canManagePlans) return NextResponse.json({ error: 'لا تملك صلاحية إدارة الخطط' }, { status: 403 })

  const body = await req.json()
  const name_ar = body.name_ar?.toString().trim()
  if (!name_ar) return NextResponse.json({ error: 'اسم الخطة مطلوب' }, { status: 400 })

  const { data, error } = await ctx.admin.from('plans').insert({
    school_id:     ctx.schoolId,
    name_ar,
    academic_year: body.academic_year || null,
    start_date:    body.start_date || null,
    end_date:      body.end_date || null,
    level_count:   body.level_count ?? 3,
    level_names:   Array.isArray(body.level_names) ? body.level_names : [],
    kpi_levels:    Array.isArray(body.kpi_levels) ? body.kpi_levels : [],
    department:    body.department?.toString().trim()    || null,
    plan_category: body.plan_category?.toString().trim() || null,
    owner_id:      body.owner_id || null,
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  /* إشعار صاحب الخطة عند تعيينه (إن اختلف عن المُنشئ واحترام تفضيلاته) */
  const ownerId = body.owner_id || null
  if (ownerId && ownerId !== auth.user.id) {
    const { data: op } = await ctx.admin.from('profiles').select('notif_enabled, notif_inapp').eq('id', ownerId).maybeSingle()
    if (!(op?.notif_enabled === false || op?.notif_inapp === false)) {
      await ctx.admin.from('notifications').insert({
        recipient_id: ownerId, sender_id: auth.user.id, type: 'task_status_changed',
        title: `📋 أصبحت صاحب خطة: ${name_ar}`,
        body: 'تم تعيينك مسؤولاً عن هذه الخطة — تابعها من لوحة التجميع.',
        link: `/dashboard/plans/${data.id}`, is_read: false, send_email: false,
      })
    }
  }

  return NextResponse.json({ ok: true, id: data.id })
}

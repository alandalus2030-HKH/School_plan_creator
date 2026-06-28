import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAudit } from '@/lib/audit'

/**
 * PATCH /api/plans/[planId]/certify
 * Body: { approve: boolean }
 * - approve=true  → يُعيَّن approved_at=NOW() و approved_by=userId (حصراً is_super_admin)
 * - approve=false → يُمسح approved_at و approved_by (إلغاء الاعتماد)
 * الخطة المعتمدة: لا حذف (الـ DELETE يرفضها 403)؛ فقط الأرشفة متاحة.
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ planId: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { planId } = await context.params
  const body = await req.json().catch(() => ({}))
  const approve: boolean = body.approve === true

  const admin = createAdminClient()

  /* ── التحقق من الصلاحية: مشرف النظام أو دور يملك approve_plans ── */
  const { data: me } = await admin
    .from('profiles')
    .select('is_super_admin, active_school_id, school_id, role')
    .eq('id', auth.user.id)
    .single()

  if (!me) return NextResponse.json({ error: 'تعذّر تحديد المستخدم' }, { status: 403 })

  let allowed = me.is_super_admin === true
  if (!allowed && me.role) {
    const { data: roleData } = await admin.from('roles').select('permissions').eq('code', me.role).maybeSingle()
    const perms: string[] = Array.isArray(roleData?.permissions) ? roleData!.permissions : []
    allowed = perms.includes('all') || perms.includes('approve_plans')
  }
  if (!allowed) {
    return NextResponse.json({ error: 'لا تملك صلاحية اعتماد الخطط' }, { status: 403 })
  }

  /* ── التحقق من وجود الخطة وعزل المدرسة ── */
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  const { data: plan } = await admin
    .from('plans')
    .select('id, school_id, deleted_at')
    .eq('id', planId)
    .maybeSingle()
  if (!plan || plan.deleted_at) {
    return NextResponse.json({ error: 'الخطة غير موجودة' }, { status: 404 })
  }
  if (schoolId && plan.school_id !== schoolId) {
    return NextResponse.json({ error: 'الخطة خارج نطاق مدرستك الفعّالة' }, { status: 403 })
  }

  const patch = approve
    ? { approved_at: new Date().toISOString(), approved_by: auth.user.id }
    : { approved_at: null,                     approved_by: null }

  const { error } = await admin.from('plans').update(patch).eq('id', planId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recordAudit({
    req, userId: auth.user.id, schoolId: plan.school_id,
    action: approve ? 'plan_certified' : 'plan_uncertified', table: 'plans', recordId: planId,
  })

  return NextResponse.json({ ok: true, approved_at: patch.approved_at ?? null })
}

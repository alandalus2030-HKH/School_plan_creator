import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * PATCH /api/plans/[planId]/freeze
 * Body: { freeze: boolean }
 * - freeze=true  → frozen_at=NOW()، frozen_by=userId (تُقفل الخطة بالكامل)
 * - freeze=false → يُمسح التجميد
 * الصلاحية: مشرف النظام أو دور يملك freeze_plans. عزل المدرسة مفروض.
 * الإقفال نفسه مفروض في القاعدة عبر triggers (الترحيل 053).
 */
export async function PATCH(req: NextRequest, context: { params: Promise<{ planId: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { planId } = await context.params
  const body = await req.json().catch(() => ({}))
  const freeze: boolean = body.freeze === true

  const admin = createAdminClient()

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
    allowed = perms.includes('all') || perms.includes('freeze_plans')
  }
  if (!allowed) {
    return NextResponse.json({ error: 'لا تملك صلاحية تجميد الخطط' }, { status: 403 })
  }

  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  const { data: plan } = await admin
    .from('plans').select('id, school_id, deleted_at').eq('id', planId).maybeSingle()
  if (!plan || plan.deleted_at) return NextResponse.json({ error: 'الخطة غير موجودة' }, { status: 404 })
  if (schoolId && plan.school_id !== schoolId) {
    return NextResponse.json({ error: 'الخطة خارج نطاق مدرستك الفعّالة' }, { status: 403 })
  }

  const patch = freeze
    ? { frozen_at: new Date().toISOString(), frozen_by: auth.user.id }
    : { frozen_at: null, frozen_by: null }

  const { error } = await admin.from('plans').update(patch).eq('id', planId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, frozen_at: patch.frozen_at ?? null })
}

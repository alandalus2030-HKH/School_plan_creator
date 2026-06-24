import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * DELETE /api/plans/[planId] → حذف ناعم للخطة
 * الحذف الناعم من العميل مستحيل: سياسة القراءة (deleted_at IS NULL)
 * تُفرض على الصف الجديد بعد UPDATE فترفضه (درس مستفاد 13) —
 * لذا يتم خادمياً بـ service role مع حراسة manage_plans وعزل المدرسة.
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

async function canDeletePlans(admin: any, role: string, isSuper: boolean) {
  const { data: roleData } = await admin.from('roles').select('permissions').eq('code', role).maybeSingle()
  const perms: string[] = Array.isArray(roleData?.permissions) ? roleData!.permissions : []
  return perms.includes('all') || perms.includes('delete_plans') || ADMIN_ROLES.includes(role) || isSuper
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ planId: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { planId } = await context.params
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })

  if (!(await canDeletePlans(ctx.admin, ctx.me.role, ctx.me.is_super_admin))) {
    return NextResponse.json({ error: 'لا تملك صلاحية حذف الخطط' }, { status: 403 })
  }

  const { data: plan } = await ctx.admin
    .from('plans').select('id, school_id, deleted_at, approved_at').eq('id', planId).maybeSingle()
  if (!plan || plan.deleted_at) return NextResponse.json({ error: 'الخطة غير موجودة' }, { status: 404 })
  if (plan.school_id !== ctx.schoolId) {
    return NextResponse.json({ error: 'الخطة خارج نطاق مدرستك' }, { status: 403 })
  }
  if (plan.approved_at) {
    return NextResponse.json({ error: 'الخطة معتمدة ولا يمكن حذفها — أرشفها بدلاً من ذلك' }, { status: 403 })
  }

  const { data: rows, error } = await ctx.admin.from('plans')
    .update({ deleted_at: new Date().toISOString(), updated_by: auth.user.id })
    .eq('id', planId).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: 'لم يُحذف أي صف — تحقّق من معرّف الخطة' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

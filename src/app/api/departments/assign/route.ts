import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * ضمّ/إزالة مستخدمين من قسم (جماعي) — يضبط profiles.department.
 * الحراسة: manage_users + عزل المدرسة الفعّالة (لا يطال مستخدمي مدرسة أخرى).
 */

const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const admin = createAdminClient()

  const { data: me } = await admin
    .from('profiles').select('school_id, active_school_id, is_super_admin, role').eq('id', auth.user.id).single()
  if (!me) return NextResponse.json({ error: 'مستخدم غير موجود' }, { status: 403 })
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  if (!schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })

  const { data: roleData } = await admin.from('roles').select('permissions').eq('code', me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleData?.permissions) ? roleData!.permissions : []
  const canManage = me.is_super_admin || ADMIN_ROLES.includes(me.role)
    || perms.includes('all') || perms.includes('manage_users')
  if (!canManage) return NextResponse.json({ error: 'لا تملك صلاحية إدارة المستخدمين' }, { status: 403 })

  const { user_ids, department } = await req.json()
  if (!Array.isArray(user_ids) || user_ids.length === 0) {
    return NextResponse.json({ error: 'لم يُحدَّد مستخدمون' }, { status: 400 })
  }
  const dept = department ? String(department).trim() : null   // null = إزالة من القسم

  /* التحديث مقيّد بمدرسة المستخدم (لا يطال مستخدمي مدرسة أخرى) */
  const { data, error } = await admin.from('profiles')
    .update({ department: dept })
    .in('id', user_ids).eq('school_id', schoolId)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, updated: data?.length || 0 })
}

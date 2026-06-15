import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * توليد رابط إعادة تعيين كلمة المرور (recovery) دون إرسال بريد — يتجاوز حدّ البريد.
 * حسّاس: محمي بصلاحية manage_users + عزل المدرسة (المستخدم الهدف ضمن مدرسة المشرف الفعّالة).
 */

const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles').select('school_id, active_school_id, is_super_admin, role').eq('id', auth.user.id).single()
  if (!me) return NextResponse.json({ error: 'تعذّر تحديد المستخدم' }, { status: 400 })
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id

  /* صلاحية إدارة المستخدمين */
  const { data: roleData } = await admin.from('roles').select('permissions').eq('code', me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleData?.permissions) ? roleData!.permissions : []
  const canManage = me.is_super_admin || ADMIN_ROLES.includes(me.role) || perms.includes('all') || perms.includes('manage_users')
  if (!canManage) return NextResponse.json({ error: 'لا تملك صلاحية إدارة المستخدمين' }, { status: 403 })

  const { userId } = await req.json().catch(() => ({}))
  if (!userId) return NextResponse.json({ error: 'معرّف المستخدم مطلوب' }, { status: 400 })

  /* الهدف ضمن مدرسة المشرف الفعّالة (إلا لمشرف النظام) */
  const { data: target } = await admin.from('profiles').select('id, email, school_id').eq('id', userId).maybeSingle()
  if (!target?.email) return NextResponse.json({ error: 'المستخدم غير موجود أو بلا بريد' }, { status: 404 })
  if (!me.is_super_admin && target.school_id !== schoolId) {
    return NextResponse.json({ error: 'المستخدم خارج نطاق مدرستك' }, { status: 403 })
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: target.email,
    options: { redirectTo: `${siteUrl}/auth/callback?next=/auth/update-password` },
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const link = (data as any)?.properties?.action_link || ''
  if (!link) return NextResponse.json({ error: 'تعذّر توليد الرابط' }, { status: 500 })
  return NextResponse.json({ link })
}

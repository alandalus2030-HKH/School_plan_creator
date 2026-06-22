import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * إعادة تعيين كلمة المرور إدارياً عبر «كلمة مرور مؤقتة» مرتبطة بمستخدم محدد (بالـ id).
 * - لا روابط استرجاع (تتجنّب: الاستخدام مرة واحدة، الانتهاء، تعارض جلسة المشرف).
 * - يفعّل التغيير الإجباري عند أول دخول (must_change_password).
 * - حسّاس: محمي بصلاحية manage_users + عزل المدرسة + حماية الحسابات الإدارية الأعلى.
 */

const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']

/** كلمة مرور مؤقتة قوية وقابلة للقراءة (حروف + أرقام، ≥ 8) */
function genTempPassword(): string {
  const letters = 'abcdefghijkmnpqrstuvwxyz'
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const digits  = '23456789'
  const pick = (s: string, n: number) =>
    Array.from({ length: n }, () => s[Math.floor(Math.random() * s.length)]).join('')
  /* مثال: Kp7m-q4r9 */
  return `${pick(upper, 1)}${pick(letters, 3)}${pick(digits, 1)}-${pick(letters, 2)}${pick(digits, 2)}`
}

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
  const { data: target } = await admin
    .from('profiles').select('id, name_ar, username, email, school_id, is_super_admin').eq('id', userId).maybeSingle()
  if (!target) return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 })
  if (!me.is_super_admin && target.school_id !== schoolId) {
    return NextResponse.json({ error: 'المستخدم خارج نطاق مدرستك' }, { status: 403 })
  }
  /* لا يُعاد تعيين كلمة مرور مشرف النظام إلا من مشرف نظام */
  if (target.is_super_admin && !me.is_super_admin) {
    return NextResponse.json({ error: 'لا تملك صلاحية إعادة تعيين كلمة مرور هذا الحساب' }, { status: 403 })
  }

  /* ضبط كلمة مرور مؤقتة لحساب المستخدم المحدد بالذات */
  const tempPassword = genTempPassword()
  const { error: upErr } = await admin.auth.admin.updateUserById(userId, { password: tempPassword })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 })

  /* تفعيل التغيير الإجباري عند أول دخول */
  const { error: profErr } = await admin
    .from('profiles').update({ must_change_password: true }).eq('id', userId)
  if (profErr) return NextResponse.json({ error: 'تم ضبط الكلمة لكن تعذّر تفعيل التغيير الإجباري: ' + profErr.message }, { status: 500 })

  return NextResponse.json({
    tempPassword,
    username: target.username || null,
    name: target.name_ar || target.email || null,
  })
}

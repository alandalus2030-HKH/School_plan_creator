import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * DELETE /api/users/[userId] → حذف نهائي لمستخدم (auth.users + profiles)
 * حراسة خادمية: صلاحية manage_users + عزل المدرسة الفعّالة (يحترم التقمّص)
 * + منع حذف الحسابات المميّزة (مشرف النظام / مدير المدرسة) والذات.
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

async function canManageUsers(admin: any, role: string, isSuper: boolean) {
  const { data: roleData } = await admin.from('roles').select('permissions').eq('code', role).maybeSingle()
  const perms: string[] = Array.isArray(roleData?.permissions) ? roleData!.permissions : []
  return perms.includes('all') || perms.includes('manage_users') || ADMIN_ROLES.includes(role) || isSuper
}

const FK_MSG = 'تعذّر الحذف: المستخدم مرتبط بسجلات في النظام (مهام/أدلة/إشعارات). عطّل الحساب بدلاً من حذفه للحفاظ على السجل.'

export async function DELETE(req: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { userId } = await context.params
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })

  if (!(await canManageUsers(ctx.admin, ctx.me.role, ctx.me.is_super_admin))) {
    return NextResponse.json({ error: 'لا تملك صلاحية إدارة المستخدمين' }, { status: 403 })
  }

  if (userId === auth.user.id) {
    return NextResponse.json({ error: 'لا يمكنك حذف حسابك الشخصي' }, { status: 403 })
  }

  const { data: target } = await ctx.admin
    .from('profiles').select('id, role, is_super_admin, school_id').eq('id', userId).maybeSingle()
  if (!target) return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 })

  if (target.is_super_admin || target.role === 'super_admin') {
    return NextResponse.json({ error: 'لا يمكن حذف حساب مشرف النظام' }, { status: 403 })
  }
  if (ADMIN_ROLES.includes(target.role)) {
    return NextResponse.json({ error: 'لا يمكن حذف حساب مدير المدرسة — غيّر دوره أولاً إن لزم الحذف' }, { status: 403 })
  }
  if (target.school_id !== ctx.schoolId) {
    return NextResponse.json({ error: 'المستخدم خارج نطاق مدرستك' }, { status: 403 })
  }

  /* حذف حساب auth (يتسلسل إلى profiles عبر ON DELETE CASCADE) */
  const { error: authErr } = await ctx.admin.auth.admin.deleteUser(userId)
  if (authErr && !/not[ _-]?found/i.test(authErr.message)) {
    /* رسالة Supabase العامة «Database error deleting user» تغلّف غالباً انتهاك FK
       (مستخدم مرتبط بسجلات) — نعاملها كحالة ارتباط ونعرض الإرشاد العربي */
    const isFk = /foreign key|constraint|violates|database error/i.test(authErr.message)
    return NextResponse.json({ error: isFk ? FK_MSG : authErr.message }, { status: isFk ? 409 : 500 })
  }

  /* تحقّق فعلي من زوال الملف الشخصي — وإن بقي (ملف يتيم بلا حساب auth) احذفه صراحةً */
  const { data: remains } = await ctx.admin.from('profiles').select('id').eq('id', userId).maybeSingle()
  if (remains) {
    const { data: deleted, error: delErr } = await ctx.admin
      .from('profiles').delete().eq('id', userId).select('id')
    if (delErr) {
      const isFk = delErr.code === '23503'
      return NextResponse.json({ error: isFk ? FK_MSG : delErr.message }, { status: isFk ? 409 : 500 })
    }
    if (!deleted || deleted.length === 0) {
      return NextResponse.json({ error: 'لم يُحذف أي صف — تحقّق من سياسات القاعدة' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}

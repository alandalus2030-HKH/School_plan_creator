import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * تنبيه صاحب الخطة — يرسل إشعاراً للمسؤول عن الخطة (للمساءلة من لوحة التجميع).
 * الوصول: مشرف / view_aggregate / manage_plans + عزل المدرسة الفعّالة.
 */

const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']

export async function POST(req: NextRequest, context: { params: Promise<{ planId: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { planId } = await context.params
  const admin = createAdminClient()

  const { data: me } = await admin
    .from('profiles').select('school_id, active_school_id, is_super_admin, role').eq('id', auth.user.id).single()
  if (!me) return NextResponse.json({ error: 'مستخدم غير موجود' }, { status: 403 })
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id

  const { data: roleData } = await admin.from('roles').select('permissions').eq('code', me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleData?.permissions) ? roleData!.permissions : []
  const canNotify = me.is_super_admin || ADMIN_ROLES.includes(me.role)
    || perms.includes('all') || perms.includes('view_aggregate') || perms.includes('manage_plans')
  if (!canNotify) return NextResponse.json({ error: 'لا تملك صلاحية' }, { status: 403 })

  const { data: plan } = await admin
    .from('plans').select('id, name_ar, owner_id, school_id').eq('id', planId).maybeSingle()
  if (!plan || plan.school_id !== schoolId) return NextResponse.json({ error: 'الخطة خارج نطاق مدرستك' }, { status: 403 })
  if (!plan.owner_id) return NextResponse.json({ error: 'لا يوجد صاحب معيّن للخطة' }, { status: 400 })
  if (plan.owner_id === auth.user.id) return NextResponse.json({ error: 'أنت صاحب الخطة' }, { status: 400 })

  const { data: rp } = await admin.from('profiles')
    .select('notif_enabled, notif_inapp').eq('id', plan.owner_id).maybeSingle()
  if (rp?.notif_enabled === false || rp?.notif_inapp === false) {
    return NextResponse.json({ error: 'صاحب الخطة أوقف الإشعارات' }, { status: 400 })
  }

  const { error } = await admin.from('notifications').insert({
    recipient_id: plan.owner_id, sender_id: auth.user.id, type: 'task_status_changed',
    title: `🔔 تنبيه بخصوص خطتك: ${plan.name_ar}`,
    body: 'يُرجى متابعة حالة خطتك ومهامها.',
    link: `/dashboard/plans/${plan.id}`, is_read: false, send_email: false,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

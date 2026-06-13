import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * تغيير حالة الدليل (uploaded | approved | rejected)
 * الحراسة: manage_tasks / rate_tasks / مشرف + عزل المدرسة الفعّالة.
 */

const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']
const VALID = ['pending', 'accepted', 'rejected']

async function getContext(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles').select('school_id, active_school_id, is_super_admin, role').eq('id', userId).single()
  if (!me) return null
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  return { admin, me, schoolId }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ evidenceId: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { evidenceId } = await context.params
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })

  const { admin, me, schoolId } = ctx
  const { data: roleData } = await admin.from('roles').select('permissions').eq('code', me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleData?.permissions) ? roleData!.permissions : []
  const canReview = me.is_super_admin || ADMIN_ROLES.includes(me.role)
    || perms.includes('all') || perms.includes('manage_tasks') || perms.includes('rate_tasks')
  if (!canReview) return NextResponse.json({ error: 'لا تملك صلاحية مراجعة الأدلة' }, { status: 403 })

  const { status } = await req.json()
  if (!VALID.includes(status)) return NextResponse.json({ error: 'حالة غير صالحة' }, { status: 400 })

  /* تأكيد أن الدليل ضمن مدرسة المستخدم (الدليل → المهمة → العقدة → الخطة) */
  const { data: ev } = await admin.from('evidence').select('id, task_id').eq('id', evidenceId).maybeSingle()
  if (!ev) return NextResponse.json({ error: 'الدليل غير موجود' }, { status: 404 })
  const { data: t } = await admin.from('tasks').select('node_id').eq('id', ev.task_id).maybeSingle()
  const { data: n } = t?.node_id ? await admin.from('plan_nodes').select('plan_id').eq('id', t.node_id).maybeSingle() : { data: null }
  const { data: p } = n?.plan_id ? await admin.from('plans').select('school_id').eq('id', n.plan_id).maybeSingle() : { data: null }
  if (!p || p.school_id !== schoolId) return NextResponse.json({ error: 'الدليل خارج نطاق مدرستك' }, { status: 403 })

  const { error } = await admin.from('evidence').update({
    status,
    reviewed_by: status === 'pending' ? null : auth.user.id,
    reviewed_at: status === 'pending' ? null : new Date().toISOString(),
  }).eq('id', evidenceId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * DELETE /api/plans/[planId]/nodes/[nodeId] → حذف ناعم لعقدة خطة
 * (نفس علة حذف الخطط: سياسة القراءة ترفض الصف المحذوف ناعماً من العميل —
 * درس مستفاد 13 — لذا الحذف خادمي بحراسة manage_plans وعزل المدرسة)
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

async function canManagePlans(admin: any, role: string, isSuper: boolean) {
  const { data: roleData } = await admin.from('roles').select('permissions').eq('code', role).maybeSingle()
  const perms: string[] = Array.isArray(roleData?.permissions) ? roleData!.permissions : []
  return perms.includes('all') || perms.includes('manage_plans') || ADMIN_ROLES.includes(role) || isSuper
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ planId: string; nodeId: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { planId, nodeId } = await context.params
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })

  if (!(await canManagePlans(ctx.admin, ctx.me.role, ctx.me.is_super_admin))) {
    return NextResponse.json({ error: 'لا تملك صلاحية إدارة الخطط' }, { status: 403 })
  }

  /* العقدة تتبع الخطة، والخطة تتبع المدرسة الفعّالة */
  const { data: node } = await ctx.admin
    .from('plan_nodes').select('id, plan_id, deleted_at').eq('id', nodeId).maybeSingle()
  if (!node || node.deleted_at || node.plan_id !== planId) {
    return NextResponse.json({ error: 'العقدة غير موجودة' }, { status: 404 })
  }
  const { data: plan } = await ctx.admin
    .from('plans').select('school_id, approved_at').eq('id', planId).maybeSingle()
  if (!plan || plan.school_id !== ctx.schoolId) {
    return NextResponse.json({ error: 'الخطة خارج نطاق مدرستك' }, { status: 403 })
  }
  if (plan.approved_at) {
    return NextResponse.json({ error: 'الخطة معتمدة — لا يمكن حذف عناصرها' }, { status: 403 })
  }

  /* حذف متسلسل: العقدة + كل المنحدرات منها + كل مهامها (حذف ناعم) */
  const { data: allNodes } = await ctx.admin.from('plan_nodes')
    .select('id, parent_id').eq('plan_id', planId).is('deleted_at', null)
  const childrenMap: Record<string, string[]> = {}
  for (const n of allNodes || []) (childrenMap[n.parent_id ?? 'root'] ||= []).push(n.id)
  const nodeIds: string[] = []
  const stack = [nodeId]
  while (stack.length) {
    const cur = stack.pop()!
    nodeIds.push(cur)
    for (const c of childrenMap[cur] || []) stack.push(c)
  }

  const now = new Date().toISOString()
  const { data: rows, error } = await ctx.admin.from('plan_nodes')
    .update({ deleted_at: now }).in('id', nodeIds).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: 'لم يُحذف أي صف — تحقّق من معرّف العقدة' }, { status: 500 })
  }

  /* حذف المهام التابعة لأي من العقد المحذوفة */
  const { data: delTasks, error: tErr } = await ctx.admin.from('tasks')
    .update({ deleted_at: now, updated_by: auth.user.id })
    .in('node_id', nodeIds).is('deleted_at', null).select('id')
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, deletedNodes: rows.length, deletedTasks: delTasks?.length || 0 })
}

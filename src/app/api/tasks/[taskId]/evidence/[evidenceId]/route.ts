import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ taskId: string; evidenceId: string }> }
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { taskId, evidenceId } = await context.params
  const admin = createAdminClient()

  /* تحقّق من المستخدم وصلاحياته */
  const { data: me } = await admin
    .from('profiles').select('role, school_id, active_school_id, is_super_admin').eq('id', auth.user.id).single()
  if (!me) return NextResponse.json({ error: 'مستخدم غير موجود' }, { status: 403 })

  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id

  /* التحقق من صلاحية manage_tasks أو manage_plans أو is_super_admin */
  const { data: roleData } = await admin.from('roles').select('permissions').eq('code', me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleData?.permissions) ? roleData!.permissions : []
  const canDelete = perms.includes('all') || perms.includes('manage_tasks') || perms.includes('manage_plans')
    || ADMIN_ROLES.includes(me.role) || me.is_super_admin

  if (!canDelete) return NextResponse.json({ error: 'لا تملك صلاحية حذف الأدلة' }, { status: 403 })

  /* تحقق من أن الدليل يتبع المهمة، والمهمة تتبع مدرسة المستخدم */
  const { data: ev } = await admin
    .from('evidence').select('id, task_id').eq('id', evidenceId).eq('task_id', taskId).maybeSingle()
  if (!ev) return NextResponse.json({ error: 'الدليل غير موجود' }, { status: 404 })

  const { data: task } = await admin
    .from('tasks').select('node_id').eq('id', taskId).maybeSingle()
  if (!task) return NextResponse.json({ error: 'المهمة غير موجودة' }, { status: 404 })

  /* حذف فعلي */
  const { error: delError } = await admin.from('evidence').delete().eq('id', evidenceId)
  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })

  /* إعادة الترقيم: الأدلة المتبقية بعد الحذف */
  const { data: remaining } = await admin
    .from('evidence')
    .select('id, created_at')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })

  if (remaining && remaining.length > 0) {
    /* حساب رقم المهمة لاشتقاق أرقام الأدلة */
    let taskNum: string | null = null
    if (task.node_id) {
      const { data: node } = await admin
        .from('plan_nodes').select('plan_id').eq('id', task.node_id).single()
      if (node?.plan_id) {
        const { data: taskRow } = await admin
          .from('tasks').select('order_num').eq('id', taskId).single()
        const { data: allNodes } = await admin
          .from('plan_nodes').select('id, parent_id, order_num, standard_code').eq('plan_id', node.plan_id)

        if (allNodes && taskRow) {
          const chain: { order_num: number; standard_code: string | null }[] = []
          let current = allNodes.find((n: any) => n.id === task.node_id)
          while (current) {
            chain.unshift({ order_num: current.order_num, standard_code: (current as any).standard_code || null })
            current = allNodes.find((n: any) => n.id === current!.parent_id)
          }
          let baseIdx = -1
          for (let i = chain.length - 1; i >= 0; i--) {
            if (chain[i].standard_code) { baseIdx = i; break }
          }
          const path: (string | number)[] = []
          if (baseIdx >= 0) {
            path.push(chain[baseIdx].standard_code as string)
            for (let i = baseIdx + 1; i < chain.length; i++) path.push(chain[i].order_num)
          } else {
            for (const n of chain) path.push(n.order_num)
          }
          path.push(taskRow.order_num)
          taskNum = path.join('.')
        }
      }
    }

    await Promise.all(
      remaining.map((r: any, idx: number) =>
        admin.from('evidence')
          .update({ evidence_number: taskNum ? `${taskNum}.${idx + 1}` : `دليل-${idx + 1}` })
          .eq('id', r.id)
      )
    )
  }

  return NextResponse.json({ ok: true })
}

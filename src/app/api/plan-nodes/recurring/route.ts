import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAudit } from '@/lib/audit'

/**
 * إشارةُ عقدة الخطة إلى مهمّة دورية قائمة (الوثيقة 5.1‑2).
 *
 * GET    ?planId= | ?nodeId=   → الإشارات ومعها مؤشّر كل ممارسة
 * POST   { nodeId, taskId }    → تُربط
 * DELETE { nodeId, taskId }    → تُفكّ
 *
 * ── إشارةٌ لا إنشاء ──
 * «الخطة **تشير إليها ولا تنشئها**: واضع الخطة يختار «مهمة دورية
 *  قائمة» بدل كتابة مهمّة جديدة» (5.1‑2). فلا منفذَ هنا يُنشئ مهمّةً
 * دورية — التعريف في الإعدادات وحدها، «بشرط أن يكون الاختيار من
 * **قائمة جاهزة، لا نموذج إنشاء جديداً داخل الخطة**» (5.4).
 *
 * ── ولا تُحتسب في إنجاز الخطة ──
 * «المهمة الدورية لا تنتهي أبداً، فتبقى الخطة دون 100٪ إلى الأبد —
 *  أو «تكتمل» بإغلاق دورة واحدة» (5.2). والعلاج **بنيويّ**: الربط
 * صفٌّ في `plan_node_recurring` **لا صفٌّ في `tasks`**، فلا يراه أيُّ
 * حسابٍ للإنجاز — ولا يلزم استثناءٌ يُنسى في استعلام.
 *
 * ── ولها مؤشّرها الخاص ──
 * «تُعرض ممارسةً قائمة مرتبطة بالهدف، ولها مؤشّرها: **12 دورة من 12
 *  وُثّقت**» (5.2). فيُرجَع مع كل إشارةٍ حسابُ دوراتها — ثلاث حالات
 * لا اثنتان، والمهمَل وحده فجوة (5.3).
 */

async function ctxOf(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles')
    .select('id, school_id, active_school_id, is_super_admin, role')
    .eq('id', userId).single()
  if (!me) return null
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  const { data: roleRow } = await admin.from('roles').select('permissions').eq('code', me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleRow?.permissions) ? roleRow!.permissions : []
  const can = (p: string) => me.is_super_admin || perms.includes('all') || perms.includes(p)
  return { admin, me, schoolId, can }
}

/** العقدة ضمن مدرسة المستخدم — ويُرجَع معها اسمُها وخطّتها. */
async function nodeInSchool(admin: any, nodeId: string, schoolId: string) {
  const { data } = await admin.from('plan_nodes')
    .select('id, name_ar, level_num, plan_id, plan:plans!inner(id, school_id, name_ar, level_count)')
    .eq('id', nodeId).is('deleted_at', null).maybeSingle()
  if (!data || (data as any).plan?.school_id !== schoolId) return null
  return data as any
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await ctxOf(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, schoolId, can } = ctx
  if (!can('view_plans') && !can('manage_plans')) {
    return NextResponse.json({ error: 'لا تملك صلاحية الخطط' }, { status: 403 })
  }

  const planId = req.nextUrl.searchParams.get('planId')
  const nodeId = req.nextUrl.searchParams.get('nodeId')
  if (!planId && !nodeId) return NextResponse.json({ error: 'الخطة أو العقدة مطلوبة' }, { status: 400 })

  /* عقد النطاق المطلوب — ضمن المدرسة حتماً */
  let nodeQ = admin.from('plan_nodes')
    .select('id, plan:plans!inner(id, school_id)').is('deleted_at', null)
  nodeQ = planId ? nodeQ.eq('plan_id', planId) : nodeQ.eq('id', nodeId as string)
  const { data: scope } = await nodeQ
  const ids = (scope || []).filter((n: any) => n.plan?.school_id === schoolId).map((n: any) => n.id)
  if (!ids.length) return NextResponse.json({ links: [] })

  const { data: links, error } = await admin.from('plan_node_recurring')
    .select('plan_node_id, recurring_task_id, created_at')
    .in('plan_node_id', ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const taskIds = [...new Set((links || []).map((l: any) => l.recurring_task_id))]
  if (!taskIds.length) return NextResponse.json({ links: [] })

  const [{ data: tasks }, { data: cycles }] = await Promise.all([
    admin.from('recurring_tasks')
      .select('id, name_ar, frequency, assigned_department, assigned_job_title, is_active, deleted_at')
      .in('id', taskIds),
    admin.from('recurring_task_cycles')
      .select('id, recurring_task_id, period_label, due_date, status, justification')
      .in('recurring_task_id', taskIds).order('due_date', { ascending: false }),
  ])

  const taskOf = new Map((tasks || []).map((t: any) => [t.id, t]))
  const tallyOf = (id: string) => {
    const mine = (cycles || []).filter((c: any) => c.recurring_task_id === id)
    return {
      documented: mine.filter((c: any) => c.status === 'documented').length,
      skipped:    mine.filter((c: any) => c.status === 'skipped').length,
      neglected:  mine.filter((c: any) => c.status === 'neglected').length,
      open:       mine.filter((c: any) => c.status === 'open').length,
      total:      mine.length,
    }
  }

  const out = (links || []).map((l: any) => {
    const t: any = taskOf.get(l.recurring_task_id)
    if (!t || t.deleted_at) return null      // حُذفت المهمّة: إشارةٌ معلّقة تُطوى
    return {
      nodeId: l.plan_node_id,
      taskId: t.id,
      name: t.name_ar,
      frequency: t.frequency,
      assignee: t.assigned_job_title || t.assigned_department,
      isActive: t.is_active,
      tally: tallyOf(t.id),
      /* الدورات نفسها لا عدَدُها وحده — «والمبرّر جزء من السجل يقرؤه
         المقيّم» (5.3)، فمن يقرأ الهدف يقرأ ما جرى في كل دورة */
      cycles: (cycles || [])
        .filter((c: any) => c.recurring_task_id === t.id)
        .slice(0, 12)
        .map((c: any) => ({
          id: c.id, period: c.period_label, dueDate: c.due_date,
          status: c.status, justification: c.justification,
        })),
    }
  }).filter(Boolean)

  return NextResponse.json({ links: out })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await ctxOf(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, schoolId, can } = ctx
  if (!can('manage_plans')) {
    return NextResponse.json({ error: 'ربط الممارسات ببناء الخطة لمن يُدير الخطط' }, { status: 403 })
  }

  const b = await req.json().catch(() => ({} as any))
  const nodeId = String(b.nodeId || '').trim()
  const taskId = String(b.taskId || '').trim()
  if (!nodeId || !taskId) return NextResponse.json({ error: 'العقدة والمهمّة مطلوبتان' }, { status: 400 })

  const node = await nodeInSchool(admin, nodeId, schoolId)
  if (!node) return NextResponse.json({ error: 'العقدة غير موجودة' }, { status: 404 })

  /* محلُّها حيث تُكتب المهامّ — فهي تقوم مقام مهمّةٍ لا مقام هدف */
  const depth = node.plan?.level_count || 3
  if (node.level_num !== depth) {
    return NextResponse.json({
      error: 'الممارسة الدورية تُربط بالمستوى الأخير — حيث تُكتب المهامّ، فهي تقوم مقام مهمّة (5.1)',
    }, { status: 400 })
  }

  const { data: task } = await admin.from('recurring_tasks')
    .select('id, name_ar, school_id, deleted_at')
    .eq('id', taskId).eq('school_id', schoolId).is('deleted_at', null).maybeSingle()
  if (!task) return NextResponse.json({ error: 'المهمّة الدورية غير موجودة' }, { status: 404 })

  const { error } = await admin.from('plan_node_recurring')
    .upsert({ plan_node_id: nodeId, recurring_task_id: taskId, linked_by: auth.user.id },
            { onConflict: 'plan_node_id,recurring_task_id', ignoreDuplicates: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recordAudit({
    req, userId: auth.user.id, schoolId,
    action: 'create', table: 'plan_node_recurring', recordId: `${nodeId}:${taskId}`,
    after: { node: node.name_ar, task: task.name_ar },
  })
  return NextResponse.json({ linked: true })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await ctxOf(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, schoolId, can } = ctx
  if (!can('manage_plans')) {
    return NextResponse.json({ error: 'فكّ الإشارة لمن يُدير الخطط' }, { status: 403 })
  }

  const b = await req.json().catch(() => ({} as any))
  const nodeId = String(b.nodeId || '').trim()
  const taskId = String(b.taskId || '').trim()
  if (!nodeId || !taskId) return NextResponse.json({ error: 'العقدة والمهمّة مطلوبتان' }, { status: 400 })

  const node = await nodeInSchool(admin, nodeId, schoolId)
  if (!node) return NextResponse.json({ error: 'العقدة غير موجودة' }, { status: 404 })

  /* «إشارةٌ محضة: حذفها لا يمسّ دورةً واحدة» (093) — فلا حارسَ هنا */
  const { error } = await admin.from('plan_node_recurring')
    .delete().eq('plan_node_id', nodeId).eq('recurring_task_id', taskId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recordAudit({
    req, userId: auth.user.id, schoolId,
    action: 'delete', table: 'plan_node_recurring', recordId: `${nodeId}:${taskId}`,
    before: { node: node.name_ar, task: taskId },
  })
  return NextResponse.json({ unlinked: true })
}

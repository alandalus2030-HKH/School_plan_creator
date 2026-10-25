import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAudit } from '@/lib/audit'

/**
 * المهامّ الدورية — التعريف (الوثيقة 5.1 · 5.2 · 5.4)
 *
 * GET    → القائمة ومعها مراسيها ودوراتها الأخيرة وحالُ تغطيتها
 * POST   → تعريفٌ جديد (الاسم · الدورية · المنصب أو القسم · المراسي · السياسة)
 * PATCH  → تعديلٌ أو تعطيل · وتحديث المراسي
 * DELETE → حذفٌ ناعم
 *
 * ── وموضع هذه الشاشة: الإعدادات لا الخطة ──
 * «والتعقيد ينتقل إلى الإعدادات — شاشة التعريف يواجهها **منسّق الجودة
 *  مرّةً، لا المعلّم كل يوم**. وهذا تعقيدٌ في محلّه» (5.4).
 * ولهذا الصلاحية `manage_settings` أو `triage_evidence`: من يعرف الإطار
 * هو من يُسند، كما في طلب الدليل الموجَّه.
 *
 * ── ولا إسناد لشخص ──
 * «تُسنَد إلى منصب أو قسم (رئيس قسم الرياضيات · لجنة الأنشطة)» (5.2).
 * والقاعدة تمنعه بغياب العمود، وهذا المنفذ لا يعرض له حقلاً أصلاً.
 */

async function ctxOf(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles')
    .select('id, name_ar, school_id, active_school_id, is_super_admin, role')
    .eq('id', userId).single()
  if (!me) return null
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  const { data: roleRow } = await admin.from('roles').select('permissions').eq('code', me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleRow?.permissions) ? roleRow!.permissions : []
  const can = (p: string) => me.is_super_admin || perms.includes('all') || perms.includes(p)
  return { admin, me, schoolId, can }
}

const FREQ = ['weekly', 'monthly', 'semi_termly', 'termly', 'annual']
const POLICY = ['previous', 'next', 'by_date']

/* ════════════════════ GET ════════════════════ */

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await ctxOf(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, schoolId, can } = ctx

  /* القراءة لمن يرى الخطط أو الأدلة — فهي ممارسةٌ تخصّ الاثنين */
  if (!can('view_plans') && !can('view_evidence') && !can('triage_evidence') && !can('manage_settings')) {
    return NextResponse.json({ error: 'لا تملك صلاحية العرض' }, { status: 403 })
  }

  const one = req.nextUrl.searchParams.get('id')
  let q = admin.from('recurring_tasks')
    .select('*').eq('school_id', schoolId).is('deleted_at', null)
    .order('is_active', { ascending: false }).order('name_ar')
  if (one) q = q.eq('id', one)

  const { data: tasks, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const list = tasks || []
  const ids = list.map((t: any) => t.id)

  const [{ data: anchors }, { data: cycles }, { data: links }] = await Promise.all([
    ids.length ? admin.from('recurring_task_anchors')
        .select('recurring_task_id, framework_node_id, kind').in('recurring_task_id', ids)
      : Promise.resolve({ data: [] as any[] }),
    ids.length ? admin.from('recurring_task_cycles')
        .select('id, recurring_task_id, period_label, due_date, academic_year, status, justification, evidence_id, request_id')
        .in('recurring_task_id', ids).order('due_date', { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    ids.length ? admin.from('plan_node_recurring')
        .select('recurring_task_id, plan_node_id').in('recurring_task_id', ids)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const nodeIds = [...new Set((anchors || []).map((a: any) => a.framework_node_id))]
  const { data: nodes } = nodeIds.length
    ? await admin.from('framework_nodes').select('id, code, name_ar, level').in('id', nodeIds)
    : { data: [] as any[] }
  const nodeOf = new Map((nodes || []).map((n: any) => [n.id, n]))

  const items = list.map((t: any) => {
    const myCycles = (cycles || []).filter((c: any) => c.recurring_task_id === t.id)
    /* ثلاث حالات في التغطية لا اثنتان (5.3) — والمهملة وحدها فجوة */
    const documented = myCycles.filter((c: any) => c.status === 'documented').length
    const skipped    = myCycles.filter((c: any) => c.status === 'skipped').length
    const neglected  = myCycles.filter((c: any) => c.status === 'neglected').length
    const open       = myCycles.filter((c: any) => c.status === 'open').length
    return {
      ...t,
      anchors: (anchors || []).filter((a: any) => a.recurring_task_id === t.id)
        .map((a: any) => ({ ...nodeOf.get(a.framework_node_id), kind: a.kind, nodeId: a.framework_node_id }))
        .filter((a: any) => a.code),
      linkedNodes: (links || []).filter((l: any) => l.recurring_task_id === t.id).length,
      cycles: myCycles.slice(0, 12),
      /* «ولها مؤشّرها الخاص: 12 دورة من 12 وُثّقت» (5.2) — لا نسبة إنجاز خطة */
      tally: { documented, skipped, neglected, open, total: myCycles.length },
    }
  })

  return NextResponse.json({
    items,
    canManage: can('manage_settings') || can('triage_evidence'),
  })
}

/* ════════════════════ POST ════════════════════ */

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await ctxOf(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, schoolId, can } = ctx

  if (!can('manage_settings') && !can('triage_evidence')) {
    return NextResponse.json({ error: 'تعريف المهامّ الدورية لمنسّق الجودة أو مدير النظام' }, { status: 403 })
  }

  const b = await req.json().catch(() => ({} as any))
  const name = String(b.nameAr || '').trim()
  const frequency = String(b.frequency || '').trim()
  const dept = String(b.assignedDepartment || '').trim() || null
  const job  = String(b.assignedJobTitle   || '').trim() || null
  const policy = String(b.yearPolicy || 'by_date').trim()
  const leadDays = Number.isFinite(Number(b.leadDays)) ? Math.round(Number(b.leadDays)) : 7
  const anchorIds: string[] = Array.isArray(b.anchors) ? b.anchors.map(String).slice(0, 40) : []

  if (!name)                    return NextResponse.json({ error: 'اسم المهمّة مطلوب' }, { status: 400 })
  if (!FREQ.includes(frequency)) return NextResponse.json({ error: 'الدورية: أسبوعية · شهرية · نصف فصلية · فصلية · سنوية' }, { status: 400 })
  /* «تُسنَد إلى منصب أو قسم لا شخصاً» (5.2) */
  if (!dept && !job)            return NextResponse.json({ error: 'الإسناد إلى قسمٍ أو منصب — ولا يُسنَد لشخص (5.2)' }, { status: 400 })
  if (!POLICY.includes(policy)) return NextResponse.json({ error: 'سياسة العام: المنصرم · القادم · بالتاريخ' }, { status: 400 })
  if (leadDays < 0 || leadDays > 120) return NextResponse.json({ error: 'مدّة التنبيه بين 0 و120 يوماً' }, { status: 400 })
  if (!anchorIds.length)        return NextResponse.json({ error: 'المراسي مطلوبة — وهي ما يجعلها تُسنَد مرّةً وتُثمر سنوات (5)' }, { status: 400 })

  /* المراسي من الإصدار النشط، ومستواها معيارٌ فرعيّ أو مؤشّر (3.3) */
  const { data: nodes } = await admin.from('framework_nodes')
    .select('id, level, frameworks!inner(status)').in('id', anchorIds)
  const ok = (nodes || []).filter((n: any) => n.frameworks?.status === 'active' && (n.level === 3 || n.level === 4))
  if (ok.length !== anchorIds.length) {
    return NextResponse.json({ error: 'المرساة معيارٌ فرعيّ أو مؤشّر من الإصدار النشط' }, { status: 400 })
  }

  const { data: row, error } = await admin.from('recurring_tasks').insert({
    school_id: schoolId,
    name_ar: name,
    description: String(b.description || '').trim() || null,
    frequency,
    assigned_department: dept,
    assigned_job_title: job,
    expected_evidence_type: String(b.expectedEvidenceType || '').trim() || null,
    year_policy: policy,
    lead_days: leadDays,
    starts_on: String(b.startsOn || '').trim() || null,
    ends_on:   String(b.endsOn   || '').trim() || null,
    created_by: auth.user.id,
  }).select('id').single()
  if (error || !row) return NextResponse.json({ error: error?.message || 'تعذّر الحفظ' }, { status: 500 })

  const { error: aErr } = await admin.from('recurring_task_anchors').insert(
    ok.map((n: any) => ({
      recurring_task_id: row.id,
      framework_node_id: n.id,
      kind: n.level === 3 ? 'implicit' : 'specific',
    })))
  if (aErr) {
    await admin.from('recurring_tasks').delete().eq('id', row.id)
    return NextResponse.json({ error: aErr.message }, { status: 500 })
  }

  await recordAudit({
    req, userId: auth.user.id, schoolId,
    action: 'create', table: 'recurring_tasks', recordId: row.id,
    after: { name, frequency, assignee: job || dept, anchors: ok.length, policy },
  })
  return NextResponse.json({ id: row.id, created: true })
}

/* ════════════════════ PATCH ════════════════════ */

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await ctxOf(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, schoolId, can } = ctx

  if (!can('manage_settings') && !can('triage_evidence')) {
    return NextResponse.json({ error: 'تعديل المهامّ الدورية لمنسّق الجودة أو مدير النظام' }, { status: 403 })
  }

  const b = await req.json().catch(() => ({} as any))
  const id = String(b.id || '').trim()
  if (!id) return NextResponse.json({ error: 'المهمّة مطلوبة' }, { status: 400 })

  const { data: cur } = await admin.from('recurring_tasks')
    .select('id, school_id, name_ar').eq('id', id).eq('school_id', schoolId).maybeSingle()
  if (!cur) return NextResponse.json({ error: 'المهمّة غير موجودة' }, { status: 404 })

  const patch: any = {}
  if (typeof b.nameAr === 'string' && b.nameAr.trim()) patch.name_ar = b.nameAr.trim()
  if (typeof b.description === 'string') patch.description = b.description.trim() || null
  if (typeof b.frequency === 'string' && FREQ.includes(b.frequency)) patch.frequency = b.frequency
  if (typeof b.yearPolicy === 'string' && POLICY.includes(b.yearPolicy)) patch.year_policy = b.yearPolicy
  if (typeof b.expectedEvidenceType === 'string') patch.expected_evidence_type = b.expectedEvidenceType.trim() || null
  if (b.leadDays !== undefined) {
    const n = Number(b.leadDays)
    if (!Number.isInteger(n) || n < 0 || n > 120)
      return NextResponse.json({ error: 'مدّة التنبيه بين 0 و120 يوماً' }, { status: 400 })
    patch.lead_days = n
  }
  if (typeof b.isActive === 'boolean') patch.is_active = b.isActive
  if (typeof b.endsOn === 'string') patch.ends_on = b.endsOn.trim() || null

  /* الإسناد: منصبٌ أو قسم — ولا يُفرَّغ الاثنان معاً (حارسُ القاعدة يرفضه) */
  if (b.assignedDepartment !== undefined || b.assignedJobTitle !== undefined) {
    const dept = String(b.assignedDepartment ?? '').trim() || null
    const job  = String(b.assignedJobTitle   ?? '').trim() || null
    if (!dept && !job) return NextResponse.json({ error: 'الإسناد إلى قسمٍ أو منصب — ولا يُسنَد لشخص (5.2)' }, { status: 400 })
    patch.assigned_department = dept
    patch.assigned_job_title  = job
  }

  /* المراسي تُستبدل جملةً — و«أوّل ما يمرّ على جدول التحويل عند تفعيل
     إصدار جديد: راجِع إسناد 60 مهمة دورية» (5.2) */
  if (Array.isArray(b.anchors)) {
    const anchorIds = b.anchors.map(String).slice(0, 40)
    if (!anchorIds.length) return NextResponse.json({ error: 'لا تُترك المهمّة بلا مرساة' }, { status: 400 })
    const { data: nodes } = await admin.from('framework_nodes')
      .select('id, level, frameworks!inner(status)').in('id', anchorIds)
    const ok = (nodes || []).filter((n: any) => n.frameworks?.status === 'active' && (n.level === 3 || n.level === 4))
    if (ok.length !== anchorIds.length) {
      return NextResponse.json({ error: 'المرساة معيارٌ فرعيّ أو مؤشّر من الإصدار النشط' }, { status: 400 })
    }
    await admin.from('recurring_task_anchors').delete().eq('recurring_task_id', id)
    const { error: aErr } = await admin.from('recurring_task_anchors').insert(
      ok.map((n: any) => ({
        recurring_task_id: id, framework_node_id: n.id,
        kind: n.level === 3 ? 'implicit' : 'specific',
      })))
    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })
  }

  if (Object.keys(patch).length) {
    const { error } = await admin.from('recurring_tasks').update(patch).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await recordAudit({
    req, userId: auth.user.id, schoolId,
    action: 'update', table: 'recurring_tasks', recordId: id,
    after: { ...patch, ...(Array.isArray(b.anchors) ? { anchors: b.anchors.length } : {}) },
  })
  return NextResponse.json({ updated: true })
}

/* ════════════════════ DELETE — حذفٌ ناعم ════════════════════ */

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await ctxOf(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, schoolId, can } = ctx

  if (!can('manage_settings') && !can('triage_evidence')) {
    return NextResponse.json({ error: 'حذف المهامّ الدورية لمنسّق الجودة أو مدير النظام' }, { status: 403 })
  }

  const { id } = await req.json().catch(() => ({} as any))
  if (!id) return NextResponse.json({ error: 'المهمّة مطلوبة' }, { status: 400 })

  /* دورةٌ موثّقة أثرٌ في التغطية — فالحذف ناعمٌ أبداً، والتاريخ يبقى */
  const { error } = await admin.from('recurring_tasks')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id).eq('school_id', schoolId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recordAudit({
    req, userId: auth.user.id, schoolId,
    action: 'delete', table: 'recurring_tasks', recordId: String(id),
  })
  return NextResponse.json({ deleted: true })
}

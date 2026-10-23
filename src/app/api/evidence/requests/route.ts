import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAudit } from '@/lib/audit'

/**
 * طلب الدليل الموجَّه — القناة الثالثة (الوثيقة 3.1)
 *
 * GET   ?scope=mine  →  «أدلة مطلوبة» للمكلَّف (مفتوحةً وقيد التقييم)
 * GET                →  لوحة الطالب: طلبات المدرسة بحالاتها وعدّاداتها
 * POST               →  إنشاء طلب (منسّق الجودة أو عضو فريق تركيز)
 * PATCH              →  تمديد المهلة · تعديل النصّ · إعادة الإسناد · حذفٌ ناعم
 *
 * ── وقيمة هذه القناة ──
 * «هو ما يحلّ معضلة الجمع والإسناد معاً: منسّق الجودة — وهو من يعرف
 *  الإطار — يحدّد المؤشّر عند الطلب، فينتقل عبء الدقّة إلى من يملكها،
 *  **ويُرفع عن المعلّم تماماً**».
 *
 * فالمرساة تُولد مع الطلب لا عند الرفع، والموظّف **يرفع الملفّ فقط**.
 *
 * ── ولا حالةَ «أُلغي» ──
 * الحالات ثلاث بنصّ الوثيقة. وطلبٌ أُرسل خطأً يُحذف حذفاً ناعماً:
 * الملغى **لم يكن**، والمغلق **سدّ فجوة** — وخلطهما يُفسد كل عدٍّ
 * للفجوات، وهو ما تُبنى عليه التغطية.
 */

async function ctxOf(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles')
    .select('id, name_ar, school_id, active_school_id, is_super_admin, role, department, job_title')
    .eq('id', userId).single()
  if (!me) return null
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  const { data: roleRow } = await admin.from('roles').select('permissions').eq('code', me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleRow?.permissions) ? roleRow!.permissions : []
  const can = (p: string) => me.is_super_admin || perms.includes('all') || perms.includes(p)
  return { admin, me, schoolId, can }
}

/** أسماء عقد الإطار المشار إليها — بطلبٍ واحد لا بطلبٍ لكل صفّ */
async function nodeMap(admin: any, ids: string[]) {
  const uniq = [...new Set(ids.filter(Boolean))]
  if (!uniq.length) return new Map<string, any>()
  const { data } = await admin.from('framework_nodes')
    .select('id, code, name_ar, level').in('id', uniq)
  return new Map((data || []).map((n: any) => [n.id, n]))
}

const overdue = (r: any) =>
  r.status === 'open' && !!r.due_date && r.due_date < new Date().toISOString().slice(0, 10)

/* ════════════════════ GET ════════════════════ */

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await ctxOf(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, me, schoolId, can } = ctx

  const mine = req.nextUrl.searchParams.get('scope') === 'mine'
  const one  = req.nextUrl.searchParams.get('id')

  /* «أدلة مطلوبة» حقُّ كل مكلَّف — ولوحةُ الطلبات لمن يفرز (10) */
  if (!mine && !can('triage_evidence')) {
    return NextResponse.json({ error: 'لوحة الطلبات تتطلّب صلاحية الفرز' }, { status: 403 })
  }

  let q = admin.from('evidence_requests')
    .select(`id, status, what_is_asked, expected_type, academic_year, due_date,
             sub_node_id, indicator_ids, attempts, last_reject, diverted_note,
             created_at, closed_at, evidence_id,
             assigned_to, assigned_department, assigned_job_title,
             requester:profiles!evidence_requests_requested_by_fkey(id, name_ar),
             assignee:profiles!evidence_requests_assigned_to_fkey(id, name_ar),
             evidence:evidence!evidence_requests_evidence_id_fkey(id, name, code, status)`)
    .eq('school_id', schoolId)
    .is('deleted_at', null)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (one)  q = q.eq('id', one)
  /* ── «أدلة مطلوبة»: ما أُسند إليّ شخصياً **أو إلى قسمي أو منصبي** ──
     فطلبُ الدورة مُسنَدٌ إلى وجهةٍ مؤسسية لا إلى شخص (5.2)، «فالممارسة
     مؤسسية، وإسنادها لشخصٍ بعينه يقتلها عند رحيله». ومن يشغل الوجهة
     اليوم يراها، فلا إعادة إسنادٍ عند تبدّل الناس. */
  if (mine) {
    const ors = [`assigned_to.eq.${auth.user.id}`]
    if (me.department) ors.push(`assigned_department.eq.${me.department}`)
    if (me.job_title)  ors.push(`assigned_job_title.eq.${me.job_title}`)
    q = q.or(ors.join(',')).neq('status', 'closed')
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = data || []

  /* طلبُ الدورة يُعرَف ليُعرَض معه بابُ المبرّر (5.2) */
  const { data: cycleRows } = rows.length
    ? await admin.from('recurring_task_cycles')
        .select('id, request_id, period_label, recurring_task_id')
        .in('request_id', rows.map((r: any) => r.id))
    : { data: [] as any[] }
  const cycleOf = new Map((cycleRows || []).map((c: any) => [c.request_id, c]))

  const nodes = await nodeMap(admin, [
    ...rows.map((r: any) => r.sub_node_id),
    ...rows.flatMap((r: any) => r.indicator_ids || []),
  ])

  const requests = rows.map((r: any) => ({
    ...r,
    sub: nodes.get(r.sub_node_id) || null,
    indicators: (r.indicator_ids || []).map((i: string) => nodes.get(i)).filter(Boolean),
    /* فراغ المؤشرات «يغطّي المعيار الفرعي كاملاً» — تغطيةٌ ضمنية (3.3) */
    whole: !(r.indicator_ids || []).length,
    overdue: overdue(r),
    /* وجهةُ الطلب — شخصٌ أو وجهةٌ مؤسسية (5.2) */
    target: r.assigned_to ? 'person' : (r.assigned_job_title ? 'job' : 'department'),
    targetName: r.assigned_to ? (r.assignee?.name_ar || '—')
                : (r.assigned_job_title || r.assigned_department),
    cycle: cycleOf.get(r.id) || null,
  }))

  return NextResponse.json({
    requests,
    counts: {
      open:      requests.filter((r: any) => r.status === 'open').length,
      in_review: requests.filter((r: any) => r.status === 'in_review').length,
      closed:    requests.filter((r: any) => r.status === 'closed').length,
      overdue:   requests.filter((r: any) => r.overdue).length,
    },
  })
}

/* ════════════════════ POST — إنشاء طلب ════════════════════ */

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await ctxOf(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, me, schoolId, can } = ctx

  if (!can('triage_evidence'))
    return NextResponse.json({ error: 'طلب الأدلة لمنسّق الجودة وفرق التركيز (10)' }, { status: 403 })

  const b = await req.json().catch(() => ({} as any))
  const assignedTo   = String(b.assignedTo || '').trim()
  const subNodeId    = String(b.subNodeId || '').trim()
  const indicatorIds = Array.isArray(b.indicatorIds) ? b.indicatorIds.map(String).slice(0, 40) : []
  const whatIsAsked  = String(b.whatIsAsked || '').trim()
  const expectedType = String(b.expectedType || '').trim() || null
  const academicYear = String(b.academicYear || '').trim()
  const dueDate      = String(b.dueDate || '').trim() || null

  if (!assignedTo)  return NextResponse.json({ error: 'المكلَّف مطلوب' }, { status: 400 })
  if (!subNodeId)   return NextResponse.json({ error: 'المعيار الفرعي مطلوب — والطلب يحمل مرساته سلفاً (3.1)' }, { status: 400 })
  if (!whatIsAsked) return NextResponse.json({ error: 'اكتب ما المطلوب بالضبط' }, { status: 400 })
  if (academicYear && !/^\d{4}-\d{4}$/.test(academicYear))
    return NextResponse.json({ error: 'العام الدراسي بصيغة 2026-2027' }, { status: 400 })

  /* المكلَّف من المدرسة نفسها — والعزل لا يُترك للواجهة */
  const { data: who } = await admin.from('profiles')
    .select('id, name_ar, school_id, notif_enabled, notif_inapp')
    .eq('id', assignedTo).maybeSingle()
  if (!who || who.school_id !== schoolId)
    return NextResponse.json({ error: 'المكلَّف ليس من مدرستك' }, { status: 400 })

  /* المرساة: معيار فرعي من الإصدار النشط — ودرس 2026-10-13: رشِّح بالإصدار */
  const { data: node } = await admin.from('framework_nodes')
    .select('id, code, name_ar, level, frameworks!inner(status)')
    .eq('id', subNodeId).maybeSingle()
  if (!node || node.level !== 3 || (node as any).frameworks?.status !== 'active')
    return NextResponse.json({ error: 'المعيار الفرعي غير صالح أو من إصدار غير فعّال' }, { status: 400 })

  /* والمؤشرات — إن حُدّدت — أبناءُ هذا المعيار الفرعي لا غيره */
  let inds: string[] = []
  if (indicatorIds.length) {
    const { data: rows } = await admin.from('framework_nodes')
      .select('id, code, level').in('id', indicatorIds)
    inds = (rows || [])
      .filter((n: any) => n.level === 4 && String(n.code).startsWith(`${node.code}.`))
      .map((n: any) => n.id)
    if (inds.length !== indicatorIds.length)
      return NextResponse.json({ error: 'مؤشّرٌ لا يتبع هذا المعيار الفرعي' }, { status: 400 })
  }

  const { data: reqRow, error } = await admin.from('evidence_requests').insert({
    school_id:     schoolId,
    requested_by:  auth.user.id,
    assigned_to:   assignedTo,
    sub_node_id:   subNodeId,
    indicator_ids: inds,
    what_is_asked: whatIsAsked,
    expected_type: expectedType,
    academic_year: academicYear || null,
    due_date:      dueDate,
    status:        'open',
  }).select('id').single()
  if (error || !reqRow) return NextResponse.json({ error: error?.message || 'تعذّر إنشاء الطلب' }, { status: 500 })

  /* ── الطلب يصل مكلَّفه — وإلّا بقي في لوحةٍ لا يفتحها ── */
  if (who.notif_enabled !== false && who.notif_inapp !== false) {
    await admin.from('notifications').insert({
      recipient_id: assignedTo,
      sender_id:    auth.user.id,
      type:         'evidence_request',
      title:        `دليلٌ مطلوب منك: ${node.code} ${node.name_ar}`,
      body: `${whatIsAsked}${dueDate ? ` — المهلة ${dueDate}` : ''}`
            + (inds.length ? ` · ${inds.length} مؤشّراً محدَّداً` : ' · المعيار الفرعي كاملاً'),
      link:         '/dashboard/evidence/requested',
      is_read: false, send_email: false,
    })
  }

  await recordAudit({
    req, userId: auth.user.id, schoolId,
    action: 'create', table: 'evidence_requests', recordId: reqRow.id,
    after: { assignedTo: who.name_ar, node: node.code, due: dueDate, by: me.name_ar },
  })

  return NextResponse.json({ id: reqRow.id, created: true })
}

/* ════════════════════ PATCH — تعديل أو حذفٌ ناعم ════════════════════ */

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await ctxOf(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, schoolId, can } = ctx

  if (!can('triage_evidence'))
    return NextResponse.json({ error: 'تعديل الطلبات لمنسّق الجودة وفرق التركيز' }, { status: 403 })

  const b = await req.json().catch(() => ({} as any))
  const id = String(b.id || '').trim()
  if (!id) return NextResponse.json({ error: 'الطلب مطلوب' }, { status: 400 })

  const { data: cur } = await admin.from('evidence_requests')
    .select('id, status, assigned_to, school_id').eq('id', id).eq('school_id', schoolId).maybeSingle()
  if (!cur) return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })

  /* الحذف الناعم: طلبٌ أُرسل خطأً — ولا يُغلق، فالإغلاق سدُّ فجوة */
  if (b.action === 'delete') {
    if (cur.status === 'in_review')
      return NextResponse.json({
        error: 'طلبٌ رُفع له دليل ينتظر الحكم — احكم عليه أوّلاً ثم احذف الطلب',
      }, { status: 409 })
    const { error } = await admin.from('evidence_requests')
      .update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await recordAudit({
      req, userId: auth.user.id, schoolId,
      action: 'delete', table: 'evidence_requests', recordId: id, before: { status: cur.status },
    })
    return NextResponse.json({ deleted: true })
  }

  const patch: any = {}
  if (typeof b.whatIsAsked === 'string' && b.whatIsAsked.trim()) patch.what_is_asked = b.whatIsAsked.trim()
  if (typeof b.dueDate === 'string')      patch.due_date      = b.dueDate.trim() || null
  if (typeof b.expectedType === 'string') patch.expected_type = b.expectedType.trim() || null
  if (typeof b.assignedTo === 'string' && b.assignedTo.trim()) {
    const { data: who } = await admin.from('profiles')
      .select('id, school_id').eq('id', b.assignedTo.trim()).maybeSingle()
    if (!who || who.school_id !== schoolId)
      return NextResponse.json({ error: 'المكلَّف ليس من مدرستك' }, { status: 400 })
    patch.assigned_to = who.id
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'لا تغيير' }, { status: 400 })

  const { error } = await admin.from('evidence_requests').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recordAudit({
    req, userId: auth.user.id, schoolId,
    action: 'update', table: 'evidence_requests', recordId: id, after: patch,
  })
  return NextResponse.json({ updated: true })
}

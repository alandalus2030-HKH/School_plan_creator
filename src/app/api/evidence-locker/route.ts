import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * خزانة الأدلة — تجميع كل أدلة المدرسة منظّمةً بالمعيار + تحليل التغطية.
 * الوصول: view_evidence (أو all / مشرف نظام / school_admin / admin).
 * العزل: المدرسة الفعّالة (يحترم التقمّص). القراءة عبر createAdminClient
 * لكن مُقيّدة يدوياً بـ school_id (لا تسريب عبر المدارس).
 */

const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']

async function getContext(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles').select('school_id, active_school_id, is_super_admin, role, department').eq('id', userId).single()
  if (!me) return null
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  return { admin, me, schoolId }
}

export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })

  const { admin, me, schoolId } = ctx
  const { data: roleData } = await admin.from('roles').select('permissions').eq('code', me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleData?.permissions) ? roleData!.permissions : []
  const isAdmin = me.is_super_admin || ADMIN_ROLES.includes(me.role)
  if (!(isAdmin || perms.includes('all') || perms.includes('view_evidence'))) {
    return NextResponse.json({ error: 'لا تملك صلاحية خزانة الأدلة' }, { status: 403 })
  }

  /* الخطط (غير المؤرشفة) في المدرسة */
  const { data: plansRaw } = await admin.from('plans')
    .select('id, name_ar, department, plan_category, is_archived').eq('school_id', schoolId)
  const plans = (plansRaw || []).filter((p: any) => !p.is_archived)
  /* لا خروج مبكر عند غياب الخطط: المخزن يحتوي أدلةً بلا مهمّة (القناة
     المباشرة وما بعدها)، والخزانة واحدة للقنوات الأربع — 3.1 */
  const planIds = plans.map((p: any) => p.id)
  const planById = new Map(plans.map((p: any) => [p.id, p]))

  /* العقد */
  const { data: nodes } = planIds.length
    ? await admin.from('plan_nodes')
        .select('id, parent_id, order_num, standard_code, name_ar, plan_id').in('plan_id', planIds)
    : { data: [] as any[] }
  const nodeById = new Map((nodes || []).map((n: any) => [n.id, n]))

  /* المعيار الحاكم لعقدة = أعمق سلف له standard_code */
  const standardFor = (nodeId: string): { code: string; name: string } | null => {
    let cur: any = nodeById.get(nodeId)
    while (cur) {
      if (cur.standard_code) return { code: cur.standard_code, name: cur.name_ar }
      cur = cur.parent_id ? nodeById.get(cur.parent_id) : null
    }
    return null
  }

  /* مستويات المعيار الثلاثة لعقدة: الرئيس (1) · الجانب (1.1) · الفرعي (1.1.3)
     الأرقام من بادئة كود المعيار، والأسماء من عقد السلسلة المقابلة. */
  type Std = { code: string; name: string }
  const standardLevels = (nodeId: string): { main: Std | null; aspect: Std | null; sub: Std | null } => {
    const chain: any[] = []
    let cur: any = nodeById.get(nodeId)
    while (cur) { chain.unshift(cur); cur = cur.parent_id ? nodeById.get(cur.parent_id) : null }
    let baseIdx = -1
    for (let i = chain.length - 1; i >= 0; i--) { if (chain[i].standard_code) { baseIdx = i; break } }
    if (baseIdx < 0) return { main: null, aspect: null, sub: null }
    const code  = chain[baseIdx].standard_code as string
    const parts = code.split('.')
    const sub: Std = { code, name: chain[baseIdx].name_ar }
    const aligned = parts.length === baseIdx + 1   // كل مستوى عقدة يقابل جزءاً من الكود
    const main: Std | null = parts.length >= 1
      ? { code: parts[0], name: aligned ? (chain[0]?.name_ar || parts[0]) : parts[0] } : null
    const aspect: Std | null = parts.length >= 2
      ? { code: parts.slice(0, 2).join('.'), name: aligned ? (chain[1]?.name_ar || parts.slice(0, 2).join('.')) : parts.slice(0, 2).join('.') } : null
    return { main, aspect, sub }
  }
  const planOfNode = (nodeId: string): any => {
    const n: any = nodeById.get(nodeId)
    return n ? planById.get(n.plan_id) : null
  }

  /* المهام */
  const nodeIds = (nodes || []).map((n: any) => n.id)
  const tasks = nodeIds.length
    ? (await admin.from('tasks').select('id, name_ar, status, node_id').in('node_id', nodeIds)).data || []
    : []
  const taskById = new Map(tasks.map((t: any) => [t.id, t]))
  const taskIds = tasks.map((t: any) => t.id)

  /* ════════════════════════════════════════════════════════════
     الأدلة — **كل أدلة المدرسة** لا أدلة المهام وحدها.
     المسار المباشر `evidence.school_id` (ترحيل 073) حلّ محلّ السلسلة
     دليل←مهمة←عقدة←خطة، فصارت الخزانة واحدةً للقنوات الأربع (3.1):
     ما له `task_id` يُثرى بسياق الخطة، وما لا مهمّة له بمراسيه.
     ════════════════════════════════════════════════════════════ */
  const { data: evidenceRaw } = await admin.from('evidence')
    .select('id, name, evidence_number, code, file_type, file_size, status, created_at, task_id, source, academic_year, document_date, evidence_type, reason_code, owner_team_id')
    .eq('school_id', schoolId).is('deleted_at', null)
    .order('created_at', { ascending: false })
  const evidence = evidenceRaw || []
  const evidenceIds = evidence.map((e: any) => e.id)

  /* المراسي في الإطار + الفرق المالكة */
  const [anchorsRes, teamsRes] = await Promise.all([
    evidenceIds.length
      ? admin.from('evidence_anchors')
          .select('evidence_id, framework_node_id, kind, confirm_status').in('evidence_id', evidenceIds)
      : Promise.resolve({ data: [] as any[] }),
    admin.from('focus_teams').select('id, name_ar, standard_code').eq('school_id', schoolId),
  ])
  const anchorNodeIds = [...new Set((anchorsRes.data || []).map((a: any) => a.framework_node_id))]
  const { data: fwNodes } = anchorNodeIds.length
    ? await admin.from('framework_nodes').select('id, code, name_ar').in('id', anchorNodeIds)
    : { data: [] as any[] }
  const fwById   = new Map((fwNodes || []).map((n: any) => [n.id, n]))
  const teamById = new Map((teamsRes.data || []).map((t: any) => [t.id, t]))
  const anchorsOf = new Map<string, any[]>()
  for (const a of anchorsRes.data || []) {
    const n = fwById.get(a.framework_node_id)
    if (!anchorsOf.has(a.evidence_id)) anchorsOf.set(a.evidence_id, [])
    anchorsOf.get(a.evidence_id)!.push({
      code: n?.code || '', name: n?.name_ar || '',
      kind: a.kind, confirmStatus: a.confirm_status,
    })
  }

  /* عدد الملفات + الحجم لكل دليل */
  const filesCount: Record<string, number> = {}
  const sizeByEv:   Record<string, number> = {}
  if (evidenceIds.length) {
    const { data: efs } = await admin.from('evidence_files')
      .select('evidence_id, file_size').in('evidence_id', evidenceIds)
    for (const f of efs || []) {
      filesCount[f.evidence_id] = (filesCount[f.evidence_id] || 0) + 1
      sizeByEv[f.evidence_id]   = (sizeByEv[f.evidence_id] || 0) + (f.file_size || 0)
    }
  }

  /* حالة كل دليل (لاحتساب التغطية بالأدلة المعتمدة فقط) */
  const evStatusById = new Map((evidence as any[]).map((e: any) => [e.id, e.status]))

  /* الارتباطات المشتركة: عدد المهام المرتبطة + المهام التي لها دليل مشترك معتمد */
  const linkedCount: Record<string, number> = {}
  const acceptedLinkTasks = new Set<string>()
  if (taskIds.length) {
    const { data: links } = await admin.from('evidence_links')
      .select('evidence_id, task_id').in('task_id', taskIds)
    for (const l of links || []) {
      linkedCount[l.evidence_id] = (linkedCount[l.evidence_id] || 0) + 1
      if (evStatusById.get(l.evidence_id) === 'accepted') acceptedLinkTasks.add(l.task_id)
    }
  }

  /* بناء قائمة الأدلة بسياق المعيار/الخطة (بمستويات المعيار الثلاثة) */
  const evList = evidence.map((e: any) => {
    const t = e.task_id ? taskById.get(e.task_id) : null
    const lvl = t ? standardLevels(t.node_id) : { main: null, aspect: null, sub: null }
    const plan = t ? planOfNode(t.node_id) : null
    const anchors = anchorsOf.get(e.id) || []
    const team = e.owner_team_id ? teamById.get(e.owner_team_id) : null
    /* المعيار المعروض: المرساة أولاً (معرّف ثابت)، وإلا سياق الخطة (كود نصّي) */
    const anchored = anchors[0]
      ? { code: anchors[0].code, name: anchors[0].name }
      : null
    return {
      id: e.id, name: e.name, number: e.evidence_number, code: e.code,
      file_type: e.file_type, status: e.status, created_at: e.created_at,
      source: e.source || (e.task_id ? 'plan' : 'direct'),
      academicYear: e.academic_year, documentDate: e.document_date,
      type: e.evidence_type, reason: e.reason_code,
      filesCount: filesCount[e.id] || 1,
      size: sizeByEv[e.id] || e.file_size || 0,
      linkedCount: linkedCount[e.id] || 0,
      task: t ? { id: t.id, name_ar: t.name_ar, status: t.status } : null,
      plan: plan ? { name_ar: plan.name_ar, department: plan.department, category: plan.plan_category } : null,
      standard: anchored || lvl.sub,
      standardMain: lvl.main,
      standardAspect: lvl.aspect,
      anchors,
      /* بلا مرساة = لا يدخل تغطية الإطار. أدلة الخطط كلّها كذلك حتى م1‑3ج */
      hasAnchor: anchors.length > 0,
      team: team ? { name: team.name_ar, standard: team.standard_code } : null,
    }
  })

  /* التغطية: مهمة "مغطّاة" = لها دليل واحد على الأقل حالته 'accepted'
     (مملوك أو مشترك) — الأدلة المرفوضة/قيد المراجعة لا تُحتسب تغطيةً. */
  const acceptedOwnedTasks = new Set(
    (evidence as any[]).filter((e: any) => e.status === 'accepted').map((e: any) => e.task_id))
  const isCovered = (taskId: string) => acceptedOwnedTasks.has(taskId) || acceptedLinkTasks.has(taskId)

  const stdMap = new Map<string, any>()
  /* عدّادات التغطية مفصولة: المهام المرتبطة بمعيار وحدها تُحسب في النسبة،
     ومهام «بلا معيار» (التشغيلية/المخصّصة) تُعدّ منفصلةً خارج المقام. */
  let mappedTotal = 0, mappedCovered = 0, unmappedTotal = 0
  for (const t of tasks) {
    const std = standardFor(t.node_id)
    const plan = planOfNode(t.node_id)
    const key = std ? `${plan?.id}|${std.code}` : `${plan?.id}|__none__`
    if (!stdMap.has(key)) {
      stdMap.set(key, {
        code: std?.code || null, name: std?.name || 'بلا معيار',
        plan: plan?.name_ar || '—', department: plan?.department || null,
        total: 0, covered: 0, without: [] as any[],
      })
    }
    const g = stdMap.get(key)
    g.total++
    if (isCovered(t.id)) g.covered++
    else g.without.push({ id: t.id, name_ar: t.name_ar })
    if (std) { mappedTotal++; if (isCovered(t.id)) mappedCovered++ }
    else unmappedTotal++
  }
  const standards = [...stdMap.values()].sort((a, b) => (a.code || '').localeCompare(b.code || '', 'ar'))

  /* إحصاءات */
  const byType: Record<string, number> = {}
  const bySource: Record<string, number> = {}
  let totalSize = 0, shared = 0, accepted = 0, pending = 0, rejected = 0, unanchored = 0
  for (const e of evList) {
    bySource[e.source] = (bySource[e.source] || 0) + 1
    if (!e.hasAnchor) unanchored++
    const cat = e.file_type === 'video/youtube' ? 'video'
      : e.file_type?.startsWith('image') ? 'image'
      : e.file_type === 'application/pdf' ? 'pdf'
      : e.file_type?.includes('word') ? 'word'
      : e.file_type?.includes('sheet') ? 'excel' : 'other'
    byType[cat] = (byType[cat] || 0) + 1
    totalSize += e.size
    if (e.linkedCount > 0) shared++
    if (e.status === 'accepted') accepted++
    else if (e.status === 'rejected') rejected++
    else pending++
  }
  return NextResponse.json({
    evidence: evList,
    standards,
    myDepartment: me.department || null,
    stats: {
      total: evList.length, byType, bySource, unanchored, totalSize, shared, accepted, pending, rejected,
      totalTasks: tasks.length,           // كل المهام (للمرجع)
      accreditationTasks: mappedTotal,    // المرتبطة بمعيار (مقام التغطية)
      coveredTasks: mappedCovered,        // المرتبطة بمعيار ولها دليل معتمد
      unmappedTasks: unmappedTotal,       // بلا معيار — خارج حساب التغطية
      coverage: mappedTotal > 0 ? Math.round((mappedCovered / mappedTotal) * 100) : 0,
    },
  })
}

function emptyStats() {
  return { total: 0, byType: {}, bySource: {}, unanchored: 0, totalSize: 0, shared: 0, accepted: 0, pending: 0, rejected: 0, totalTasks: 0, accreditationTasks: 0, coveredTasks: 0, unmappedTasks: 0, coverage: 0 }
}

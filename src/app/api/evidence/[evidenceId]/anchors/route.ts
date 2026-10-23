import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAudit } from '@/lib/audit'

/**
 * مراسي الدليل — «حدِّد ما يغطّيه» (الوثيقة 3.3)
 *
 * GET    → مراسي الدليل بأسمائها + مؤشرات معياره الفرعي للاختيار منها.
 * POST   → { subCode, indicatorIds?: string[], whole?: boolean, reason? }
 * DELETE → { anchorId, reason? }
 *
 * ── ثلاث قواعد من الوثيقة تحكم هذا المنفذ ──
 * • **الصيغة «حدِّد ما يغطّيه» لا «اختر مؤشّراً»**: فـ«يغطّي المعيار
 *   الفرعي كاملاً» إجابةٌ مشروعة تُسجَّل **تغطيةً ضمنية** (`implicit`)
 *   على عقدة المعيار الفرعي، وتُعرَض بلونٍ مختلف في كل مؤشراته.
 * • **المالك الواحد** (3.2): مرساةٌ تقع خارج المعيار الرئيس للفريق
 *   المالك تُولد **`pending`** — «إسناداً وارداً» لفريقها ليؤكّده،
 *   **ولا تُحتسب في التغطية قبل التأكيد**. وبغير هذا تُكتب في تغطية
 *   فريقٍ لم يفحص الدليل، ثم يكتب سرد فصله على تغطيةٍ لا يثق بها.
 * • **التعديل بعد القبول يُسجَّل** (3.3): من · متى · **لماذا** — فالسبب
 *   إلزاميّ متى كان الدليل مقبولاً، وحرٌّ قبل ذلك.
 *
 * وحارس «لا يُحذف آخر إسناد» في القاعدة (088) لا هنا — فالمسارات
 * تتعدّد والقاعدة واحدة.
 */

const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']

async function ctxOf(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles')
    .select('school_id, active_school_id, is_super_admin, role').eq('id', userId).single()
  if (!me) return null
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  const { data: roleRow } = await admin.from('roles').select('permissions').eq('code', me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleRow?.permissions) ? roleRow!.permissions : []
  const can = (p: string) => me.is_super_admin || perms.includes('all') || perms.includes(p)
  const isAdmin = me.is_super_admin || perms.includes('all') || ADMIN_ROLES.includes(me.role)
  return { admin, me, schoolId, can, isAdmin }
}

/** الدليل في مدرستك، ومعه فريقه المالك ومعياره الرئيس */
async function loadEvidence(admin: any, evidenceId: string, schoolId: string) {
  const { data: ev } = await admin.from('evidence')
    .select('id, name, school_id, status, owner_team_id, deleted_at').eq('id', evidenceId).maybeSingle()
  if (!ev || ev.deleted_at) return { error: NextResponse.json({ error: 'الدليل غير موجود' }, { status: 404 }) }
  if (ev.school_id !== schoolId) return { error: NextResponse.json({ error: 'الدليل خارج نطاق مدرستك' }, { status: 403 }) }
  let ownerStandard: string | null = null
  if (ev.owner_team_id) {
    const { data: team } = await admin.from('focus_teams').select('standard_code').eq('id', ev.owner_team_id).maybeSingle()
    ownerStandard = team?.standard_code || null
  }
  return { ev, ownerStandard }
}

export async function GET(req: NextRequest, context: { params: Promise<{ evidenceId: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { evidenceId } = await context.params
  const ctx = await ctxOf(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, schoolId, can } = ctx
  if (!can('view_evidence') && !can('triage_evidence')) {
    return NextResponse.json({ error: 'لا تملك صلاحية عرض الأدلة' }, { status: 403 })
  }

  const loaded = await loadEvidence(admin, evidenceId, schoolId)
  if ('error' in loaded) return loaded.error

  const { data: anchors } = await admin.from('evidence_anchors')
    .select('id, framework_node_id, kind, confirm_status, note').eq('evidence_id', evidenceId)
  const ids = (anchors || []).map((a: any) => a.framework_node_id)
  const { data: nodes } = ids.length
    ? await admin.from('framework_nodes').select('id, code, name_ar, level').in('id', ids)
    : { data: [] as any[] }
  const nodeById = new Map((nodes || []).map((n: any) => [n.id, n]))

  return NextResponse.json({
    ownerStandard: loaded.ownerStandard,
    status: loaded.ev.status,
    anchors: (anchors || []).map((a: any) => {
      const n = nodeById.get(a.framework_node_id)
      return {
        id: a.id, nodeId: a.framework_node_id,
        code: n?.code || '', name: n?.name_ar || '', level: n?.level ?? null,
        kind: a.kind, confirm_status: a.confirm_status,
        /* مرساةٌ فوق المعيار الفرعي لا تقول لأيّ مؤشّر تشهد (3.3) */
        loose: (n?.level ?? 0) < 3,
      }
    }),
  })
}

export async function POST(req: NextRequest, context: { params: Promise<{ evidenceId: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { evidenceId } = await context.params
  const ctx = await ctxOf(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, me, schoolId, can, isAdmin } = ctx
  if (!can('triage_evidence')) return NextResponse.json({ error: 'لا تملك صلاحية الإسناد' }, { status: 403 })

  const body = await req.json().catch(() => ({} as any))
  const subCode = typeof body.subCode === 'string' ? body.subCode.trim() : ''
  const whole   = body.whole === true
  const indicatorIds: string[] = Array.isArray(body.indicatorIds) ? body.indicatorIds : []
  const reason  = typeof body.reason === 'string' ? body.reason.trim() : ''

  if (!subCode) return NextResponse.json({ error: 'المعيار الفرعي مطلوب' }, { status: 400 })
  if (!whole && indicatorIds.length === 0) {
    return NextResponse.json({ error: 'حدِّد مؤشراتٍ بعينها أو اختر «يغطّي المعيار الفرعي كاملاً»' }, { status: 400 })
  }

  const loaded = await loadEvidence(admin, evidenceId, schoolId)
  if ('error' in loaded) return loaded.error
  const { ev, ownerStandard } = loaded

  /* التعديل بعد القبول يُسجَّل بـ«لماذا» (3.3) */
  if (ev.status === 'accepted' && !reason) {
    return NextResponse.json({ error: 'الدليل مقبول — تعديل إسناده يلزمه سببٌ مكتوب (3.3)' }, { status: 400 })
  }

  /* الملكيّة: الإسناد من عضو الفريق المالك، ومن سواه تجاوزٌ يُسجَّل (3.2) */
  let override = false
  if (ev.owner_team_id) {
    const { data: member } = await admin.from('focus_team_members')
      .select('profile_id').eq('team_id', ev.owner_team_id).eq('profile_id', auth.user.id).maybeSingle()
    if (!member) {
      if (!isAdmin) return NextResponse.json({ error: 'الإسناد لعضو الفريق المالك' }, { status: 403 })
      override = true
    }
  }

  /* عقدة المعيار الفرعي في الإصدار النشط — ومنها المؤشرات */
  const { data: sub } = await admin.from('framework_nodes')
    .select('id, code, name_ar, framework_id, frameworks!inner(status)')
    .eq('code', subCode).eq('level', 3).eq('frameworks.status', 'active').maybeSingle()
  if (!sub) return NextResponse.json({ error: 'المعيار الفرعي غير موجود في الإصدار النشط' }, { status: 400 })

  let targets: { id: string; kind: 'specific' | 'implicit' }[] = []
  if (whole) {
    targets = [{ id: sub.id, kind: 'implicit' }]
  } else {
    const { data: inds } = await admin.from('framework_nodes')
      .select('id').eq('parent_id', sub.id).eq('level', 4).in('id', indicatorIds)
    if (!inds || inds.length !== indicatorIds.length) {
      return NextResponse.json({ error: 'مؤشّرٌ لا ينتمي إلى هذا المعيار الفرعي' }, { status: 400 })
    }
    targets = inds.map((i: any) => ({ id: i.id, kind: 'specific' as const }))
  }

  /* المرساة الواردة: خارج معيار الفريق المالك ⇒ تنتظر تأكيد فريقها (3.2) */
  const mainOf = (code: string) => code.split('.')[0]
  const rows = targets.map(t => ({
    evidence_id: evidenceId,
    framework_node_id: t.id,
    kind: t.kind,
    confirm_status: (ownerStandard && mainOf(subCode) !== ownerStandard) ? 'pending' : 'confirmed',
    assigned_by: auth.user.id,
    ...(ownerStandard && mainOf(subCode) !== ownerStandard
      ? { note: `إسنادٌ وارد من فريق ${ownerStandard}` } : {}),
  }))

  const { error } = await admin.from('evidence_anchors')
    .upsert(rows, { onConflict: 'evidence_id,framework_node_id', ignoreDuplicates: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const incoming = rows.some(r => r.confirm_status === 'pending')
  await recordAudit({
    req, userId: auth.user.id, schoolId,
    action: 'update', table: 'evidence_anchors', recordId: evidenceId,
    after: {
      added: rows.length, sub: subCode, kind: whole ? 'implicit' : 'specific',
      ...(incoming ? { incoming: 'بانتظار تأكيد فريق ' + mainOf(subCode) } : {}),
      ...(reason ? { reason } : {}),
      ...(override ? { override: 'من خارج الفريق المالك' } : {}),
    },
  })

  return NextResponse.json({ ok: true, added: rows.length, incoming })
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ evidenceId: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { evidenceId } = await context.params
  const ctx = await ctxOf(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, schoolId, can, isAdmin } = ctx
  if (!can('triage_evidence')) return NextResponse.json({ error: 'لا تملك صلاحية الإسناد' }, { status: 403 })

  const body = await req.json().catch(() => ({} as any))
  const anchorId = typeof body.anchorId === 'string' ? body.anchorId : ''
  const reason   = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!anchorId) return NextResponse.json({ error: 'المرساة مطلوبة' }, { status: 400 })

  const loaded = await loadEvidence(admin, evidenceId, schoolId)
  if ('error' in loaded) return loaded.error
  const { ev } = loaded

  if (ev.status === 'accepted' && !reason) {
    return NextResponse.json({ error: 'الدليل مقبول — حذف إسناده يلزمه سببٌ مكتوب (3.3)' }, { status: 400 })
  }
  if (ev.owner_team_id) {
    const { data: member } = await admin.from('focus_team_members')
      .select('profile_id').eq('team_id', ev.owner_team_id).eq('profile_id', auth.user.id).maybeSingle()
    if (!member && !isAdmin) return NextResponse.json({ error: 'الإسناد لعضو الفريق المالك' }, { status: 403 })
  }

  /* حارس «لا يُحذف آخر إسناد» في القاعدة (088) — ورسالته تصل كما هي */
  const { error } = await admin.from('evidence_anchors')
    .delete().eq('id', anchorId).eq('evidence_id', evidenceId)
  if (error) return NextResponse.json({ error: error.message }, { status: 409 })

  await recordAudit({
    req, userId: auth.user.id, schoolId,
    action: 'delete', table: 'evidence_anchors', recordId: evidenceId,
    after: { anchor: anchorId, ...(reason ? { reason } : {}) },
  })

  return NextResponse.json({ ok: true })
}

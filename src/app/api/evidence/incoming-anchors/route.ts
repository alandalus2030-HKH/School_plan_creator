import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAudit } from '@/lib/audit'

/**
 * الإسناد الوارد — طابور الفريق المستقبِل (الوثيقة 3.2)
 *
 * GET  → المراسي المعلّقة الواقعة في معايير فرقي، موسومةً بمن أسندها.
 * POST → { anchorId, action: 'confirm' | 'decline', note? }
 *
 * ── القاعدة ──
 * «دليلٌ واحد قد يخدم ثلاثة معايير رئيسة، فيكون له ثلاثة ملّاك
 *  محتملين — والأسوأ أن يقبله فريقٌ ويُسنده إلى مؤشرات فريقٍ آخر،
 *  فتُحتسب في تغطية الثاني أدلّةٌ لم يفحصها، ثم يكتب سرد فصله على
 *  تغطيةٍ لا يثق بها.»
 *
 * فالمالك واحدٌ يقبل الدليل أو يرفضه، والمراسي الخارجة عن معياره تصل
 * فريقها **للتأكيد**. و**الردّ يُسقط تلك المرساة وحدها لا الدليل** —
 * ولذلك يُحفظ الصفّ بحالة `declined` ولا يُحذف: الدليل يبقى، وتبقى
 * واقعةُ الردّ في سجلّه.
 *
 * و«لا تُحتسب في التغطية قبل تأكيدها»: مفروضٌ في موضعين — حارس القبول
 * (088 يشترط مرساةً **مؤكَّدة**) وفهرس التغطية المؤكَّدة.
 */

async function ctxOf(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles')
    .select('school_id, active_school_id, is_super_admin, role').eq('id', userId).single()
  if (!me) return null
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  const { data: roleRow } = await admin.from('roles').select('permissions').eq('code', me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleRow?.permissions) ? roleRow!.permissions : []
  const can = (p: string) => me.is_super_admin || perms.includes('all') || perms.includes(p)
  return { admin, me, schoolId, can }
}

/** رموز المعايير الرئيسة التي يملك المستخدم تأكيد وارداتها */
async function myStandards(admin: any, userId: string, schoolId: string, isAdmin: boolean) {
  const { data: teams } = await admin.from('focus_teams')
    .select('id, standard_code, name_ar').eq('school_id', schoolId).eq('is_active', true)
  if (isAdmin) return { codes: (teams || []).map((t: any) => t.standard_code), teams: teams || [] }
  const { data: mine } = await admin.from('focus_team_members')
    .select('team_id').eq('profile_id', userId)
  const ids = new Set((mine || []).map((m: any) => m.team_id))
  const my = (teams || []).filter((t: any) => ids.has(t.id))
  return { codes: my.map((t: any) => t.standard_code), teams: my }
}

export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await ctxOf(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, me, schoolId, can } = ctx
  if (!can('triage_evidence')) return NextResponse.json({ error: 'لا تملك صلاحية الفرز' }, { status: 403 })

  const isAdmin = !!me.is_super_admin || ['school_admin', 'admin'].includes(me.role)
  const { codes } = await myStandards(admin, auth.user.id, schoolId, isAdmin)

  /* أدلة المدرسة الحيّة وحدها — المرساة تتبع دليلها في النطاق */
  const { data: evs } = await admin.from('evidence')
    .select('id, name, status, owner_team_id, source').eq('school_id', schoolId).is('deleted_at', null)
  const evById = new Map((evs || []).map((e: any) => [e.id, e]))
  if (!evById.size) return NextResponse.json({ items: [], myStandards: codes })

  const { data: anchors } = await admin.from('evidence_anchors')
    .select('id, evidence_id, framework_node_id, kind, assigned_by, assigned_at, note')
    .eq('confirm_status', 'pending').in('evidence_id', [...evById.keys()])

  const nodeIds = [...new Set((anchors || []).map((a: any) => a.framework_node_id))]
  const { data: nodes } = nodeIds.length
    ? await admin.from('framework_nodes').select('id, code, name_ar, level').in('id', nodeIds)
    : { data: [] as any[] }
  const nodeById = new Map((nodes || []).map((n: any) => [n.id, n]))

  const byIds = [...new Set((anchors || []).map((a: any) => a.assigned_by).filter(Boolean))]
  const { data: profs } = byIds.length
    ? await admin.from('profiles').select('id, name_ar').in('id', byIds)
    : { data: [] as any[] }
  const nameOf = new Map((profs || []).map((p: any) => [p.id, p.name_ar]))

  const { data: teamRows } = await admin.from('focus_teams')
    .select('id, standard_code, name_ar').eq('school_id', schoolId)
  const teamByStd = new Map((teamRows || []).map((t: any) => [t.standard_code, t.name_ar]))
  const teamById  = new Map((teamRows || []).map((t: any) => [t.id, t.name_ar]))

  const items = (anchors || [])
    .map((a: any) => {
      const n  = nodeById.get(a.framework_node_id)
      const ev = evById.get(a.evidence_id)
      const std = String(n?.code || '').split('.')[0]
      return {
        id: a.id, evidenceId: a.evidence_id, evidenceName: ev?.name || '—',
        evidenceStatus: ev?.status, ownerTeam: teamById.get(ev?.owner_team_id) || null,
        code: n?.code || '', name: n?.name_ar || '', level: n?.level ?? null, kind: a.kind,
        standard: std, standardTeam: teamByStd.get(std) || null,
        assignedBy: nameOf.get(a.assigned_by) || '—', assignedAt: a.assigned_at, note: a.note || null,
        mine: codes.includes(std),
      }
    })
    .filter((x: any) => x.mine)
    .sort((a: any, b: any) => String(a.assignedAt).localeCompare(String(b.assignedAt)))

  return NextResponse.json({ items, myStandards: codes })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await ctxOf(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, me, schoolId, can } = ctx
  if (!can('triage_evidence')) return NextResponse.json({ error: 'لا تملك صلاحية الفرز' }, { status: 403 })

  const { anchorId, action, note } = await req.json().catch(() => ({} as any))
  if (!anchorId || (action !== 'confirm' && action !== 'decline')) {
    return NextResponse.json({ error: 'طلبٌ ناقص' }, { status: 400 })
  }

  const { data: a } = await admin.from('evidence_anchors')
    .select('id, evidence_id, framework_node_id, confirm_status, assigned_by').eq('id', anchorId).maybeSingle()
  if (!a) return NextResponse.json({ error: 'المرساة غير موجودة' }, { status: 404 })
  if (a.confirm_status !== 'pending') {
    return NextResponse.json({ error: 'هذه المرساة حُكم عليها سلفاً' }, { status: 409 })
  }

  /* الدليل من مدرستك */
  const { data: ev } = await admin.from('evidence')
    .select('id, name, school_id, uploaded_by, deleted_at').eq('id', a.evidence_id).maybeSingle()
  if (!ev || ev.deleted_at || ev.school_id !== schoolId) {
    return NextResponse.json({ error: 'الدليل خارج نطاق مدرستك' }, { status: 403 })
  }

  /* والمرساة في معيارٍ يملكه فريقك — فكل فريق سيّد تغطيته */
  const { data: node } = await admin.from('framework_nodes')
    .select('code, name_ar').eq('id', a.framework_node_id).maybeSingle()
  const std = String(node?.code || '').split('.')[0]
  const isAdmin = !!me.is_super_admin || ['school_admin', 'admin'].includes(me.role)
  const { codes } = await myStandards(admin, auth.user.id, schoolId, isAdmin)
  if (!codes.includes(std)) {
    return NextResponse.json({ error: 'هذا إسنادٌ وارد على معيارٍ ليس لفريقك' }, { status: 403 })
  }

  /* الردّ يُسقط المرساة وحدها لا الدليل — فتُحفظ الواقعة ولا يُحذف الصفّ */
  const { error } = await admin.from('evidence_anchors').update({
    confirm_status: action === 'confirm' ? 'confirmed' : 'declined',
    confirmed_by: auth.user.id,
    confirmed_at: new Date().toISOString(),
    ...(action === 'decline' && String(note || '').trim()
      ? { note: `رُدَّ: ${String(note).trim()}` } : {}),
  }).eq('id', anchorId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recordAudit({
    req, userId: auth.user.id, schoolId,
    action: 'update', table: 'evidence_anchors', recordId: anchorId,
    after: {
      [action === 'confirm' ? 'confirmed' : 'declined']: node?.code || '',
      evidence: ev.name, ...(note ? { note: String(note).trim() } : {}),
    },
  })

  /* من أسندها يُعلَم بمصيرها — وإلّا أسنَد وانتظر بلا خبر */
  if (a.assigned_by && a.assigned_by !== auth.user.id) {
    const { data: pref } = await admin.from('profiles')
      .select('notif_enabled, notif_inapp').eq('id', a.assigned_by).maybeSingle()
    if (pref?.notif_enabled !== false && pref?.notif_inapp !== false) {
      await admin.from('notifications').insert({
        recipient_id: a.assigned_by, sender_id: auth.user.id, type: 'evidence_status',
        title: action === 'confirm'
          ? `أُكِّد إسنادك: ${node?.code || ''}`
          : `رُدَّ إسنادك: ${node?.code || ''}`,
        body: action === 'confirm'
          ? `الدليل «${ev.name}» صار محتسَباً في تغطية المعيار ${std}.`
          : `الدليل «${ev.name}» يبقى كما هو — سقطت هذه المرساة وحدها${note ? ` · ${String(note).trim()}` : ''}.`,
        link: '/dashboard/evidence', is_read: false, send_email: false,
      })
    }
  }

  return NextResponse.json({ ok: true })
}

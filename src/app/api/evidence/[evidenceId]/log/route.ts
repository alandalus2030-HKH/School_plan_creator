import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isExternal } from '@/lib/evidenceLog'

/**
 * GET /api/evidence/[evidenceId]/log — سجلّ الدليل (الوثيقة 9.3)
 *
 * «سجلٌّ لا يُحرَّر لكل دليل مقبول: من رفعه ومتى · من قبله ومتى · وما
 *  تغيّر فيه بعد القبول. والفهرس يقول ماذا عندك، ومصفوفة التغطية تقول
 *  أين يقع، **وهذا يقول كيف صار إلى هنا**.»
 *
 * ولا يُكتب من هنا: المُشغِّلات (091) تكتبه، وهذا يقرأ.
 *
 * ── والمقيّم الخارجي لا يرى المداولة ──
 * «يخرج ما يخصّ الدليل المقبول، ولا يخرج ما يخصّ المداولة» — فمن كان
 * دوره قراءةً خارجية (10) تُرشَّح له الوقائع بالتصنيف نفسه الذي تُبنى
 * عليه حزمة المرحلة الرابعة، مصدراً واحداً لا قاعدتين تتفرّقان.
 */

/* دور المقيّم الخارجي — قراءةٌ بلا مداولة (10 · 9.3) */
const EXTERNAL_ROLES = ['external_reviewer', 'evaluator', 'assessor']

export async function GET(_req: NextRequest, context: { params: Promise<{ evidenceId: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { evidenceId } = await context.params

  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles')
    .select('school_id, active_school_id, is_super_admin, role').eq('id', auth.user.id).single()
  if (!me) return NextResponse.json({ error: 'الملفّ الشخصي غير موجود' }, { status: 403 })
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  if (!schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })

  const { data: roleRow } = await admin.from('roles').select('permissions').eq('code', me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleRow?.permissions) ? roleRow!.permissions : []
  const can = (p: string) => me.is_super_admin || perms.includes('all') || perms.includes(p)
  if (!can('view_evidence') && !can('triage_evidence')) {
    return NextResponse.json({ error: 'لا تملك صلاحية الأدلة' }, { status: 403 })
  }

  /* الدليل من مدرستك — ويُسأل `evidence` عن مدرسته لا سلسلةُ المهمّة */
  const { data: ev } = await admin.from('evidence')
    .select('id, name, code, status, school_id, deleted_at').eq('id', evidenceId).maybeSingle()
  if (!ev || ev.deleted_at) return NextResponse.json({ error: 'الدليل غير موجود' }, { status: 404 })
  if (ev.school_id !== schoolId) {
    return NextResponse.json({ error: 'الدليل خارج نطاق مدرستك' }, { status: 403 })
  }

  const { data: rows, error } = await admin.from('evidence_assignments')
    .select('id, at, event, actor_id, from_status, to_status, reason_code, reason_text, node_id, detail')
    .eq('evidence_id', evidenceId).order('at', { ascending: true }).order('id', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const list = rows || []

  /* الأسماء بطلبٍ واحد — لا طلبٌ لكل صفّ */
  const actorIds = [...new Set(list.map((r: any) => r.actor_id).filter(Boolean))]
  const nodeIds  = [...new Set(list.map((r: any) => r.node_id).filter(Boolean))]
  const [{ data: people }, { data: nodes }] = await Promise.all([
    actorIds.length ? admin.from('profiles').select('id, name_ar').in('id', actorIds)
                    : Promise.resolve({ data: [] as any[] }),
    nodeIds.length  ? admin.from('framework_nodes').select('id, code, name_ar').in('id', nodeIds)
                    : Promise.resolve({ data: [] as any[] }),
  ])
  const nameOf = new Map((people || []).map((p: any) => [p.id, p.name_ar]))
  const nodeOf = new Map((nodes  || []).map((n: any) => [n.id, n]))

  const externalOnly = EXTERNAL_ROLES.includes(String(me.role)) && !me.is_super_admin
  const visible = externalOnly ? list.filter((r: any) => isExternal(r.event)) : list

  return NextResponse.json({
    evidence: { id: ev.id, name: ev.name, code: ev.code, status: ev.status },
    /* السجلّ يبدأ من ترحيل 091 — فما بُذر مُعلَّمٌ ليُقرأ على وجهه */
    entries: visible.map((r: any) => ({
      id: r.id, at: r.at, event: r.event,
      actor: r.actor_id ? (nameOf.get(r.actor_id) || '—') : null,
      from: r.from_status, to: r.to_status,
      reasonCode: r.reason_code, reasonText: r.reason_text,
      node: r.node_id ? (nodeOf.get(r.node_id) || null) : null,
      detail: r.detail || null,
      backfilled: r.detail?.backfilled === true,
    })),
    /* ما حُجب عن المقيّم يُقال عدداً للداخل، ولا يُقال له هو */
    hidden: externalOnly ? 0 : list.length - list.filter((r: any) => isExternal(r.event)).length,
    externalOnly,
  })
}

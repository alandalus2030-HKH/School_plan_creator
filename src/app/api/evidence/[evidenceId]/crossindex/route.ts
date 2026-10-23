import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * الفهرسة العرضية — `3.1.2.2 · 3 من 7` (الوثيقة 3.4)
 *
 * «الطبقة الثانية: الفهرسة العرضية — **تُحسب ولا تُخزَّن**، تتغيّر
 *  بتغيّر الأدلة.»
 *
 * فهي ترتيب الدليل بين أدلة مؤشّره: الثالث من سبعة. ولو خُزِّنت لكذبت
 * عند قبول دليلٍ ثامن أو إعادة إسناد سابع — «فيبقى الرقم القديم شاهداً
 * على حالٍ زالت» (14).
 *
 * ── والترتيب بالهويّة الثابتة لا بالتاريخ ──
 * `E-2026-0041` قبل `E-2026-0142` أبداً، لأن الهويّة «تُمنح عند القبول
 * **ولا تتغيّر أبداً**» (3.4). ولو رتّبنا بتاريخ القبول لتبدّل ترتيب
 * دليلٍ أُعيد فتحه ثم قُبل ثانيةً — فينتقل من الثالث إلى السابع وقد
 * ذُكر في تقريرٍ بوصفه الثالث.
 *
 * ── والمقام من المصفوفة نفسها ──
 * «من 7» هو عدد الأدلة المقبولة المؤكَّدة على المؤشّر — وهو ما تحسبه
 * `/api/evidence/coverage`. فحسابُه هنا بالقاعدة نفسها لا بقاعدةٍ ثانية،
 * وإلّا اختلف الرقمان في شاشتين.
 */

export async function GET(_req: Request, context: { params: Promise<{ evidenceId: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { evidenceId } = await context.params

  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles')
    .select('school_id, active_school_id, is_super_admin, role').eq('id', auth.user.id).maybeSingle()
  if (!me) return NextResponse.json({ error: 'الملفّ الشخصي غير موجود' }, { status: 403 })
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id

  const { data: ev } = await admin.from('evidence')
    .select('id, code, status, school_id, deleted_at').eq('id', evidenceId).maybeSingle()
  if (!ev || ev.deleted_at) return NextResponse.json({ error: 'الدليل غير موجود' }, { status: 404 })
  if (ev.school_id !== schoolId) {
    return NextResponse.json({ error: 'الدليل خارج نطاق مدرستك' }, { status: 403 })
  }

  /* المرساة غير المؤكَّدة لا موضع لها في الفهرس: «لا تُحتسب في التغطية
     قبل تأكيدها» (3.2) — فلا تُفهرَس أيضاً. */
  const { data: mine } = await admin.from('evidence_anchors')
    .select('framework_node_id, kind').eq('evidence_id', evidenceId).eq('confirm_status', 'confirmed')
  const nodeIds = [...new Set((mine || []).map((a: any) => a.framework_node_id))]
  if (!nodeIds.length) return NextResponse.json({ entries: [] })

  const [{ data: nodes }, { data: peers }] = await Promise.all([
    admin.from('framework_nodes').select('id, code, name_ar, level').in('id', nodeIds),
    admin.from('evidence_anchors')
      .select('evidence_id, framework_node_id, evidence:evidence!inner(id, code, status, school_id, deleted_at)')
      .in('framework_node_id', nodeIds).eq('confirm_status', 'confirmed')
      .eq('evidence.school_id', schoolId).eq('evidence.status', 'accepted'),
  ])
  const nodeOf = new Map((nodes || []).map((n: any) => [n.id, n]))

  /* ترتيبٌ بالهويّة الثابتة — ومن لا هويّة له (معلَّق) خارج الفهرس */
  const groups = new Map<string, string[]>()
  for (const r of (peers || [])) {
    const e: any = (r as any).evidence
    if (!e || e.deleted_at || !e.code) continue
    const arr = groups.get(r.framework_node_id) || []
    if (!arr.includes(e.code)) arr.push(e.code)
    groups.set(r.framework_node_id, arr)
  }

  const entries = nodeIds.map(id => {
    const node = nodeOf.get(id)
    const codes = (groups.get(id) || []).slice().sort((a, b) => a.localeCompare(b, 'en'))
    const rank = ev.code ? codes.indexOf(ev.code) + 1 : 0
    return {
      nodeId: id,
      code: node?.code || '',
      name: node?.name_ar || '',
      level: node?.level || null,
      /* `3.1.2.2 · 3 من 7` — والصفر يعني أنه لم يُقبل بعد فلا موضع له */
      rank, of: codes.length,
      label: rank > 0 ? `${node?.code} · ${rank} من ${codes.length}` : `${node?.code} · لم يُقبل بعد`,
    }
  }).sort((a, b) => a.code.localeCompare(b.code, 'en'))

  return NextResponse.json({ code: ev.code, status: ev.status, entries })
}

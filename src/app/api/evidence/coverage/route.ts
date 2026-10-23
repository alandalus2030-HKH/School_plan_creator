import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * مصفوفة التغطية (الوثيقة 3.3 · 3.4 · 14)
 *
 * GET → شجرة الإطار النشط ومعها لكل مؤشّر:
 *   • **عدّادان منفصلان** مخصوص وضمنيّ — «لأن المقيّم يفرّق بين «عندنا
 *     سياسة» و«عندنا دليل تطبيق»» (3.3). ولا يُجمعان في رقمٍ واحد أبداً.
 *   • **عدد الأدلة المتفرّدة** بجوار عدد المراسي — حاجز تضخيم الإسناد.
 *   • **وسمُ المؤشّر الذي كلّ أدلّته مشتركة** مع مؤشّرٍ آخر.
 *
 * ── والحساب كلّه عند العرض ──
 * «وقاعدة تسري على الجدول كلّه: **المحسوب لا يُخزَّن**… وأمّا التقدير
 *  فوق صفّ السلم · النسبة الكلّية · **مصفوفة التغطية** · **الفهرسة
 *  العرضية** · الاتجاه · **عدد الأدلة المتفرّدة** — فتُحسب عند العرض.
 *  والعلّة أن المخزَّن يكذب بعد حين: قاعدة تجميعٍ تتغيّر، أو دليلٌ يُعاد
 *  إسناده، أو دورةٌ تُقفل متأخّرة — فيبقى الرقم القديم شاهداً على حالٍ
 *  زالت» (14).
 *
 * ── وما يدخل التغطية ──
 *   • الدليل **مقبولٌ** وحده: «القبول → يدخل المخزن، **ويُحتسب في
 *     التغطية**» (3.2). فالمعلّق لا يُحتسب، ويُعدّ منفصلاً ليُعرف ما
 *     ينتظر الفرز.
 *   • والمرساة **مؤكَّدة**: «والمرساة الواردة **لا تُحتسب في التغطية
 *     قبل تأكيدها**» (3.2).
 *   • والإصدار **النشط** وحده — ودرس 2026‑10‑13: جداول الإطار التابعة
 *     لا تحمل `framework_id`، فالترشيح بمعرّفات عقد الإصدار لا بالجدول.
 */

export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles')
    .select('school_id, active_school_id, is_super_admin, role').eq('id', auth.user.id).maybeSingle()
  if (!me) return NextResponse.json({ error: 'الملفّ الشخصي غير موجود' }, { status: 403 })
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  if (!schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })

  const { data: roleRow } = await admin.from('roles').select('permissions').eq('code', me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleRow?.permissions) ? roleRow!.permissions : []
  const can = (p: string) => me.is_super_admin || perms.includes('all') || perms.includes(p)
  if (!can('view_evidence') && !can('triage_evidence')) {
    return NextResponse.json({ error: 'لا تملك صلاحية الأدلة' }, { status: 403 })
  }

  /* ── (1) الإطار النشط بعقده كلّها ── */
  const { data: nodes, error: nErr } = await admin.from('framework_nodes')
    .select('id, code, name_ar, level, sort_order, frameworks!inner(code, status)')
    .eq('frameworks.code', 'QNSA').eq('frameworks.status', 'active')
    .eq('is_active', true).order('sort_order')
  if (nErr) return NextResponse.json({ error: nErr.message }, { status: 500 })
  const all = nodes || []
  if (!all.length) return NextResponse.json({ error: 'لا إطار نشط' }, { status: 409 })

  /* ── (2) مراسي أدلة المدرسة — المقبولة والمعلّقة متمايزتين ── */
  const { data: evs } = await admin.from('evidence')
    .select('id, code, name, status, academic_year')
    .eq('school_id', schoolId).is('deleted_at', null)
    .in('status', ['accepted', 'pending'])
  const evById = new Map((evs || []).map((e: any) => [e.id, e]))
  const evIds = [...evById.keys()]

  const { data: anchors } = evIds.length
    ? await admin.from('evidence_anchors')
        .select('evidence_id, framework_node_id, kind, confirm_status')
        .in('evidence_id', evIds)
    : { data: [] as any[] }

  /* ── (3) الفرز: ما يُحتسب وما ينتظر ──
     المقبول + المرساة المؤكَّدة = تغطية. وما عداه «ينتظر» يُعرَض ولا
     يُحتسب، فالفجوة الظاهرة أنفع من المستورة. */
  const byNode = new Map<string, {
    specific: Set<string>; implicit: Set<string>; waiting: Set<string>
  }>()
  const nodeOfEvidence = new Map<string, Set<string>>()   // لحساب التفرّد

  const touch = (id: string) => {
    if (!byNode.has(id)) byNode.set(id, { specific: new Set(), implicit: new Set(), waiting: new Set() })
    return byNode.get(id)!
  }

  for (const a of (anchors || [])) {
    const ev = evById.get(a.evidence_id)
    if (!ev) continue
    const counts = ev.status === 'accepted' && a.confirm_status === 'confirmed'
    const slot = touch(a.framework_node_id)
    if (!counts) { slot.waiting.add(a.evidence_id); continue }
    if (a.kind === 'implicit') slot.implicit.add(a.evidence_id)
    else slot.specific.add(a.evidence_id)
    if (!nodeOfEvidence.has(a.evidence_id)) nodeOfEvidence.set(a.evidence_id, new Set())
    nodeOfEvidence.get(a.evidence_id)!.add(a.framework_node_id)
  }

  /* ── (4) الشجرة: محور ← جانب ← معيار فرعي ← مؤشّر ──
     والترشيح بسابقة الكود كما في `lib/framework`: كود الابن = كود الأب
     ونقطةٌ ورقم. */
  const byLevel = (l: number) => all.filter((n: any) => n.level === l)
  const childrenOf = (parentCode: string, level: number) =>
    byLevel(level).filter((n: any) => String(n.code).startsWith(`${parentCode}.`)
      && String(n.code).split('.').length === parentCode.split('.').length + 1)

  /* المرساة الضمنية على المعيار الفرعي «تغطّيه كاملاً» فتسري على مؤشراته (3.3) */
  const indicatorCell = (ind: any, subId: string) => {
    const own  = byNode.get(ind.id)
    const sub  = byNode.get(subId)
    const specific = own ? [...own.specific] : []
    /* الضمنيّ يُورَث من المعيار الفرعي، ويُضمّ إليه ما أُسند ضمنيّاً للمؤشّر نفسه */
    const implicit = [...new Set([...(sub?.implicit || []), ...(own?.implicit || [])])]
    const waiting  = own ? own.waiting.size : 0

    /* حاجز تضخيم الإسناد: «ويُوسَم المؤشّر الذي **كلّ أدلّته مشتركة**
       مع غيره» — أي لا يسنده دليلٌ واحد يخصّه. والمشترك ما أُسند إلى
       أكثر من بندٍ في الإطار. */
    const unique = new Set([...specific, ...implicit])
    const soleOwn = specific.filter(id => (nodeOfEvidence.get(id)?.size || 0) === 1)
    return {
      id: ind.id, code: ind.code, name: ind.name_ar,
      /* عدّادان منفصلان — لا يُجمعان (3.3) */
      specific: specific.length,
      implicit: implicit.length,
      /* عدد الأدلة المتفرّدة بجوار عدد المراسي */
      anchors: specific.length + implicit.length,
      unique:  unique.size,
      waiting,
      /* موسومٌ: له أدلة، ولا دليلَ يخصّه وحده */
      allShared: specific.length > 0 && soleOwn.length === 0,
      covered: unique.size > 0,
    }
  }

  const tree = byLevel(1).map((std: any) => {
    const aspects = childrenOf(std.code, 2).map((asp: any) => {
      const subs = childrenOf(asp.code, 3).map((sub: any) => {
        const inds = childrenOf(sub.code, 4).map((i: any) => indicatorCell(i, sub.id))
        const slot = byNode.get(sub.id)
        return {
          id: sub.id, code: sub.code, name: sub.name_ar,
          /* المعيار الفرعي: ما أُسند إليه نفسه، ومجمل مؤشراته */
          implicitHere: slot ? slot.implicit.size : 0,
          specificHere: slot ? slot.specific.size : 0,
          waitingHere:  slot ? slot.waiting.size  : 0,
          indicators: inds,
          covered: inds.filter((i: any) => i.covered).length,
          total:   inds.length,
        }
      })
      return {
        id: asp.id, code: asp.code, name: asp.name_ar, subs,
        covered: subs.reduce((s: number, x: any) => s + x.covered, 0),
        total:   subs.reduce((s: number, x: any) => s + x.total, 0),
      }
    })
    return {
      id: std.id, code: std.code, name: std.name_ar, aspects,
      covered: aspects.reduce((s: number, x: any) => s + x.covered, 0),
      total:   aspects.reduce((s: number, x: any) => s + x.total, 0),
    }
  })

  const indicators = tree.flatMap((s: any) => s.aspects.flatMap((a: any) => a.subs.flatMap((x: any) => x.indicators)))
  const covered    = indicators.filter((i: any) => i.covered).length

  return NextResponse.json({
    tree,
    totals: {
      standards:  tree.length,
      indicators: indicators.length,
      covered,
      /* النسبة تُحسب هنا ولا تُخزَّن (14) */
      pct: indicators.length ? Math.round((covered / indicators.length) * 1000) / 10 : 0,
      /* وعدّاداها منفصلان دائماً */
      specificOnly: indicators.filter((i: any) => i.specific > 0 && i.implicit === 0).length,
      implicitOnly: indicators.filter((i: any) => i.implicit > 0 && i.specific === 0).length,
      bothKinds:    indicators.filter((i: any) => i.specific > 0 && i.implicit > 0).length,
      gaps:         indicators.length - covered,
      /* مؤشراتٌ كلّ أدلّتها مشتركة — تضخيم إسنادٍ محتمل */
      inflated: indicators.filter((i: any) => i.allShared).length,
      /* ما ينتظر الفرز — يُعرَض ولا يُحتسب */
      waiting: indicators.filter((i: any) => i.waiting > 0).length,
      acceptedEvidence: (evs || []).filter((e: any) => e.status === 'accepted').length,
      pendingEvidence:  (evs || []).filter((e: any) => e.status === 'pending').length,
    },
  })
}

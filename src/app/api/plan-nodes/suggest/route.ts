import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { requireAuth } from '@/lib/supabase/server'
import { GROQ_MODEL_SMART, groqTuning, groqModelError } from '@/lib/ai/groq'
import { parseAiStrings } from '@/lib/ai/json'

/**
 * POST /api/plan-nodes/suggest — اقتراح أهداف أو مهام بالذكاء الاصطناعي (Groq)
 * body: { kind: 'goal' | 'task', contextName, contextCode?, planName?, existing?: string[],
 *         nodeId?: string }
 * يُرجع: { suggestions: string[] }
 *
 * ── إثراء سياق المهام (2026-10-07) ──
 * كان الاقتراح يرى **اسم الهدف وحده**، فيُنتج سطراً في خطة لا عملاً
 * يُنتج دليلاً. فإن مُرِّر `nodeId` (عقدة الهدف) جمع المنفذ من القاعدة:
 *   • المعيار الفرعي فوقه — وهو ما يُقاس عليه العمل.
 *   • المؤشّر المُسنَد إليه الهدف إن وُجد — فتُقترح مهامٌّ تشهد له بعينه.
 *   • نماذج الأدلة التي يذكرها الإطار لجانب هذا المعيار (245 نموذجاً،
 *     مرتبطة بعقدة الجانب) — وتُمرَّر **أمثلةً استرشادية لا قائمةً حاصرة**:
 *     الإطار يذكرها على سبيل المثال، والدليل الرسمي يشترط **التنوّع**
 *     (ص 231). ولو قُدِّمت حاصرةً لحُصر تفكير النموذج في اثني عشر نموذجاً
 *     ومُنع من اقتراح ما هو أنسب — وهو تقييدٌ لا إثراء.
 * والجمع في الخادم لا في المتصفّح: رحلةٌ واحدة بدل أربع.
 *
 * ── قراءة الردّ (2026-10-07) ──
 * يُطلب الجواب **كائناً** `{"items":[…]}` في وضع JSON الصارم، ويُقرأ
 * بـ`parseAiStrings` التي تعدّ الأقواس بدل التعبير النمطيّ الجَشِع.
 * والسبب: إثراء السياق أطال الطلب فأطال الجواب، فزاد احتمال أن يُتبعه
 * النموذج بسطر شرحٍ — وكان اللقط الجَشِع يبتلعه فينفجر التحليل.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { kind, contextName, contextCode, planName, existing, nodeId, frameworkNodeId } = await req.json()
    if (!contextName) return NextResponse.json({ error: 'السياق مطلوب' }, { status: 400 })

    const db = auth.supabase

    /* ── سياقٌ مشترك: مدّة الخطة وملفّ المدرسة ──
       بلا مدّةٍ يكتب النموذج مواعيد من ذاكرته (رُصد: «يونيو 2024» في خطة
       2026‑2027)، وبلا ملفّ المدرسة يخترع ما لا وجود له («جميع الفروع»). */
    let period = '', school = ''
    if (nodeId) {
      try {
        const { data: pn } = await db.from('plan_nodes').select('plan_id').eq('id', nodeId).maybeSingle()
        if (pn?.plan_id) {
          const { data: p } = await db.from('plans')
            .select('academic_year, start_date, end_date, school_id').eq('id', pn.plan_id).maybeSingle()
          if (p) {
            period = [
              p.academic_year ? `العام الدراسي ${p.academic_year}` : '',
              p.start_date && p.end_date ? `مدّتها من ${p.start_date} إلى ${p.end_date}` : '',
            ].filter(Boolean).join(' · ')
          }
          if (p?.school_id) {
            const { data: s } = await db.from('schools')
              .select('name_ar, vision_ar, mission_ar').eq('id', p.school_id).maybeSingle()
            if (s) {
              school = [
                `- المدرسة: "${s.name_ar}"`,
                s.vision_ar  ? `- رؤيتها: "${s.vision_ar}"`   : '',
                s.mission_ar ? `- رسالتها: "${s.mission_ar}"` : '',
              ].filter(Boolean).join('\n')
            }
          }
        }
      } catch { /* السياق إثراءٌ لا شرط */ }
    }

    /* ── سياق الأهداف: مؤشرات المعيار الفرعي · وصف «ممتاز» من سلّم التقدير ──
       وصف «ممتاز» هو **صورة الحال المنشود** و**وحدة الحكم** التي يُقاس
       عليها فعلاً (§6 من الوثيقة المعمارية) — فهو أدقّ ما يُلقَّن. */
    let indList: { code: string; name: string }[] = [], excellence: string[] = []
    if (kind === 'goal') {
      try {
        /* عقدة المعيار الفرعي في الإطار: إمّا من مؤشّرٍ اختير، وإمّا من مرساة عقدة الخطة */
        let subId: string | null = null
        if (frameworkNodeId) {
          const { data: ind } = await db.from('framework_nodes')
            .select('parent_id').eq('id', frameworkNodeId).maybeSingle()
          subId = ind?.parent_id || null
        }
        if (!subId && nodeId) {
          const { data: pn } = await db.from('plan_nodes')
            .select('framework_node_id, standard_code').eq('id', nodeId).maybeSingle()
          if (pn?.framework_node_id) subId = pn.framework_node_id
          else if (pn?.standard_code && pn.standard_code.split('.').length === 3) {
            const { data: fn } = await db.from('framework_nodes')
              .select('id, frameworks!inner(status)')
              .eq('code', pn.standard_code).eq('level', 3).eq('frameworks.status', 'active').maybeSingle()
            subId = fn?.id || null
          }
        }

        if (subId) {
          const [{ data: inds }, { data: rub }] = await Promise.all([
            db.from('framework_nodes').select('code, name_ar').eq('parent_id', subId).eq('level', 4).order('code'),
            db.from('framework_rubric').select('descriptor_ar').eq('framework_node_id', subId).eq('level', 5).order('row_index'),
          ])
          indList    = (inds || []).map((i: any) => ({ code: i.code, name: i.name_ar }))
          excellence = (rub  || []).map((r: any) => r.descriptor_ar).filter(Boolean)
        }
      } catch { /* السياق إثراءٌ لا شرط */ }
    }

    /* ── سياق إضافيّ للمهام: المعيار الفرعي · المؤشّر المُسنَد · نماذج الأدلة ── */
    let subStd = '', indicator = '', samples: string[] = []
    if (kind === 'task' && nodeId) {
      try {
        const { data: goal } = await db.from('plan_nodes')
          .select('parent_id, framework_node_id').eq('id', nodeId).maybeSingle()

        if (goal?.framework_node_id) {
          const { data: ind } = await db.from('framework_nodes')
            .select('code, name_ar').eq('id', goal.framework_node_id).maybeSingle()
          if (ind) indicator = `(${ind.code}) ${ind.name_ar}`
        }

        let subCode: string | null = null
        if (goal?.parent_id) {
          const { data: parent } = await db.from('plan_nodes')
            .select('name_ar, standard_code').eq('id', goal.parent_id).maybeSingle()
          if (parent) {
            subCode = parent.standard_code
            subStd  = `${parent.standard_code ? `(${parent.standard_code}) ` : ''}${parent.name_ar}`
          }
        }

        /* نماذج الأدلة مرتبطة بعقدة **الجانب** (المستوى 2) — ترحيل 067 */
        const aspectCode = subCode ? subCode.split('.').slice(0, 2).join('.') : null
        if (aspectCode) {
          const { data: aspect } = await db.from('framework_nodes')
            .select('id, frameworks!inner(status)')
            .eq('code', aspectCode).eq('level', 2).eq('frameworks.status', 'active').maybeSingle()
          if (aspect?.id) {
            const { data: evs } = await db.from('framework_evidence_samples')
              .select('text_ar').eq('framework_node_id', aspect.id).order('sort_order').limit(12)
            samples = (evs || []).map((e: any) => e.text_ar).filter(Boolean)
          }
        }
      } catch { /* السياق إثراءٌ لا شرط — يمضي الاقتراح بدونه */ }
    }

    const ctxBlock = [
      subStd    ? `- المعيار الفرعي: "${subStd}"` : '',
      indicator ? `- مؤشّر الأداء المُسنَد إليه الهدف: "${indicator}"` : '',
      samples.length
        ? `- أمثلة استرشادية على الأدلة في هذا الجانب (**ليست قائمة حاصرة** — الإطار يذكرها على سبيل المثال، والدليل الرسمي يشترط التنوّع):\n${samples.map(s => `  • ${s}`).join('\n')}`
        : '',
    ].filter(Boolean).join('\n')

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey || apiKey === 'your_groq_api_key_here') {
      return NextResponse.json({ error: 'مفتاح GROQ_API_KEY غير مُعيَّن' }, { status: 503 })
    }

    const existingList = existing?.length
      ? `\nعناصر موجودة بالفعل (لا تكررها):\n${existing.map((s: string) => `- ${s}`).join('\n')}`
      : ''

    const prompt = kind === 'task'
      ? `أنت خبير في التخطيط التربوي والتنفيذ المدرسي. مهمتك اقتراح مهام تنفيذية واضحة وقابلة للتنفيذ.

السياق:
- الخطة: ${planName || 'خطة تشغيلية مدرسية'}
- الهدف${contextCode ? ` (${contextCode})` : ''}: "${contextName}"
${ctxBlock}
${existingList}

المطلوب: اقترح 6 مهام تنفيذية محددة تحقّق هذا الهدف في بيئة مدرسة قطرية خاصة.
قواعد:
1. كل مهمة فعل تنفيذي واضح يمكن إسناده لموظف (مثل: إعداد، حصر، تنفيذ، تدريب، توثيق...).
2. محددة وواقعية وغير عامة.
3. مرتبطة مباشرة بالهدف المذكور.
4. **كل مهمة تُنتج دليلاً ملموساً** يمكن حفظه ورفعه (وثيقة · محضر · تقرير · استمارة · صورة · تحليل بيانات).
5. الأمثلة المذكورة أعلاه **استرشادية لا حاصرة**: استأنس بها و**لا تقتصر عليها** — واقترح أدلةً
   أخرى مناسبة للمعيار ولو لم يذكرها الإطار، فالدليل الرسمي يشترط **التنوّع والشمولية**.
6. **نوّع** مصادر الدليل بين المهامّ الستّ ولا تُكرّر النوع نفسه.
7. وإن ذُكر مؤشّر الأداء المُسنَد، فاجعل المهامّ **تشهد له بعينه** لا للمعيار عموماً.
8. مكتوبة بالعربية الفصيحة، جملة قصيرة لكل مهمة.

أجب بكائن JSON واحد لا غير، مفتاحه "items" وقيمته مصفوفة نصوص (أسماء المهام)، بلا أي شرح أو markdown، مثال:
{"items":["إعداد كشف بأسماء ...","تنفيذ ورشة ...","توثيق ..."]}`
      : `أنت خبير في التخطيط التربوي والاستراتيجي في مدرسة قطرية خاصة، تصوغ أهدافاً تشغيلية لمعيار اعتماد فرعي.

السياق:
${school || '- المدرسة: مدرسة قطرية خاصة'}
- الخطة: ${planName || 'خطة تشغيلية مدرسية'}${period ? ` · ${period}` : ''}
- المعيار الفرعي${contextCode ? ` (${contextCode})` : ''}: "${contextName}"
${indList.length ? `- مؤشرات الأداء تحته:\n${indList.map(i => `  • (${i.code}) ${i.name}`).join('\n')}` : ''}
${excellence.length ? `- وصف الأداء «ممتاز» في سلّم التقدير — وهو ما يُحكَم به على المدرسة فعلاً:\n${excellence.map(d => `  • ${d}`).join('\n')}` : ''}
${existingList}

المطلوب: اقترح **حتى 4** أهداف تشغيلية، مرتَّبةً بالأهمية، تُقرّب المدرسة من وصف «ممتاز» أعلاه.

قواعد مُلزِمة:
1. الهدف **نتيجة مرجوّة** لا نشاطاً: «يشغل كل موظف وظيفةً تطابق مؤهّله» هدف، و«تدريب الفريق» و«توثيق العمليات» مهامّ موضعها المستوى الذي تحته.
2. **هدف واحد في كل جملة** — لا تجمع هدفين بحرف «و».
3. كل هدف يخدم **مؤشّراً بعينه** من المؤشرات أعلاه، واذكر رمزه في الحقل indicator. ووزّع الأهداف على المؤشرات ولا تحشدها على واحد.
4. **المواعيد من مدّة الخطة وحدها** — ولا موعد خارجها البتّة. وإن لم تكن المدّة مذكورة فلا تذكر تاريخاً.
5. **لا تذكر ما ليس في السياق**: لا فروع ولا جهات ولا شهادات ولا أرقام لم تُعطَ لك. وإن لم تُذكر رؤية المدرسة فلا تخترعها.
6. **الكفاءة لا العدد**: إن لم تجد إلا هدفين دقيقين فاكتفِ بهما — ولا تُكمل العدد بحشو.
7. العربية الفصيحة، جملة قصيرة واحدة لكل هدف.

أمثلة للحكم لا للنسخ:
✗ «تدريب فريق الموارد البشرية على السياسة الجديدة» — نشاطٌ لا نتيجة.
✗ «ضمان توثيق عمليات التوظيف وتوفير ملفّ إلكتروني مركزي» — هدفان في جملة.
✗ «اعتماد معايير الاختيار بحلول يونيو 2024» — موعدٌ خارج مدّة الخطة.
✗ «تطبيق الدليل في جميع الفروع» — معلومةٌ ليست في السياق.
✓ «تتوافق وظائف جميع الموظفين مع مؤهلاتهم وخبراتهم بنهاية الفصل الدراسي الأول» — نتيجةٌ واحدة، تخدم مؤشّراً بعينه، وموعدها داخل المدّة.

أجب بكائن JSON واحد لا غير، مفتاحه "items"، بلا أي شرح أو markdown، مثال:
{"items":[{"name":"نصّ الهدف","indicator":"${indList[0]?.code || contextCode || '0.0.0'}"}]}`

    const groq   = new Groq({ apiKey })
    const result = await groq.chat.completions.create({
      model:       GROQ_MODEL_SMART,
      /* الأهداف تُطلب دقيقةً لا متنوّعة — والحرارة العالية تُفقدها الالتزام بالقواعد */
      temperature: kind === 'task' ? 0.7 : 0.35,
      /* المهامّ أطول من الأهداف، والسياق المُثرى يُطيل الجواب — ورموز
         «التفكير» تُحسب من السقف نفسه، فالبتر يعود جواباً ناقصاً */
      max_tokens:  kind === 'task' ? 1500 : 1200,
      ...groqTuning(GROQ_MODEL_SMART),
      response_format: { type: 'json_object' },
      messages:    [{ role: 'user', content: prompt }],
    })

    const rawText     = result.choices[0]?.message?.content?.trim() || ''
    const suggestions = parseAiStrings(rawText)

    if (!suggestions) {
      console.error('[plan-nodes/suggest] ردٌّ غير مفهوم:', rawText.slice(0, 600))
      return NextResponse.json({ error: 'تعذّر فهم ردّ الذكاء الاصطناعي — أعد المحاولة أو اكتب بنفسك' }, { status: 500 })
    }
    if (!suggestions.length) {
      console.error('[plan-nodes/suggest] قائمة فارغة · finish_reason:', result.choices[0]?.finish_reason)
      return NextResponse.json({ error: 'لم يُرجع النموذج اقتراحات — أعد المحاولة' }, { status: 500 })
    }

    return NextResponse.json({ suggestions })
  } catch (err: any) {
    console.error('[plan-nodes/suggest]', err)
    /* لا تُعرض رسالة المزوّد الخام على المدرسة — إلّا حين تكون قابلة للعلاج */
    const msg = err?.status === 404
      ? groqModelError(GROQ_MODEL_SMART, err?.message || '')
      : 'تعذّر توليد الاقتراحات — أعد المحاولة بعد قليل'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

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
    const { kind, contextName, contextCode, planName, existing, nodeId } = await req.json()
    if (!contextName) return NextResponse.json({ error: 'السياق مطلوب' }, { status: 400 })

    /* ── سياق إضافيّ للمهام: المعيار الفرعي · المؤشّر المُسنَد · نماذج الأدلة ── */
    let subStd = '', indicator = '', samples: string[] = []
    if (kind === 'task' && nodeId) {
      try {
        const db = auth.supabase
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
      : `أنت خبير في التخطيط التربوي والاستراتيجي. مهمتك اقتراح أهداف تشغيلية مناسبة لمعيار اعتماد فرعي.

السياق:
- الخطة: ${planName || 'خطة تشغيلية مدرسية'}
- المعيار الفرعي${contextCode ? ` (${contextCode})` : ''}: "${contextName}"
${existingList}

المطلوب: اقترح 6 أهداف تشغيلية تحقّق هذا المعيار الفرعي في بيئة مدرسة قطرية خاصة.
قواعد:
1. كل هدف محدد وقابل للتحقيق ويخدم المعيار الفرعي مباشرة.
2. صياغة هدف (نتيجة مرجوّة) لا مهمة تنفيذية.
3. واقعي وغير عام.
4. مكتوب بالعربية الفصيحة، جملة قصيرة لكل هدف.

أجب بكائن JSON واحد لا غير، مفتاحه "items" وقيمته مصفوفة نصوص (أسماء الأهداف)، بلا أي شرح أو markdown، مثال:
{"items":["رفع نسبة ...","تحسين ...","ضمان ..."]}`

    const groq   = new Groq({ apiKey })
    const result = await groq.chat.completions.create({
      model:       GROQ_MODEL_SMART,
      temperature: 0.7,
      /* المهامّ أطول من الأهداف، والسياق المُثرى يُطيل الجواب — ورموز
         «التفكير» تُحسب من السقف نفسه، فالبتر يعود جواباً ناقصاً */
      max_tokens:  kind === 'task' ? 1500 : 1024,
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

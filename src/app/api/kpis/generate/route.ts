import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { requireAuth } from '@/lib/supabase/server'
import { GROQ_MODEL_SMART, groqTuning, groqModelError } from '@/lib/ai/groq'
import { parseAiArray } from '@/lib/ai/json'

const KPI_TYPE_LABEL: Record<string, string> = {
  impact:  'الأثر البعيد — تغيير حقيقي في الواقع التعليمي',
  outcome: 'النتيجة المباشرة — نتيجة ملموسة من تنفيذ الخطة',
  output:  'المخرجات — ما أنتجته الأنشطة والمبادرات',
}
const KPI_FREQ_LABEL: Record<string, string> = {
  monthly:   'شهري',
  quarterly: 'ربع سنوي',
  semester:  'فصلي (مرتان في السنة)',
  yearly:    'سنوي',
}

export async function POST(req: NextRequest) {
  /* ── التحقق من هوية المُستدعي أولاً ── */
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { nodeName, planName, levelName, kpiType, frequency, existingKpis } = await req.json()

    if (!nodeName) {
      return NextResponse.json({ error: 'اسم العقدة مطلوب' }, { status: 400 })
    }

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey || apiKey === 'your_groq_api_key_here') {
      return NextResponse.json({ error: 'مفتاح GROQ_API_KEY غير مُعيَّن' }, { status: 503 })
    }

    const existingList = existingKpis?.length
      ? `\nمؤشرات موجودة بالفعل (لا تكررها):\n${existingKpis.map((k: string) => `- ${k}`).join('\n')}`
      : ''

    const prompt = `أنت خبير في التخطيط التربوي والاستراتيجي. مهمتك توليد مؤشرات أداء رئيسية (KPIs) دقيقة وقابلة للقياس وفق معايير SMART.

السياق:
- الخطة: ${planName || 'خطة تشغيلية مدرسية'}
- المستوى الهرمي: ${levelName || 'هدف'}
- الهدف / العنصر: "${nodeName}"
- نوع المؤشر المطلوب: ${KPI_TYPE_LABEL[kpiType] || kpiType}
- دورية القياس: ${KPI_FREQ_LABEL[frequency] || frequency}
${existingList}

المطلوب: اقترح 4 مؤشرات أداء رئيسية مختلفة ومناسبة لهذا الهدف في البيئة التعليمية المدرسية القطرية.

قواعد المؤشرات:
1. يجب أن تكون قابلة للقياس الكمي (نسبة مئوية، عدد، درجة، إلخ)
2. مرتبطة مباشرة بالهدف المذكور
3. واقعية وقابلة للتحقيق
4. تتناسب مع نوع المؤشر المطلوب
5. مكتوبة بالعربية الفصيحة

أجب بكائن JSON واحد لا غير، مفتاحه "items" وقيمته مصفوفة المؤشرات، بدون أي نص أو markdown، مثال:
{"items":[{"name_ar":"...","target_value":85,"unit":"%","baseline_value":60,"description":"..."}]}`

    const groq   = new Groq({ apiKey })
    const result = await groq.chat.completions.create({
      model:       GROQ_MODEL_SMART,
      temperature: 0.7,
      max_tokens:  1024,
      ...groqTuning(GROQ_MODEL_SMART),
      response_format: { type: 'json_object' },
      messages:    [{ role: 'user', content: prompt }],
    })

    const rawText = result.choices[0]?.message?.content?.trim() || ''

    /* بعدّ الأقواس لا بتعبيرٍ نمطيّ جَشِع — انظر `src/lib/ai/json.ts` */
    const suggestions = parseAiArray(rawText)
    if (!suggestions) {
      console.error('[kpis/generate] ردٌّ غير مفهوم:', rawText.slice(0, 600))
      return NextResponse.json({ error: 'تعذّر فهم ردّ الذكاء الاصطناعي — أعد المحاولة' }, { status: 500 })
    }

    return NextResponse.json({ suggestions })

  } catch (err: any) {
    console.error('[kpis/generate]', err)
    const msg = err?.status === 404
      ? groqModelError(GROQ_MODEL_SMART, err?.message || '')
      : 'تعذّر توليد المؤشرات — أعد المحاولة بعد قليل'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

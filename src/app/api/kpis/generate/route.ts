import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'

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

أجب فقط بمصفوفة JSON خالصة بدون أي نص أو markdown، مثال:
[{"name_ar":"...","target_value":85,"unit":"%","baseline_value":60,"description":"..."}]`

    const groq   = new Groq({ apiKey })
    const result = await groq.chat.completions.create({
      model:       'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_tokens:  1024,
      messages:    [{ role: 'user', content: prompt }],
    })

    const rawText = result.choices[0]?.message?.content?.trim() || ''

    const jsonMatch = rawText.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'تعذّر تحليل رد الذكاء الاصطناعي' }, { status: 500 })
    }

    const suggestions = JSON.parse(jsonMatch[0])
    return NextResponse.json({ suggestions })

  } catch (err: any) {
    console.error('[kpis/generate]', err)
    return NextResponse.json(
      { error: err?.message || 'خطأ في الخادم' },
      { status: 500 }
    )
  }
}

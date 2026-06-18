import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { requireAuth } from '@/lib/supabase/server'

/**
 * POST /api/plan-nodes/suggest — اقتراح أهداف أو مهام بالذكاء الاصطناعي (Groq)
 * body: { kind: 'goal' | 'task', contextName, contextCode?, planName?, existing?: string[] }
 * يُرجع: { suggestions: string[] }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { kind, contextName, contextCode, planName, existing } = await req.json()
    if (!contextName) return NextResponse.json({ error: 'السياق مطلوب' }, { status: 400 })

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
${existingList}

المطلوب: اقترح 6 مهام تنفيذية محددة تحقّق هذا الهدف في بيئة مدرسة قطرية خاصة.
قواعد:
1. كل مهمة فعل تنفيذي واضح يمكن إسناده لموظف (مثل: إعداد، حصر، تنفيذ، تدريب، توثيق...).
2. محددة وواقعية وغير عامة.
3. مرتبطة مباشرة بالهدف المذكور.
4. مكتوبة بالعربية الفصيحة، جملة قصيرة لكل مهمة.

أجب فقط بمصفوفة JSON من نصوص (أسماء المهام) بلا أي شرح أو markdown، مثال:
["إعداد كشف بأسماء ...","تنفيذ ورشة ...","توثيق ..."]`
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

أجب فقط بمصفوفة JSON من نصوص (أسماء الأهداف) بلا أي شرح أو markdown، مثال:
["رفع نسبة ...","تحسين ...","ضمان ..."]`

    const groq   = new Groq({ apiKey })
    const result = await groq.chat.completions.create({
      model:       'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_tokens:  1024,
      messages:    [{ role: 'user', content: prompt }],
    })

    const rawText   = result.choices[0]?.message?.content?.trim() || ''
    const jsonMatch = rawText.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return NextResponse.json({ error: 'تعذّر تحليل رد الذكاء الاصطناعي' }, { status: 500 })

    const parsed = JSON.parse(jsonMatch[0])
    const suggestions = (Array.isArray(parsed) ? parsed : [])
      .map((s: any) => (typeof s === 'string' ? s : s?.name_ar || s?.name || ''))
      .map((s: string) => s.trim())
      .filter(Boolean)

    return NextResponse.json({ suggestions })
  } catch (err: any) {
    console.error('[plan-nodes/suggest]', err)
    return NextResponse.json({ error: err?.message || 'خطأ في الخادم' }, { status: 500 })
  }
}

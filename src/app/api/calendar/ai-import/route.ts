import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE_MB = 10

const PROMPT = `أنت نظام استخراج بيانات متخصص في التقاويم الدراسية القطرية.
استخرج جميع الفترات والأحداث من هذه الصورة (عطلات، إجازات، اختبارات، أيام وطنية، أعياد، بدء/نهاية دوام).

قواعد الاستخراج:
- title: نص "البيان" أو وصف الحدث كما هو في الصورة
- kind: اختر من: holiday (عطلة/إجازة), break (استراحة/منتصف فصل), national (وطني), eid (عيد), exam (اختبار/امتحان/اختبارات), other (بدء دوام/نهاية دوام/غير ذلك)
- enforcement: block للعطلات والأعياد والاختبارات، warn لغيرها
- start_date و end_date: صيغة YYYY-MM-DD حصراً
- لو كان عمود "الفترة الزمنية" مقسوماً إلى خليتين في أحد الفعاليات: استخرج التاريخ في الخلية اليمنى ليكون تاريخ البدء (start_date)، والتاريخ في الخلية اليسرى ليكون تاريخ الانتهاء (end_date).
- في حال كان عمود "الفترة الزمنية" غير مقسوم إلى خليتين (تاريخ واحد فقط): اجعل تاريخ البدء هو نفسه تاريخ الانتهاء (start_date = end_date).
- انتبه لتنسيق التواريخ العربية (يوم / شهر / سنة) وأسماء الأشهر العربية (يناير=01 ... ديسمبر=12)
- استخرج كل صف في الجدول

أعد JSON فقط (مصفوفة) بدون أي نص إضافي قبله أو بعده:
[{"title":"اسم الحدث","kind":"holiday","start_date":"YYYY-MM-DD","end_date":"YYYY-MM-DD","enforcement":"block"}]

إن لم تجد أي أحداث: []`

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ميزة الذكاء الاصطناعي غير مفعّلة — يرجى إضافة GROQ_API_KEY في إعدادات الخادم' },
      { status: 503 },
    )
  }

  let formData: FormData
  try { formData = await req.formData() } catch {
    return NextResponse.json({ error: 'تعذّر قراءة البيانات المرسلة' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'الملف مطلوب' }, { status: 400 })

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'يُقبل فقط: JPG، PNG، WebP — للـPDF التقطِ صورة للصفحة أو استخدم استيراد Excel' },
      { status: 415 },
    )
  }

  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return NextResponse.json({ error: `حجم الملف يتجاوز ${MAX_SIZE_MB} ميغابايت` }, { status: 413 })
  }

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')
  const mimeType = file.type === 'image/jpg' ? 'image/jpeg' : file.type

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 4000,
      }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error('[calendar/ai-import] Groq error:', res.status, errText)
      if (res.status === 429) {
        return NextResponse.json(
          { error: 'تجاوزت الحصة المجانية مؤقتاً — جرّب بعد دقيقة أو استخدم استيراد Excel' },
          { status: 429 },
        )
      }
      return NextResponse.json(
        { error: 'تعذّر تحليل الصورة — حاول بصورة أوضح أو استخدم استيراد Excel' },
        { status: 500 },
      )
    }

    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content || '[]'
    const match = content.match(/\[[\s\S]*\]/)
    if (!match) return NextResponse.json({ events: [] })

    const raw: any[] = JSON.parse(match[0])
    const VALID_KINDS = ['holiday', 'break', 'national', 'eid', 'exam', 'other']
    const events = raw
      .filter(e => e && typeof e.title === 'string' && e.title.trim())
      .map(e => ({
        title:       String(e.title).trim(),
        kind:        VALID_KINDS.includes(e.kind) ? e.kind : 'other',
        start_date:  String(e.start_date || '').slice(0, 10),
        end_date:    String(e.end_date || e.start_date || '').slice(0, 10),
        enforcement: e.enforcement === 'warn' ? 'warn' : 'block',
      }))

    return NextResponse.json({ events })
  } catch (err: any) {
    console.error('[calendar/ai-import]', err?.message || err)
    return NextResponse.json(
      { error: 'تعذّر تحليل الصورة — حاول بصورة أوضح أو استخدم استيراد Excel' },
      { status: 500 },
    )
  }
}

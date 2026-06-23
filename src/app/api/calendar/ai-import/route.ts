import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE_MB = 10

const PROMPT = `أنت نظام استخراج بيانات متخصص في التقاويم الدراسية القطرية.
استخرج جميع الفترات والأحداث من هذه الصورة (عطلات، إجازات، اختبارات، أيام وطنية، أعياد).

قواعد الاستخراج:
- kind: اختر من: holiday (عطلة/إجازة), break (استراحة/منتصف فصل), national (وطني), eid (عيد), exam (اختبار/امتحان/اختبارات), other
- enforcement: block للعطلات والأعياد والاختبارات، warn للتنبيه فقط
- start_date و end_date: صيغة YYYY-MM-DD حصراً
- إن كان الحدث يوماً واحداً: اجعل start_date = end_date
- تجاهل أيام الدراسة العادية والفترات غير المحددة
- إذا رأيت عاماً هجرياً حوّله لميلادي تقريبياً

أعد JSON فقط (مصفوفة) بدون أي نص إضافي قبله أو بعده:
[{"title":"اسم الحدث","kind":"holiday","start_date":"YYYY-MM-DD","end_date":"YYYY-MM-DD","enforcement":"block"}]

إن لم تجد أي أحداث: []`

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ميزة الذكاء الاصطناعي غير مفعّلة — يرجى إضافة GEMINI_API_KEY في إعدادات الخادم' },
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

  const body = {
    contents: [
      {
        parts: [
          { inline_data: { mime_type: mimeType, data: base64 } },
          { text: PROMPT },
        ],
      },
    ],
    generationConfig: { temperature: 0.1, maxOutputTokens: 4000 },
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    )

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error('[calendar/ai-import] Gemini error:', res.status, errText)
      const detail = errText.slice(0, 300)
      return NextResponse.json(
        { error: `تعذّر التحليل (Gemini ${res.status}): ${detail}` },
        { status: 500 },
      )
    }

    const data = await res.json()
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]'
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
      { error: `تعذّر التحليل (استثناء): ${String(err?.message || err).slice(0, 300)}` },
      { status: 500 },
    )
  }
}

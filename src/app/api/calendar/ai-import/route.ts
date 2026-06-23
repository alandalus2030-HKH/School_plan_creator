import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE_MB = 10

const PROMPT = `You are an AI system specialized in structured data extraction.

Task:
- Convert the attached image of the school calendar (academic year 2026/2027) into a clean, error-free digital table.
- Ensure accuracy of all dates and event descriptions.

Validation Rules:
1. Each row must contain:
   - "event": Arabic text exactly as in the image (do not translate).
   - "date_range": normalized ISO format. Single date: "YYYY-MM-DD". Range: "YYYY-MM-DD to YYYY-MM-DD".
   - "kind": one of: holiday (عطلة/إجازة), break (استراحة/منتصف فصل), national (وطني), eid (عيد), exam (اختبار/امتحان/اختبارات), other (بدء دوام/نهاية دوام/غير ذلك).
   - "enforcement": "block" for holidays, eid, exams; "warn" otherwise.
2. If start date = end date → store as single date. Example: "2026-08-23"
3. If start date ≠ end date → store as range. Example: "2026-08-23 to 2026-08-27"
4. Verify chronological order of events from August 2026 to August 2027.
5. If a date is unclear, set date_range to "ERROR: date not recognized".
6. Arabic month names: يناير=01 فبراير=02 مارس=03 أبريل=04 مايو=05 يونيو=06 يوليو=07 أغسطس=08 سبتمبر=09 أكتوبر=10 نوفمبر=11 ديسمبر=12.
7. Extract every row in the table.

Output JSON array only, no text before or after:
[
  {"event":"بدء دوام الموظفين في المدارس للعام الأكاديمي 2026/2027","date_range":"2026-08-23","kind":"other","enforcement":"warn"},
  {"event":"اختبارات الدور الثاني لجميع الصفوف","date_range":"2026-08-23 to 2026-08-27","kind":"exam","enforcement":"block"}
]

If no events: []`

/* تحويل date_range ("YYYY-MM-DD" أو "YYYY-MM-DD to YYYY-MM-DD") إلى بداية/نهاية */
function parseRange(dr: any): { start: string; end: string } {
  const s = String(dr || '').trim()
  if (!s || /^ERROR/i.test(s)) return { start: '', end: '' }
  const parts = s.split(/\s+to\s+/i)
  const start = (parts[0] || '').slice(0, 10)
  const end = (parts[1] || parts[0] || '').slice(0, 10)
  return { start, end }
}

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
      .filter(e => e && typeof e.event === 'string' && e.event.trim())
      .map(e => {
        const { start, end } = parseRange(e.date_range)
        return {
          title:       String(e.event).trim(),
          kind:        VALID_KINDS.includes(e.kind) ? e.kind : 'other',
          start_date:  start,
          end_date:    end,
          enforcement: e.enforcement === 'warn' ? 'warn' : 'block',
        }
      })

    return NextResponse.json({ events })
  } catch (err: any) {
    console.error('[calendar/ai-import]', err?.message || err)
    return NextResponse.json(
      { error: 'تعذّر تحليل الصورة — حاول بصورة أوضح أو استخدم استيراد Excel' },
      { status: 500 },
    )
  }
}

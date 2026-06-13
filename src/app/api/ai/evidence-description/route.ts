import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { videoTitle, videoUrl } = await req.json()
  if (!videoTitle) return NextResponse.json({ error: 'videoTitle مطلوب' }, { status: 400 })

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content: 'أنت مساعد تعليمي متخصص في أنظمة الاعتماد المدرسي. تجيب باللغة العربية فقط.',
        },
        {
          role: 'user',
          content: `عنوان فيديو يوتيوب: "${videoTitle}"
رابط: ${videoUrl}

هذا فيديو سيُستخدم كدليل إثبات في نظام متابعة الخطط المدرسية (QNSA).
اقترح:
1. اسماً موجزاً للدليل (5-8 كلمات عربية)
2. وصفاً مختصراً يوضّح قيمته كدليل (جملة أو جملتين)

أجب بتنسيق JSON فقط بدون أي نص إضافي:
{"name": "...", "description": "..."}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 200,
    })

    const content = completion.choices[0]?.message?.content || '{}'
    const jsonMatch = content.match(/\{[\s\S]*?\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { name: videoTitle, description: '' }
    return NextResponse.json(parsed)
  } catch (err: any) {
    console.error('[groq evidence-description]', err)
    return NextResponse.json({ name: videoTitle, description: '' })
  }
}

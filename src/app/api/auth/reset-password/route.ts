import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  const { email } = await req.json()
  if (!email) return Response.json({ error: 'البريد الإلكتروني مطلوب' }, { status: 400 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  const { error } = await admin.auth.resetPasswordForEmail(email, {
    /* الجلسة تُسلَّم في hash → صفحة عميل مباشرة (لا مسار خادمي يفقد الـ hash) */
    redirectTo: `${siteUrl}/auth/update-password`,
  })

  if (error) {
    /* رسائل أوضح للأخطاء الشائعة (حدّ إرسال البريد المدمج في Supabase) */
    const raw = error.message || ''
    const msg = /rate limit/i.test(raw)
      ? 'تم تجاوز حدّ إرسال رسائل البريد مؤقتاً (قيد مزوّد بريد Supabase الافتراضي). انتظر قليلاً ثم أعد المحاولة، أو اضبط مزوّد SMTP مخصّصاً لرفع الحد.'
      : raw
    return Response.json({ error: msg }, { status: 400 })
  }
  return Response.json({ ok: true })
}

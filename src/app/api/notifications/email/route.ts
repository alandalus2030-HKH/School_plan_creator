import { NextRequest, NextResponse } from 'next/server'

/* POST /api/notifications/email — إرسال بريد إلكتروني للإشعار */
export async function POST(req: NextRequest) {
  const { to, title, body, link } = await req.json()

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    /* البريد غير مُفعَّل بعد — تجاهل بهدوء */
    return NextResponse.json({ skipped: true })
  }

  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const fullLink = link ? `${siteUrl}${link}` : siteUrl

    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    'نظام متابعة الخطط <notifications@yourdomain.com>',
        to:      [to],
        subject: title,
        html: `
          <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
            <div style="background: #7c3aed; color: white; padding: 16px 24px; border-radius: 12px 12px 0 0;">
              <h2 style="margin: 0; font-size: 18px;">🔔 ${title}</h2>
            </div>
            <div style="background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
              ${body ? `<p style="color: #475569; margin: 0 0 16px;">${body}</p>` : ''}
              ${link ? `
                <a href="${fullLink}"
                   style="display: inline-block; background: #7c3aed; color: white; padding: 10px 20px;
                          border-radius: 8px; text-decoration: none; font-weight: bold;">
                  عرض التفاصيل ←
                </a>` : ''}
              <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
                نظام متابعة الخطط المدرسية
              </p>
            </div>
          </div>
        `,
      }),
    })

    if (!res.ok) {
      const err = await res.json()
      console.error('[email]', err)
      return NextResponse.json({ error: 'فشل إرسال البريد' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[email]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

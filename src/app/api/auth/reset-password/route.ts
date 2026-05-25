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
    redirectTo: `${siteUrl}/auth/callback?next=/auth/update-password`,
  })

  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ ok: true })
}

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/**
 * DEBUG ONLY — يُحذف بعد حل المشكلة
 * GET /api/debug/check-username?email=alandalus2030@gmail.com
 * GET /api/debug/check-username?username=mokhtar
 */
export async function GET(req: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'no service key' }, { status: 500 })

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const email    = req.nextUrl.searchParams.get('email')    || ''
  const username = req.nextUrl.searchParams.get('username') || ''

  // بحث في profiles
  let profileQuery = admin.from('profiles').select('id, email, username, name_ar, is_active, created_at')
  if (email)    profileQuery = (profileQuery as any).eq('email', email)
  if (username) profileQuery = (profileQuery as any).ilike('username', username)

  const { data: profiles, error: profileErr } = await (profileQuery as any)

  // بحث في auth.users
  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const authUsers = (authList?.users || []).filter(u =>
    (email && u.email?.toLowerCase() === email.toLowerCase()) ||
    (username && (u.user_metadata?.username || '').toLowerCase() === username.toLowerCase())
  )

  return NextResponse.json({
    profiles: profiles || [],
    profileError: profileErr?.message,
    authUsers: authUsers.map(u => ({
      id: u.id,
      email: u.email,
      username_in_metadata: u.user_metadata?.username,
      created_at: u.created_at,
    })),
  })
}

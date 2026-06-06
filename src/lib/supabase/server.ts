import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}

/**
 * requireAuth — دالة مساعدة لحماية API Routes
 *
 * الاستخدام:
 *   const auth = await requireAuth()
 *   if (auth instanceof NextResponse) return auth   // 401 تلقائي
 *   const { user, supabase } = auth
 */
export async function requireAuth() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json(
      { error: 'غير مصرح — يجب تسجيل الدخول أولاً' },
      { status: 401 }
    )
  }

  return { user, supabase }
}

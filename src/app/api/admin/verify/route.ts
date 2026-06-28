import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireSuperAdmin } from '@/lib/adminGuard'

/**
 * POST /api/admin/verify  { password }
 * بوّابة إعادة المصادقة قبل فتح الأدوات المدمّرة (طبقة تحقّق ثانية فوق is_super_admin).
 * يتحقّق من كلمة مرور المشرف عبر عميل منفصل (لا يمسّ الجلسة الحالية).
 */
export async function POST(req: NextRequest) {
  const g = await requireSuperAdmin()
  if (g.error) return g.error

  const { password } = await req.json().catch(() => ({}))
  if (!password || !g.user.email) {
    return NextResponse.json({ error: 'كلمة المرور مطلوبة' }, { status: 400 })
  }

  const probe = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { error } = await probe.auth.signInWithPassword({ email: g.user.email, password })
  if (error) {
    return NextResponse.json({ error: 'كلمة المرور غير صحيحة' }, { status: 401 })
  }
  return NextResponse.json({ ok: true })
}

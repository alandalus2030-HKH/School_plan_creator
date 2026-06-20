import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * يصفّر إلزام تغيير كلمة المرور للمستخدم الحالي بعد أن يضبط كلمته.
 * يُستدعى من صفحة تعيين كلمة المرور عند النجاح.
 */
export async function POST() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ must_change_password: false })
    .eq('id', auth.user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

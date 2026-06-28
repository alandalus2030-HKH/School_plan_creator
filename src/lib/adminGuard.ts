import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * حارس الأدوات الإشرافية — يضمن أن المُستدعي مشرف منصة (is_super_admin).
 * يُستخدم في كل نقاط /api/admin/*. يُرجع إما { error } (رد جاهز) أو { user, admin }.
 */
export async function requireSuperAdmin() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return { error: auth as NextResponse }

  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles').select('is_super_admin').eq('id', auth.user.id).single()

  if (!me?.is_super_admin) {
    return { error: NextResponse.json({ error: 'متاح لمشرف المنصة فقط' }, { status: 403 }) }
  }
  return { user: auth.user, admin }
}

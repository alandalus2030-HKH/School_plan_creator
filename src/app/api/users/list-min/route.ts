import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/users/list-min
 * قائمة مختصرة بالمستخدمين النشطين (id, name, email)
 * لاختيار مالك مجموعة — متاح لمشرف النظام فقط
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles').select('is_super_admin').eq('id', auth.user.id).single()
  if (!me?.is_super_admin) {
    return NextResponse.json({ error: 'متاح لمشرف النظام فقط' }, { status: 403 })
  }

  const { data } = await admin
    .from('profiles')
    .select('id, name_ar, email')
    .eq('is_active', true)
    .order('name_ar')
    .limit(1000)

  return NextResponse.json({ users: data || [] })
}

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/groups/principals
 * قائمة مديري مدارس مجموعة المالك (أسماء فقط — للدعوة)
 * متاح لمالك المجموعة
 *
 * ⚖️ خصوصية: أسماء المديرين فقط — لا بيانات مدارسهم
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles').select('is_group_owner, owned_group_id, is_super_admin')
    .eq('id', auth.user.id).single()

  if (!me?.is_group_owner && !me?.is_super_admin) {
    return NextResponse.json({ error: 'متاح لمالك المجموعة فقط' }, { status: 403 })
  }
  if (!me.owned_group_id) {
    return NextResponse.json({ principals: [] })
  }

  /* مدارس المجموعة */
  const { data: schools } = await admin
    .from('schools').select('id, name_ar').eq('group_id', me.owned_group_id)
  const schoolIds = (schools || []).map(s => s.id)
  if (schoolIds.length === 0) return NextResponse.json({ principals: [] })

  /* مديرو هذه المدارس (school_admin) */
  const { data: admins } = await admin
    .from('profiles')
    .select('id, name_ar, email, school_id')
    .in('school_id', schoolIds)
    .eq('role', 'school_admin')
    .eq('is_active', true)

  const schoolMap = Object.fromEntries((schools || []).map(s => [s.id, s.name_ar]))
  const principals = (admins || []).map(a => ({
    id:          a.id,
    name_ar:     a.name_ar,
    email:       a.email,
    school_name: schoolMap[a.school_id!] || '',
  }))

  return NextResponse.json({ principals })
}

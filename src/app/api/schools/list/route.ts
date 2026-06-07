import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/schools/list
 * قائمة كل المدارس + عدد المستخدمين والخطط لكل مدرسة
 * متاح لمشرف النظام فقط
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { user } = auth

  const admin = createAdminClient()

  const { data: me } = await admin
    .from('profiles').select('is_super_admin').eq('id', user.id).single()
  if (!me?.is_super_admin) {
    return NextResponse.json({ error: 'متاح لمشرف النظام فقط' }, { status: 403 })
  }

  /* ── جلب المدارس + الإحصائيات ── */
  const [{ data: schools }, { data: profiles }, { data: plans }] = await Promise.all([
    admin.from('schools').select('id, name_ar, name_en, created_at').order('created_at'),
    admin.from('profiles').select('school_id, is_active'),
    admin.from('plans').select('school_id').is('deleted_at', null),
  ])

  const result = (schools || []).map(s => ({
    ...s,
    user_count:   (profiles || []).filter(p => p.school_id === s.id).length,
    active_count: (profiles || []).filter(p => p.school_id === s.id && p.is_active).length,
    plan_count:   (plans    || []).filter(p => p.school_id === s.id).length,
  }))

  return NextResponse.json({ schools: result })
}

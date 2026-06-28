import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/adminGuard'

/**
 * GET /api/admin/preview
 * معاينة جافة لأدوات المشرف: المدارس وأعدادها + إجماليات + حسابات المصادقة اليتيمة.
 */
export async function GET() {
  const g = await requireSuperAdmin()
  if (g.error) return g.error
  const { admin } = g

  const [{ data: schools }, { data: profiles }, { data: plans }] = await Promise.all([
    admin.from('schools').select('id, name_ar').order('name_ar'),
    admin.from('profiles').select('id, school_id'),
    admin.from('plans').select('id, school_id'),
  ])

  const schoolList = (schools || []).map(s => ({
    id:     s.id,
    name_ar: s.name_ar,
    users:  (profiles || []).filter(p => p.school_id === s.id).length,
    plans:  (plans || []).filter(p => p.school_id === s.id).length,
  }))

  /* حسابات auth.users بلا ملف شخصي (أشباح) */
  const profileIds = new Set((profiles || []).map(p => p.id))
  const { data: authData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const authUsers = authData?.users || []
  const orphanAuth = authUsers.filter(u => !profileIds.has(u.id)).length

  return NextResponse.json({
    schools: schoolList,
    totals: {
      schools:    schoolList.length,
      profiles:   (profiles || []).length,
      authUsers:  authUsers.length,
      orphanAuth,
    },
  })
}

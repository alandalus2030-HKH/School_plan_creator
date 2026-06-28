import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/adminGuard'

/**
 * POST /api/admin/purge-orphans
 * حذف حسابات auth.users التي لا يقابلها ملف شخصي (أشباح خلّفتها عمليات حذف سابقة
 * تركت حساب المصادقة) — تمنع تصادم «البريد مسجَّل مسبقاً» لاحقاً.
 */
export async function POST() {
  const g = await requireSuperAdmin()
  if (g.error) return g.error
  const { admin, user } = g

  const { data: profiles } = await admin.from('profiles').select('id')
  const profileIds = new Set((profiles || []).map(p => p.id))

  const { data: authData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const orphans = (authData?.users || []).filter(u => !profileIds.has(u.id))

  let deleted = 0
  const failed: string[] = []
  for (const u of orphans) {
    const { error: e } = await admin.auth.admin.deleteUser(u.id)
    if (e) failed.push(u.id); else deleted++
  }

  try {
    await admin.from('audit_logs').insert({
      school_id: null, user_id: user.id, action: 'admin_purge_orphan_auth',
      new_values: { found: orphans.length, deleted, failed: failed.length },
    })
  } catch {}

  return NextResponse.json({ ok: true, found: orphans.length, deleted, failed: failed.length })
}

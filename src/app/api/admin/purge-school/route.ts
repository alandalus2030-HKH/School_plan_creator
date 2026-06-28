import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/adminGuard'
import { recordAudit } from '@/lib/audit'

/**
 * POST /api/admin/purge-school  { schoolId, confirm }
 * حذف مدرسة قسري متعاقب: كل بياناتها + مستخدميها + حساباتهم في auth.users.
 * يتطلّب confirm = اسم المدرسة بالضبط.
 */
export async function POST(req: NextRequest) {
  const g = await requireSuperAdmin()
  if (g.error) return g.error
  const { admin, user } = g

  const { schoolId, confirm } = await req.json().catch(() => ({}))
  if (!schoolId) return NextResponse.json({ error: 'لم تُحدَّد المدرسة' }, { status: 400 })

  const { data: school } = await admin.from('schools').select('id, name_ar').eq('id', schoolId).single()
  if (!school) return NextResponse.json({ error: 'المدرسة غير موجودة' }, { status: 404 })

  if ((confirm || '').trim() !== (school.name_ar || '').trim()) {
    return NextResponse.json({ error: 'نص التأكيد لا يطابق اسم المدرسة' }, { status: 400 })
  }

  /* (1) حذف بيانات المدرسة ومستخدميها داخل معاملة ذرّية → تُرجع معرّفات المستخدمين */
  const { data: ids, error } = await admin.rpc('admin_purge_school', { p_school: schoolId })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const userIds: string[] = (Array.isArray(ids) ? ids : [])
    .map((r: any) => (typeof r === 'string' ? r : (r?.admin_purge_school ?? r?.unnest ?? Object.values(r ?? {})[0])))
    .filter(Boolean) as string[]

  /* (2) حذف حسابات المصادقة المقابلة */
  let authDeleted = 0
  const authFailed: string[] = []
  for (const uid of userIds) {
    const { error: e } = await admin.auth.admin.deleteUser(uid)
    if (e) authFailed.push(uid); else authDeleted++
  }

  /* (3) تسجيل العملية (أُفرغ سجل المدرسة بالفعل — نسجّل على مستوى المنصة) */
  await recordAudit({
    req, userId: user.id, schoolId: null,
    action: 'admin_purge_school', table: 'schools', recordId: schoolId,
    after: { school: school.name_ar, users_purged: userIds.length, auth_deleted: authDeleted, auth_failed: authFailed.length },
  })

  return NextResponse.json({
    ok: true, school: school.name_ar,
    usersPurged: userIds.length, authDeleted, authFailed: authFailed.length,
  })
}

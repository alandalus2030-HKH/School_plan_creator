import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/adminGuard'
import { recordAudit } from '@/lib/audit'

const CONFIRM_PHRASE = 'مسح نهائي'

/**
 * POST /api/admin/reset  { confirm }
 * إعادة تهيئة ما قبل الإطلاق: حذف كل المدارس/المستخدمين/البيانات + حساباتهم في
 * auth.users، مع إبقاء البذور (الأدوار العامة/القوائم/معايير QNSA/المجموعات)
 * وإبقاء المشرف المُستدعي وحده. يتطلّب confirm = «مسح نهائي».
 */
export async function POST(req: NextRequest) {
  const g = await requireSuperAdmin()
  if (g.error) return g.error
  const { admin, user } = g

  const { confirm } = await req.json().catch(() => ({}))
  if ((confirm || '').trim() !== CONFIRM_PHRASE) {
    return NextResponse.json({ error: `اكتب عبارة التأكيد «${CONFIRM_PHRASE}» بالضبط` }, { status: 400 })
  }

  /* (1) حذف كل بيانات المستأجرين + الملفات (عدا المشرف) — يُرجع معرّفات المحذوفين */
  const { data: ids, error } = await admin.rpc('admin_reset_tenants', { p_keep: user.id })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const userIds: string[] = (Array.isArray(ids) ? ids : [])
    .map((r: any) => (typeof r === 'string' ? r : (r?.admin_reset_tenants ?? r?.unnest ?? Object.values(r ?? {})[0])))
    .filter(Boolean) as string[]

  /* (2) حذف حسابات المصادقة المقابلة (يشمل الأشباح ضمناً عبر الأداة المنفصلة) */
  let authDeleted = 0
  const authFailed: string[] = []
  for (const uid of userIds) {
    const { error: e } = await admin.auth.admin.deleteUser(uid)
    if (e) authFailed.push(uid); else authDeleted++
  }

  /* (3) تسجيل العملية على مستوى المنصة (السجل أُفرِغ) */
  await recordAudit({
    req, userId: user.id, schoolId: null, action: 'admin_reset_tenants',
    after: { profiles_deleted: userIds.length, auth_deleted: authDeleted, auth_failed: authFailed.length },
  })

  return NextResponse.json({ ok: true, profilesDeleted: userIds.length, authDeleted, authFailed: authFailed.length })
}

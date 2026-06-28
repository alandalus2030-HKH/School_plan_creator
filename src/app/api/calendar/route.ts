import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAudit } from '@/lib/audit'

/**
 * التقويم المدرسي (عطلات/اختبارات) + أيام نهاية الأسبوع.
 * GET    → { events, weekend } لكل مستخدم في المدرسة (للعرض/التحقق).
 * POST   → إنشاء فترة (صلاحية إدارة).
 * PATCH  → تحديث أيام نهاية الأسبوع { weekend:[..] } (صلاحية إدارة).
 * العزل: المدرسة الفعّالة (يحترم التقمّص).
 */

const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']
const KINDS = ['holiday', 'exam', 'break', 'national', 'eid', 'other']
const ENFORCE = ['block', 'warn']

async function getContext(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles').select('school_id, active_school_id, is_super_admin, role').eq('id', userId).single()
  if (!me) return null
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  return { admin, me, schoolId }
}

async function canManage(admin: any, role: string, isSuper: boolean) {
  if (isSuper || ADMIN_ROLES.includes(role)) return true
  const { data: roleData } = await admin.from('roles').select('permissions').eq('code', role).maybeSingle()
  const perms: string[] = Array.isArray(roleData?.permissions) ? roleData!.permissions : []
  return perms.includes('all') || perms.includes('manage_settings') || perms.includes('manage_plans')
}

export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, schoolId } = ctx

  const [{ data: events }, { data: school }] = await Promise.all([
    admin.from('school_calendar')
      .select('id, title, kind, enforcement, start_date, end_date, note')
      .eq('school_id', schoolId).order('start_date'),
    admin.from('schools').select('weekend_days').eq('id', schoolId).maybeSingle(),
  ])
  return NextResponse.json({ events: events || [], weekend: school?.weekend_days || [5, 6] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, me, schoolId } = ctx
  if (!(await canManage(admin, me.role, me.is_super_admin)))
    return NextResponse.json({ error: 'لا تملك صلاحية إدارة التقويم' }, { status: 403 })

  const b = await req.json().catch(() => ({}))
  const title = (b.title || '').toString().trim()
  if (!title) return NextResponse.json({ error: 'العنوان مطلوب' }, { status: 400 })
  if (!KINDS.includes(b.kind)) return NextResponse.json({ error: 'نوع غير صالح' }, { status: 400 })
  if (!ENFORCE.includes(b.enforcement)) return NextResponse.json({ error: 'مستوى إلزام غير صالح' }, { status: 400 })
  if (!b.start_date || !b.end_date) return NextResponse.json({ error: 'التواريخ مطلوبة' }, { status: 400 })
  if (b.end_date < b.start_date) return NextResponse.json({ error: 'تاريخ الانتهاء قبل البدء' }, { status: 400 })

  const { error } = await admin.from('school_calendar').insert({
    school_id: schoolId, title, kind: b.kind, enforcement: b.enforcement,
    start_date: b.start_date, end_date: b.end_date, note: b.note?.toString().trim() || null,
    created_by: auth.user.id,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await recordAudit({ req, userId: auth.user.id, schoolId, action: 'insert', table: 'school_calendar', after: { title, kind: b.kind, start_date: b.start_date, end_date: b.end_date } })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, me, schoolId } = ctx
  if (!(await canManage(admin, me.role, me.is_super_admin)))
    return NextResponse.json({ error: 'لا تملك صلاحية إدارة التقويم' }, { status: 403 })

  const b = await req.json().catch(() => ({}))
  const days = Array.isArray(b.weekend) ? b.weekend.map((n: any) => parseInt(n, 10)).filter((n: number) => n >= 0 && n <= 6) : null
  if (!days) return NextResponse.json({ error: 'أيام غير صالحة' }, { status: 400 })
  const { error } = await admin.from('schools').update({ weekend_days: days }).eq('id', schoolId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await recordAudit({ req, userId: auth.user.id, schoolId, action: 'update', table: 'schools', recordId: schoolId, after: { weekend_days: days } })
  return NextResponse.json({ ok: true })
}

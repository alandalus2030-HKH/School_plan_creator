import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * إدارة "الدخول كمدرسة" (Impersonation) — مشرف النظام فقط
 * POST   { school_id }  → دخول كمدرسة (يضبط active_school_id + تسجيل)
 * DELETE                → خروج (يمسح active_school_id + تسجيل)
 */

async function getSuperAdmin(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles').select('is_super_admin, school_id, name_ar').eq('id', userId).single()
  return me?.is_super_admin ? { admin, me } : null
}

/* ════ دخول كمدرسة ════ */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const sa = await getSuperAdmin(auth.user.id)
  if (!sa) return NextResponse.json({ error: 'متاح لمشرف النظام فقط' }, { status: 403 })

  const { school_id } = await req.json()
  if (!school_id) return NextResponse.json({ error: 'معرّف المدرسة مطلوب' }, { status: 400 })

  /* تأكيد وجود المدرسة */
  const { data: school } = await sa.admin
    .from('schools').select('id, name_ar').eq('id', school_id).single()
  if (!school) return NextResponse.json({ error: 'المدرسة غير موجودة' }, { status: 404 })

  /* ضبط المدرسة المُتقمَّصة */
  await sa.admin.from('profiles').update({ active_school_id: school_id }).eq('id', auth.user.id)

  /* تسجيل الوصول في audit_logs (مساءلة) */
  await sa.admin.from('audit_logs').insert({
    school_id,
    user_id:    auth.user.id,
    action:     'impersonate_enter',
    table_name: 'schools',
    record_id:  school_id,
    new_values: { _summary: `دخل كمدرسة "${school.name_ar}"`, school_name: school.name_ar },
  })

  return NextResponse.json({ ok: true, school_name: school.name_ar })
}

/* ════ خروج من التقمّص ════ */
export async function DELETE() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const sa = await getSuperAdmin(auth.user.id)
  if (!sa) return NextResponse.json({ error: 'متاح لمشرف النظام فقط' }, { status: 403 })

  /* اقرأ المدرسة الحالية للتسجيل */
  const { data: prof } = await sa.admin
    .from('profiles').select('active_school_id').eq('id', auth.user.id).single()

  if (prof?.active_school_id) {
    const { data: school } = await sa.admin
      .from('schools').select('name_ar').eq('id', prof.active_school_id).single()
    await sa.admin.from('audit_logs').insert({
      school_id:  prof.active_school_id,
      user_id:    auth.user.id,
      action:     'impersonate_exit',
      table_name: 'schools',
      record_id:  prof.active_school_id,
      new_values: { _summary: `خرج من مدرسة "${school?.name_ar || ''}"`, school_name: school?.name_ar },
    })
  }

  await sa.admin.from('profiles').update({ active_school_id: null }).eq('id', auth.user.id)

  return NextResponse.json({ ok: true })
}

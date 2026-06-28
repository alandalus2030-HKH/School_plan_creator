import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAudit } from '@/lib/audit'

/** التحقق من أن المُستدعي مشرف نظام */
async function ensureSuperAdmin(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles').select('is_super_admin').eq('id', userId).single()
  return me?.is_super_admin === true ? admin : null
}

/* ════ PATCH: تعديل بيانات المدرسة ════ */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ schoolId: string }> }
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const admin = await ensureSuperAdmin(auth.user.id)
  if (!admin) return NextResponse.json({ error: 'متاح لمشرف النظام فقط' }, { status: 403 })

  const { schoolId } = await context.params
  const body = await req.json()
  const { name_ar, name_en, is_active } = body

  /* بناء التحديث ديناميكياً (تعديل بيانات أو تبديل الحالة) */
  const updates: Record<string, any> = {}
  if (name_ar !== undefined) {
    if (!name_ar?.trim()) return NextResponse.json({ error: 'اسم المدرسة مطلوب' }, { status: 400 })
    updates.name_ar = name_ar.trim()
    updates.name_en = name_en?.trim() || null
  }
  if (is_active !== undefined) {
    updates.is_active = !!is_active
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'لا توجد تغييرات' }, { status: 400 })
  }

  const { error } = await admin.from('schools').update(updates).eq('id', schoolId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await recordAudit({ req, userId: auth.user.id, schoolId, action: 'update', table: 'schools', recordId: schoolId, after: updates })
  return NextResponse.json({ ok: true })
}

/* ════ DELETE: حذف المدرسة ════ */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ schoolId: string }> }
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const admin = await ensureSuperAdmin(auth.user.id)
  if (!admin) return NextResponse.json({ error: 'متاح لمشرف النظام فقط' }, { status: 403 })

  const { schoolId } = await context.params

  /* ── حماية: لا تحذف مدرسة فيها مستخدمون أو خطط ── */
  const [{ count: userCount }, { count: planCount }] = await Promise.all([
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    admin.from('plans').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).is('deleted_at', null),
  ])

  if ((userCount ?? 0) > 0 || (planCount ?? 0) > 0) {
    return NextResponse.json({
      error: `لا يمكن حذف المدرسة — تحتوي على ${userCount ?? 0} مستخدم و${planCount ?? 0} خطة. `
           + `ادخل إليها كمدرسة («الدخول كمدرسة») واحذف مستخدميها وخططها أولاً، ثم أعد المحاولة.`,
    }, { status: 409 })
  }

  /* ── منع حذف آخر مدرسة في النظام ── */
  const { count: totalSchools } = await admin
    .from('schools').select('id', { count: 'exact', head: true })
  if ((totalSchools ?? 0) <= 1) {
    return NextResponse.json({ error: 'لا يمكن حذف المدرسة الوحيدة في النظام' }, { status: 400 })
  }

  const { data: sch } = await admin.from('schools').select('name_ar').eq('id', schoolId).maybeSingle()

  const { error } = await admin.from('schools').delete().eq('id', schoolId)
  if (error) {
    /* قيد مفتاح أجنبي غير مُغطّى → رسالة واضحة بدل رسالة Postgres الخام */
    if (error.code === '23503' || /foreign key|violates|constraint/i.test(error.message)) {
      return NextResponse.json({
        error: 'تعذّر حذف المدرسة لارتباطها ببيانات أخرى. احذف مستخدميها وخططها أولاً ثم أعد المحاولة.',
      }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  /* school_id=null لأن المدرسة حُذفت (تفادي قيد FK على audit_logs) */
  await recordAudit({ req, userId: auth.user.id, schoolId: null, action: 'delete', table: 'schools', recordId: schoolId, before: { name_ar: (sch as any)?.name_ar ?? null } })
  return NextResponse.json({ ok: true })
}

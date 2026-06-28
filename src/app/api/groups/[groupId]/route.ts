import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAudit } from '@/lib/audit'

async function ensureSuperAdmin(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles').select('is_super_admin').eq('id', userId).single()
  return me?.is_super_admin === true ? admin : null
}

/* ════ PATCH: تعديل المجموعة / إسناد مدارس / تعيين مالك ════ */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ groupId: string }> }
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const admin = await ensureSuperAdmin(auth.user.id)
  if (!admin) return NextResponse.json({ error: 'متاح لمشرف النظام فقط' }, { status: 403 })

  const { groupId } = await context.params
  const body = await req.json()
  const { name_ar, name_en, is_active, school_ids, owner_id } = body

  /* تعديل بيانات المجموعة */
  const updates: Record<string, any> = {}
  if (name_ar !== undefined) {
    if (!name_ar?.trim()) return NextResponse.json({ error: 'اسم المجموعة مطلوب' }, { status: 400 })
    updates.name_ar = name_ar.trim()
    updates.name_en = name_en?.trim() || null
  }
  if (is_active !== undefined) updates.is_active = !!is_active
  if (Object.keys(updates).length > 0) {
    const { error } = await admin.from('school_groups').update(updates).eq('id', groupId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  /* إسناد مدارس للمجموعة (استبدال كامل لقائمة مدارس المجموعة) */
  if (Array.isArray(school_ids)) {
    /* أزل المدارس التي لم تعد في القائمة */
    await admin.from('schools').update({ group_id: null })
      .eq('group_id', groupId)
    /* أضف المدارس المختارة */
    if (school_ids.length > 0) {
      await admin.from('schools').update({ group_id: groupId })
        .in('id', school_ids)
    }
  }

  /* تعيين مالك المجموعة */
  if (owner_id !== undefined) {
    /* أزل ملكية المالك السابق لهذه المجموعة */
    await admin.from('profiles')
      .update({ is_group_owner: false, owned_group_id: null })
      .eq('owned_group_id', groupId)
    /* عيّن المالك الجديد */
    if (owner_id) {
      await admin.from('profiles')
        .update({ is_group_owner: true, owned_group_id: groupId })
        .eq('id', owner_id)
    }
  }

  await recordAudit({ req, userId: auth.user.id, schoolId: null, action: 'update', table: 'school_groups', recordId: groupId, after: { ...updates, ...(Array.isArray(school_ids) ? { school_ids } : {}), ...(owner_id !== undefined ? { owner_id } : {}) } })
  return NextResponse.json({ ok: true })
}

/* ════ DELETE: حذف المجموعة (تبقى المدارس مستقلة) ════ */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ groupId: string }> }
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const admin = await ensureSuperAdmin(auth.user.id)
  if (!admin) return NextResponse.json({ error: 'متاح لمشرف النظام فقط' }, { status: 403 })

  const { groupId } = await context.params

  /* فك ارتباط المدارس والمالك (لا تُحذف المدارس) */
  await admin.from('schools').update({ group_id: null }).eq('group_id', groupId)
  await admin.from('profiles')
    .update({ is_group_owner: false, owned_group_id: null })
    .eq('owned_group_id', groupId)

  const { error } = await admin.from('school_groups').delete().eq('id', groupId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await recordAudit({ req, userId: auth.user.id, schoolId: null, action: 'delete', table: 'school_groups', recordId: groupId })
  return NextResponse.json({ ok: true })
}

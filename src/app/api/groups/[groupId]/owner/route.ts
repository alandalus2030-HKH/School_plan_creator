import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAudit } from '@/lib/audit'

/**
 * POST /api/groups/[groupId]/owner
 * إنشاء حساب مالك مجموعة مخصص وربطه بالمجموعة
 * متاح لمشرف النظام فقط
 *
 * المالك حساب منصة مستقل (بلا مدرسة) — يرى أرقام مجموعته فقط
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ groupId: string }> }
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles').select('is_super_admin').eq('id', auth.user.id).single()
  if (!me?.is_super_admin) {
    return NextResponse.json({ error: 'متاح لمشرف النظام فقط' }, { status: 403 })
  }

  const { groupId } = await context.params

  try {
    const { name, email, username, password } = await req.json()
    if (!email?.trim())    return NextResponse.json({ error: 'البريد الإلكتروني مطلوب' }, { status: 400 })
    if (!username?.trim()) return NextResponse.json({ error: 'اسم الدخول مطلوب' }, { status: 400 })

    const uname    = username.toString().trim().toLowerCase()
    const fullName = name?.trim() || email

    /* تحقق من المجموعة */
    const { data: group } = await admin
      .from('school_groups').select('id, name_ar').eq('id', groupId).single()
    if (!group) return NextResponse.json({ error: 'المجموعة غير موجودة' }, { status: 404 })

    /* تحقق من عدم تكرار اسم الدخول */
    const { data: existing } = await admin
      .from('profiles').select('id').ilike('username', uname).maybeSingle()
    if (existing) {
      return NextResponse.json({ error: `اسم الدخول "${uname}" مستخدم بالفعل` }, { status: 400 })
    }

    /* إنشاء حساب Auth */
    const pass = (password && password.length >= 8)
      ? password : crypto.randomUUID() + crypto.randomUUID()

    const { data: created, error: authErr } = await admin.auth.admin.createUser({
      email:         email.trim(),
      email_confirm: true,
      password:      pass,
      user_metadata: { name_ar: fullName, username: uname },
    })

    let userId = created?.user?.id ?? null
    if (authErr) {
      const msg = authErr.message.toLowerCase()
      if (msg.includes('already') || msg.includes('exists') || msg.includes('registered')) {
        const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
        userId = list?.users?.find(u => u.email?.toLowerCase() === email.trim().toLowerCase())?.id ?? null
      } else {
        return NextResponse.json({ error: authErr.message }, { status: 400 })
      }
    }
    if (!userId) return NextResponse.json({ error: 'فشل إنشاء الحساب' }, { status: 500 })

    /* أزل أي مالك سابق لهذه المجموعة */
    await admin.from('profiles')
      .update({ is_group_owner: false, owned_group_id: null })
      .eq('owned_group_id', groupId)

    /* إنشاء/تحديث ملف المالك — حساب منصة بلا مدرسة */
    await admin.from('profiles').upsert({
      id:             userId,
      email:          email.trim(),
      username:       uname,
      name_ar:        fullName,
      full_name_ar:   fullName,
      role:           'group_owner',
      is_active:      true,
      is_group_owner: true,
      owned_group_id: groupId,
      school_id:      null,           // مالك المجموعة لا ينتمي لمدرسة
    }, { onConflict: 'id' })

    await recordAudit({ req, userId: auth.user.id, schoolId: null, action: 'group_owner_set', table: 'profiles', recordId: userId, after: { group: group.name_ar, username: uname } })

    return NextResponse.json({
      ok: true,
      message: `تم إنشاء حساب مالك "${group.name_ar}" بنجاح`,
    })
  } catch (e: any) {
    console.error('[groups/owner]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

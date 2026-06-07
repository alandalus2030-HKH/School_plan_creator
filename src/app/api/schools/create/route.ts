import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/schools/create
 * إنشاء مدرسة جديدة + حساب مديرها الأول
 * متاح لمشرف النظام فقط (is_super_admin)
 */
export async function POST(req: NextRequest) {
  /* ── التحقق من الجلسة ── */
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { user } = auth

  const admin = createAdminClient()

  /* ── التحقق من أن المُستدعي مشرف نظام ── */
  const { data: me } = await admin
    .from('profiles').select('is_super_admin').eq('id', user.id).single()
  if (!me?.is_super_admin) {
    return NextResponse.json({ error: 'هذه العملية متاحة لمشرف النظام فقط' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const {
      school_name_ar,
      school_name_en,
      admin_email,
      admin_name,
      admin_username,
      admin_password,
    } = body

    if (!school_name_ar?.trim()) return NextResponse.json({ error: 'اسم المدرسة مطلوب' }, { status: 400 })
    if (!admin_email?.trim())    return NextResponse.json({ error: 'بريد المدير مطلوب' }, { status: 400 })
    if (!admin_username?.trim()) return NextResponse.json({ error: 'اسم دخول المدير مطلوب' }, { status: 400 })

    const uname = admin_username.toString().trim().toLowerCase()

    /* ── التحقق من عدم تكرار اسم الدخول ── */
    const { data: existingUser } = await admin
      .from('profiles').select('id').ilike('username', uname).maybeSingle()
    if (existingUser) {
      return NextResponse.json({ error: `اسم الدخول "${uname}" مستخدم بالفعل` }, { status: 400 })
    }

    /* ── 1) إنشاء المدرسة ── */
    const { data: school, error: schoolErr } = await admin
      .from('schools')
      .insert({
        name_ar: school_name_ar.trim(),
        name_en: school_name_en?.trim() || null,
      })
      .select('id, name_ar')
      .single()

    if (schoolErr || !school) {
      return NextResponse.json({ error: schoolErr?.message || 'فشل إنشاء المدرسة' }, { status: 500 })
    }

    /* ── 2) إنشاء حساب المدير في Auth ── */
    const password = (admin_password && admin_password.length >= 8)
      ? admin_password
      : crypto.randomUUID() + crypto.randomUUID()

    const fullName = admin_name?.trim() || admin_email

    const { data: created, error: authErr } = await admin.auth.admin.createUser({
      email:         admin_email.trim(),
      email_confirm: true,
      password,
      user_metadata: { name_ar: fullName, username: uname },
    })

    let userId = created?.user?.id ?? null

    /* المستخدم موجود مسبقاً → استخدمه */
    if (authErr) {
      const msg = authErr.message.toLowerCase()
      if (msg.includes('already') || msg.includes('exists') || msg.includes('registered')) {
        const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
        const found = list?.users?.find(u => u.email?.toLowerCase() === admin_email.trim().toLowerCase())
        userId = found?.id ?? null
      } else {
        /* تراجع: احذف المدرسة المُنشأة */
        await admin.from('schools').delete().eq('id', school.id)
        return NextResponse.json({ error: authErr.message }, { status: 400 })
      }
    }

    if (!userId) {
      await admin.from('schools').delete().eq('id', school.id)
      return NextResponse.json({ error: 'فشل إنشاء حساب المدير' }, { status: 500 })
    }

    /* ── 3) إنشاء ملف المدير مربوطاً بالمدرسة الجديدة ── */
    const { error: profileErr } = await admin
      .from('profiles')
      .upsert({
        id:            userId,
        school_id:     school.id,
        email:         admin_email.trim(),
        username:      uname,
        name_ar:       fullName,
        full_name_ar:  fullName,
        role:          'school_admin',   // يمنحه 'all' عبر PermissionsContext
        is_active:     true,
        is_super_admin: false,
      }, { onConflict: 'id' })

    if (profileErr) {
      console.error('[schools/create] profile', profileErr)
    }

    return NextResponse.json({
      ok:        true,
      school_id: school.id,
      admin_id:  userId,
      message:   `تم إنشاء مدرسة "${school.name_ar}" ومديرها بنجاح`,
    })
  } catch (e: any) {
    console.error('[schools/create]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

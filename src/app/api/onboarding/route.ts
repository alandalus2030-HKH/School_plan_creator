import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/onboarding  (multipart/form-data)
 * معالج إعداد مدرسة جديدة دفعة واحدة — لمشرف النظام فقط:
 *   1) إنشاء المدرسة + بياناتها (اتصال/شعار)
 *   2) إنشاء حساب المدير الأول
 *   3) (اختياري) إنشاء خطة أولى
 *
 * يستخدم createAdminClient (service role) ويستهدف المدرسة الجديدة صراحةً،
 * فلا يتأثّر بسياق مدرسة المُستدعي.
 */

const LOGO_BUCKET = 'school-logos'
const MAX_LOGO = 2 * 1024 * 1024
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp']
const LEVEL_PRESETS: Record<number, string[]> = {
  2: ['المحور', 'المبادرة'],
  3: ['المحور', 'المبادرة', 'الهدف'],
  4: ['المحور', 'الهدف الاستراتيجي', 'الهدف العام', 'الهدف الفرعي'],
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { user } = auth

  const admin = createAdminClient()

  /* مشرف نظام فقط */
  const { data: me } = await admin
    .from('profiles').select('is_super_admin').eq('id', user.id).single()
  if (!me?.is_super_admin) {
    return NextResponse.json({ error: 'هذه العملية متاحة لمشرف النظام فقط' }, { status: 403 })
  }

  let createdSchoolId: string | null = null
  try {
    const form = await req.formData()
    const get = (k: string) => (form.get(k)?.toString() || '').trim()

    const school_name_ar = get('school_name_ar')
    const school_name_en = get('school_name_en')
    const admin_email    = get('admin_email')
    const admin_username = get('admin_username').toLowerCase()
    const admin_name     = get('admin_name')
    const admin_password = get('admin_password')
    const plan_name      = get('plan_name')
    const plan_year      = get('plan_year')
    const plan_levels    = parseInt(get('plan_levels') || '3', 10)
    const logo           = form.get('logo')

    /* تحقّق أساسي */
    if (!school_name_ar) return NextResponse.json({ error: 'اسم المدرسة مطلوب' }, { status: 400 })
    if (!admin_email)    return NextResponse.json({ error: 'بريد المدير مطلوب' }, { status: 400 })
    if (!admin_username) return NextResponse.json({ error: 'اسم دخول المدير مطلوب' }, { status: 400 })

    /* عدم تكرار اسم الدخول */
    const { data: existingUser } = await admin
      .from('profiles').select('id').ilike('username', admin_username).maybeSingle()
    if (existingUser) {
      return NextResponse.json({ error: `اسم الدخول "${admin_username}" مستخدم بالفعل` }, { status: 400 })
    }

    /* ── 1) إنشاء المدرسة + بيانات الاتصال ── */
    const { data: school, error: schoolErr } = await admin
      .from('schools')
      .insert({
        name_ar:         school_name_ar,
        name_en:         school_name_en || null,
        address:         get('address') || null,
        phone:           get('phone') || null,
        email:           get('email') || null,
        principal_name:  get('principal_name') || null,
        ministry_number: get('ministry_number') || null,
      })
      .select('id, name_ar')
      .single()
    if (schoolErr || !school) {
      return NextResponse.json({ error: schoolErr?.message || 'فشل إنشاء المدرسة' }, { status: 500 })
    }
    createdSchoolId = school.id

    /* ── 2) رفع الشعار (اختياري) ── */
    if (logo instanceof File && logo.size > 0) {
      if (logo.size > MAX_LOGO) {
        await admin.from('schools').delete().eq('id', school.id)
        return NextResponse.json({ error: 'حجم الشعار يتجاوز 2MB' }, { status: 400 })
      }
      if (!LOGO_TYPES.includes(logo.type)) {
        await admin.from('schools').delete().eq('id', school.id)
        return NextResponse.json({ error: 'صيغة الشعار غير مدعومة' }, { status: 400 })
      }
      const ext  = (logo.name.split('.').pop() || 'png').toLowerCase()
      const path = `${school.id}/logo_${Date.now()}.${ext}`
      const buffer = Buffer.from(await logo.arrayBuffer())
      const { error: upErr } = await admin.storage
        .from(LOGO_BUCKET).upload(path, buffer, { upsert: true, contentType: logo.type })
      if (!upErr) {
        const { data: pub } = admin.storage.from(LOGO_BUCKET).getPublicUrl(path)
        if (pub?.publicUrl) await admin.from('schools').update({ logo_url: pub.publicUrl }).eq('id', school.id)
      }
    }

    /* ── 3) إنشاء حساب المدير ── */
    const password = (admin_password && admin_password.length >= 8)
      ? admin_password
      : crypto.randomUUID() + crypto.randomUUID()
    const fullName = admin_name || admin_email

    const { data: created, error: authErr } = await admin.auth.admin.createUser({
      email:         admin_email,
      email_confirm: true,
      password,
      user_metadata: { name_ar: fullName, username: admin_username },
    })
    let userId = created?.user?.id ?? null

    if (authErr) {
      const msg = authErr.message.toLowerCase()
      if (msg.includes('already') || msg.includes('exists') || msg.includes('registered')) {
        const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
        userId = list?.users?.find(u => u.email?.toLowerCase() === admin_email.toLowerCase())?.id ?? null
      } else {
        await admin.from('schools').delete().eq('id', school.id)
        return NextResponse.json({ error: authErr.message }, { status: 400 })
      }
    }
    if (!userId) {
      await admin.from('schools').delete().eq('id', school.id)
      return NextResponse.json({ error: 'فشل إنشاء حساب المدير' }, { status: 500 })
    }

    const { error: profileErr } = await admin.from('profiles').upsert({
      id:             userId,
      school_id:      school.id,
      email:          admin_email,
      username:       admin_username,
      name_ar:        fullName,
      full_name_ar:   fullName,
      role:           'school_admin',
      is_active:      true,
      is_super_admin: false,
    }, { onConflict: 'id' })
    if (profileErr) console.error('[onboarding] profile', profileErr)

    /* ── 4) خطة أولى (اختياري) ── */
    let planId: string | null = null
    if (plan_name) {
      const lc = [2, 3, 4].includes(plan_levels) ? plan_levels : 3
      const { data: plan } = await admin
        .from('plans')
        .insert({
          school_id:     school.id,
          name_ar:       plan_name,
          academic_year: plan_year || '2025-2026',
          level_count:   lc,
          level_names:   LEVEL_PRESETS[lc],
          kpi_levels:    [],
        })
        .select('id').single()
      planId = plan?.id ?? null
    }

    return NextResponse.json({
      ok: true,
      school_id: school.id,
      admin_id:  userId,
      plan_id:   planId,
      message:   `تم إعداد مدرسة "${school.name_ar}" بنجاح`,
    })
  } catch (e: any) {
    console.error('[onboarding]', e)
    if (createdSchoolId) {
      try { await createAdminClient().from('schools').delete().eq('id', createdSchoolId) } catch {}
    }
    return NextResponse.json({ error: e.message || 'حدث خطأ غير متوقع' }, { status: 500 })
  }
}

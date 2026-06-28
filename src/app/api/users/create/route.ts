import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAudit } from '@/lib/audit'

const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']

export async function POST(req: NextRequest) {
  /* ── التحقق من هوية المُستدعي أولاً ── */
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const admin = createAdminClient()

  /* ── سياق المُستدعي: المدرسة الفعّالة (تحترم تقمّص مشرف النظام) ── */
  const { data: me } = await admin
    .from('profiles')
    .select('school_id, active_school_id, is_super_admin, role')
    .eq('id', auth.user.id)
    .single()
  if (!me) return NextResponse.json({ error: 'تعذّر تحديد ملف المُستدعي' }, { status: 400 })

  /* ── حارس خادمي: صلاحية manage_users ── */
  const { data: roleData } = await admin.from('roles').select('permissions').eq('code', me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleData?.permissions) ? roleData!.permissions : []
  const canManageUsers = perms.includes('all') || perms.includes('manage_users')
    || ADMIN_ROLES.includes(me.role) || me.is_super_admin
  if (!canManageUsers) {
    return NextResponse.json({ error: 'لا تملك صلاحية إدارة المستخدمين' }, { status: 403 })
  }

  const effectiveSchoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  if (!effectiveSchoolId) {
    return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة بحسابك — لا يمكن إنشاء مستخدم' }, { status: 400 })
  }

  try {
    const body = await req.json()

    /* ── whitelist صريحة — لا يدخل أي حقل خارج هذه القائمة للـ profile ── */
    const {
      email,
      first_name_ar,
      last_name_ar,
      password,
      username,
      /* الحقول المسموح بها فقط */
      nationality   = null,
      school        = null,
      department    = null,
      job_title     = null,
      phone         = null,
      role          = null,
      is_active     = true,
      education_level = null,
      marital_status  = null,
      notif_enabled   = true,
      notif_email     = true,
    } = body

    if (!email) return NextResponse.json({ error: 'البريد الإلكتروني مطلوب' }, { status: 400 })
    if (!username) return NextResponse.json({ error: 'اسم الدخول مطلوب' }, { status: 400 })

    const uname      = username.toString().trim().toLowerCase()
    const fullNameAr = [first_name_ar, last_name_ar].filter(Boolean).join(' ') || email

    /* ── التحقق من أن اسم الدخول غير مستخدم ── */
    const { data: existingUsername } = await admin
      .from('profiles')
      .select('id')
      .ilike('username', uname)
      .maybeSingle()

    if (existingUsername) {
      return NextResponse.json({ error: `اسم الدخول "${uname}" مستخدم بالفعل` }, { status: 400 })
    }

    /* ── منع تكرار البريد: البريد هو هوية تسجيل الدخول (حساب مصادقة واحد لكل بريد) ──
       تكراره عبر حسابين يسبّب تصادم تسجيل الدخول (الدخول يصل للحساب الخطأ). */
    const emailNorm = email.toString().trim().toLowerCase()
    const { data: existingEmail } = await admin
      .from('profiles')
      .select('id, name_ar')
      .ilike('email', emailNorm)
      .maybeSingle()
    if (existingEmail) {
      return NextResponse.json({
        error: `البريد "${email}" مستخدم بالفعل لحساب آخر${existingEmail.name_ar ? ` (${existingEmail.name_ar})` : ''} — استخدم بريداً فريداً لكل مستخدم.`,
      }, { status: 400 })
    }

    /* ── إنشاء مستخدم في Supabase Auth ── */
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password: (password && password.length >= 8) ? password : crypto.randomUUID() + crypto.randomUUID(),
      user_metadata: { name_ar: fullNameAr, username: uname },
    })

    let userId: string | null = null

    if (error) {
      /* البريد موجود في حساب مصادقة آخر (حتى لو بلا ملف) → ارفض بوضوح بدل إعادة الاستخدام
         (إعادة الاستخدام تربط الملف الجديد بحساب موجود فيحدث تصادم تسجيل الدخول). */
      const errMsg = error.message.toLowerCase()
      if (errMsg.includes('already') || errMsg.includes('exists') || errMsg.includes('registered') || errMsg.includes('duplicate')) {
        return NextResponse.json({
          error: `البريد "${email}" مرتبط بحساب مصادقة موجود مسبقاً — استخدم بريداً فريداً لكل مستخدم.`,
        }, { status: 400 })
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    userId = data.user?.id ?? null

    if (!userId) return NextResponse.json({ error: 'فشل إنشاء المستخدم' }, { status: 500 })

    /* ── المستخدم الجديد ينتمي للمدرسة الفعّالة للمُنشئ ──
       تحترم تقمّص مشرف النظام (active_school_id) وتضمن العزل المدرسي */
    const autoSchoolId = effectiveSchoolId

    /* كلمة مرور مؤقتة ضبطها المدير → يُلزَم المستخدم بتغييرها أول دخول.
       (نموذج الدعوة بالرابط: بلا كلمة مرور → يضبطها المستخدم بنفسه → لا إلزام) */
    const mustChange = !!(password && password.length >= 8)

    /* ── upsert الملف الشخصي (حقول مُعتمدة فقط) ── */
    const allowedProfileData = {
      id:              userId,
      email,
      name_ar:         fullNameAr,
      full_name_ar:    fullNameAr,
      first_name_ar:   first_name_ar   || null,
      last_name_ar:    last_name_ar    || null,
      username:        uname,
      school_id:       autoSchoolId,
      nationality,
      school,
      department,
      job_title,
      phone,
      role,
      is_active,
      education_level,
      marital_status,
      notif_enabled,
      notif_email,
      must_change_password: mustChange,
    }

    const { error: upsertErr } = await admin
      .from('profiles')
      .upsert(allowedProfileData, { onConflict: 'id' })

    if (upsertErr) {
      console.error('[create-user] upsert error:', upsertErr)
    }

    /* ── UPDATE مضمون لاسم الدخول (يتجاوز أي trigger يُعيد الضبط) ── */
    const { error: updateErr } = await admin
      .from('profiles')
      .update({
        username:        uname,
        name_ar:         fullNameAr,
        full_name_ar:    fullNameAr,
        first_name_ar:   first_name_ar   || null,
        last_name_ar:    last_name_ar    || null,
        email,
        school_id:       autoSchoolId,
        nationality,
        school,
        department,
        job_title,
        phone,
        role,
        is_active,
        education_level,
        marital_status,
        notif_enabled,
        notif_email,
      })
      .eq('id', userId)

    if (updateErr) {
      console.error('[create-user] update error:', updateErr)
    }

    await recordAudit({
      req, userId: auth.user.id, schoolId: effectiveSchoolId,
      action: 'user_created', table: 'profiles', recordId: userId,
      after: { email, username: uname, role, name_ar: fullNameAr },
    })

    return NextResponse.json({ ok: true, id: userId })
  } catch (e: any) {
    console.error('[create-user] exception:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

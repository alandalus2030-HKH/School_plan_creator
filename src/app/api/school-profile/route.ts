import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * بيانات المدرسة — جلب وحفظ
 * GET   → بيانات مدرسة المستخدم
 * PATCH → تحديث (لمن لديه manage_settings)
 *
 * يعمل ضمن سياق مدرسة المستخدم (يحترم التقمّص active_school_id)
 */

async function getContext(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles')
    .select('school_id, active_school_id, is_super_admin, role')
    .eq('id', userId).single()
  if (!me) return null
  /* المدرسة الفعّالة = المُتقمَّصة (للمشرف) أو مدرسة المستخدم */
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  return { admin, me, schoolId }
}

const ALLOWED = [
  'name_ar', 'name_en', 'logo_url', 'vision_ar', 'mission_ar',
  'address', 'phone', 'email', 'principal_name', 'ministry_number',
  'report_header', 'report_footer',
] as const

const LOGO_BUCKET = 'school-logos'
const MAX_LOGO = 2 * 1024 * 1024
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp']

/* التحقق من صلاحية إدارة بيانات المدرسة */
async function canManage(ctx: NonNullable<Awaited<ReturnType<typeof getContext>>>) {
  const { data: roleData } = await ctx.admin
    .from('roles').select('permissions').eq('code', ctx.me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleData?.permissions) ? roleData!.permissions : []
  const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']
  return perms.includes('all') || perms.includes('manage_settings')
    || ADMIN_ROLES.includes(ctx.me.role) || ctx.me.is_super_admin
}

/* ════ GET ════ */
export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })

  const { data } = await ctx.admin
    .from('schools')
    .select('id, ' + ALLOWED.join(', '))
    .eq('id', ctx.schoolId).single()

  return NextResponse.json({ school: data })
}

/* ════ PATCH ════ */
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })

  if (!(await canManage(ctx))) {
    return NextResponse.json({ error: 'لا تملك صلاحية تعديل بيانات المدرسة' }, { status: 403 })
  }

  const body = await req.json()
  const updates: Record<string, any> = {}
  for (const key of ALLOWED) {
    if (body[key] !== undefined) updates[key] = body[key]?.toString().trim() || null
  }
  if (body.name_ar !== undefined && !body.name_ar?.trim()) {
    return NextResponse.json({ error: 'اسم المدرسة مطلوب' }, { status: 400 })
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'لا توجد تغييرات' }, { status: 400 })
  }

  const { error } = await ctx.admin.from('schools').update(updates).eq('id', ctx.schoolId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/* ════ POST — رفع الشعار (عبر service role، يتجاوز RLS بأمان) ════ */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  if (!(await canManage(ctx))) {
    return NextResponse.json({ error: 'لا تملك صلاحية تعديل بيانات المدرسة' }, { status: 403 })
  }

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'لم يتم إرسال ملف' }, { status: 400 })
  }
  if (file.size > MAX_LOGO) {
    return NextResponse.json({ error: 'حجم الصورة يتجاوز 2MB' }, { status: 400 })
  }
  if (!LOGO_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'صيغة غير مدعومة (PNG/JPG/SVG/WEBP)' }, { status: 400 })
  }

  const ext  = (file.name.split('.').pop() || 'png').toLowerCase()
  const path = `${ctx.schoolId}/logo_${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: upErr } = await ctx.admin.storage
    .from(LOGO_BUCKET)
    .upload(path, buffer, { upsert: true, contentType: file.type })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: pub } = ctx.admin.storage.from(LOGO_BUCKET).getPublicUrl(path)
  return NextResponse.json({ url: pub?.publicUrl || '' })
}

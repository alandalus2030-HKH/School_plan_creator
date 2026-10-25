import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAudit } from '@/lib/audit'
import { MAX_PLAN_LEVELS } from '@/lib/planLevels'

/**
 * قوالب الخطط (الوثيقة 4.1).
 *
 * GET    → قوالب المدرسة (القراءة لمن ينشئ خطة)
 * POST   → قالبٌ جديد
 * PATCH  → تعديل · أو إيقاف/استئناف
 * DELETE → حذفٌ ناعم
 *
 * ── والقالب لا يُقرأ بعد ميلاد الخطة ──
 * «يُنسَخ عند الإنشاء» — فتعديلُ قالبٍ هنا **لا يمسّ خطّةً قائمة**،
 * ولا تتبدّل مسمّياتُ خطّةٍ قيد البناء تحت صاحبها. ولهذا لا حارسَ
 * يمنع تعديل قالبٍ وُلدت منه خطط.
 *
 * ── وسياسة العمق ثابتةٌ وحدها ──
 * «سقفٌ لا قفل… **والعمق المتغيّر مؤجَّلٌ لا منقوض**» (4.1) — فالقيد
 * في القاعدة يردّ ما سواه، ولا تُعرض هنا خيارات.
 */

const POLICIES = ['required', 'optional', 'none']

async function ctxOf(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles')
    .select('id, school_id, active_school_id, is_super_admin, role')
    .eq('id', userId).single()
  if (!me) return null
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  const { data: roleRow } = await admin.from('roles').select('permissions').eq('code', me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleRow?.permissions) ? roleRow!.permissions : []
  const can = (p: string) => me.is_super_admin || perms.includes('all') || perms.includes(p)
  return { admin, me, schoolId, can }
}

/** تنقيةُ ما يصل من الشاشة — والقيود في القاعدة هي الحكم الأخير. */
function shape(b: any) {
  const names = (Array.isArray(b.levelNames) ? b.levelNames : [])
    .map((n: any) => String(n || '').trim()).filter(Boolean)
  const fwRaw = Array.isArray(b.frameworkLevels) ? b.frameworkLevels : []
  const fw = names.map((_: string, i: number) => {
    const v = Number(fwRaw[i] ?? 0)
    return v >= 1 && v <= 4 ? v : 0
  })
  const policy = POLICIES.includes(String(b.anchorPolicy)) ? String(b.anchorPolicy) : 'optional'
  let level = Number(b.anchorLevel) || null
  if (policy === 'none') level = null
  else if (!level || level < 1 || level > names.length) level = names.length
  return {
    name_ar: String(b.nameAr || '').trim(),
    level_names: names,
    framework_levels: fw,
    anchor_policy: policy,
    anchor_level: level,
  }
}

function invalid(v: ReturnType<typeof shape>): string | null {
  if (!v.name_ar) return 'اسم القالب مطلوب'
  if (v.level_names.length < 2) return 'القالب مستويان على الأقلّ'
  if (v.level_names.length > MAX_PLAN_LEVELS)
    return `سقف العمق ${MAX_PLAN_LEVELS} مستويات — «سقفٌ لا قفل» (4.1)`
  return null
}

export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await ctxOf(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, schoolId, can } = ctx
  if (!can('view_plans') && !can('manage_plans') && !can('manage_settings')) {
    return NextResponse.json({ error: 'لا تملك صلاحية الخطط' }, { status: 403 })
  }

  const { data, error } = await admin.from('plan_templates')
    .select('id, code, name_ar, level_names, framework_levels, anchor_policy, anchor_level, is_active, sort_order')
    .eq('school_id', schoolId).is('deleted_at', null)
    .order('sort_order').order('name_ar')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    templates: data || [],
    canManage: can('manage_settings') || can('manage_plans'),
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await ctxOf(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, schoolId, can } = ctx
  if (!can('manage_settings') && !can('manage_plans'))
    return NextResponse.json({ error: 'تعريف القوالب لمن يُدير الإعدادات أو الخطط' }, { status: 403 })

  const v = shape(await req.json().catch(() => ({})))
  const bad = invalid(v)
  if (bad) return NextResponse.json({ error: bad }, { status: 400 })

  const { data, error } = await admin.from('plan_templates')
    .insert({ ...v, school_id: schoolId, created_by: auth.user.id })
    .select('id').single()
  if (error) {
    return NextResponse.json({
      error: error.code === '23505' ? 'لديك قالبٌ بهذا الاسم' : error.message,
    }, { status: 409 })
  }

  await recordAudit({
    req, userId: auth.user.id, schoolId,
    action: 'create', table: 'plan_templates', recordId: data.id, after: v,
  })
  return NextResponse.json({ id: data.id })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await ctxOf(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, schoolId, can } = ctx
  if (!can('manage_settings') && !can('manage_plans'))
    return NextResponse.json({ error: 'تعديل القوالب لمن يُدير الإعدادات أو الخطط' }, { status: 403 })

  const b = await req.json().catch(() => ({} as any))
  const id = String(b.id || '').trim()
  if (!id) return NextResponse.json({ error: 'القالب مطلوب' }, { status: 400 })

  /* الإيقاف والاستئناف وحدهما لا يلزمهما هيكلٌ كامل */
  const patch: any = {}
  if (typeof b.isActive === 'boolean') patch.is_active = b.isActive
  if (Array.isArray(b.levelNames)) {
    const v = shape(b)
    const bad = invalid(v)
    if (bad) return NextResponse.json({ error: bad }, { status: 400 })
    Object.assign(patch, v)
  }
  if (!Object.keys(patch).length)
    return NextResponse.json({ error: 'لا تغيير' }, { status: 400 })

  const { data, error } = await admin.from('plan_templates')
    .update(patch).eq('id', id).eq('school_id', schoolId).is('deleted_at', null)
    .select('id')
  if (error) {
    return NextResponse.json({
      error: error.code === '23505' ? 'لديك قالبٌ بهذا الاسم' : error.message,
    }, { status: 409 })
  }
  if (!data?.length) return NextResponse.json({ error: 'القالب غير موجود' }, { status: 404 })

  await recordAudit({
    req, userId: auth.user.id, schoolId,
    action: 'update', table: 'plan_templates', recordId: id, after: patch,
  })
  return NextResponse.json({ updated: true })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await ctxOf(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, schoolId, can } = ctx
  if (!can('manage_settings') && !can('manage_plans'))
    return NextResponse.json({ error: 'حذف القوالب لمن يُدير الإعدادات أو الخطط' }, { status: 403 })

  const b = await req.json().catch(() => ({} as any))
  const id = String(b.id || '').trim()
  if (!id) return NextResponse.json({ error: 'القالب مطلوب' }, { status: 400 })

  /* حذفٌ ناعم — والخطط المولودة منه تحتفظ بنسبها (`template_id`)
     وبما نُسخ إليها، فلا يتبدّل هيكلُ خطّةٍ بحذف قالبها. */
  const { data, error } = await admin.from('plan_templates')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id).eq('school_id', schoolId).is('deleted_at', null).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'القالب غير موجود' }, { status: 404 })

  await recordAudit({
    req, userId: auth.user.id, schoolId,
    action: 'delete', table: 'plan_templates', recordId: id,
  })
  return NextResponse.json({ deleted: true })
}

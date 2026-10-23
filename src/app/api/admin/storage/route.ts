import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAudit } from '@/lib/audit'

/**
 * مؤشّر استهلاك التخزين (الوثيقة 16)
 *
 * GET   → المستهلك · الحدّ · النسبة · التوزيع على الدلاء والمدارس
 * PATCH → تحديث الباقة ونسبة التنبيه (مشرف النظام) — بعد الترقية
 *
 * «والمراقَبة تحلّ محلّ المنع: مؤشّر استهلاك التخزين في أدوات المشرف،
 *  وتنبيهٌ عند 70٪ — فتُرقَّى الباقة قبل الامتلاء لا بعده. **والامتلاء
 *  المفاجئ هو الخطر الحقيقيّ**: رفعٌ يتوقّف في منتصف دفعة، فتبقى
 *  ملفّات في المخزن وأخرى خارجه.»
 *
 * والقياس من `storage.objects` لا من `evidence_files`: الأوّل ما في
 * القرص، والثاني ما نعرفه — والفرق بينهما هو المعلومة لا الخطأ.
 */

/** الحارس: المؤشّر لمشرف النظام — فالترقية قراره */
async function guard(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles')
    .select('is_super_admin, role').eq('id', userId).maybeSingle()
  if (!me?.is_super_admin) return null
  return admin
}

export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const admin = await guard(auth.user.id)
  if (!admin) return NextResponse.json({ error: 'مؤشّر التخزين لمشرف النظام' }, { status: 403 })

  const [{ data: plan }, { data: buckets, error: bErr }, { data: schools }] = await Promise.all([
    admin.from('storage_plan').select('*').eq('id', 1).maybeSingle(),
    admin.rpc('storage_usage'),
    admin.rpc('evidence_storage_by_school'),
  ])

  /* الترحيل 092 لم يُشغَّل بعد: يُقال صريحاً ولا يُعرَض صفرٌ كاذب */
  if (bErr || !plan) {
    return NextResponse.json({
      error: 'دوال قياس التخزين غير موجودة — شغّل الترحيل 092',
      needsMigration: true,
    }, { status: 409 })
  }

  const used  = (buckets || []).reduce((s: number, b: any) => s + Number(b.bytes || 0), 0)
  const known = (schools || []).reduce((s: number, r: any) => s + Number(r.bytes || 0), 0)
  const quota = Number(plan.quota_bytes) || 1
  const pct   = Math.min(100, Math.round((used / quota) * 1000) / 10)

  return NextResponse.json({
    plan: { name: plan.plan_name, quotaBytes: quota, warnPct: plan.warn_pct },
    used, pct,
    free: Math.max(0, quota - used),
    /* ما في القرص ولا صفَّ له في مخزن الأدلة — شعاراتٌ وصورٌ، أو بقايا رفعٍ انكسر */
    unaccounted: Math.max(0, used - known),
    warn: pct >= plan.warn_pct,
    buckets: (buckets || []).map((b: any) => ({
      bucket: b.bucket, objects: Number(b.objects), bytes: Number(b.bytes),
    })),
    schools: (schools || []).map((r: any) => ({
      id: r.school_id, name: r.school_name || '—',
      files: Number(r.files), bytes: Number(r.bytes),
    })),
  })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const admin = await guard(auth.user.id)
  if (!admin) return NextResponse.json({ error: 'تعديل الباقة لمشرف النظام' }, { status: 403 })

  const b = await req.json().catch(() => ({} as any))
  const patch: any = { updated_at: new Date().toISOString() }

  if (typeof b.planName === 'string' && b.planName.trim()) patch.plan_name = b.planName.trim()
  if (b.quotaGb !== undefined) {
    const gb = Number(b.quotaGb)
    if (!Number.isFinite(gb) || gb <= 0 || gb > 100000)
      return NextResponse.json({ error: 'الحدّ بالغيغابايت رقمٌ موجب' }, { status: 400 })
    patch.quota_bytes = Math.round(gb * 1073741824)
  }
  if (b.warnPct !== undefined) {
    const p = Number(b.warnPct)
    if (!Number.isInteger(p) || p < 1 || p > 99)
      return NextResponse.json({ error: 'نسبة التنبيه بين 1 و99' }, { status: 400 })
    patch.warn_pct = p
  }
  /* الحدّ تبدّل، فما أُشعر عنده لم يعد ذا معنى — ويُسمح بتنبيهٍ جديد */
  if (patch.quota_bytes || patch.warn_pct) patch.last_alert_pct = null

  if (Object.keys(patch).length === 1)
    return NextResponse.json({ error: 'لا تغيير' }, { status: 400 })

  const { error } = await admin.from('storage_plan').update(patch).eq('id', 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recordAudit({
    req, userId: auth.user.id, schoolId: null,
    action: 'update', table: 'storage_plan', recordId: '1', after: patch,
  })
  return NextResponse.json({ updated: true })
}

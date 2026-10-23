import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/storage/headroom — هل تضيق المساحة؟ (الوثيقة 16)
 *
 * يردّ **حكماً لا رقماً**: `{ tight, critical }` وكفى.
 *
 * ── ولماذا بلا أرقام ──
 * الباقة حدٌّ واحد للنظام كلّه لا لكل مدرسة، فنسبةُ الامتلاء فيها
 * استهلاك مدارس أخرى — ولا يملك مستخدم المدرسة ترقيتها أصلاً. فعرضُ
 * النسبة له كشفٌ لما لا يعنيه وطلبٌ لما لا يستطيعه.
 *
 * ── ولماذا يُعرَض له شيءٌ من أصله ──
 * «والامتلاء المفاجئ هو الخطر الحقيقيّ: رفعٌ يتوقّف في منتصف دفعة»
 * (16). وحاجزُ الباقة في م1‑9 يردّ الدفعة **بعد** أن يجمع الموظّف
 * مئتي ملفّ — فالمفاجأة تنتقل من مشرف النظام إليه. وهذا يُنذره **قبل
 * أن يجمع**، ويدلّه على من يملك العلاج: مشرف النظام.
 *
 * ومؤشّر الأرقام والتوزيع والترقية في `/api/admin/storage` — لمشرف
 * النظام وحده.
 */

export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles')
    .select('school_id, active_school_id, is_super_admin, role').eq('id', auth.user.id).maybeSingle()
  if (!me) return NextResponse.json({ error: 'الملفّ الشخصي غير موجود' }, { status: 403 })

  const { data: roleRow } = await admin.from('roles').select('permissions').eq('code', me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleRow?.permissions) ? roleRow!.permissions : []
  const can = (p: string) => me.is_super_admin || perms.includes('all') || perms.includes(p)
  if (!can('manage_evidence'))
    return NextResponse.json({ error: 'لا تملك صلاحية رفع الأدلة' }, { status: 403 })

  /* الترحيل 092 لم يُشغَّل: لا إنذار — والمؤشّر حمايةٌ لا شرطُ عمل */
  const { data: plan } = await admin.from('storage_plan')
    .select('quota_bytes, warn_pct').eq('id', 1).maybeSingle()
  if (!plan) return NextResponse.json({ tight: false, critical: false })

  const { data: usage, error } = await admin.rpc('storage_usage')
  if (error) return NextResponse.json({ tight: false, critical: false })

  const used  = (usage || []).reduce((s: number, b: any) => s + Number(b.bytes || 0), 0)
  const quota = Number(plan.quota_bytes) || 0
  if (quota <= 0) return NextResponse.json({ tight: false, critical: false })
  const pct = (used / quota) * 100

  /* حكمان فقط — ولا بايت يخرج من هنا */
  return NextResponse.json({
    tight:    pct >= Number(plan.warn_pct),
    critical: pct >= 90,
  })
}

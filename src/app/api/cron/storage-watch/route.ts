import { NextResponse } from 'next/server'
import { createAdminClient, isValidCronRequest } from '@/lib/supabase/admin'

/**
 * GET /api/cron/storage-watch — يُشغّله Vercel Cron يومياً
 *
 * «والمراقَبة تحلّ محلّ المنع: مؤشّر استهلاك التخزين في أدوات المشرف،
 *  **وتنبيهٌ عند 70٪** — فتُرقَّى الباقة قبل الامتلاء لا بعده» (16).
 *
 * ── ولماذا مُهمّةٌ مجدولة لا شارةٌ في شاشة ──
 * الشاشة تُنذر من يفتحها، والامتلاء يأتي لمن لا يفتحها: «**والامتلاء
 * المفاجئ هو الخطر الحقيقيّ**: رفعٌ يتوقّف في منتصف دفعة، فتبقى ملفّات
 * في المخزن وأخرى خارجه». فالتنبيه يذهب إلى مشرف النظام حيث هو.
 *
 * ── ولا يتكرّر بلا تبدّل ──
 * `last_alert_pct` يحفظ النسبة التي أُشعر عندها، فلا يُعاد التنبيه إلا
 * إذا ارتفع الاستهلاك **خمس نقاط** أو تجاوز حدّاً أعلى — وإلّا صار
 * إشعاراً يوميّاً يُقرأ أوّل مرّة ويُهمَل بعدها.
 */

const STEP = 5   // نقاطٌ مئوية: دون هذا التبدّل لا يُعاد التنبيه

export async function GET(req: Request) {
  if (!isValidCronRequest(req)) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: plan } = await admin.from('storage_plan').select('*').eq('id', 1).maybeSingle()
  if (!plan) return NextResponse.json({ ok: true, skipped: 'الترحيل 092 لم يُشغَّل' })

  const { data: buckets, error } = await admin.rpc('storage_usage')
  if (error) return NextResponse.json({ ok: true, skipped: 'دالّة القياس غير موجودة' })

  const used  = (buckets || []).reduce((s: number, b: any) => s + Number(b.bytes || 0), 0)
  const quota = Number(plan.quota_bytes) || 1
  const pct   = Math.round((used / quota) * 100)

  if (pct < plan.warn_pct) {
    /* نزل عن الحدّ (حذفٌ أو ترقية): يُصفَّر الختم ليُنذر ثانيةً إن عاد */
    if (plan.last_alert_pct !== null) {
      await admin.from('storage_plan').update({ last_alert_pct: null }).eq('id', 1)
    }
    return NextResponse.json({ ok: true, pct, notified: 0 })
  }

  const last = plan.last_alert_pct
  if (last !== null && pct < last + STEP) {
    return NextResponse.json({ ok: true, pct, notified: 0, reason: 'لا تبدّل يستحقّ تنبيهاً' })
  }

  /* مشرفو النظام — فالترقية قرارهم */
  const { data: supers } = await admin.from('profiles')
    .select('id, notif_enabled, notif_inapp').eq('is_super_admin', true)
  const targets = (supers || []).filter(p => p.notif_enabled !== false && p.notif_inapp !== false)

  const gb = (n: number) => (n / 1073741824).toFixed(2)
  const critical = pct >= 90
  if (targets.length) {
    await admin.from('notifications').insert(targets.map(p => ({
      recipient_id: p.id,
      type:         'system',
      title: critical
        ? `التخزين ${pct}٪ — الامتلاء قريب`
        : `التخزين بلغ ${pct}٪ من الباقة`,
      body: `المستهلك ${gb(used)} من ${gb(quota)} غيغابايت (باقة ${plan.plan_name}).`
            + (critical
               ? ' رقِّ الباقة قبل أيّ رفعٍ جماعيّ — فالدفعة تنقطع في منتصفها ولا تُستأنف.'
               : ' رقِّ الباقة قبل الامتلاء لا بعده (الوثيقة 16).'),
      link:    '/dashboard/admin-tools',
      is_read: false, send_email: false,
    })))
  }

  await admin.from('storage_plan').update({ last_alert_pct: pct }).eq('id', 1)
  return NextResponse.json({ ok: true, pct, notified: targets.length })
}

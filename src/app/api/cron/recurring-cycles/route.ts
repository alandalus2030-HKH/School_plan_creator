import { NextResponse } from 'next/server'
import { createAdminClient, isValidCronRequest } from '@/lib/supabase/admin'

/**
 * GET /api/cron/recurring-cycles — يُشغّله Vercel Cron يومياً
 *
 * «٣ النظام **يفتح دورةً في موعدها ويطلب دليلها** عبر طابور «أدلة
 *  مطلوبة» — والطلب يحمل مرساته ونوع دليله سلفاً» (5.1).
 *
 * ── ولا إشعار هنا ──
 * «ستّون مهمة بعضها شهريّ = مئات الطلبات سنوياً فوق مهام الخطط ⇒
 *  **يتجاهلها الناس**. والعلاج: طابور واحد **لا إشعار لكل دورة** ·
 *  تجميع أسبوعي» (5.2).
 * فهذا يفتح ويُسجّل صامتاً، والتجميع في `/api/cron/requests-digest`.
 *
 * ── ويوسم المهمَل ──
 * «دورة مطلوبة أُهملت → خلل، **وهذه وحدها تُعدّ فجوة**» (5.3). وبغير
 * الوسم لا تصير فجوةٌ فجوةً، فيبقى كل شيء «مفتوحاً» إلى الأبد — وذلك
 * ستْرٌ للخلل لا إنصافٌ للمدرسة. والوسم يُنقَض بدليلٍ يُقبل أو مبرّرٍ
 * يُسجَّل بعده.
 *
 * ── والمنطق في القاعدة لا هنا ──
 * `open_due_recurring_cycles()` دالّةٌ في ترحيل 094: فحسابُ موعد
 * الدورة ووسمها وعامها المنسوب في موضعٍ واحد، لا نصفُه في SQL ونصفُه
 * في TypeScript فيتفرّقان عند أوّل تعديل.
 */

export async function GET(req: Request) {
  if (!isValidCronRequest(req)) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data: opened, error: oErr } = await admin.rpc('open_due_recurring_cycles')
  if (oErr) {
    /* الترحيل 094 لم يُشغَّل بعد: يُقال ولا يُبتلَع */
    return NextResponse.json({ ok: false, error: oErr.message, needsMigration: true }, { status: 200 })
  }

  const { data: neglected, error: nErr } = await admin.rpc('mark_neglected_cycles')
  if (nErr) return NextResponse.json({ ok: false, error: nErr.message }, { status: 200 })

  return NextResponse.json({
    ok: true,
    opened: (opened || []).length,
    cycles: (opened || []).map((c: any) => ({
      task: c.task_name, period: c.period, due: c.due,
    })),
    neglected: Number(neglected) || 0,
  })
}

import { NextResponse } from 'next/server'
import { createAdminClient, isValidCronRequest } from '@/lib/supabase/admin'

/**
 * GET /api/cron/requests-digest — التجميع الأسبوعي (الوثيقة 5.2)
 *
 * «طوفان الإشعارات: ستّون مهمة بعضها شهريّ = مئات الطلبات سنوياً فوق
 *  مهام الخطط ⇒ **يتجاهلها الناس**. والعلاج: طابور واحد لا إشعار لكل
 *  دورة · **تجميع أسبوعي** · تأجيل أو تخطٍّ بمبرّر.»
 *
 * فإشعارٌ واحد لكل شخص في الأسبوع يقول: كم مطلوبٌ منك، وكم تجاوز
 * مهلته، وأقربُها. ولا إشعارَ لمن لا شيء عليه — فالصمت نفسه معلومة.
 *
 * ── ويحلّ الوجهة المؤسسية إلى أشخاصها هنا لا في الطلب ──
 * الطلب يبقى مُسنَداً إلى **قسمٍ أو منصب** (5.2)، فلا يموت برحيل
 * أحدٍ. والإشعار وحده يُحلّ إلى من يشغل الوجهة **اليوم** — فمن جاء
 * بعد غدٍ يتسلّمها بلا إعادة إسناد.
 */

export async function GET(req: Request) {
  if (!isValidCronRequest(req)) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  }

  const admin = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data: reqs, error } = await admin.from('evidence_requests')
    .select('id, school_id, what_is_asked, due_date, assigned_to, assigned_department, assigned_job_title')
    .eq('status', 'open').is('deleted_at', null)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
  const open = reqs || []
  if (!open.length) return NextResponse.json({ ok: true, notified: 0, requests: 0 })

  /* من يشغل الوجهات المؤسسية اليوم */
  const depts = [...new Set(open.map(r => r.assigned_department).filter(Boolean))]
  const jobs  = [...new Set(open.map(r => r.assigned_job_title).filter(Boolean))]
  const { data: people } = await admin.from('profiles')
    .select('id, school_id, department, job_title, notif_enabled, notif_inapp')
    .eq('is_active', true)

  /* بريدُ كل شخص: ما يخصّه شخصياً وما يخصّ قسمه أو منصبه */
  const bag = new Map<string, { total: number; overdue: number; soonest: string | null }>()
  const add = (pid: string, r: any) => {
    const b = bag.get(pid) || { total: 0, overdue: 0, soonest: null }
    b.total++
    if (r.due_date && r.due_date < today) b.overdue++
    if (r.due_date && (!b.soonest || r.due_date < b.soonest)) b.soonest = r.due_date
    bag.set(pid, b)
  }

  for (const r of open) {
    if (r.assigned_to) { add(r.assigned_to, r); continue }
    for (const p of (people || [])) {
      if (p.school_id !== r.school_id) continue
      const byDept = r.assigned_department && p.department === r.assigned_department
      const byJob  = r.assigned_job_title  && p.job_title  === r.assigned_job_title
      if (byDept || byJob) add(p.id, r)
    }
  }
  if (!bag.size) return NextResponse.json({ ok: true, notified: 0, requests: open.length })

  /* تفضيلات المستقبِلين تُحترم — ومنهم من أُسند له شخصياً ولم يُقرأ أعلاه */
  const prefById = new Map((people || []).map((p: any) => [p.id, p]))
  const missing = [...bag.keys()].filter(id => !prefById.has(id))
  if (missing.length) {
    const { data: extra } = await admin.from('profiles')
      .select('id, notif_enabled, notif_inapp').in('id', missing)
    for (const p of (extra || [])) prefById.set(p.id, p)
  }

  const rows: any[] = []
  for (const [pid, b] of bag) {
    const pref: any = prefById.get(pid)
    if (pref && (pref.notif_enabled === false || pref.notif_inapp === false)) continue
    rows.push({
      recipient_id: pid,
      type:  'evidence_request',
      title: b.overdue > 0
        ? `${b.total} دليلاً مطلوباً منك · ${b.overdue} تجاوز مهلته`
        : `${b.total} دليلاً مطلوباً منك هذا الأسبوع`,
      body: (b.soonest ? `أقربها ${b.soonest}. ` : '')
            + 'والدورة التي لم تُنفَّذ يكفيها مبرّرٌ مسجَّل — فلا تُرفَع أدلّةٌ بلا قيمة لتُغلق.',
      link: '/dashboard/evidence/requested',
      is_read: false, send_email: false,
    })
  }

  if (rows.length) await admin.from('notifications').insert(rows)

  return NextResponse.json({
    ok: true, notified: rows.length, requests: open.length,
    departments: depts.length, jobTitles: jobs.length,
  })
}

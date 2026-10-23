import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAudit } from '@/lib/audit'

/**
 * دورات المهامّ الدورية — الحكم عليها (الوثيقة 5.3)
 *
 * GET   ?taskId= | ?scope=mine  →  الدورات وحالاتها
 * PATCH { cycleId, action }     →  'skip' بمبرّر · 'reopen'
 *
 * ── ولماذا «لم تُنفَّذ» بابٌ مفتوح ──
 * «الامتثال الشكليّ: الطلب الآليّ يضغط لرفع «أيّ شيء» ليُغلق ⇒ **مخزن
 *  يمتلئ بأدلة بلا قيمة**. والعلاج: «لم تُنفَّذ هذه الدورة — والسبب…»
 *  إجابةٌ **مشروعة تُسجَّل**» (5.2).
 * فجعلُ الصدق أسهلَ من التحايل هو ما يحمي المخزن — لا التشديد.
 *
 * ── والمبرّر يُقرأ ولا يُخفى ──
 * «دورة لم تُنفَّذ بمبرّر مسجَّل → **مقبولة**، والمبرّر **جزء من السجل
 *  يقرؤه المقيّم**» (5.3). فهو حكمٌ معروض لا عذرٌ مستور.
 *
 * ── وطلبُ الدورة المتروكة يُرفع عن الطابور ──
 * الدورة صارت لها حالٌ مسجَّلة، فبقاءُ طلبها مفتوحاً مطالبةٌ بما حُكم
 * فيه. ويُحذف الطلب حذفاً ناعماً — **والفجوة لا تُستر**: محلُّها صفُّ
 * الدورة الذي يقرؤه المقيّم، لا طلبٌ معلّق في طابور.
 */

async function ctxOf(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles')
    .select('id, name_ar, school_id, active_school_id, is_super_admin, role, department, job_title')
    .eq('id', userId).single()
  if (!me) return null
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  const { data: roleRow } = await admin.from('roles').select('permissions').eq('code', me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleRow?.permissions) ? roleRow!.permissions : []
  const can = (p: string) => me.is_super_admin || perms.includes('all') || perms.includes(p)
  return { admin, me, schoolId, can }
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await ctxOf(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, schoolId } = ctx

  const taskId = req.nextUrl.searchParams.get('taskId')
  let q = admin.from('recurring_task_cycles')
    .select(`id, recurring_task_id, period_label, period_start, due_date, academic_year,
             status, justification, evidence_id, request_id, closed_at,
             task:recurring_tasks!inner(id, name_ar, frequency, assigned_department, assigned_job_title)`)
    .eq('school_id', schoolId).order('due_date', { ascending: false }).limit(300)
  if (taskId) q = q.eq('recurring_task_id', taskId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data || []
  return NextResponse.json({
    cycles: rows,
    /* ثلاث حالات لا اثنتان — والمهملة وحدها فجوة (5.3) */
    tally: {
      open:       rows.filter((c: any) => c.status === 'open').length,
      documented: rows.filter((c: any) => c.status === 'documented').length,
      skipped:    rows.filter((c: any) => c.status === 'skipped').length,
      neglected:  rows.filter((c: any) => c.status === 'neglected').length,
    },
  })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await ctxOf(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, me, schoolId, can } = ctx

  const b = await req.json().catch(() => ({} as any))
  const cycleId = String(b.cycleId || '').trim()
  const action  = String(b.action  || '').trim()
  if (!cycleId) return NextResponse.json({ error: 'الدورة مطلوبة' }, { status: 400 })

  const { data: cyc } = await admin.from('recurring_task_cycles')
    .select(`id, school_id, status, request_id, period_label,
             task:recurring_tasks!inner(id, name_ar, assigned_department, assigned_job_title)`)
    .eq('id', cycleId).eq('school_id', schoolId).maybeSingle()
  if (!cyc) return NextResponse.json({ error: 'الدورة غير موجودة' }, { status: 404 })

  /* من يحكم: من يشغل وجهتها اليوم، أو من يفرز الأدلة أو يُدير الإعدادات */
  const t: any = (cyc as any).task
  const isTarget = (t.assigned_department && me.department === t.assigned_department)
                || (t.assigned_job_title  && me.job_title  === t.assigned_job_title)
  if (!isTarget && !can('triage_evidence') && !can('manage_settings')) {
    return NextResponse.json({
      error: `هذه الدورة لـ«${t.assigned_job_title || t.assigned_department}» — والحكم عليها لمن يشغلها أو لمنسّق الجودة`,
    }, { status: 403 })
  }

  if (action === 'skip') {
    const why = String(b.justification || '').trim()
    /* الحارس في القاعدة يرفضه فارغاً — والرسالة المفهومة أوّلاً */
    if (!why) {
      return NextResponse.json({
        error: 'المبرّر مطلوب — «والمبرّر جزء من السجل يقرؤه المقيّم» (5.3)',
      }, { status: 400 })
    }
    const { error } = await admin.from('recurring_task_cycles')
      .update({ status: 'skipped', justification: why, closed_by: auth.user.id })
      .eq('id', cycleId)
    if (error) return NextResponse.json({ error: error.message }, { status: 409 })

    /* طلبُها يُرفع عن الطابور — والفجوة محلُّها صفّ الدورة لا طلبٌ معلّق */
    if (cyc.request_id) {
      await admin.from('evidence_requests')
        .update({ deleted_at: new Date().toISOString() }).eq('id', cyc.request_id)
    }

    await recordAudit({
      req, userId: auth.user.id, schoolId,
      action: 'update', table: 'recurring_task_cycles', recordId: cycleId,
      after: { status: 'skipped', justification: why, task: t.name_ar, period: cyc.period_label },
    })
    return NextResponse.json({ updated: true, status: 'skipped' })
  }

  if (action === 'reopen') {
    /* تصحيحُ حكمٍ: المهمَل أو المتروك يعود مفتوحاً — ولمنسّق الجودة وحده،
       فعودةُ الطلب مطالبةٌ لغيره. ودورةٌ موثّقة لا تُنقَض من هنا: نقضُها
       نقضُ حكمٍ على دليل، وبابُه إعادة فتح الدليل (3.2). */
    if (!can('triage_evidence') && !can('manage_settings')) {
      return NextResponse.json({ error: 'إعادة فتح الدورة لمنسّق الجودة' }, { status: 403 })
    }
    if (cyc.status === 'documented') {
      return NextResponse.json({
        error: 'دورةٌ موثّقة — ونقضها يبدأ بإعادة فتح دليلها من الخزانة، فيعود الحكم إلى أهله (3.2)',
      }, { status: 409 })
    }
    const { error } = await admin.from('recurring_task_cycles')
      .update({ status: 'open', justification: null }).eq('id', cycleId)
    if (error) return NextResponse.json({ error: error.message }, { status: 409 })

    await recordAudit({
      req, userId: auth.user.id, schoolId,
      action: 'update', table: 'recurring_task_cycles', recordId: cycleId,
      after: { status: 'open', was: cyc.status },
    })
    return NextResponse.json({ updated: true, status: 'open' })
  }

  return NextResponse.json({ error: 'إجراءٌ غير معروف' }, { status: 400 })
}

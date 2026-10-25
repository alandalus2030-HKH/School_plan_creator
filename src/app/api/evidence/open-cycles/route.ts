import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * دوراتٌ مفتوحة على معيارٍ فرعيّ — علاج «ازدواج الدليل» (الوثيقة 5.2).
 *
 * GET ?subNodeId=…  →  الدورات المفتوحة التي تنتظر دليلاً لهذا المعيار
 *
 * ── العلّة ──
 * «ازدواج الدليل بين الرفع المباشر والدورة: **يُرفع دليل الاجتماع من
 *  القناة المباشرة بينما طلب الدورة مفتوح ⇒ سجلّان لحدثٍ واحد وطلبٌ
 *  معلّق**» (5.2). فالمدرسة تظنّ أنها وثّقت، والطابور يظنّ أنها لم
 *  تفعل — وتُوسَم الدورة مهملةً بعد مهلتها وقد نُفِّذت ووُثِّقت.
 *
 * ── والعلاج سؤالٌ لا منع ──
 * «عند الرفع المباشر، إن كانت للمؤشّر دورة مفتوحة: **«أهذا دليل دورة
 *  أكتوبر من مهمة كذا؟» — بنقرة**» (5.2). فالرفع المباشر حقٌّ قائم
 * (3.1) لا يُسلَب، والدليل قد يكون لشيءٍ آخر في المعيار نفسه. فيُسأل
 * الرافع ويُجاب بنقرة، ولا يُحوَّل عنه قسراً.
 *
 * ── والسؤال من الطلب لا من المهمّة ──
 * طلبُ الدورة يحمل `sub_node_id` مشتقّاً من مراسي مهمّته عند فتحها،
 * فهو **ما يُطابَق عليه**: مطابقةٌ على ما طُلب فعلاً لا على ما قد
 * تؤول إليه المراسي بعد تعديلٍ لاحق.
 */

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles')
    .select('school_id, active_school_id, is_super_admin').eq('id', auth.user.id).single()
  if (!me) return NextResponse.json({ cycles: [] })
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  if (!schoolId) return NextResponse.json({ cycles: [] })

  const subNodeId = String(req.nextUrl.searchParams.get('subNodeId') || '').trim()
  if (!subNodeId) return NextResponse.json({ cycles: [] })

  const { data: reqs } = await admin.from('evidence_requests')
    .select('id, sub_node_id, academic_year, due_date')
    .eq('school_id', schoolId).eq('sub_node_id', subNodeId)
    .eq('status', 'open').is('deleted_at', null)
  const ids = (reqs || []).map((r: any) => r.id)
  if (!ids.length) return NextResponse.json({ cycles: [] })

  /* دوراتٌ مفتوحة وحدها — فالموثّقة سُدّت فجوتها، والمتروكة حُكم فيها */
  const { data: cycles } = await admin.from('recurring_task_cycles')
    .select(`id, request_id, period_label, due_date, academic_year,
             task:recurring_tasks!inner(id, name_ar, frequency)`)
    .eq('school_id', schoolId).eq('status', 'open').in('request_id', ids)
    .order('due_date')

  return NextResponse.json({
    cycles: (cycles || []).map((c: any) => ({
      cycleId:   c.id,
      requestId: c.request_id,
      period:    c.period_label,
      dueDate:   c.due_date,
      year:      c.academic_year,
      taskName:  c.task?.name_ar || '',
      frequency: c.task?.frequency || '',
    })),
  })
}

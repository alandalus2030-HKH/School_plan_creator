import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAudit } from '@/lib/audit'

/**
 * إرسال الدفعة — من ورقة التهيئة إلى طوابير الفرق (الوثيقة 3.6.1)
 *
 * «٤ الإرسال — عند اكتمال الحقول المانعة تدخل الدفعة طوابير الفرق،
 *  فتمضي في الفرز والقبول المعتادَين.»
 *
 * ولا شيء هنا يخترع مساراً جديداً: تُنشأ أدلةٌ **مصدرها «رفع مباشر»**
 * (3.6.1: «الدليل المرفوع في دفعة مصدره رفع مباشر، والدفعة لا تظهر في
 *  `source`») بحالة `pending`، ومعها مرساة معيارها الفرعي وفريقها
 * المالك المشتقّ من المعيار الرئيس — ثمّ تمضي في الطابور كغيرها.
 *
 * والدمج يُحسم هنا لا بعده: «الدمج قبل القبول حتماً — الرقم الثابت
 * يُمنح عند القبول ولا يتغيّر، فدمجٌ بعده يُبطل رقماً منشوراً».
 */

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles')
    .select('school_id, active_school_id, is_super_admin, role').eq('id', auth.user.id).single()
  if (!me) return NextResponse.json({ error: 'الملفّ الشخصي غير موجود' }, { status: 403 })
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  if (!schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })

  const { data: roleRow } = await admin.from('roles').select('permissions').eq('code', me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleRow?.permissions) ? roleRow!.permissions : []
  const can = (p: string) => me.is_super_admin || perms.includes('all') || perms.includes(p)
  if (!can('manage_evidence')) return NextResponse.json({ error: 'لا تملك صلاحية رفع الأدلة' }, { status: 403 })

  const { batchId } = await req.json().catch(() => ({} as any))
  if (!batchId) return NextResponse.json({ error: 'الدفعة مطلوبة' }, { status: 400 })

  const { data: batch } = await admin.from('evidence_batches')
    .select('*').eq('id', batchId).eq('school_id', schoolId).maybeSingle()
  if (!batch) return NextResponse.json({ error: 'الدفعة غير موجودة' }, { status: 404 })
  if (batch.status !== 'staging') return NextResponse.json({ error: 'الدفعة أُرسلت سلفاً' }, { status: 409 })

  const { data: items } = await admin.from('evidence_batch_items')
    .select('*').eq('batch_id', batchId).eq('dropped', false).order('order_num')
  const rows = items || []
  if (!rows.length) return NextResponse.json({ error: 'لا صفوف في الدفعة' }, { status: 400 })

  /* الحاجز يُفحص هنا وفي القاعدة (089) — الرسالة المفهومة أولاً */
  const bad = rows.filter((r: any) =>
    !r.sub_node_id || !/^\d{4}-\d{4}$/.test(r.academic_year || ''))
  if (bad.length) {
    return NextResponse.json({
      error: `${bad.length} صفّاً ناقص المعيار الفرعي أو العام — وهما الحقلان المانعان`,
      incomplete: bad.map((r: any) => r.id),
    }, { status: 409 })
  }

  /* المعايير الفرعية المُشار إليها — ومنها الفريق المالك */
  const subIds = [...new Set(rows.map((r: any) => r.sub_node_id))]
  const { data: subs } = await admin.from('framework_nodes')
    .select('id, code, name_ar, level').in('id', subIds)
  const subById = new Map((subs || []).map((s: any) => [s.id, s]))
  const { data: teams } = await admin.from('focus_teams')
    .select('id, standard_code').eq('school_id', schoolId)
  const teamByStd = new Map((teams || []).map((t: any) => [t.standard_code, t.id]))

  /* المجموعات: صفٌّ بلا `merge_group` دليلٌ مستقلّ (الملفّ = دليل) */
  const groups = new Map<string, any[]>()
  for (const r of rows) {
    const key = r.merge_group != null ? `g${r.merge_group}` : `i${r.id}`
    ;(groups.get(key) || groups.set(key, []).get(key)!).push(r)
  }

  let created = 0
  const madeIds: string[] = []
  for (const [, members] of groups) {
    const head = members[0]
    const sub  = subById.get(head.sub_node_id)
    const std  = String(sub?.code || '').split('.')[0]

    const { data: ev, error: evErr } = await admin.from('evidence').insert({
      school_id:     schoolId,
      task_id:       null,
      source:        'direct',              // الدفعة أسلوب إدخال لا قناة (3.6.1)
      batch_id:      batchId,
      status:        'pending',
      name:          head.name_override || head.file_name.replace(/\.[^.]+$/, ''),
      evidence_type: head.evidence_type || null,
      reason_code:   batch.reason_code || null,
      academic_year: head.academic_year,
      document_date: head.document_date || null,
      owner_team_id: teamByStd.get(std) || null,
      uploaded_by:   auth.user.id,
      file_url:      head.file_url,
      file_type:     head.file_type,
      file_size:     head.file_size,
    }).select('id').single()
    if (evErr || !ev) return NextResponse.json({ error: evErr?.message || 'تعذّر إنشاء الدليل' }, { status: 500 })

    const fileRows = members.map((m: any, i: number) => ({
      evidence_id:  ev.id,
      name:         m.file_name,
      file_url:     m.file_url,
      file_type:    m.file_type,
      file_size:    m.file_size,
      video_url:    null,
      order_num:    i + 1,
      content_hash: m.content_hash,       // البصمة محسوبةٌ في الابتلاع (11)
      fixity_status: 'ok',
      last_fixity_at: new Date().toISOString().slice(0, 10),
    }))
    const { error: fErr } = await admin.from('evidence_files').insert(fileRows)
    if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 })

    /* مرساة المعيار الفرعي — «الرافع يحدّد المعيار الفرعي، والمقيّم
       يكمل المؤشرات» (3.1). ومُشغِّل 084 يشترط مرساةً دالّة عند القبول. */
    await admin.from('evidence_anchors').insert({
      evidence_id: ev.id, framework_node_id: head.sub_node_id,
      kind: 'specific', confirm_status: 'confirmed', assigned_by: auth.user.id,
    })

    await admin.from('evidence_batch_items')
      .update({ evidence_id: ev.id }).in('id', members.map((m: any) => m.id))
    created++; madeIds.push(ev.id)
  }

  /* حاجز القاعدة يتكلّم إن بقي نقص — والختم `sent_at` فيه */
  const { error: sErr } = await admin.from('evidence_batches')
    .update({ status: 'sent' }).eq('id', batchId)
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 409 })

  await recordAudit({
    req, userId: auth.user.id, schoolId,
    action: 'update', table: 'evidence_batches', recordId: batchId,
    after: { sent: created, files: rows.length },
  })

  return NextResponse.json({ sent: true, created, files: rows.length })
}

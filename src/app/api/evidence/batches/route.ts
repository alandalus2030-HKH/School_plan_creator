import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAudit } from '@/lib/audit'

/**
 * الرفع الجماعي — الابتلاع وورقة التهيئة (الوثيقة 3.6.1)
 *
 * POST  (multipart) → **الابتلاع**: تُرفع الملفّات، وتُحسب بصماتها،
 *                     ويُعلَّم المكرّر — ثمّ دفعةٌ **قيد التهيئة**.
 * GET   ?id=        → ورقة التهيئة: صفُّها ملفّ، وأعمدتها الأربعة.
 * GET               → دفعات المدرسة.
 * PATCH             → تحرير الورقة: بالتحديد الجماعي وبالصفّ الواحد معاً.
 *
 * ── والرفع لا يسأل شيئاً، والتهيئة تلي ──
 * «١ الابتلاع — تُرفع الملفّات، وتُحسب بصماتها، ويُسقَط المكرّر **قبل
 *  أن يُتعب أحداً**. ٢ دفعة قيد التهيئة — لا تدخل المخزن ولا تظهر في
 *  طابور أيّ فريق. ٣ ورقة التهيئة… ٤ الإرسال عند اكتمال الحقول
 *  المانعة.» فلا يُسأل الرافع عن شيءٍ وهو يرفع مئتي ملفّ.
 */

const BUCKET    = 'evidence'
const MAX_FILES = 200           // «مئتا ملفّ دفعةً واحدة» (3.6)
const MAX_FILE  = 25 * 1024 * 1024
const MAX_TOTAL = 150 * 1024 * 1024

/** «الصيغ المقبولة هي المعمول بها اليوم في أدلة المهامّ» (3.6.1) */
const OK_TYPE = (t: string) =>
  t.startsWith('image/') ||
  ['application/pdf',
   'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
   'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ].includes(t)

async function ctxOf(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles')
    .select('school_id, active_school_id, is_super_admin, role').eq('id', userId).single()
  if (!me) return null
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  const { data: roleRow } = await admin.from('roles').select('permissions').eq('code', me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleRow?.permissions) ? roleRow!.permissions : []
  const can = (p: string) => me.is_super_admin || perms.includes('all') || perms.includes(p)
  return { admin, me, schoolId, can }
}

/**
 * اقتراح العام من اسم الملفّ — «أنماط ثابتة» بلا ذكاء اصطناعي (3.6.1).
 * يلتقط «2023-2024» و«2024» و«1445» (هجريّ تقريبيّ).
 */
function yearFromName(name: string): string | null {
  const pair = name.match(/(20\d{2})\s*[-–_/]\s*(20\d{2})/)
  if (pair) return `${pair[1]}-${pair[2]}`
  const greg = name.match(/\b(20\d{2})\b/)
  if (greg) {
    const y = +greg[1]
    /* سنةٌ مفردة: تُحمل على عامٍ دراسيّ يبدأ بها — والمستخدم يصحّح */
    return `${y}-${y + 1}`
  }
  const hij = name.match(/\b(14[2-6]\d)\b/)
  if (hij) { const g = Math.round(+hij[1] * 0.97 + 622); return `${g}-${g + 1}` }
  return null
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await ctxOf(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, schoolId, can } = ctx
  if (!can('manage_evidence')) return NextResponse.json({ error: 'لا تملك صلاحية رفع الأدلة' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')

  if (!id) {
    const { data: batches } = await admin.from('evidence_batches')
      .select('id, created_at, sent_at, status, year_default, note')
      .eq('school_id', schoolId).order('created_at', { ascending: false }).limit(30)
    const ids = (batches || []).map((b: any) => b.id)
    const { data: counts } = ids.length
      ? await admin.from('evidence_batch_items').select('batch_id, dropped').in('batch_id', ids)
      : { data: [] as any[] }
    const n = (bid: string) => (counts || []).filter((c: any) => c.batch_id === bid && !c.dropped).length
    return NextResponse.json({
      batches: (batches || []).map((b: any) => ({ ...b, items: n(b.id) })),
    })
  }

  const { data: batch } = await admin.from('evidence_batches')
    .select('*').eq('id', id).eq('school_id', schoolId).maybeSingle()
  if (!batch) return NextResponse.json({ error: 'الدفعة غير موجودة' }, { status: 404 })

  const { data: items } = await admin.from('evidence_batch_items')
    .select('*').eq('batch_id', id).order('order_num')

  const subIds = [...new Set((items || []).map((i: any) => i.sub_node_id).filter(Boolean))]
  const { data: subs } = subIds.length
    ? await admin.from('framework_nodes').select('id, code, name_ar').in('id', subIds)
    : { data: [] as any[] }
  const subById = new Map((subs || []).map((s: any) => [s.id, s]))

  /* النافذة الانتقالية 1 يوليو ← 30 سبتمبر: «يُعلَّم في ورقة التهيئة
     ويُسأل عنه، ولا يُنسَب صامتاً» (3.8) */
  const inWindow = (d: string | null) => {
    if (!d) return false
    const m = +d.slice(5, 7), day = +d.slice(8, 10)
    return (m === 7 || m === 8) || (m === 9 && day <= 30)
  }

  return NextResponse.json({
    batch,
    items: (items || []).map((i: any) => ({
      ...i,
      sub: i.sub_node_id ? subById.get(i.sub_node_id) || null : null,
      transitional: inWindow(i.document_date),
      blockers: [
        i.sub_node_id ? null : 'المعيار الفرعي',
        /^\d{4}-\d{4}$/.test(i.academic_year || '') ? null : 'العام',
      ].filter(Boolean),
    })),
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await ctxOf(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, schoolId, can } = ctx
  if (!can('manage_evidence')) return NextResponse.json({ error: 'لا تملك صلاحية رفع الأدلة' }, { status: 403 })

  const form = await req.formData()
  const files = form.getAll('files').filter((f): f is File => f instanceof File)
  const yearDefault = String(form.get('yearDefault') || '').trim() || null
  const reasonCode  = String(form.get('reasonCode')  || '').trim() || null
  const batchId     = String(form.get('batchId')     || '').trim() || null

  if (!files.length) return NextResponse.json({ error: 'أرفق ملفّاً واحداً على الأقل' }, { status: 400 })
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `الحدّ ${MAX_FILES} ملفّاً في الدفعة — قسّمها` }, { status: 400 })
  }
  let total = 0
  for (const f of files) {
    if (f.size > MAX_FILE) return NextResponse.json({ error: `«${f.name}» يتجاوز 25 ميغابايت` }, { status: 400 })
    if (!OK_TYPE(f.type))   return NextResponse.json({ error: `صيغة «${f.name}» غير مدعومة` }, { status: 400 })
    total += f.size
  }
  if (total > MAX_TOTAL) {
    return NextResponse.json({ error: 'إجمالي الحجم يتجاوز 150 ميغابايت — ارفعها على دفعات' }, { status: 400 })
  }

  /* ── مساحةُ الباقة تُفحص **قبل** الرفع لا بعده (16 · م1‑11ب) ──
     «والامتلاء المفاجئ هو الخطر الحقيقيّ: رفعٌ يتوقّف في منتصف دفعة،
      فتبقى ملفّات في المخزن وأخرى خارجه.» فالدفعة التي لا تسعها الباقة
     تُرَدّ **كلّها** قبل أن يُرفع منها بايت، ويُقال كم يلزم.
     وإن لم يُشغَّل ترحيل 092 مضى الرفع: المؤشّر حمايةٌ لا شرطُ عمل. */
  {
    const { data: plan } = await admin.from('storage_plan')
      .select('quota_bytes, warn_pct, plan_name').eq('id', 1).maybeSingle()
    if (plan) {
      const { data: usage } = await admin.rpc('storage_usage')
      const used  = (usage || []).reduce((a: number, b: any) => a + Number(b.bytes || 0), 0)
      const quota = Number(plan.quota_bytes) || 0
      const free  = quota - used
      if (quota > 0 && total > free) {
        const mb = (n: number) => Math.max(0, Math.round(n / 1048576))
        return NextResponse.json({
          error: `لا تسع الباقة هذه الدفعة: المتاح ${mb(free)} ميغابايت والدفعة ${mb(total)}. `
               + `رقِّ باقة التخزين أو قسّم الدفعة — فالرفع لا يُبدأ ليتوقّف في منتصفه (16).`,
          storageFull: true, freeBytes: Math.max(0, free), neededBytes: total,
        }, { status: 507 })
      }
    }
  }

  /* دفعةٌ قائمة تُستكمل، أو تُفتح جديدة */
  let batch: any = null
  if (batchId) {
    const { data } = await admin.from('evidence_batches')
      .select('*').eq('id', batchId).eq('school_id', schoolId).maybeSingle()
    if (!data || data.status !== 'staging') {
      return NextResponse.json({ error: 'الدفعة غير قابلة للاستكمال' }, { status: 409 })
    }
    batch = data
  } else {
    const { data, error } = await admin.from('evidence_batches').insert({
      school_id: schoolId, created_by: auth.user.id,
      year_default: yearDefault, reason_code: reasonCode,
    }).select('*').single()
    if (error || !data) return NextResponse.json({ error: error?.message || 'تعذّر فتح الدفعة' }, { status: 500 })
    batch = data
  }

  const { data: lastRow } = await admin.from('evidence_batch_items')
    .select('order_num').eq('batch_id', batch.id).order('order_num', { ascending: false }).limit(1)
  let order = (lastRow?.[0]?.order_num || 0) + 1

  const rows: any[] = []
  let dups = 0
  for (const f of files) {
    const buf  = Buffer.from(await f.arrayBuffer())
    const hash = createHash('sha256').update(buf).digest('hex')

    /* كشف التكرار بالبصمة — في المخزن وفي الدفعة نفسها (11) */
    const { data: hit } = await admin.from('evidence_files')
      .select('id, evidence:evidence!inner(school_id)').eq('content_hash', hash).limit(5)
    const sameSchool = (hit || []).find((h: any) => h.evidence?.school_id === schoolId)
    const twinInBatch = rows.find(r => r.content_hash === hash)

    const ext  = (f.name.split('.').pop() || 'bin').toLowerCase().slice(0, 8)
    const path = `batch/${schoolId}/${batch.id}/${order}-${Date.now()}.${ext}`
    const { error: upErr } = await admin.storage.from(BUCKET)
      .upload(path, buf, { upsert: false, contentType: f.type })
    if (upErr) return NextResponse.json({ error: `تعذّر رفع «${f.name}»: ${upErr.message}` }, { status: 500 })
    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)

    const dup = !!(sameSchool || twinInBatch)
    if (dup) dups++
    rows.push({
      batch_id: batch.id, order_num: order++,
      file_name: f.name, file_url: pub?.publicUrl || '', file_type: f.type, file_size: f.size,
      content_hash: hash,
      /* مسار المجلّد أقوى مصادر العام، ثمّ اسم الملفّ، ثمّ افتراض الدفعة (3.6.1) */
      academic_year: yearFromName(f.name) || batch.year_default || null,
      dup_of: sameSchool?.id || null,
      dropped: dup,                       // «يُسقَط المكرّر قبل أن يُتعب أحداً» — ويُعرَض
    })
  }

  const { error: insErr } = await admin.from('evidence_batch_items').insert(rows)
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  await recordAudit({
    req, userId: auth.user.id, schoolId,
    action: 'create', table: 'evidence_batches', recordId: batch.id,
    after: { ingested: rows.length, duplicates: dups },
  })

  return NextResponse.json({ batchId: batch.id, ingested: rows.length, duplicates: dups })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await ctxOf(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, schoolId, can } = ctx
  if (!can('manage_evidence')) return NextResponse.json({ error: 'لا تملك صلاحية رفع الأدلة' }, { status: 403 })

  const body = await req.json().catch(() => ({} as any))
  const batchId: string = body.batchId
  const ids: string[]   = Array.isArray(body.ids) ? body.ids : []
  if (!batchId) return NextResponse.json({ error: 'الدفعة مطلوبة' }, { status: 400 })

  const { data: batch } = await admin.from('evidence_batches')
    .select('id, status').eq('id', batchId).eq('school_id', schoolId).maybeSingle()
  if (!batch) return NextResponse.json({ error: 'الدفعة غير موجودة' }, { status: 404 })
  if (batch.status !== 'staging') {
    return NextResponse.json({ error: 'الدفعة أُرسلت — لا تُحرَّر بعد الإرسال' }, { status: 409 })
  }

  /* خصائص الدفعة نفسها */
  if (body.batchPatch && typeof body.batchPatch === 'object') {
    const p: any = {}
    if ('year_default' in body.batchPatch) p.year_default = body.batchPatch.year_default || null
    if ('reason_code'  in body.batchPatch) p.reason_code  = body.batchPatch.reason_code  || null
    if ('note'         in body.batchPatch) p.note         = body.batchPatch.note || null
    if ('status'       in body.batchPatch && body.batchPatch.status === 'discarded') p.status = 'discarded'
    if (Object.keys(p).length) await admin.from('evidence_batches').update(p).eq('id', batchId)
  }

  /* الصفوف: «يُحرَّر بالتحديد الجماعي وبالصفّ الواحد معاً» (3.6.1) */
  if (ids.length && body.patch && typeof body.patch === 'object') {
    const p: any = {}
    for (const k of ['academic_year', 'document_date', 'evidence_type', 'sub_node_id', 'name_override', 'merge_group']) {
      if (k in body.patch) p[k] = body.patch[k] === '' ? null : body.patch[k]
    }
    if ('dropped' in body.patch) p.dropped = !!body.patch.dropped
    if (Object.keys(p).length) {
      const { error } = await admin.from('evidence_batch_items').update(p).in('id', ids).eq('batch_id', batchId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}

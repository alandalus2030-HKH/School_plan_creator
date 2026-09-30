import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * القناة المباشرة — رفع دليل إلى مخزن الاعتماد بلا مهمّة ولا خطة.
 * المرجع: docs/QNSA_ACCREDITATION_ARCHITECTURE.html §3.1 · 3.2 · 3.4 · 3.8
 *
 * GET  ?hash=…  فحص التكرار قبل الرفع (بصمة يحسبها المتصفّح)
 * POST multipart رفعٌ وختم:
 *   • الرفع عبر service role (نمط الشعار والصورة الشخصية — قاعدة المشروع 5)
 *   • **البصمة يحسبها الخادم من البايتات وهي المعتمدة** — وما يأتي من
 *     المتصفّح يُقارَن بها ويُبلَّغ عند الاختلاف، ولا يُخزَّن.
 *   • الدليل يدخل status='pending' فلا يُحتسب في تغطية حتى يُقبل.
 *   • مرساةُ الدخول = المعيار الفرعي، ومنها يُشتقّ الفريق المالك آلياً.
 */

const BUCKET = 'evidence'
const MAX_FILE  = 25 * 1024 * 1024        // 25MB للملفّ الواحد
const MAX_TOTAL = 60 * 1024 * 1024        // 60MB للطلب الواحد
const MAX_FILES = 10

/* الصيغ المقبولة — هي المعمول بها في أدلة المهام */
const OK_TYPE = (t: string) =>
  t.startsWith('image/') ||
  t === 'application/pdf' ||
  t.startsWith('application/vnd.openxmlformats-officedocument') ||
  t === 'application/msword' ||
  t === 'application/vnd.ms-excel' ||
  t === 'application/vnd.ms-powerpoint'

async function getContext(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles')
    .select('school_id, active_school_id, is_super_admin, role')
    .eq('id', userId).single()
  if (!me) return null
  /* المدرسة الفعّالة — يحترم التقمّص (قاعدة المشروع 1) */
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  const { data: roleData } = await admin
    .from('roles').select('permissions').eq('code', me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleData?.permissions) ? roleData!.permissions : []
  const can = (p: string) =>
    me.is_super_admin || perms.includes('all') || perms.includes(p)
  return { admin, me, schoolId, can }
}

/* ════════════════ GET — فحص التكرار ════════════════ */

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })

  const hashes = (req.nextUrl.searchParams.get('hash') || '')
    .split(',').map(h => h.trim().toLowerCase()).filter(Boolean).slice(0, MAX_FILES)
  if (!hashes.length) return NextResponse.json({ duplicates: [] })

  const { data } = await ctx.admin
    .from('evidence_files')
    .select('content_hash, name, evidence:evidence!inner(id, name, code, status, school_id, created_at)')
    .in('content_hash', hashes)
    .eq('evidence.school_id', ctx.schoolId)

  const duplicates = (data || []).map((r: any) => ({
    hash:       r.content_hash,
    fileName:   r.name,
    evidenceId: r.evidence?.id,
    name:       r.evidence?.name,
    code:       r.evidence?.code,
    status:     r.evidence?.status,
    createdAt:  r.evidence?.created_at,
  }))
  return NextResponse.json({ duplicates })
}

/* ════════════════ POST — رفع دليل مباشر ════════════════ */

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, schoolId, can } = ctx

  if (!can('manage_evidence'))
    return NextResponse.json({ error: 'لا تملك صلاحية رفع الأدلة' }, { status: 403 })

  let form: FormData
  try { form = await req.formData() }
  catch { return NextResponse.json({ error: 'تعذّرت قراءة الطلب' }, { status: 400 }) }

  const str = (k: string) => String(form.get(k) ?? '').trim()
  const name          = str('name')
  const description   = str('description')
  const subNodeId     = str('sub_node_id')
  const academicYear  = str('academic_year')
  const documentDate  = str('document_date')
  const evidenceType  = str('evidence_type')
  const reasonCode    = str('reason_code')

  /* ── الحقول المانعة (3.6.1): المعيار الفرعي والعام ── */
  if (!name)                               return NextResponse.json({ error: 'اسم الدليل مطلوب' }, { status: 400 })
  if (!subNodeId)                          return NextResponse.json({ error: 'المعيار الفرعي إلزاميّ' }, { status: 400 })
  if (!/^\d{4}-\d{4}$/.test(academicYear)) return NextResponse.json({ error: 'العام الدراسي بصيغة 2026-2027' }, { status: 400 })

  /* ── المرساة: معيار فرعي (مستوى 3) من الإطار الفعّال ── */
  const { data: node } = await admin
    .from('framework_nodes')
    .select('id, code, level, frameworks!inner(status)')
    .eq('id', subNodeId).maybeSingle()
  if (!node || node.level !== 3 || (node as any).frameworks?.status !== 'active')
    return NextResponse.json({ error: 'المعيار الفرعي غير صالح أو من إصدار غير فعّال' }, { status: 400 })

  /* ── الفريق المالك يُشتقّ من المعيار الرئيس (3.2) ── */
  const standardCode = String(node.code).split('.')[0]
  const { data: team } = await admin
    .from('focus_teams').select('id')
    .eq('school_id', schoolId).eq('standard_code', standardCode).maybeSingle()

  /* ── الملفّات ── */
  const files = form.getAll('files').filter((f): f is File => f instanceof File)
  if (!files.length)          return NextResponse.json({ error: 'أرفق ملفاً واحداً على الأقل' }, { status: 400 })
  if (files.length > MAX_FILES) return NextResponse.json({ error: `الحدّ ${MAX_FILES} ملفّات في الدليل الواحد` }, { status: 400 })

  let total = 0
  for (const f of files) {
    if (f.size > MAX_FILE) return NextResponse.json({ error: `«${f.name}» يتجاوز 25 ميغابايت` }, { status: 400 })
    if (!OK_TYPE(f.type))   return NextResponse.json({ error: `صيغة «${f.name}» غير مدعومة` }, { status: 400 })
    total += f.size
  }
  if (total > MAX_TOTAL) return NextResponse.json({ error: 'إجمالي الحجم يتجاوز 60 ميغابايت — ارفعها على دفعات' }, { status: 400 })

  const clientHashes = form.getAll('hashes').map(h => String(h).toLowerCase())

  /* ── صفّ الدليل أولاً (لنبني مسار التخزين على معرّفه) ── */
  const { data: ev, error: evErr } = await admin
    .from('evidence')
    .insert({
      school_id:     schoolId,
      task_id:       null,                    // القناة المباشرة: لا مهمّة
      source:        'direct',
      status:        'pending',               // لا يُحتسب حتى يُقبل
      name,
      description:   description || null,
      evidence_type: evidenceType || null,
      reason_code:   reasonCode   || null,
      academic_year: academicYear,
      document_date: documentDate || null,
      owner_team_id: team?.id || null,
      uploaded_by:   auth.user.id,
      file_url:      '',                      // يُملأ بعد رفع أول ملفّ
    })
    .select('id').single()
  if (evErr || !ev) return NextResponse.json({ error: evErr?.message || 'تعذّر إنشاء الدليل' }, { status: 500 })

  /* ── الرفع + البصمة (الخادم هو المعتمد) ── */
  const rows: any[] = []
  const mismatches: string[] = []
  try {
    for (let i = 0; i < files.length; i++) {
      const f      = files[i]
      const buf    = Buffer.from(await f.arrayBuffer())
      const hash   = createHash('sha256').update(buf).digest('hex')
      if (clientHashes[i] && clientHashes[i] !== hash) mismatches.push(f.name)

      const ext  = (f.name.split('.').pop() || 'bin').toLowerCase().slice(0, 8)
      const path = `direct/${schoolId}/${ev.id}/${i + 1}-${Date.now()}.${ext}`
      const { error: upErr } = await admin.storage
        .from(BUCKET).upload(path, buf, { upsert: false, contentType: f.type })
      if (upErr) throw new Error(upErr.message)

      const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)
      rows.push({
        evidence_id:  ev.id,
        name:         f.name,
        file_url:     pub?.publicUrl || '',
        file_type:    f.type,
        file_size:    f.size,
        video_url:    null,
        order_num:    i + 1,
        content_hash: hash,
      })
    }

    const { error: filesErr } = await admin.from('evidence_files').insert(rows)
    if (filesErr) throw new Error(filesErr.message)

    /* الملفّ الأساسي في صفّ الدليل — توافقاً مع العروض القائمة */
    await admin.from('evidence').update({
      file_url:  rows[0].file_url,
      file_type: rows[0].file_type,
      file_size: rows[0].file_size,
    }).eq('id', ev.id)

    /* مرساة الدخول: المعيار الفرعي — ويكمل المقيّم المؤشرات عند القبول (3.3) */
    const { error: anchorErr } = await admin.from('evidence_anchors').insert({
      evidence_id:       ev.id,
      framework_node_id: subNodeId,
      kind:              'specific',
      confirm_status:    'confirmed',
      assigned_by:       auth.user.id,
    })
    if (anchorErr) throw new Error(anchorErr.message)
  } catch (e: any) {
    /* تنظيف: لا نترك دليلاً نصفه في المخزن ونصفه خارجه */
    await admin.from('evidence').delete().eq('id', ev.id)
    return NextResponse.json({ error: e.message || 'تعذّر رفع الملفّات' }, { status: 500 })
  }

  return NextResponse.json({
    id: ev.id,
    files: rows.length,
    ...(mismatches.length ? { hashMismatch: mismatches } : {}),
  })
}

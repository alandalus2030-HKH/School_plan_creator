import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * قناة الخطة — دليلٌ يُرفع على مهمّة (الوثيقة §3.1 · 3.2 · 11).
 *
 * POST multipart: الرفع والإدراج والبصمة في **طلبٍ واحد**.
 *
 * ── لماذا انتقل من المتصفّح إلى الخادم ──
 * كانت الشاشة ترفع إلى التخزين ثمّ تُدرج الصفّ من المتصفّح، فاجتمعت
 * فيها ثلاث علل:
 *   ١ **ملفّات يتيمة**: الرفع ينجح ثمّ يُرفض الإدراج (RLS أو غيره)،
 *     فيبقى الملفّ في التخزين بلا صفٍّ يعرفه — ولا أحد يحذفه.
 *   ٢ **`uploaded_by` فارغ**: المتصفّح لا يرسله. ومنعُ التقييم الذاتي
 *     في `review/route.ts` يقارن به — **فلا يمنع شيئاً**، ورسالةُ
 *     الرفض لا تصل رافعَه.
 *   ٣ **البصمة متأخّرة**: كانت تُطلب بنداءٍ تالٍ لا يُعطّل الرفع، فإن
 *     أخفق بقي الملفّ بلا بصمة. وهنا تُحسب **من البايتات وهي مارّة**،
 *     فلا نداءَ ثانيَ ولا فرصةَ لإخفاقه — «نحسبها في الخادم بعد
 *     الاستلام وهي المعتمدة» (11).
 *
 * ── وحراسُ RLS يُعادون هنا بأيدينا ──
 * مفتاح الخدمة **يتجاوز RLS**، فما كانت القاعدة تحرسه يصير مسؤولية
 * هذا المنفذ: الصلاحية · المدرسة الفعّالة · وحالُ المهمّة. وتركُ
 * واحدٍ منها يفتح ما أغلقه 098.
 *
 * ── ولا مراسيَ تُكتب هنا ──
 * `evidence_anchor_inherit` (077) مُشغِّلٌ AFTER INSERT يصعد سلسلة
 * العقد ويكتبها. فكتابتها هنا ازدواج — «الإسناد الموروث» (4.2).
 * والمهمّة المستقلّة بلا عقدة فبلا مرساة، وهو الصواب: تُسنَد عند
 * الفرز كالدليل المباشر.
 */

const BUCKET = 'evidence'
const MAX_FILE  = 25 * 1024 * 1024
const MAX_TOTAL = 60 * 1024 * 1024
const MAX_FILES = 10

const OK_TYPE = (t: string) =>
  t.startsWith('image/') ||
  t === 'application/pdf' ||
  t.startsWith('application/vnd.openxmlformats-officedocument') ||
  t === 'application/msword' ||
  t === 'application/vnd.ms-excel' ||
  t === 'application/vnd.ms-powerpoint'

async function getContext(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles')
    .select('school_id, active_school_id, is_super_admin, role')
    .eq('id', userId).single()
  if (!me) return null
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  const { data: roleData } = await admin.from('roles')
    .select('permissions').eq('code', me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleData?.permissions) ? roleData!.permissions : []
  const can = (p: string) => me.is_super_admin || perms.includes('all') || perms.includes(p)
  return { admin, schoolId, can }
}

/**
 * رقمُ المهمّة من سلسلة عقدها — منقولٌ من الشاشة كما كان.
 * والمهمّة المستقلّة بلا عقدة، فرقمُها `دليل-ن`.
 */
async function taskNumber(admin: any, nodeId: string, orderNum: number): Promise<string | null> {
  const { data: node } = await admin.from('plan_nodes').select('plan_id').eq('id', nodeId).maybeSingle()
  if (!node) return null
  const { data: all } = await admin.from('plan_nodes')
    .select('id, parent_id, order_num, standard_code').eq('plan_id', node.plan_id)
  if (!all) return null

  const chain: any[] = []
  let cur = all.find((n: any) => n.id === nodeId)
  while (cur) {
    chain.unshift(cur)
    cur = all.find((n: any) => n.id === cur!.parent_id)
  }
  let baseIdx = -1
  for (let i = chain.length - 1; i >= 0; i--) if (chain[i].standard_code) { baseIdx = i; break }

  const path: (string | number)[] = []
  if (baseIdx >= 0) {
    path.push(chain[baseIdx].standard_code as string)
    for (let i = baseIdx + 1; i < chain.length; i++) path.push(chain[i].order_num)
  } else {
    for (const c of chain) path.push(c.order_num)
  }
  path.push(orderNum)
  return path.join('.')
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, schoolId, can } = ctx

  /* ── حارسُ الصلاحية (كان في RLS، ومفتاح الخدمة يتجاوزها) ── */
  if (!can('manage_evidence'))
    return NextResponse.json({ error: 'لا تملك صلاحية رفع الأدلة' }, { status: 403 })

  let form: FormData
  try { form = await req.formData() }
  catch { return NextResponse.json({ error: 'تعذّرت قراءة الطلب' }, { status: 400 }) }

  const str = (k: string) => String(form.get(k) ?? '').trim()
  const taskId       = str('task_id')
  const name         = str('name')
  const description  = str('description')
  const evidenceType = str('evidence_type')
  if (!taskId) return NextResponse.json({ error: 'المهمّة مطلوبة' }, { status: 400 })
  if (!name)   return NextResponse.json({ error: 'اسم الدليل مطلوب' }, { status: 400 })

  /* ── حارسُ المدرسة وحالِ المهمّة ──
     `tasks.school_id` عمودٌ منذ 097 — فلا تُسأل الخطةُ عمّا تملكه
     المهمّة، والمستقلّة تمرّ كغيرها. */
  const { data: task } = await admin.from('tasks')
    .select('id, school_id, status, node_id, order_num, required_evidence_types, deleted_at')
    .eq('id', taskId).maybeSingle()
  if (!task || task.deleted_at)
    return NextResponse.json({ error: 'المهمّة غير موجودة' }, { status: 404 })
  if (task.school_id !== schoolId)
    return NextResponse.json({ error: 'المهمّة خارج نطاق مدرستك' }, { status: 403 })
  if (['completed', 'submitted'].includes(String(task.status)))
    return NextResponse.json({
      error: 'المهمّة مُقفلة — والمنجزة سجلُّ اعتمادٍ لا يُعدَّل (024)',
    }, { status: 409 })

  /* نوعُ الدليل إلزاميّ حين تشترط المهمّة أنواعاً — كما في الشاشة */
  const required: string[] = Array.isArray(task.required_evidence_types) ? task.required_evidence_types : []
  if (required.length && !evidenceType)
    return NextResponse.json({ error: 'حدّد نوع الدليل — هذه المهمّة تتطلّب أنواعاً محدّدة' }, { status: 400 })

  /* ── المرفقات: ملفّات وفيديوهات، ويُحفظ ترتيبُ عرضها ── */
  const files  = form.getAll('files').filter((f): f is File => f instanceof File)
  const orders = form.getAll('orders').map(o => Number(o) || 0)
  let videos: any[] = []
  try { videos = JSON.parse(str('videos') || '[]') } catch { videos = [] }
  if (!Array.isArray(videos)) videos = []

  if (!files.length && !videos.length)
    return NextResponse.json({ error: 'أضف ملفاً أو فيديو واحداً على الأقل' }, { status: 400 })
  if (files.length > MAX_FILES)
    return NextResponse.json({ error: `الحدّ ${MAX_FILES} ملفّات في الدليل الواحد` }, { status: 400 })

  let total = 0
  for (const f of files) {
    if (f.size > MAX_FILE) return NextResponse.json({ error: `«${f.name}» يتجاوز 25 ميغابايت` }, { status: 400 })
    if (!OK_TYPE(f.type))   return NextResponse.json({ error: `صيغة «${f.name}» غير مدعومة` }, { status: 400 })
    total += f.size
  }
  if (total > MAX_TOTAL)
    return NextResponse.json({ error: 'إجمالي الحجم يتجاوز 60 ميغابايت — ارفعها على دفعات' }, { status: 400 })

  const clientHashes = form.getAll('hashes').map(h => String(h).toLowerCase())

  /* ── الرقم التسلسليّ للدليل في مهمّته ── */
  const { count } = await admin.from('evidence')
    .select('id', { count: 'exact', head: true })
    .eq('task_id', taskId).is('deleted_at', null)
  const seq = (count || 0) + 1
  const tNum = task.node_id ? await taskNumber(admin, task.node_id, task.order_num || 0) : null
  const evNum = tNum ? `${tNum}.${seq}` : `دليل-${seq}`

  /* ── صفّ الدليل أوّلاً: عليه يُبنى مسار التخزين ──
     و`source` يبقى `plan` — القنوات أربع، ولا خامسةَ للمهمّة
     المستقلّة: استقلالُها **محسوبٌ** من `tasks.node_id` (3.1 · 14). */
  const { data: ev, error: evErr } = await admin.from('evidence')
    .insert({
      school_id:       schoolId,
      task_id:         taskId,
      source:          'plan',
      status:          'pending',
      name,
      description:     description || null,
      evidence_type:   evidenceType || null,
      evidence_number: evNum,
      uploaded_by:     auth.user.id,
      file_url:        '',
    })
    .select('id').single()
  if (evErr || !ev)
    return NextResponse.json({ error: evErr?.message || 'تعذّر إنشاء الدليل' }, { status: 500 })

  /* ── الرفع والبصمة — وما يُرفع يُتتبَّع ليُحذف عند الإخفاق ── */
  const uploaded: string[] = []
  const rows: any[] = []
  const mismatches: string[] = []
  try {
    for (let i = 0; i < files.length; i++) {
      const f    = files[i]
      const buf  = Buffer.from(await f.arrayBuffer())
      const hash = createHash('sha256').update(buf).digest('hex')
      if (clientHashes[i] && clientHashes[i] !== hash) mismatches.push(f.name)

      const ext  = (f.name.split('.').pop() || 'bin').toLowerCase().slice(0, 8)
      const path = `tasks/${schoolId}/${ev.id}/${i + 1}-${Date.now()}.${ext}`
      const { error: upErr } = await admin.storage
        .from(BUCKET).upload(path, buf, { upsert: false, contentType: f.type })
      if (upErr) throw new Error(upErr.message)
      uploaded.push(path)

      const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)
      rows.push({
        evidence_id:  ev.id,
        name:         f.name,
        file_url:     pub?.publicUrl || '',
        file_type:    f.type,
        file_size:    f.size,
        video_url:    null,
        order_num:    orders[i] || (i + 1),
        content_hash: hash,
      })
    }

    /* الفيديو رابطٌ لا بايتات — فلا بصمةَ له، والبصمة تُثبت ثبات ملفّ */
    for (const v of videos.slice(0, MAX_FILES)) {
      const vid = String(v?.videoId || '').trim()
      if (!vid) continue
      rows.push({
        evidence_id:  ev.id,
        name:         String(v?.title || 'فيديو'),
        file_url:     `https://img.youtube.com/vi/${vid}/maxresdefault.jpg`,
        file_type:    'video/youtube',
        file_size:    0,
        video_url:    String(v?.videoUrl || ''),
        order_num:    Number(v?.order) || (rows.length + 1),
        content_hash: null,
      })
    }
    if (!rows.length) throw new Error('لا مرفقات صالحة')

    rows.sort((a, b) => a.order_num - b.order_num)
    const { error: filesErr } = await admin.from('evidence_files').insert(rows)
    if (filesErr) throw new Error(filesErr.message)

    /* الملفّ الأساسي في صفّ الدليل — توافقاً مع العروض القائمة */
    await admin.from('evidence').update({
      file_url:  rows[0].file_url,
      file_type: rows[0].file_type,
      file_size: rows[0].file_size,
      video_url: rows[0].video_url,
      last_fixity_at: new Date().toISOString(),
    }).eq('id', ev.id)
  } catch (e: any) {
    /* ── التنظيف: لا صفٌّ يتيم ولا ملفٌّ يتيم ──
       وهو ما لم يكن في المسار القديم: كان الملفّ يُرفع ثمّ يُرفض
       الصفّ، فيبقى في التخزين بلا شيءٍ يعرفه. */
    await admin.from('evidence').delete().eq('id', ev.id)
    if (uploaded.length) await admin.storage.from(BUCKET).remove(uploaded)
    return NextResponse.json({ error: e.message || 'تعذّر رفع الملفّات' }, { status: 500 })
  }

  return NextResponse.json({
    id: ev.id,
    evidenceNumber: evNum,
    files: rows.length,
    ...(mismatches.length ? { hashMismatch: mismatches } : {}),
  })
}

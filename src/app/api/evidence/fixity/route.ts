import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAudit } from '@/lib/audit'

/**
 * البصمة: الختم والفحص الدوريّ — الوثيقة 11
 *
 * POST { evidenceId }            → **ختم**: يبصم ملفّات دليلٍ لم تُبصَم بعد.
 * POST { scope: 'school', limit }→ **فحصٌ دوريّ**: يُعيد حساب البصمات ويقارنها.
 * GET                            → حال الأرشيف: مبصوم · بلا بصمة · متبدّل · مفقود.
 *
 * ── لماذا الخادم ──
 * «ونحسبها مرّتين: في المتصفّح قبل الرفع (`crypto.subtle`) لكشف المكرّر
 *  قبل إرسال مئتي ملفّ · **وفي الخادم بعد الاستلام وهي المعتمدة**،
 *  لأن ما يأتي من المتصفّح يُزوَّر. ولا نعتمد ETag التخزين — غالباً MD5
 *  ويختلف حسابه في الرفع المُجزّأ.»
 *
 * فالبصمة هنا تُحسب من **بايتات الملفّ المنزَّلة من التخزين**، لا ممّا
 * يقوله العميل ولا ممّا يقوله مزوّد التخزين.
 *
 * ── ولماذا دالّةٌ واحدة للختم والفحص ──
 * العملية واحدة: نزِّل، احسب، قارن. والفرق في المرجع: الختم يكتب
 * البصمة أوّل مرّة، والفحص يقارنها بالمخزَّنة ويُبلّغ عن الاختلاف —
 * «والقيمة أن يُكتشف التلف **قبل أن تُطلب الأدلة، لا يوم الزيارة**».
 */

const BUCKET_GUESS = ['evidence', 'files', 'public']

/** من رابط التخزين إلى (الدلو · المسار) — يحتمل الرابط العامّ والموقَّع */
function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  try {
    const u = new URL(url)
    /* /storage/v1/object/public/<bucket>/<path>  أو  .../sign/<bucket>/<path> */
    const m = u.pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/)
    if (m) return { bucket: m[1], path: decodeURIComponent(m[2]) }
    return null
  } catch { return null }
}

async function hashOne(admin: any, fileUrl: string): Promise<{ hash?: string; missing?: boolean }> {
  const loc = parseStorageUrl(fileUrl)
  if (!loc) return { missing: true }
  const { data, error } = await admin.storage.from(loc.bucket).download(loc.path)
  if (error || !data) {
    /* دلوٌ آخر ربّما — الروابط القديمة قد تحمل اسماً مختلفاً */
    for (const b of BUCKET_GUESS) {
      if (b === loc.bucket) continue
      const alt = await admin.storage.from(b).download(loc.path)
      if (!alt.error && alt.data) {
        const buf = Buffer.from(await alt.data.arrayBuffer())
        return { hash: createHash('sha256').update(buf).digest('hex') }
      }
    }
    return { missing: true }
  }
  const buf = Buffer.from(await data.arrayBuffer())
  return { hash: createHash('sha256').update(buf).digest('hex') }
}

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

/** ملفّات أدلة المدرسة — مع رابطها وبصمتها المخزَّنة */
async function schoolFiles(admin: any, schoolId: string, evidenceId?: string) {
  let q = admin.from('evidence').select('id, name, code, status').eq('school_id', schoolId).is('deleted_at', null)
  if (evidenceId) q = q.eq('id', evidenceId)
  const { data: evs } = await q
  const ids = (evs || []).map((e: any) => e.id)
  if (!ids.length) return { evs: [], files: [] }
  const { data: files } = await admin.from('evidence_files')
    .select('id, evidence_id, name, file_url, content_hash, last_fixity_at, fixity_status')
    .in('evidence_id', ids)
  return { evs: evs || [], files: files || [] }
}

export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await ctxOf(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, schoolId, can } = ctx
  if (!can('view_evidence') && !can('triage_evidence')) {
    return NextResponse.json({ error: 'لا تملك صلاحية الأدلة' }, { status: 403 })
  }

  const { files } = await schoolFiles(admin, schoolId)
  const stamped = files.filter((f: any) => !!f.content_hash)
  return NextResponse.json({
    total: files.length,
    stamped: stamped.length,
    unstamped: files.length - stamped.length,
    mismatch: files.filter((f: any) => f.fixity_status === 'mismatch').length,
    missing:  files.filter((f: any) => f.fixity_status === 'missing').length,
    lastCheck: stamped.map((f: any) => f.last_fixity_at).filter(Boolean).sort().pop() || null,
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await ctxOf(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, schoolId, can } = ctx

  const body = await req.json().catch(() => ({} as any))
  const evidenceId: string | undefined = typeof body.evidenceId === 'string' ? body.evidenceId : undefined
  const sweep = body.scope === 'school'
  const limit = Math.min(Math.max(Number(body.limit) || 60, 1), 200)

  /* الختم يكفيه رفعُ الدليل · والفحص الدوريّ قرارٌ إداريّ */
  if (sweep ? !can('triage_evidence') : !can('manage_evidence')) {
    return NextResponse.json({ error: 'لا تملك صلاحية هذا الإجراء' }, { status: 403 })
  }
  if (!sweep && !evidenceId) return NextResponse.json({ error: 'الدليل مطلوب' }, { status: 400 })

  const { files } = await schoolFiles(admin, schoolId, evidenceId)
  /* الختم: ما لم يُبصَم بعد · الفحص: الأقدم فحصاً أوّلاً */
  const targets = (sweep
    ? [...files].sort((a: any, b: any) =>
        String(a.last_fixity_at || '').localeCompare(String(b.last_fixity_at || '')))
    : files.filter((f: any) => !f.content_hash)
  ).slice(0, limit)

  const now = new Date().toISOString()
  const today = now.slice(0, 10)
  const report = { checked: 0, stamped: 0, ok: 0, mismatch: 0, missing: 0,
                   changed: [] as { file: string; evidence: string }[] }

  for (const f of targets) {
    const { hash, missing } = await hashOne(admin, f.file_url)
    report.checked++
    if (missing || !hash) {
      report.missing++
      await admin.from('evidence_files')
        .update({ fixity_status: 'missing', last_fixity_at: today }).eq('id', f.id)
      continue
    }
    if (!f.content_hash) {
      report.stamped++
      await admin.from('evidence_files')
        .update({ content_hash: hash, fixity_status: 'ok', last_fixity_at: today }).eq('id', f.id)
      continue
    }
    if (f.content_hash === hash) {
      report.ok++
      await admin.from('evidence_files').update({ fixity_status: 'ok', last_fixity_at: today }).eq('id', f.id)
    } else {
      /* **البصمة المخزَّنة لا تُستبدَل**: هي المرجع، والاختلاف واقعةٌ تُبلَّغ
         لا تُسوّى صامتةً — وإلّا ضاع ما بُنيت البصمة لكشفه (11). */
      report.mismatch++
      report.changed.push({ file: f.name, evidence: f.evidence_id })
      await admin.from('evidence_files')
        .update({ fixity_status: 'mismatch', last_fixity_at: today }).eq('id', f.id)
    }
  }

  if (sweep || report.mismatch || report.missing) {
    await recordAudit({
      req, userId: auth.user.id, schoolId,
      action: 'update', table: 'evidence_files', recordId: evidenceId || schoolId,
      after: { fixity: sweep ? 'فحصٌ دوريّ' : 'ختم', ...report, changed: undefined },
    })
  }

  return NextResponse.json({ done: true, ...report })
}

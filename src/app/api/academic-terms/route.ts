import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAudit } from '@/lib/audit'

/**
 * فصول العام الدراسي — مصدرُ كل تاريخٍ فصليّ في النظام.
 *
 * GET  ?year=2026-2027   → فصول ذلك العام
 * PUT  { year, terms[] } → تُستبدل فصول العام كلّها دفعةً واحدة
 *
 * ── ولماذا استبدالٌ لا تعديلُ صفّ ──
 * الفصول تُقرأ معاً لا فُرادى: عددُها وحدودها نظامٌ واحد، وتعديل
 * فصلٍ بمفرده يفتح ثغرةً بينه وبين جاره أو تداخلاً معه. فالشاشة
 * تعرضها جدولاً واحداً، والحفظ يكتب النظام كلّه — وحارسُ التداخل
 * في القاعدة يردّ ما لا يستقيم.
 *
 * ── والتواريخ لا تُخترع ──
 * ما لم تُعرَّف فصول العام، **لا يفتح محرّك الدورات شيئاً** — ولا
 * يرجع إلى افتراضٍ مستور. فجوةٌ ظاهرة خيرٌ من دورةٍ بتاريخٍ مخترَع.
 */

const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']
const YEAR_RE = /^\d{4}-\d{4}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

async function ctxOf(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles')
    .select('id, school_id, active_school_id, is_super_admin, role')
    .eq('id', userId).single()
  if (!me) return null
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  return { admin, me, schoolId }
}

async function canManage(admin: any, role: string, isSuper: boolean) {
  if (isSuper || ADMIN_ROLES.includes(role)) return true
  const { data: roleRow } = await admin.from('roles').select('permissions').eq('code', role).maybeSingle()
  const perms: string[] = Array.isArray(roleRow?.permissions) ? roleRow!.permissions : []
  return perms.includes('all') || perms.includes('manage_settings')
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await ctxOf(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, schoolId } = ctx

  const year = String(req.nextUrl.searchParams.get('year') || '').trim()
  let q = admin.from('academic_terms')
    .select('id, academic_year, term_no, name_ar, start_date, end_date, mid_date')
    .eq('school_id', schoolId)
  if (year) q = q.eq('academic_year', year)

  const { data, error } = await q.order('academic_year').order('term_no')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ terms: data || [] })
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await ctxOf(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, me, schoolId } = ctx
  if (!(await canManage(admin, me.role, me.is_super_admin)))
    return NextResponse.json({ error: 'لا تملك صلاحية إدارة التقويم' }, { status: 403 })

  const b = await req.json().catch(() => ({} as any))
  const year = String(b.year || '').trim()
  if (!YEAR_RE.test(year))
    return NextResponse.json({ error: 'العام الدراسي بصيغة 2026-2027' }, { status: 400 })

  const raw: any[] = Array.isArray(b.terms) ? b.terms : []
  if (raw.length > 6)
    return NextResponse.json({ error: 'ستّة فصولٍ حدٌّ أقصى' }, { status: 400 })

  const rows = raw.map((t, i) => ({
    school_id: schoolId,
    academic_year: year,
    term_no: Number(t.term_no) || i + 1,
    name_ar: String(t.name_ar || '').trim(),
    start_date: String(t.start_date || '').trim(),
    end_date: String(t.end_date || '').trim(),
    mid_date: String(t.mid_date || '').trim() || null,
    created_by: auth.user.id,
  }))

  for (const r of rows) {
    if (!r.name_ar) return NextResponse.json({ error: 'كل فصلٍ يلزمه اسم' }, { status: 400 })
    if (!DATE_RE.test(r.start_date) || !DATE_RE.test(r.end_date))
      return NextResponse.json({ error: `«${r.name_ar}»: تاريخا البداية والنهاية مطلوبان` }, { status: 400 })
    if (r.end_date < r.start_date)
      return NextResponse.json({ error: `«${r.name_ar}»: النهاية قبل البداية` }, { status: 400 })
    if (r.mid_date && (r.mid_date < r.start_date || r.mid_date >= r.end_date))
      return NextResponse.json({
        error: `«${r.name_ar}»: نصف الفصل خارج حدّيه — وهو آخر يومٍ في النصف الأول`,
      }, { status: 400 })
  }

  /* الاستبدال: تُحذف فصول العام ثمّ تُكتب — فالنظام يُقرأ معاً لا فُرادى */
  const { error: delErr } = await admin.from('academic_terms')
    .delete().eq('school_id', schoolId).eq('academic_year', year)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  if (rows.length) {
    const { error: insErr } = await admin.from('academic_terms').insert(rows)
    /* حارسُ التداخل في القاعدة يردّ برسالةٍ مفهومة — تُمرَّر كما هي */
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 409 })
  }

  await recordAudit({
    req, userId: auth.user.id, schoolId,
    action: 'update', table: 'academic_terms', recordId: year,
    after: { year, terms: rows.length },
  })

  return NextResponse.json({ saved: rows.length })
}

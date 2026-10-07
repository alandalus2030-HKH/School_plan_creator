import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAudit } from '@/lib/audit'

/**
 * فرق التركيز الخمسة وأعضاؤها — الوثيقة 3.2 · 3.6
 *
 * GET  → الفرق الخمسة بأعضائها + منسوبو المدرسة للاختيار منهم.
 * POST → { teamId, profileId, action: 'add' | 'remove' | 'lead' }
 *
 * ولماذا شاشةٌ لها أصلاً: «توزيع الحمل على خمسة فرق — 400 دليل للفريق
 * لا طابور واحد يختنق» (3.6). وبلا أعضاء يبقى الطابور واحداً مهما
 * كثرت الفرق — فالعضوية شرطُ المعنى لا زينةً.
 *
 * والفرق تُبذَر لكل مدرسة في 074 بـ`standard_code` ('1'..'5') لا
 * بمعرّف عقدة — فالعقد تتبدّل بين إصدارات الإطار والرموز لا تتبدّل.
 */

const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']

async function getContext(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles')
    .select('school_id, active_school_id, is_super_admin, role').eq('id', userId).single()
  if (!me) return null
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  const { data: roleRow } = await admin.from('roles').select('permissions').eq('code', me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleRow?.permissions) ? roleRow!.permissions : []
  const can = (p: string) => me.is_super_admin || perms.includes('all') || ADMIN_ROLES.includes(me.role) || perms.includes(p)
  return { admin, me, schoolId, can }
}

export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, schoolId, can } = ctx
  if (!can('triage_evidence')) return NextResponse.json({ error: 'لا تملك صلاحية فرق التركيز' }, { status: 403 })

  const { data: teams } = await admin.from('focus_teams')
    .select('id, name_ar, standard_code, lead_id, sort_order, is_active')
    .eq('school_id', schoolId).order('sort_order')

  const teamIds = (teams || []).map((t: any) => t.id)
  const { data: members } = teamIds.length
    ? await admin.from('focus_team_members').select('team_id, profile_id, role_in_team').in('team_id', teamIds)
    : { data: [] as any[] }

  const { data: people } = await admin.from('profiles')
    .select('id, name_ar, job_title, department, role, is_active')
    .eq('school_id', schoolId).eq('is_active', true).order('name_ar')

  return NextResponse.json({ teams: teams || [], members: members || [], people: people || [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, schoolId, can } = ctx
  /* تشكيل الفرق قرارٌ إداريّ — لا يكفيه الفرز */
  if (!can('accept_evidence')) {
    return NextResponse.json({ error: 'تشكيل الفرق يتطلّب صلاحية قبول الأدلة' }, { status: 403 })
  }

  const { teamId, profileId, action } = await req.json().catch(() => ({} as any))
  if (!teamId || !profileId || !['add', 'remove', 'lead'].includes(action)) {
    return NextResponse.json({ error: 'طلبٌ ناقص' }, { status: 400 })
  }

  /* الفريق والشخص من المدرسة الفعّالة — لا تسريب عبر المدارس */
  const [{ data: team }, { data: person }] = await Promise.all([
    admin.from('focus_teams').select('id, school_id, name_ar').eq('id', teamId).maybeSingle(),
    admin.from('profiles').select('id, school_id, name_ar').eq('id', profileId).maybeSingle(),
  ])
  if (!team || team.school_id !== schoolId) return NextResponse.json({ error: 'الفريق خارج نطاق مدرستك' }, { status: 403 })
  if (!person || person.school_id !== schoolId) return NextResponse.json({ error: 'العضو خارج نطاق مدرستك' }, { status: 403 })

  if (action === 'add') {
    const { error } = await admin.from('focus_team_members')
      .upsert({ team_id: teamId, profile_id: profileId, role_in_team: 'member' }, { onConflict: 'team_id,profile_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (action === 'remove') {
    const { error } = await admin.from('focus_team_members')
      .delete().eq('team_id', teamId).eq('profile_id', profileId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    /* ولا يبقى قائداً من خرج */
    await admin.from('focus_teams').update({ lead_id: null }).eq('id', teamId).eq('lead_id', profileId)
  } else {
    /* القائد عضوٌ أولاً — فلا يُقاد فريقٌ من خارجه */
    await admin.from('focus_team_members')
      .upsert({ team_id: teamId, profile_id: profileId, role_in_team: 'lead' }, { onConflict: 'team_id,profile_id' })
    const { error } = await admin.from('focus_teams').update({ lead_id: profileId }).eq('id', teamId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await recordAudit({
    req, userId: auth.user.id, schoolId,
    action: 'update', table: 'focus_team_members', recordId: teamId,
    after: { action, team: team.name_ar, person: person.name_ar },
  })

  return NextResponse.json({ ok: true })
}

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/evidence/queue — طابور الفرز (الوثيقة 3.2 · 3.6)
 *
 * يُرجع الأدلة المعلّقة في المدرسة الفعّالة، **الأقدم أولاً** — فالدليل
 * الذي طال انتظاره أحقّ بالنظر. ومع كل دليل ما يحتاجه الفارز في بطاقةٍ
 * واحدة: مراسيه بأسمائها · فريقه المالك المقترَح · رافعه · مهمّته إن
 * كانت · وهل يفلت من حاجز القبول (مرساة · عام).
 *
 * والتقسيم على الفرق هو ما يمنع «طابوراً واحداً يختنق» (3.6): يُرجع
 * `myTeams` ليُرشَّح الطابور على فرق المستخدم، و`teams` لعرض الكلّ.
 */

async function getContext(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles')
    .select('school_id, active_school_id, is_super_admin, role').eq('id', userId).single()
  if (!me) return null
  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  return { admin, me, schoolId }
}

export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const ctx = await getContext(auth.user.id)
  if (!ctx?.schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })
  const { admin, me, schoolId } = ctx

  const { data: roleRow } = await admin.from('roles').select('permissions').eq('code', me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleRow?.permissions) ? roleRow!.permissions : []
  const can = (p: string) => me.is_super_admin || perms.includes('all') || perms.includes(p)
  if (!can('triage_evidence')) {
    return NextResponse.json({ error: 'لا تملك صلاحية فرز الأدلة' }, { status: 403 })
  }

  const [{ data: rows }, { data: teams }, { data: myMemberships }, { data: reasons }] = await Promise.all([
    admin.from('evidence')
      .select('id, name, description, file_url, file_type, file_size, video_url, evidence_type, ' +
              'source, reason_code, academic_year, document_date, created_at, uploaded_by, ' +
              'owner_team_id, task_id, code, status')
      .eq('school_id', schoolId).eq('status', 'pending').is('deleted_at', null)
      .order('created_at', { ascending: true }).limit(300),
    admin.from('focus_teams').select('id, name_ar, standard_code, sort_order')
      .eq('school_id', schoolId).eq('is_active', true).order('sort_order'),
    admin.from('focus_team_members').select('team_id').eq('profile_id', auth.user.id),
    admin.from('dropdown_options').select('value').eq('category', 'evidence_reject_reason')
      .eq('is_active', true).order('sort_order'),
  ])

  const list = rows || []
  const ids  = list.map((e: any) => e.id)

  /* المراسي بأسمائها — ليحكم الفارز على ما يغطّيه الدليل لا على معرّفات */
  const { data: anchors } = ids.length
    ? await admin.from('evidence_anchors')
        .select('evidence_id, framework_node_id, kind, confirm_status').in('evidence_id', ids)
    : { data: [] as any[] }
  const fIds = [...new Set((anchors || []).map((a: any) => a.framework_node_id))]
  const { data: fNodes } = fIds.length
    ? await admin.from('framework_nodes').select('id, code, name_ar, level').in('id', fIds)
    : { data: [] as any[] }
  const fById = new Map((fNodes || []).map((n: any) => [n.id, n]))

  const anchorsOf: Record<string, any[]> = {}
  for (const a of anchors || []) {
    const n = fById.get(a.framework_node_id)
    ;(anchorsOf[a.evidence_id] ||= []).push({
      id: a.framework_node_id, code: n?.code || '', name: n?.name_ar || '',
      level: n?.level ?? null, kind: a.kind, confirm_status: a.confirm_status,
    })
  }

  /* الرافعون والمهامّ — أسماءٌ لا معرّفات */
  const upIds = [...new Set(list.map((e: any) => e.uploaded_by).filter(Boolean))]
  const { data: profs } = upIds.length
    ? await admin.from('profiles').select('id, name_ar').in('id', upIds)
    : { data: [] as any[] }
  const nameOf = new Map((profs || []).map((p: any) => [p.id, p.name_ar]))

  const taskIds = [...new Set(list.map((e: any) => e.task_id).filter(Boolean))]
  const { data: tasks } = taskIds.length
    ? await admin.from('tasks').select('id, name_ar').in('id', taskIds)
    : { data: [] as any[] }
  const taskOf = new Map((tasks || []).map((t: any) => [t.id, t.name_ar]))

  const myTeamIds = (myMemberships || []).map((m: any) => m.team_id)

  const items = list.map((e: any) => {
    const anc = anchorsOf[e.id] || []
    return {
      ...e,
      uploader: nameOf.get(e.uploaded_by) || '—',
      taskName: e.task_id ? (taskOf.get(e.task_id) || null) : null,
      anchors:  anc,
      /* حاجزا القبول — تُعرَض للفارز قبل أن يضغط فيُمنع (3.3 · 3.6.1) */
      blockers: [
        anc.length ? null : 'بلا مرساة',
        /^\d{4}-\d{4}$/.test(e.academic_year || '') ? null : 'بلا عامٍ منسوب',
      ].filter(Boolean),
      isMine: e.uploaded_by === auth.user.id,
    }
  })

  return NextResponse.json({
    items,
    teams: teams || [],
    myTeamIds,
    rejectReasons: (reasons || []).map((r: any) => r.value),
    canAccept: can('accept_evidence'),
    total: items.length,
  })
}

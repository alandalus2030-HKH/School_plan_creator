import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * مخزن الاعتماد — قراءة أدلة القناة المباشرة (وما لا يرتبط بمهمّة).
 * المرجع: docs/QNSA_ACCREDITATION_ARCHITECTURE.html §3
 *
 * قائمة **للقراءة فقط** ريثما تُبنى شاشة الفرز (م1‑4). وهي تعرض ما لا
 * تراه خزانة الأدلة: تلك مبنيّة على الخطط، ودليلُ المخزن بلا مهمّة.
 *
 * العزل: المدرسة الفعّالة (يحترم التقمّص). القراءة بـ service role
 * مُقيَّدة يدوياً بـ school_id.
 */

const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']

export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles')
    .select('school_id, active_school_id, is_super_admin, role')
    .eq('id', auth.user.id).single()
  if (!me) return NextResponse.json({ error: 'تعذّر تحديد الحساب' }, { status: 400 })

  const schoolId = (me.is_super_admin && me.active_school_id) ? me.active_school_id : me.school_id
  if (!schoolId) return NextResponse.json({ error: 'لا توجد مدرسة مرتبطة' }, { status: 400 })

  const { data: roleData } = await admin
    .from('roles').select('permissions').eq('code', me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleData?.permissions) ? roleData!.permissions : []
  const isAdmin = me.is_super_admin || ADMIN_ROLES.includes(me.role)
  if (!(isAdmin || perms.includes('all') || perms.includes('view_evidence')))
    return NextResponse.json({ error: 'لا تملك صلاحية عرض المخزن' }, { status: 403 })

  /* ── الأدلة غير المرتبطة بمهمّة ── */
  const { data: rows, error } = await admin
    .from('evidence')
    .select('id, name, description, status, source, academic_year, document_date, evidence_type, reason_code, code, owner_team_id, uploaded_by, created_at')
    .eq('school_id', schoolId)
    .is('task_id', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (rows || []).map(r => r.id)
  if (!ids.length) return NextResponse.json({ evidence: [] })

  /* ── الملفّات · المراسي · الفرق · الرافعون (استعلامات مستقلّة، بلا تضمين) ── */
  const [filesRes, anchorsRes, teamsRes, usersRes] = await Promise.all([
    admin.from('evidence_files')
      .select('evidence_id, content_hash, file_size, order_num').in('evidence_id', ids),
    admin.from('evidence_anchors')
      .select('evidence_id, framework_node_id, kind, confirm_status').in('evidence_id', ids),
    admin.from('focus_teams').select('id, name_ar, standard_code').eq('school_id', schoolId),
    admin.from('profiles').select('id, full_name_ar, name_ar')
      .in('id', [...new Set((rows || []).map(r => r.uploaded_by).filter(Boolean))] as string[]),
  ])

  const nodeIds = [...new Set((anchorsRes.data || []).map((a: any) => a.framework_node_id))]
  const { data: nodes } = nodeIds.length
    ? await admin.from('framework_nodes').select('id, code, name_ar').in('id', nodeIds)
    : { data: [] as any[] }

  const nodeById = new Map((nodes || []).map((n: any) => [n.id, n]))
  const teamById = new Map((teamsRes.data || []).map((t: any) => [t.id, t]))
  const userById = new Map((usersRes.data || []).map((u: any) => [u.id, u.full_name_ar || u.name_ar || '']))

  const filesOf   = new Map<string, any[]>()
  for (const f of filesRes.data || []) {
    if (!filesOf.has(f.evidence_id)) filesOf.set(f.evidence_id, [])
    filesOf.get(f.evidence_id)!.push(f)
  }
  const anchorsOf = new Map<string, any[]>()
  for (const a of anchorsRes.data || []) {
    if (!anchorsOf.has(a.evidence_id)) anchorsOf.set(a.evidence_id, [])
    anchorsOf.get(a.evidence_id)!.push(a)
  }

  const evidence = (rows || []).map(r => {
    const files   = (filesOf.get(r.id) || []).sort((a, b) => a.order_num - b.order_num)
    const anchors = (anchorsOf.get(r.id) || []).map(a => {
      const n = nodeById.get(a.framework_node_id)
      return { code: n?.code || '', name: n?.name_ar || '', kind: a.kind, confirmStatus: a.confirm_status }
    })
    const team = r.owner_team_id ? teamById.get(r.owner_team_id) : null
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      status: r.status,
      source: r.source,
      academicYear: r.academic_year,
      documentDate: r.document_date,
      type: r.evidence_type,
      reason: r.reason_code,
      code: r.code,
      team: team ? { name: team.name_ar, standard: team.standard_code } : null,
      uploader: userById.get(r.uploaded_by) || '',
      createdAt: r.created_at,
      files: files.length,
      size: files.reduce((s, f) => s + (f.file_size || 0), 0),
      hash: files[0]?.content_hash || null,
      anchors,
    }
  })

  return NextResponse.json({ evidence })
}

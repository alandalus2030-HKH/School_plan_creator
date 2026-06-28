import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAudit } from '@/lib/audit'

async function ensureSuperAdmin(userId: string) {
  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles').select('is_super_admin').eq('id', userId).single()
  return me?.is_super_admin === true ? admin : null
}

/* ════ GET: قائمة المجموعات + عدد مدارسها ════ */
export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const admin = await ensureSuperAdmin(auth.user.id)
  if (!admin) return NextResponse.json({ error: 'متاح لمشرف النظام فقط' }, { status: 403 })

  const [{ data: groups }, { data: schools }, { data: owners }] = await Promise.all([
    admin.from('school_groups').select('id, name_ar, name_en, is_active, created_at').order('created_at'),
    admin.from('schools').select('id, group_id'),
    admin.from('profiles').select('id, name_ar, email, owned_group_id').eq('is_group_owner', true),
  ])

  const result = (groups || []).map(g => ({
    ...g,
    school_count: (schools || []).filter(s => s.group_id === g.id).length,
    owner: (owners || []).find(o => o.owned_group_id === g.id) || null,
  }))

  return NextResponse.json({ groups: result })
}

/* ════ POST: إنشاء مجموعة ════ */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const admin = await ensureSuperAdmin(auth.user.id)
  if (!admin) return NextResponse.json({ error: 'متاح لمشرف النظام فقط' }, { status: 403 })

  const { name_ar, name_en } = await req.json()
  if (!name_ar?.trim()) return NextResponse.json({ error: 'اسم المجموعة مطلوب' }, { status: 400 })

  const { data, error } = await admin
    .from('school_groups')
    .insert({ name_ar: name_ar.trim(), name_en: name_en?.trim() || null })
    .select('id, name_ar')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await recordAudit({ req, userId: auth.user.id, schoolId: null, action: 'insert', table: 'school_groups', recordId: data.id, after: { name_ar: data.name_ar } })
  return NextResponse.json({ ok: true, group: data })
}

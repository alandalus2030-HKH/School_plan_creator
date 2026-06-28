import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/audit — عارض سجل التدقيق (مع فلاتر)
 * الوصول: مشرف المنصة (كل المدارس) أو صاحب manage_settings (مدرسته فقط).
 * المعاملات: user, table, action, from, to, q, limit, offset
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const admin = createAdminClient()

  const { data: me } = await admin
    .from('profiles').select('school_id, active_school_id, is_super_admin, role').eq('id', auth.user.id).single()
  if (!me) return NextResponse.json({ error: 'تعذّر تحديد الملف' }, { status: 400 })

  const { data: roleData } = await admin.from('roles').select('permissions').eq('code', me.role).maybeSingle()
  const perms: string[] = Array.isArray(roleData?.permissions) ? roleData!.permissions : []
  const canView = me.is_super_admin || perms.includes('all') || perms.includes('manage_settings')
  if (!canView) return NextResponse.json({ error: 'لا تملك صلاحية عرض سجل التدقيق' }, { status: 403 })

  const sp = req.nextUrl.searchParams
  const limit  = Math.min(Number(sp.get('limit')) || 50, 200)
  const offset = Number(sp.get('offset')) || 0

  let q = admin.from('audit_logs')
    .select('id, school_id, user_id, action, table_name, record_id, old_values, new_values, ip_address, user_agent, created_at', { count: 'exact' })

  /* عزل المدرسة: مشرف المنصة يرى الكل؛ غيره مدرسته فقط (الفعّالة عند التقمّص) */
  if (!me.is_super_admin) {
    const schoolId = me.active_school_id || me.school_id
    q = q.eq('school_id', schoolId)
  }

  if (sp.get('user'))   q = q.eq('user_id', sp.get('user'))
  if (sp.get('table'))  q = q.eq('table_name', sp.get('table'))
  if (sp.get('action')) q = q.eq('action', sp.get('action'))
  if (sp.get('from'))   q = q.gte('created_at', sp.get('from'))
  if (sp.get('to'))     q = q.lte('created_at', sp.get('to') + 'T23:59:59')
  const text = sp.get('q')
  if (text) q = q.or(`action.ilike.%${text}%,table_name.ilike.%${text}%,record_id.ilike.%${text}%`)

  const { data: logs, count } = await q.order('created_at', { ascending: false }).range(offset, offset + limit - 1)

  /* أسماء المستخدمين */
  const userIds = [...new Set((logs || []).map(l => l.user_id).filter(Boolean))]
  const names = new Map<string, string>()
  if (userIds.length) {
    const { data: p } = await admin.from('profiles').select('id, name_ar, email').in('id', userIds as string[])
    for (const x of p || []) names.set(x.id, x.name_ar || x.email || '—')
  }

  const rows = (logs || []).map(l => ({
    ...l,
    user_name: l.user_id ? (names.get(l.user_id) || 'مستخدم محذوف') : 'النظام',
  }))

  /* قوائم الفلاتر المتاحة */
  const { data: distinctActors } = await admin.from('profiles').select('id, name_ar').order('name_ar').limit(500)

  return NextResponse.json({
    rows, total: count ?? rows.length, limit, offset,
    actors: (distinctActors || []).map(a => ({ id: a.id, name: a.name_ar })),
  })
}

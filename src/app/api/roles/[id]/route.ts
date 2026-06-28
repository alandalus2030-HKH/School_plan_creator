import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAudit } from '@/lib/audit'

/**
 * DELETE /api/roles/[id] → حذف دور مخصّص
 * نمط AWS/Google/Salesforce: يُمنع حذف دور مُستخدَم حتى يُنقل مستخدموه أولاً.
 * حراسة: manage_settings أو manage_roles (أو مشرف/all) + منع حذف الأدوار النظامية.
 */
const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { id } = await context.params
  const admin = createAdminClient()

  const { data: me } = await admin
    .from('profiles').select('is_super_admin, role').eq('id', auth.user.id).single()
  if (!me) return NextResponse.json({ error: 'تعذّر تحديد المستخدم' }, { status: 403 })

  let allowed = me.is_super_admin === true || ADMIN_ROLES.includes(me.role || '')
  if (!allowed && me.role) {
    const { data: rd } = await admin.from('roles').select('permissions').eq('code', me.role).maybeSingle()
    const perms: string[] = Array.isArray(rd?.permissions) ? rd!.permissions : []
    allowed = perms.includes('all') || perms.includes('manage_settings') || perms.includes('manage_roles')
  }
  if (!allowed) return NextResponse.json({ error: 'لا تملك صلاحية إدارة الأدوار' }, { status: 403 })

  const { data: role } = await admin
    .from('roles').select('id, code, name_ar, is_system').eq('id', id).maybeSingle()
  if (!role) return NextResponse.json({ error: 'الدور غير موجود' }, { status: 404 })
  if (role.is_system) {
    return NextResponse.json({ error: 'لا يمكن حذف دور نظامي' }, { status: 403 })
  }

  /* الحارس: المستخدمون الحاملون لهذا الدور (عبر كل المدارس — service role) */
  const { data: holders, error: cntErr } = await admin
    .from('profiles').select('id, name_ar, school:schools!school_id(name_ar)')
    .eq('role', role.code).order('name_ar')
  if (cntErr) return NextResponse.json({ error: 'تعذّر التحقق من المستخدمين' }, { status: 500 })
  if ((holders?.length || 0) > 0) {
    const users = (holders || []).map((h: any) => ({
      name: h.name_ar || '—',
      school: h.school?.name_ar || null,
    }))
    return NextResponse.json(
      {
        error: `لا يمكن حذف الدور — مُسنَد إلى ${users.length} مستخدم. انقلهم إلى دور آخر أولاً ثم احذفه.`,
        inUse: users.length,
        users,
      },
      { status: 409 },
    )
  }

  const { data: deleted, error: delErr } = await admin
    .from('roles').delete().eq('id', id).select('id')
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: 'لم يُحذف أي صف' }, { status: 500 })
  }
  await recordAudit({ req, userId: auth.user.id, schoolId: null, action: 'delete', table: 'roles', recordId: id, before: { code: role.code, name_ar: role.name_ar } })
  return NextResponse.json({ ok: true })
}

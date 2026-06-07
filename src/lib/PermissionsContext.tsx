'use client'

/* ══════════════════════════════════════════════════════
   سياق الصلاحيات — يُحمَّل مرة واحدة في layout الـ Dashboard
   ويتاح لأي مكوّن عبر usePermissions()
══════════════════════════════════════════════════════ */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { createClient } from './supabase/client'

export type PermsCtx = {
  userId:      string
  userName:    string
  userEmail:   string
  role:        string
  permissions: string[]
  loading:     boolean
  /** هل يملك الدور هذه الصلاحية؟ (يقبل 'all' كصلاحية شاملة) */
  can:         (perm: string) => boolean
  /** هل مدير كامل الصلاحيات؟ */
  isFullAdmin: boolean
  /** هل مشرف نظام (يدير كل المدارس)؟ */
  isSuperAdmin: boolean
  /** اسم مدرسة المستخدم */
  schoolName:  string
  /** هل مالك مجموعة مدارس؟ */
  isGroupOwner: boolean
  /** معرّف المجموعة المملوكة (لمالك المجموعة) */
  ownedGroupId: string
  /** اسم المجموعة المملوكة */
  groupName:   string
  /** وصف دور المستخدم للعرض (مشرف النظام / مالك المجموعة / ...) */
  roleLabel:   string
  /** هل المشرف يتقمّص مدرسة حالياً؟ */
  impersonating:        boolean
  /** اسم المدرسة المُتقمَّصة */
  impersonatedSchool:   string
}

const PermCtx = createContext<PermsCtx>({
  userId: '', userName: '', userEmail: '', role: '',
  permissions: [], loading: true,
  can: () => false, isFullAdmin: false, isSuperAdmin: false, schoolName: '',
  isGroupOwner: false, ownedGroupId: '', groupName: '', roleLabel: '',
  impersonating: false, impersonatedSchool: '',
})

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [userId,      setUserId]      = useState('')
  const [userName,    setUserName]    = useState('')
  const [userEmail,   setUserEmail]   = useState('')
  const [role,        setRole]        = useState('')
  const [permissions, setPermissions] = useState<string[]>([])
  const [loading,     setLoading]     = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [schoolName,  setSchoolName]  = useState('')
  const [isGroupOwner, setIsGroupOwner] = useState(false)
  const [ownedGroupId, setOwnedGroupId] = useState('')
  const [groupName,    setGroupName]    = useState('')
  const [impersonating, setImpersonating] = useState(false)
  const [impersonatedSchool, setImpersonatedSchool] = useState('')

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      setUserId(user.id)
      setUserEmail(user.email || '')

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, full_name_ar, name_ar, is_active, is_super_admin, is_group_owner, owned_group_id, school_id, active_school_id, schools(name_ar, is_active)')
        .eq('id', user.id)
        .single()

      if (!profile) { setLoading(false); return }

      setIsSuperAdmin(profile.is_super_admin === true)

      /* حالة التقمّص (مشرف يدخل كمدرسة) */
      const activeSid = (profile as any).active_school_id
      if (profile.is_super_admin === true && activeSid) {
        setImpersonating(true)
        const { data: imp } = await supabase
          .from('schools').select('name_ar').eq('id', activeSid).single()
        setImpersonatedSchool(imp?.name_ar || '')
      }
      setIsGroupOwner((profile as any).is_group_owner === true)
      setOwnedGroupId((profile as any).owned_group_id || '')

      /* اسم المجموعة لمالكها */
      if ((profile as any).owned_group_id) {
        const { data: grp } = await supabase
          .from('school_groups').select('name_ar')
          .eq('id', (profile as any).owned_group_id).single()
        setGroupName(grp?.name_ar || '')
      }

      /* ── اسم المدرسة للشريط الجانبي ── */
      const school = (profile as any).schools
      setSchoolName(school?.name_ar || '')

      /* ── طبقة أمان: مدرسة معطَّلة → أخرج المستخدم (إلا مشرف النظام) ── */
      if (school && school.is_active === false && profile.is_super_admin !== true) {
        await supabase.auth.signOut()
        window.location.href = '/login?reason=school_suspended'
        return
      }

      /* ── طبقة أمان: إذا كان الحساب معطَّلاً → أخرجه فوراً ── */
      if (profile.is_active === false) {
        await supabase.auth.signOut()
        window.location.href = '/login?reason=deactivated'
        return
      }

      setRole(profile.role || '')
      setUserName(profile.full_name_ar || profile.name_ar || '')

      if (profile.role) {
        const { data: roleData } = await supabase
          .from('roles').select('permissions').eq('code', profile.role).single()

        if (roleData && Array.isArray(roleData.permissions)) {
          setPermissions(roleData.permissions)
        } else {
          /* الدور غير موجود في جدول roles →
             إذا كان الدور أحد الأدوار النظامية المعروفة نعطيه كل الصلاحيات */
          const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']
          if (ADMIN_ROLES.includes(profile.role)) {
            setPermissions(['all'])
          }
          /* وإلا تبقى الصلاحيات [] = مستخدم عادي */
        }
      }
      setLoading(false)
    })()
  }, [])

  const can = (perm: string) =>
    permissions.includes('all') || permissions.includes(perm)

  const isFullAdmin = can('all')

  /* وصف الدور للعرض */
  const ROLE_NAMES: Record<string, string> = {
    super_admin: 'مشرف النظام', school_admin: 'مدير المدرسة', admin: 'مدير',
    coordinator: 'منسق الخطة', team_leader: 'قائد فريق', teacher: 'معلم', staff: 'موظف',
  }
  const roleLabel =
    isSuperAdmin ? 'مشرف النظام' :
    isGroupOwner ? 'مالك المجموعة' :
    (ROLE_NAMES[role] || (can('all') ? 'مدير' : 'مستخدم'))

  return (
    <PermCtx.Provider value={{
      userId, userName, userEmail, role, permissions, loading, can, isFullAdmin, isSuperAdmin, schoolName,
      isGroupOwner, ownedGroupId, groupName, roleLabel, impersonating, impersonatedSchool,
    }}>
      {children}
    </PermCtx.Provider>
  )
}

export const usePermissions = () => useContext(PermCtx)

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
  userAvatar:  string
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
  /** هل يُلزَم المستخدم بتغيير كلمة المرور؟ (مدمج هنا لتفادي استعلام هوية منفصل في layout) */
  mustChangePassword:  boolean
  /** لا يوجد مستخدم مسجَّل دخول (بعد اكتمال الفحص) */
  noUser:              boolean
}

const PermCtx = createContext<PermsCtx>({
  userId: '', userName: '', userEmail: '', userAvatar: '', role: '',
  permissions: [], loading: true,
  can: () => false, isFullAdmin: false, isSuperAdmin: false, schoolName: '',
  isGroupOwner: false, ownedGroupId: '', groupName: '', roleLabel: '',
  impersonating: false, impersonatedSchool: '',
  mustChangePassword: false, noUser: false,
})

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [userId,      setUserId]      = useState('')
  const [userName,    setUserName]    = useState('')
  const [userEmail,   setUserEmail]   = useState('')
  const [userAvatar,  setUserAvatar]  = useState('')
  const [role,        setRole]        = useState('')
  const [roleName,    setRoleName]    = useState('')   // اسم الدور من جدول roles (المصدر الموحّد)
  const [permissions, setPermissions] = useState<string[]>([])
  const [loading,     setLoading]     = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [schoolName,  setSchoolName]  = useState('')
  const [isGroupOwner, setIsGroupOwner] = useState(false)
  const [ownedGroupId, setOwnedGroupId] = useState('')
  const [groupName,    setGroupName]    = useState('')
  const [impersonating, setImpersonating] = useState(false)
  const [impersonatedSchool, setImpersonatedSchool] = useState('')
  const [mustChangePassword, setMustChangePassword] = useState(false)
  const [noUser, setNoUser] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      /* استعلام هوية واحد فقط (getUser) — لا تكرار مع أي فحص آخر في الـ layout */
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setNoUser(true); setLoading(false); return }
      setUserId(user.id)
      setUserEmail(user.email || '')

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, full_name_ar, name_ar, avatar_url, is_active, is_super_admin, is_group_owner, owned_group_id, school_id, active_school_id, must_change_password, school:schools!school_id(name_ar, is_active)')
        .eq('id', user.id)
        .single()

      if (!profile) { setLoading(false); return }

      const p = profile as any
      const school = p.school

      /* إلزام تغيير كلمة المرور — مدموج في استعلام الهوية نفسه (كان استعلاماً منفصلاً في layout) */
      if (p.must_change_password) {
        setMustChangePassword(true); setLoading(false); return
      }

      /* ── طبقتا الأمان أولاً (إخراج المستخدم إن لزم) ── */
      if (school && school.is_active === false && p.is_super_admin !== true) {
        await supabase.auth.signOut()
        window.location.href = '/login?reason=school_suspended'
        return
      }
      if (profile.is_active === false) {
        await supabase.auth.signOut()
        window.location.href = '/login?reason=deactivated'
        return
      }

      /* ── الهوية الأساسية (تُضبط دائماً) ── */
      setIsSuperAdmin(p.is_super_admin === true)
      setIsGroupOwner(p.is_group_owner === true)
      setOwnedGroupId(p.owned_group_id || '')
      setSchoolName(school?.name_ar || '')
      setRole(profile.role || '')
      setUserName(profile.full_name_ar || profile.name_ar || '')
      setUserAvatar(p.avatar_url || '')

      /* ── الصلاحيات ── */
      /* ── الصلاحيات + الاستعلامات التجميلية معاً (Promise.all — كانت متتابعة) ── */
      const wantsImpersonation = p.is_super_admin === true && !!p.active_school_id
      const wantsGroup = !!p.owned_group_id

      const [roleRes, impRes, grpRes] = await Promise.all([
        profile.role
          ? supabase.from('roles').select('permissions, name_ar').eq('code', profile.role).single()
          : Promise.resolve({ data: null as any }),
        wantsImpersonation
          ? supabase.from('schools').select('name_ar').eq('id', p.active_school_id).single()
          : Promise.resolve({ data: null as any }),
        wantsGroup
          ? supabase.from('school_groups').select('name_ar').eq('id', p.owned_group_id).single()
          : Promise.resolve({ data: null as any }),
      ])

      const roleData = roleRes.data
      if (roleData?.name_ar) setRoleName(roleData.name_ar)
      if (roleData && Array.isArray(roleData.permissions)) {
        setPermissions(roleData.permissions)
      } else if (profile.role) {
        /* الدور غير موجود في جدول roles →
           إذا كان الدور أحد الأدوار النظامية المعروفة نعطيه كل الصلاحيات */
        const ADMIN_ROLES = ['super_admin', 'school_admin', 'admin']
        if (ADMIN_ROLES.includes(profile.role)) setPermissions(['all'])
        /* وإلا تبقى الصلاحيات [] = مستخدم عادي */
      }

      if (wantsImpersonation) { setImpersonating(true); setImpersonatedSchool(impRes.data?.name_ar || '') }
      if (wantsGroup) setGroupName(grpRes.data?.name_ar || '')

      setLoading(false)
    })()
  }, [])

  const can = (perm: string) =>
    permissions.includes('all') || permissions.includes(perm)

  const isFullAdmin = can('all')

  /* وصف الدور للعرض — المصدر الموحّد: اسم الدور من جدول roles
     (كما يُحرَّر في الإعدادات ← الأدوار)؛ الثوابت أدناه احتياط فقط
     عند غياب الدور من الجدول */
  const ROLE_NAMES: Record<string, string> = {
    super_admin: 'مشرف النظام', school_admin: 'مدير المدرسة', admin: 'مدير',
    coordinator: 'منسق الخطة', team_leader: 'قائد فريق', teacher: 'معلم', staff: 'موظف',
  }
  const roleLabel =
    isGroupOwner ? 'مالك المجموعة' :
    roleName ||
    ROLE_NAMES[role] ||
    (isSuperAdmin ? 'مشرف النظام' : can('all') ? 'مدير' : 'مستخدم')

  return (
    <PermCtx.Provider value={{
      userId, userName, userEmail, userAvatar, role, permissions, loading, can, isFullAdmin, isSuperAdmin, schoolName,
      isGroupOwner, ownedGroupId, groupName, roleLabel, impersonating, impersonatedSchool,
      mustChangePassword, noUser,
    }}>
      {children}
    </PermCtx.Provider>
  )
}

export const usePermissions = () => useContext(PermCtx)

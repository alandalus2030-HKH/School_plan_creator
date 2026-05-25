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
}

const PermCtx = createContext<PermsCtx>({
  userId: '', userName: '', userEmail: '', role: '',
  permissions: [], loading: true,
  can: () => false, isFullAdmin: false,
})

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [userId,      setUserId]      = useState('')
  const [userName,    setUserName]    = useState('')
  const [userEmail,   setUserEmail]   = useState('')
  const [role,        setRole]        = useState('')
  const [permissions, setPermissions] = useState<string[]>([])
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      setUserId(user.id)
      setUserEmail(user.email || '')

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, full_name_ar, name_ar, is_active')
        .eq('id', user.id)
        .single()

      if (!profile) { setLoading(false); return }

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

  return (
    <PermCtx.Provider value={{
      userId, userName, userEmail, role, permissions, loading, can, isFullAdmin,
    }}>
      {children}
    </PermCtx.Provider>
  )
}

export const usePermissions = () => useContext(PermCtx)

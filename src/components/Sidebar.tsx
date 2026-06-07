'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { usePermissions } from '@/lib/PermissionsContext'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, ClipboardList, Map, CircleCheckBig,
  Users, ChartNoAxesColumn, CalendarDays, UserRound, Settings,
  Contact, ChevronRight, ChevronLeft, Building2, Layers,
} from 'lucide-react'
import Logo from './Logo'

const NAV_ITEMS = [
  { href: '/dashboard/group',     Icon: Layers,          ar: 'نظرة المجموعة', en: 'Group',      perm: 'group_owner'      },
  { href: '/dashboard',           Icon: LayoutDashboard, ar: 'لوحة التحكم',  en: 'Dashboard',  perm: null               },
  { href: '/dashboard/my-tasks',  Icon: ClipboardList,   ar: 'مهامي',         en: 'My Tasks',   perm: 'self'             },
  { href: '/dashboard/plans',     Icon: Map,             ar: 'الخطط',         en: 'Plans',      perm: 'manage_plans'     },
  { href: '/dashboard/tasks',     Icon: CircleCheckBig,  ar: 'كل المهام',     en: 'All Tasks',  perm: 'manage_tasks'     },
  { href: '/dashboard/teams',     Icon: Users,           ar: 'الفرق',         en: 'Teams',      perm: 'manage_teams'     },
  { href: '/dashboard/reports',   Icon: ChartNoAxesColumn, ar: 'التقارير',      en: 'Reports',    perm: 'view_reports'     },
  { href: '/dashboard/meetings',  Icon: CalendarDays,    ar: 'الاجتماعات',    en: 'Meetings',   perm: null               },
  { href: '/dashboard/users',     Icon: UserRound,       ar: 'المستخدمون',   en: 'Users',      perm: 'manage_users'     },
  { href: '/dashboard/schools',   Icon: Building2,       ar: 'إدارة المدارس', en: 'Schools',    perm: 'super'            },
  { href: '/dashboard/settings',  Icon: Settings,        ar: 'الإعدادات',     en: 'Settings',   perm: 'manage_settings'  },
  { href: '/dashboard/profile',   Icon: Contact,         ar: 'ملفي الشخصي',  en: 'My Profile', perm: 'self'             },
]

interface SidebarProps {
  lang:        'ar' | 'en'
  collapsed?:  boolean
  onToggle?:   () => void
  schoolName?: string
}

export default function Sidebar({ lang, collapsed = false, onToggle, schoolName }: SidebarProps) {
  const pathname = usePathname()
  const { can, loading, userName, userEmail, userId, isSuperAdmin, isGroupOwner, schoolName: ctxSchoolName } = usePermissions()
  const isRtl = lang === 'ar'
  const supabase = createClient()

  /* ── عداد مهام اليوم ── */
  const [myTasksCount, setMyTasksCount] = useState<number | null>(null)

  useEffect(() => {
    if (!userId) return
    const today = new Date().toISOString().split('T')[0]
    ;(async () => {
      const { count } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_to_user_id', userId)
        .in('status', ['not_started', 'in_progress'])
        .lte('end_date', today)
        .is('deleted_at', null)
      setMyTasksCount(count ?? 0)
    })()
  }, [userId])

  const visibleNav = NAV_ITEMS.filter(item => {
    /* مالك المجموعة (غير المشرف): يرى نظرة المجموعة + ملفه الشخصي فقط */
    if (isGroupOwner && !isSuperAdmin) {
      return item.perm === 'group_owner' || item.perm === 'self'
    }
    if (loading)                  return item.perm === null || item.perm === 'self'
    if (item.perm === 'group_owner') return false      // يظهر لمالك المجموعة فقط
    if (item.perm === null)       return true
    if (item.perm === 'self')     return true
    if (item.perm === 'super')    return isSuperAdmin
    return can(item.perm)
  })

  const initial = (userName || userEmail || 'U')[0].toUpperCase()

  return (
    <aside className={`
      flex flex-col text-white min-h-screen
      transition-all duration-300 ease-in-out flex-shrink-0 relative
      ${collapsed ? 'w-16' : 'w-64'}
    `}
      style={{ background: 'var(--gradient-sidebar)' }}>

      {/* ── زر الطي ── */}
      <button
        onClick={onToggle}
        title={collapsed ? 'توسيع القائمة' : 'طي القائمة'}
        className={`
          absolute top-4 z-20 w-6 h-6 flex items-center justify-center
          text-white rounded-full shadow-lg
          transition-all duration-300 border border-white/20
          ${isRtl ? '-left-3' : '-right-3'}
        `}
        style={{ background: 'var(--maroon-700)' }}>
        {isRtl
          ? (collapsed ? <ChevronLeft size={12} /> : <ChevronRight size={12} />)
          : (collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />)}
      </button>

      {/* ── Header ── */}
      <div className={`flex items-center border-b border-white/10 transition-all duration-300
        ${collapsed ? 'p-3 justify-center' : 'gap-3 p-4'}`}>
        <Logo size={collapsed ? 32 : 40} />
        {!collapsed && (
          <span className="text-sm font-bold truncate">
            {ctxSchoolName || schoolName || (lang === 'ar' ? 'مدرستي' : 'My School')}
          </span>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden">
        {visibleNav.map(item => {
          const active =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href))

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? (lang === 'ar' ? item.ar : item.en) : undefined}
              className={`
                flex items-center gap-3 mx-2 mb-1 rounded-xl transition-all duration-200
                ${collapsed ? 'px-0 py-3 justify-center' : 'px-4 py-2.5'}
                ${active
                  ? 'bg-white/20 text-white font-semibold shadow-lg'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'}
              `}>
              <item.Icon size={18} className="flex-shrink-0" />
              {!collapsed && (
                <span className="text-sm truncate flex-1">{lang === 'ar' ? item.ar : item.en}</span>
              )}
              {/* عداد مهام اليوم بجانب "مهامي" */}
              {!collapsed && item.href === '/dashboard/my-tasks' && myTasksCount !== null && myTasksCount > 0 && (
                <span className="flex-shrink-0 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px]
                                 font-bold rounded-full flex items-center justify-center px-1 leading-none">
                  {myTasksCount > 99 ? '99+' : myTasksCount}
                </span>
              )}
              {!collapsed && active && myTasksCount === 0 && (
                <span className="mr-auto w-1.5 h-1.5 rounded-full bg-white flex-shrink-0" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* ── User info ── */}
      <div className="border-t border-white/10 p-2">
        <Link
          href="/dashboard/profile"
          title={collapsed ? (userName || userEmail || '') : undefined}
          className={`flex items-center hover:bg-white/10 rounded-xl transition-colors group
            ${collapsed ? 'justify-center p-2' : 'gap-3 p-1.5'}`}>
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm group-hover:ring-2 group-hover:ring-white/30 transition-all"
            style={{ background: 'var(--maroon-400)' }}>
            {initial}
          </div>
          {!collapsed && (
            <div className="overflow-hidden flex-1">
              <p className="text-xs font-semibold truncate font-latin">{userName || userEmail}</p>
              <p className="text-xs text-white/50 truncate font-latin">{userEmail}</p>
            </div>
          )}
        </Link>
      </div>
    </aside>
  )
}

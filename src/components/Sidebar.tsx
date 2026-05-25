'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { usePermissions } from '@/lib/PermissionsContext'

const NAV_ITEMS = [
  { href: '/dashboard',           icon: '🏠', ar: 'لوحة التحكم',   en: 'Dashboard',  perm: null              },
  { href: '/dashboard/my-tasks',  icon: '📋', ar: 'مهامي',          en: 'My Tasks',   perm: 'self'            },
  { href: '/dashboard/plans',     icon: '🗺️', ar: 'الخطط',          en: 'Plans',      perm: 'manage_plans'    },
  { href: '/dashboard/tasks',     icon: '✅', ar: 'كل المهام',       en: 'All Tasks',  perm: 'manage_tasks'    },
  { href: '/dashboard/teams',     icon: '👥', ar: 'الفرق',           en: 'Teams',      perm: 'manage_teams'    },
  { href: '/dashboard/reports',   icon: '📊', ar: 'التقارير',        en: 'Reports',    perm: 'view_reports'    },
  { href: '/dashboard/meetings',  icon: '📅', ar: 'الاجتماعات',      en: 'Meetings',   perm: null              },
  { href: '/dashboard/users',     icon: '👤', ar: 'المستخدمون',     en: 'Users',      perm: 'manage_users'    },
  { href: '/dashboard/settings',  icon: '⚙️', ar: 'الإعدادات',       en: 'Settings',   perm: 'manage_settings' },
  { href: '/dashboard/profile',   icon: '🪪', ar: 'ملفي الشخصي',   en: 'My Profile', perm: 'self'            },
]

interface SidebarProps {
  lang:       'ar' | 'en'
  collapsed?: boolean
  onToggle?:  () => void
  schoolName?: string
}

export default function Sidebar({ lang, collapsed = false, onToggle, schoolName }: SidebarProps) {
  const pathname = usePathname()
  const { can, loading, userName, userEmail } = usePermissions()

  const isRtl = lang === 'ar'

  const visibleNav = NAV_ITEMS.filter(item => {
    if (loading)             return item.perm === null || item.perm === 'self'
    if (item.perm === null)  return true
    if (item.perm === 'self') return true
    return can(item.perm)
  })

  const initial = (userName || userEmail || 'U')[0].toUpperCase()

  return (
    <aside
      className={`
        flex flex-col bg-gradient-to-b from-violet-900 to-indigo-900 text-white min-h-screen
        transition-all duration-300 ease-in-out flex-shrink-0 relative
        ${collapsed ? 'w-16' : 'w-64'}
      `}>

      {/* ── زر الطي (يظهر على الحافة) ── */}
      <button
        onClick={onToggle}
        title={collapsed ? 'توسيع القائمة' : 'طي القائمة'}
        className={`
          absolute top-4 z-20 w-6 h-6 flex items-center justify-center
          bg-indigo-700 hover:bg-violet-500 text-white rounded-full shadow-lg
          transition-all duration-300 border border-white/20
          ${isRtl
            ? (collapsed ? '-left-3' : '-left-3')
            : (collapsed ? '-right-3' : '-right-3')}
        `}>
        <span className="text-[10px] font-bold leading-none">
          {isRtl
            ? (collapsed ? '◀' : '▶')
            : (collapsed ? '▶' : '◀')}
        </span>
      </button>

      {/* ── Header (الشعار واسم المدرسة) ── */}
      <div className={`flex items-center border-b border-white/10 transition-all duration-300
        ${collapsed ? 'p-3 justify-center' : 'gap-3 p-4'}`}>
        <span className="text-2xl flex-shrink-0">🏫</span>
        {!collapsed && (
          <span className="text-sm font-bold truncate">
            {schoolName || (lang === 'ar' ? 'مدرستي' : 'My School')}
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
                ${collapsed ? 'px-0 py-3 justify-center' : 'px-4 py-3'}
                ${active
                  ? 'bg-white/20 text-white font-semibold shadow-lg'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'}
              `}>
              <span className="text-xl flex-shrink-0">{item.icon}</span>
              {!collapsed && (
                <span className="text-sm truncate">{lang === 'ar' ? item.ar : item.en}</span>
              )}
              {!collapsed && active && (
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
          <div className="w-9 h-9 rounded-full bg-violet-400 flex items-center justify-center flex-shrink-0 font-bold text-sm group-hover:ring-2 group-hover:ring-white/30 transition-all">
            {initial}
          </div>
          {!collapsed && (
            <div className="overflow-hidden flex-1">
              <p className="text-xs font-semibold truncate">{userName || userEmail}</p>
              <p className="text-xs text-white/50 truncate">{userEmail}</p>
            </div>
          )}
        </Link>
      </div>
    </aside>
  )
}

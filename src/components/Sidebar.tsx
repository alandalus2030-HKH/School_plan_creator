'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { usePermissions } from '@/lib/PermissionsContext'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, ClipboardList, Map, CircleCheckBig,
  Users, ChartNoAxesColumn, CalendarDays, UserRound, Settings,
  Contact, ChevronRight, ChevronLeft, Building2, Layers, LayoutGrid, FolderOpen, Award, HelpCircle,
} from 'lucide-react'
import Logo from './Logo'

const NAV_ITEMS = [
  { href: '/dashboard/group',          Icon: Layers,       ar: 'نظرة المجموعة',   en: 'Group',      perm: 'group_owner' },
  { href: '/dashboard/group/meetings', Icon: CalendarDays, ar: 'اجتماعات المجموعة', en: 'Meetings', perm: 'group_owner' },
  { href: '/dashboard',           Icon: LayoutDashboard, ar: 'لوحة التحكم',  en: 'Dashboard',  perm: 'manager'          },
  { href: '/dashboard/my-tasks',  Icon: ClipboardList,   ar: 'مهامي',         en: 'My Tasks',   perm: 'self'             },
  { href: '/dashboard/plans',     Icon: Map,             ar: 'الخطط',         en: 'Plans',      perm: 'manage_plans'     },
  { href: '/dashboard/tasks',     Icon: CircleCheckBig,  ar: 'كل المهام',     en: 'All Tasks',  perm: 'manage_tasks'     },
  { href: '/dashboard/teams',     Icon: Users,           ar: 'الفرق',         en: 'Teams',      perm: null               },
  { href: '/dashboard/reports',   Icon: ChartNoAxesColumn, ar: 'التقارير',      en: 'Reports',    perm: 'view_reports'     },
  { href: '/dashboard/aggregate', Icon: LayoutGrid,      ar: 'لوحة التجميع',  en: 'Aggregate',  perm: 'view_aggregate'   },
  { href: '/dashboard/evidence',  Icon: FolderOpen,      ar: 'خزانة الأدلة',  en: 'Evidence',   perm: 'view_evidence'    },
  { href: '/dashboard/meetings',  Icon: CalendarDays,    ar: 'الاجتماعات',    en: 'Meetings',   perm: null               },
  { href: '/dashboard/users',     Icon: UserRound,       ar: 'المستخدمون',   en: 'Users',      perm: 'manage_users'     },
  { href: '/dashboard/badges',    Icon: Award,           ar: 'الأوسمة',       en: 'Badges',     perm: 'badges'           },
  { href: '/dashboard/schools',   Icon: Building2,       ar: 'إدارة المدارس', en: 'Schools',    perm: 'super'            },
  { href: '/dashboard/settings',  Icon: Settings,        ar: 'الإعدادات',     en: 'Settings',   perm: 'manage_settings'  },
  { href: '/dashboard/help',      Icon: HelpCircle,      ar: 'المساعدة',      en: 'Help',       perm: null               },
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
  const { can, loading, userName, userEmail, userId, userAvatar, isSuperAdmin, isGroupOwner,
    schoolName: ctxSchoolName, groupName, roleLabel,
    impersonating, impersonatedSchool } = usePermissions()
  const isRtl = lang === 'ar'
  /* ── شعار المدرسة الفعّالة (يحترم التقمّص) ── */
  const [schoolLogo, setSchoolLogo] = useState<string | null>(null)
  useEffect(() => {
    if (loading || (isGroupOwner && !isSuperAdmin)) { setSchoolLogo(null); return }
    ;(async () => {
      try {
        const res = await fetch('/api/school-profile')
        if (!res.ok) { setSchoolLogo(null); return }
        const json = await res.json()
        setSchoolLogo(json.school?.logo_url || null)
      } catch { setSchoolLogo(null) }
    })()
  }, [loading, isGroupOwner, isSuperAdmin, impersonating, impersonatedSchool])

  const visibleNav = NAV_ITEMS.filter(item => {
    /* مالك المجموعة (غير المشرف): نظرة المجموعة + ملفه الشخصي فقط
       (لا "مهامي" — فهو بلا مدرسة ولا مهام) */
    if (isGroupOwner && !isSuperAdmin) {
      return item.perm === 'group_owner' || item.href === '/dashboard/profile'
    }
    if (loading)                  return item.perm === null || item.perm === 'self'
    if (item.perm === 'group_owner') return false      // يظهر لمالك المجموعة فقط
    if (item.perm === null)       return true
    if (item.perm === 'self')     return true
    if (item.perm === 'super')    return isSuperAdmin
    if (item.perm === 'badges')   return can('grant_badges') || can('manage_badges')
    /* لوحة التحكم للمديرين فقط — نفس شرط إعادة التوجيه في dashboard/page */
    if (item.perm === 'manager')
      return can('manage_plans') || can('manage_tasks') || can('manage_users') || can('manage_settings')
    return can(item.perm)
  })

  const initial = (userName || userEmail || 'U')[0].toUpperCase()

  return (
    <aside className={`
      flex flex-col text-white h-full
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
        {schoolLogo ? (
          <img
            src={schoolLogo}
            alt="شعار المدرسة"
            width={collapsed ? 32 : 40}
            height={collapsed ? 32 : 40}
            className="rounded-lg object-contain bg-white/95 p-0.5 flex-shrink-0"
            style={{ width: collapsed ? 32 : 40, height: collapsed ? 32 : 40 }}
            onError={() => setSchoolLogo(null)}
          />
        ) : (
          <Logo size={collapsed ? 32 : 40} />
        )}
        {!collapsed && (
          <span className="text-sm font-bold truncate">
            {impersonating
              ? (impersonatedSchool || 'مدرسة')
              : isGroupOwner
                ? (groupName ? `مجموعة ${groupName}` : 'نظرة المجموعة')
                : (ctxSchoolName || schoolName || (lang === 'ar' ? 'مدرستي' : 'My School'))}
          </span>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden">
        {visibleNav.map(item => {
          /* مسارات تُطابَق تماماً (لها مسارات فرعية تحتها) */
          const exactOnly = ['/dashboard', '/dashboard/group']
          const active = exactOnly.includes(item.href)
            ? pathname === item.href
            : (pathname === item.href || pathname.startsWith(item.href))

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
          {userAvatar ? (
            <img src={userAvatar} alt={userName || 'الصورة الشخصية'}
              className="w-9 h-9 rounded-full object-cover flex-shrink-0 group-hover:ring-2 group-hover:ring-white/30 transition-all" />
          ) : (
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm group-hover:ring-2 group-hover:ring-white/30 transition-all"
              style={{ background: 'var(--maroon-400)' }}>
              {initial}
            </div>
          )}
          {!collapsed && (
            <div className="overflow-hidden flex-1">
              <p className="text-xs font-semibold truncate">{userName || userEmail}</p>
              {roleLabel && (
                <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-white/15 text-white/90 mt-0.5">
                  {roleLabel}
                </span>
              )}
            </div>
          )}
        </Link>
      </div>
    </aside>
  )
}

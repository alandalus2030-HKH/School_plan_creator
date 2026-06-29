'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Menu } from 'lucide-react'
import NotificationBell from './NotificationBell'
import GlobalSearch from './GlobalSearch'

interface TopBarProps {
  lang: 'ar' | 'en'
  onLangChange: () => void
  title?: string
  onMenuClick?: () => void
}

export default function TopBar({ lang, onLangChange, title, onMenuClick }: TopBarProps) {
  const router   = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="bg-white border-b border-slate-200 px-3 sm:px-6 py-3 flex items-center justify-between gap-2 shadow-sm">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onMenuClick}
          aria-label={lang === 'ar' ? 'القائمة' : 'Menu'}
          className="lg:hidden flex-shrink-0 p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors">
          <Menu size={22} />
        </button>
        <h1 className="text-base sm:text-lg font-bold text-slate-800 truncate min-w-0">{title || ''}</h1>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
        {/* البحث الشامل */}
        <GlobalSearch />

        <button
          onClick={onLangChange}
          className="px-3 py-1.5 text-xs rounded-full border border-violet-300 text-violet-700 hover:bg-violet-50 transition-colors font-medium"
        >
          {lang === 'ar' ? 'English' : 'عربي'}
        </button>

        {/* جرس الإشعارات الحي */}
        <NotificationBell />

        <button
          onClick={handleLogout}
          className="px-3 py-1.5 text-xs rounded-full bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-colors font-medium"
        >
          {lang === 'ar' ? 'خروج' : 'Logout'}
        </button>
      </div>
    </header>
  )
}

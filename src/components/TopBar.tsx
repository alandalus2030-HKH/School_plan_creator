'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import NotificationBell from './NotificationBell'

interface TopBarProps {
  lang: 'ar' | 'en'
  onLangChange: () => void
  title?: string
}

export default function TopBar({ lang, onLangChange, title }: TopBarProps) {
  const router   = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm">
      <h1 className="text-lg font-bold text-slate-800">{title || ''}</h1>
      <div className="flex items-center gap-3">
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

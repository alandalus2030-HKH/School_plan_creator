'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import { PermissionsProvider } from '@/lib/PermissionsContext'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import ToastContainer  from '@/components/Toast'
import QuickAddTask    from '@/components/QuickAddTask'
import ImpersonationBanner from '@/components/ImpersonationBanner'

const SIDEBAR_KEY = 'sidebar_collapsed'

const PAGE_TITLES: Record<string, { ar: string; en: string }> = {
  '/dashboard':           { ar: 'لوحة التحكم',    en: 'Dashboard' },
  '/dashboard/my-tasks':  { ar: 'مهامي',           en: 'My Tasks'  },
  '/dashboard/plans':     { ar: 'الخطط',           en: 'Plans'     },
  '/dashboard/tasks':     { ar: 'كل المهام',        en: 'All Tasks' },
  '/dashboard/teams':     { ar: 'الفرق',            en: 'Teams'     },
  '/dashboard/reports':   { ar: 'التقارير',         en: 'Reports'   },
  '/dashboard/meetings':  { ar: 'الاجتماعات',       en: 'Meetings'  },
  '/dashboard/users':     { ar: 'المستخدمون',       en: 'Users'     },
  '/dashboard/settings':  { ar: 'الإعدادات',        en: 'Settings'  },
  '/dashboard/profile':   { ar: 'ملفي الشخصي',      en: 'My Profile'},
  '/dashboard/help':      { ar: 'المساعدة',         en: 'Help'      },
}

function getTitle(pathname: string, lang: 'ar' | 'en'): string {
  // تطابق تام أولاً
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname][lang]
  // تطابق جزئي (أول مقطعين)
  const base = '/' + pathname.split('/').slice(1, 3).join('/')
  if (PAGE_TITLES[base]) return PAGE_TITLES[base][lang]
  return ''
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [lang,      setLang]      = useState<'ar' | 'en'>('ar')
  const [collapsed, setCollapsed] = useState(false)
  const pathname  = usePathname()
  const pageTitle = getTitle(pathname, lang)

  /* احفظ الحالة في localStorage */
  useEffect(() => {
    const saved = localStorage.getItem(SIDEBAR_KEY)
    if (saved === 'true') setCollapsed(true)
  }, [])

  const toggleSidebar = () => {
    setCollapsed(prev => {
      localStorage.setItem(SIDEBAR_KEY, String(!prev))
      return !prev
    })
  }

  return (
    <PermissionsProvider>
      {/* App Shell: ارتفاع ثابت — التمرير داخل main فقط (يثبّت الشريط الجانبي/العلوي ويُفعّل sticky) */}
      <div className="flex h-screen overflow-hidden print:block print:h-auto print:overflow-visible" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="print:hidden flex-shrink-0">
          <Sidebar lang={lang} collapsed={collapsed} onToggle={toggleSidebar} />
        </div>
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 print:overflow-visible">
          <div className="print:hidden">
            <ImpersonationBanner />
            <TopBar
              lang={lang}
              onLangChange={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              title={pageTitle}
            />
          </div>
          <main className="flex-1 overflow-auto bg-slate-50 p-6 print:overflow-visible print:p-0 print:bg-white">
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </main>
        </div>
      </div>
      <div className="print:hidden">
        <QuickAddTask />
      </div>
      <ToastContainer />
    </PermissionsProvider>
  )
}

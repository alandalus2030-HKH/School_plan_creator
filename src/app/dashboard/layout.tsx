'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { SWRConfig } from 'swr'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import { PermissionsProvider, usePermissions } from '@/lib/PermissionsContext'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import ToastContainer  from '@/components/Toast'
import QuickAddTask    from '@/components/QuickAddTask'
import ImpersonationBanner from '@/components/ImpersonationBanner'
import { LocaleProvider } from '@/lib/i18n/LocaleContext'

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

/* الكاش يعيش هنا لأن هذا الـlayout لا يُعاد تركيبه بين تنقّلات صفحات اللوحة
   (App Router) — فالتنقّل بين الخطط/المهام/إلخ يستفيد من نفس ذاكرة SWR دون
   إعادة تهيئتها، وهو ما يمنح التنقّل الفوري (الطبقة 2). */
const swrConfig = {
  revalidateOnFocus: true,     // تحديث بصمت عند العودة للتبويب
  dedupingInterval: 4000,      // يمنع تكرار نفس الطلب خلال 4 ثوانٍ (مثل تبديل التبويبات بسرعة)
  keepPreviousData: true,      // يُبقي البيانات القديمة ظاهرة أثناء التحديث بدل شاشة فارغة
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={swrConfig}>
      <PermissionsProvider>
        <DashboardShell>{children}</DashboardShell>
      </PermissionsProvider>
    </SWRConfig>
  )
}

/* الحارس + الهيكل الفعلي — يقرأ حالة الهوية من PermissionsContext مباشرةً
   (لا استعلام getUser/profiles مستقل — كان يضاعف رحلة المصادقة على كل تحميل) */
function DashboardShell({ children }: { children: React.ReactNode }) {
  const [lang,      setLang]      = useState<'ar' | 'en'>('ar')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)   // الشريط الجانبي المنزلق على الجوال
  const pathname  = usePathname()
  const router    = useRouter()
  const pageTitle = getTitle(pathname, lang)
  const { loading, mustChangePassword, noUser } = usePermissions()

  /* إغلاق الشريط المنزلق عند الانتقال لصفحة جديدة (جوال) */
  useEffect(() => { setMobileOpen(false) }, [pathname])

  /* حارس: إلزام تغيير كلمة المرور عند أول دخول → تحويل لصفحة التعيين.
     (حالة noUser نادرة — الحارس الأساسي في proxy.ts server-side) */
  useEffect(() => {
    if (loading) return
    if (mustChangePassword) router.replace('/auth/update-password?forced=1')
    else if (noUser) router.replace('/login')
  }, [loading, mustChangePassword, noUser])

  /* احفظ الحالة في localStorage */
  useEffect(() => {
    const saved = localStorage.getItem(SIDEBAR_KEY)
    if (saved === 'true') setCollapsed(true)
    const savedLang = localStorage.getItem('lang')
    if (savedLang === 'en' || savedLang === 'ar') setLang(savedLang)
  }, [])

  /* حفظ اللغة المختارة (أساس i18n — تُقرأ عند التحميل) */
  useEffect(() => { localStorage.setItem('lang', lang) }, [lang])

  const toggleSidebar = () => {
    setCollapsed(prev => {
      localStorage.setItem(SIDEBAR_KEY, String(!prev))
      return !prev
    })
  }

  /* لا نحجب العرض بـ"loading" وحدها — الهيكل والمحتوى يُعرَضان فوراً حتى قبل
     اكتمال الصلاحيات، لتتمكّن المكوّنات المستقلة عنها (كصدارة الشهر وسجل
     النشاط) من الجلب بالتوازي الحقيقي بدل انتظاره تتابعياً. فقط حالتا التحويل
     الإجباري (تغيير كلمة المرور/لا مستخدم) تحجبان العرض لأنهما تعنيان مغادرة
     اللوحة فوراً على أي حال */
  if (mustChangePassword || noUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin w-8 h-8 border-4 border-[#8a1538] border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <>
      {/* App Shell: ارتفاع ثابت — التمرير داخل main فقط (يثبّت الشريط الجانبي/العلوي ويُفعّل sticky) */}
      <div className="flex h-screen overflow-hidden print:block print:h-auto print:overflow-visible" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        {/* خلفية معتمة للشريط المنزلق (جوال فقط) */}
        {mobileOpen && (
          <div className="fixed inset-0 z-[45] bg-black/40 lg:hidden print:hidden" onClick={() => setMobileOpen(false)} />
        )}
        {/* الشريط الجانبي: رِفّ ثابت على lg+، ومنزلق من اليمين على الجوال */}
        <div className={`print:hidden flex-shrink-0 z-50 transition-transform duration-300
          max-lg:fixed max-lg:inset-y-0 max-lg:right-0
          ${mobileOpen ? 'max-lg:translate-x-0' : 'max-lg:translate-x-full lg:translate-x-0'}`}>
          <Sidebar lang={lang} collapsed={collapsed} onToggle={toggleSidebar} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
        </div>
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 print:overflow-visible">
          <div className="print:hidden">
            <ImpersonationBanner />
            <TopBar
              lang={lang}
              onLangChange={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              title={pageTitle}
              onMenuClick={() => setMobileOpen(true)}
            />
          </div>
          <main className="flex-1 overflow-auto bg-slate-50 p-6 print:overflow-visible print:p-0 print:bg-white">
            <LocaleProvider locale={lang}>
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
            </LocaleProvider>
          </main>
        </div>
      </div>
      <div className="print:hidden">
        <QuickAddTask />
      </div>
      <ToastContainer />
    </>
  )
}

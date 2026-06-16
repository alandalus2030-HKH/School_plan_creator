'use client'

import { createContext, useContext } from 'react'
import { messages, type Locale } from './messages'

/**
 * سياق اللغة الخفيف (i18n) — بلا تغيير على مسارات Next.
 * الاستخدام في أي كود جديد:
 *   const t = useT()
 *   <span>{t('common.save')}</span>
 * المفتاح المفقود يرجع كما هو (fallback آمن أثناء الترحيل التدريجي).
 */

type Ctx = { locale: Locale; dir: 'rtl' | 'ltr' }
const LocaleCtx = createContext<Ctx>({ locale: 'ar', dir: 'rtl' })

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return (
    <LocaleCtx.Provider value={{ locale, dir: locale === 'ar' ? 'rtl' : 'ltr' }}>
      {children}
    </LocaleCtx.Provider>
  )
}

export function useLocale() {
  return useContext(LocaleCtx)
}

/** دالة الترجمة: t('key') أو t('key', { name }) للاستيفاء */
export function useT() {
  const { locale } = useContext(LocaleCtx)
  return (key: string, vars?: Record<string, string | number>) => {
    let s = messages[locale]?.[key] ?? messages.ar[key] ?? key
    if (vars) for (const k of Object.keys(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(vars[k]))
    return s
  }
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import Logo from '@/components/Logo'

export type LegalSection = { h: string; p: string[] }
export type LegalContent = {
  title:   string
  updated: string
  intro:   string
  sections: LegalSection[]
}

interface LegalShellProps {
  ar: LegalContent
  en: LegalContent
  otherHref: string   // رابط الصفحة القانونية الأخرى
  otherLabelAr: string
  otherLabelEn: string
}

export default function LegalShell({ ar, en, otherHref, otherLabelAr, otherLabelEn }: LegalShellProps) {
  const [lang, setLang] = useState<'ar' | 'en'>('ar')
  const isAr = lang === 'ar'
  const c = isAr ? ar : en

  return (
    <div className="min-h-screen bg-slate-50" dir={isAr ? 'rtl' : 'ltr'}>
      {/* الرأس */}
      <header className="text-white" style={{ background: 'var(--gradient-button)' }}>
        <div className="max-w-3xl mx-auto px-6 py-7 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo size={40} tileBg="rgba(255,255,255,.15)" />
            <span className="font-bold text-sm sm:text-base">
              {isAr ? 'نظام متابعة الخطط المدرسية' : 'School Plan Tracking System'}
            </span>
          </div>
          <button onClick={() => setLang(isAr ? 'en' : 'ar')}
            className="px-4 py-1.5 text-xs sm:text-sm rounded-full border border-white/40 hover:bg-white/15 transition-colors font-medium flex-shrink-0">
            {isAr ? 'English' : 'عربي'}
          </button>
        </div>
      </header>

      {/* المحتوى */}
      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-7 sm:p-9">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">{c.title}</h1>
          <p className="text-xs text-slate-400 mt-2">{c.updated}</p>
          <p className="text-slate-600 leading-relaxed mt-5">{c.intro}</p>

          <div className="mt-8 space-y-7">
            {c.sections.map((s, i) => (
              <section key={i}>
                <h2 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg text-white text-xs font-bold flex-shrink-0"
                    style={{ background: 'var(--maroon-600)' }}>{i + 1}</span>
                  {s.h}
                </h2>
                <div className="space-y-2 pr-8 pl-0 rtl:pr-8 rtl:pl-0">
                  {s.p.map((para, j) => (
                    <p key={j} className="text-slate-600 leading-relaxed text-sm">{para}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        {/* تذييل التنقّل */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-6 text-sm">
          <Link href="/login" className="text-slate-500 hover:text-slate-800 transition-colors">
            {isAr ? '→ العودة لتسجيل الدخول' : '← Back to sign in'}
          </Link>
          <Link href={otherHref} className="font-medium hover:underline" style={{ color: 'var(--maroon-600)' }}>
            {isAr ? otherLabelAr : otherLabelEn}
          </Link>
        </div>
      </main>
    </div>
  )
}

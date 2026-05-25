'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'

const QUOTES = [
  'التعليم هو أقوى سلاح يمكنك استخدامه لتغيير العالم',
  'المعلم الجيد يوقد شعلة، لا يملأ وعاءً',
  'الاستثمار في المعرفة يعود بأعلى العوائد',
  'التعلم لا يُعطى، بل يُكتسب بالمثابرة والإرادة',
  'كل طفل عبقري، والتعليم هو مفتاح اكتشاف عبقريته',
]

export default function LoginPage() {
  const [username,     setUsername]     = useState('')
  const [password,     setPassword]     = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error,        setError]        = useState('')
  const [loading,      setLoading]      = useState(false)
  const [quote,        setQuote]        = useState('')
  const [lang,         setLang]         = useState<'ar' | 'en'>('ar')

  const router       = useRouter()
  const searchParams = useSearchParams()
  const supabase     = createClient()
  const isAr         = lang === 'ar'

  useEffect(() => {
    setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)])
    /* عرض رسالة إذا جاء من حساب معطَّل */
    if (searchParams.get('reason') === 'deactivated') {
      setError(isAr ? 'تم تعطيل حسابك، تواصل مع مشرف النظام' : 'Your account has been deactivated, contact your administrator')
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) return
    setLoading(true)
    setError('')

    const input = username.trim()

    /* ══ محاولة تسجيل الدخول ══ */
    const trySignIn = async (email: string): Promise<boolean> => {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return !error
    }

    /* ── المسار 1: المدخَل بريد إلكتروني → جرّبه مباشرة ── */
    if (input.includes('@')) {
      const ok = await trySignIn(input)
      if (ok) {
        /* فحص إضافي: هل الحساب نشط؟ */
        const { data: profile } = await supabase
          .from('profiles').select('is_active').eq('email', input).maybeSingle()
        if (profile?.is_active === false) {
          await supabase.auth.signOut()
          setError(isAr ? 'الحساب معطَّل، تواصل مع مشرف النظام' : 'Account is deactivated, contact your administrator')
          setLoading(false)
          return
        }
        router.push('/dashboard'); router.refresh(); return
      }
      setError(isAr ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة' : 'Invalid email or password')
      setLoading(false)
      return
    }

    /* ── المسار 2: اسم مستخدم → ابحث عن البريد عبر API ── */
    try {
      const res = await fetch('/api/auth/resolve-username', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username: input }),
        redirect: 'error',   // ← لا نتبع أي redirect (يمنع استقبال HTML بدل JSON)
      })

      /* مساعد آمن لقراءة JSON بدون SyntaxError */
      const safeJson = async (): Promise<any> => {
        const ct = res.headers.get('content-type') || ''
        if (!ct.includes('application/json')) return {}
        try { return await res.json() } catch { return {} }
      }

      if (!res.ok) {
        const j   = await safeJson()
        let   msg = isAr ? 'اسم المستخدم أو كلمة المرور غير صحيحة' : 'Invalid username or password'
        if (j.error && res.status === 403) msg = j.error
        if (res.status === 500)            msg = isAr ? 'خطأ في الخادم، تواصل مع المشرف' : 'Server error'
        setError(msg); setLoading(false); return
      }

      const json = await safeJson()
      if (!json.email) {
        setError(isAr ? 'اسم المستخدم غير موجود' : 'Username not found')
        setLoading(false); return
      }

      const ok = await trySignIn(json.email)
      if (ok) { router.push('/dashboard'); router.refresh(); return }
      setError(isAr ? 'كلمة المرور غير صحيحة' : 'Incorrect password')
      setLoading(false)

    } catch (err: any) {
      console.error('[login] fetch error:', err?.message || err)
      const msg = err?.message?.includes('redirect')
        ? (isAr ? 'خطأ في الخادم، تواصل مع المشرف' : 'Server error')
        : (isAr ? 'تعذّر الاتصال بالخادم، حاول مجدداً' : 'Cannot reach server, please retry')
      setError(msg)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex" dir={isAr ? 'rtl' : 'ltr'}>

      {/* ── اللوحة الجانبية ── */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-violet-700 via-purple-700 to-indigo-800 flex-col items-center justify-center p-12 text-white relative overflow-hidden">
        {/* دوائر زخرفية */}
        <div className="absolute inset-0 opacity-10">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="absolute rounded-full border border-white"
              style={{
                width:  `${(i + 1) * 100}px`,
                height: `${(i + 1) * 100}px`,
                top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
              }} />
          ))}
        </div>
        <div className="relative z-10 text-center max-w-md">
          <div className="text-6xl mb-6">🏫</div>
          <h1 className="text-3xl font-bold mb-4">
            {isAr ? 'نظام متابعة الخطط المدرسية' : 'School Plan Tracking System'}
          </h1>
          <div className="mt-8 p-6 bg-white/10 rounded-2xl backdrop-blur-sm">
            <p className="text-lg italic leading-relaxed opacity-90">"{quote}"</p>
          </div>
        </div>
      </div>

      {/* ── نموذج الدخول ── */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-8 bg-white relative">

        {/* زر اللغة */}
        <div className="absolute top-4 left-4">
          <button onClick={() => setLang(isAr ? 'en' : 'ar')}
            className="px-4 py-2 text-sm rounded-full border border-violet-300 text-violet-700 hover:bg-violet-50 transition-colors font-medium">
            {isAr ? 'English' : 'عربي'}
          </button>
        </div>

        <div className="w-full max-w-md">

          {/* شعار الموبايل */}
          <div className="lg:hidden text-center mb-8">
            <div className="text-5xl mb-2">🏫</div>
            <h1 className="text-xl font-bold text-violet-700">
              {isAr ? 'نظام متابعة الخطط المدرسية' : 'School Plan Tracking System'}
            </h1>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
            <h2 className="text-2xl font-bold text-slate-800 mb-1">
              {isAr ? 'تسجيل الدخول' : 'Sign In'}
            </h2>
            <p className="text-slate-500 text-sm mb-8">
              {isAr ? 'أدخل بياناتك للوصول إلى النظام' : 'Enter your credentials to access the system'}
            </p>

            <form onSubmit={handleLogin} className="space-y-5">

              {/* اسم المستخدم */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  {isAr ? 'اسم المستخدم' : 'Username'}
                </label>
                <div className="relative">
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 select-none text-base">👤</span>
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value.replace(/\s/g, ''))}
                    required
                    autoComplete="username"
                    autoFocus
                    placeholder={isAr ? 'مثال: ahmed.ali' : 'e.g. ahmed.ali'}
                    dir="ltr"
                    className="w-full pr-9 pl-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all text-slate-800 bg-slate-50"
                  />
                </div>
              </div>

              {/* كلمة المرور */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  {isAr ? 'كلمة المرور' : 'Password'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    dir="ltr"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all text-slate-800 bg-slate-50"
                  />
                  <button type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors text-sm">
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              {/* رسالة الخطأ */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                  <span>⚠️</span> {error}
                </div>
              )}

              {/* زر الدخول */}
              <button type="submit" disabled={loading || !username.trim() || !password}
                className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-violet-200 hover:shadow-violet-300">
                {loading
                  ? (isAr ? '⏳ جارٍ التحقق...' : '⏳ Signing in...')
                  : (isAr ? 'دخول' : 'Sign In')}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-slate-400 mt-6">
            {isAr
              ? 'إذا نسيت كلمة المرور تواصل مع مشرف النظام'
              : 'Forgot your password? Contact your system administrator'}
          </p>
        </div>
      </div>
    </div>
  )
}

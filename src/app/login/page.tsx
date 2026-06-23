'use client'

import { useState, useEffect, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Logo from '@/components/Logo'

const QUOTES = [
  'التعليم هو أقوى سلاح يمكنك استخدامه لتغيير العالم',
  'المعلم الجيد يوقد شعلة، لا يملأ وعاءً',
  'الاستثمار في المعرفة يعود بأعلى العوائد',
  'التعلم لا يُعطى، بل يُكتسب بالمثابرة والإرادة',
  'كل طفل عبقري، والتعليم هو مفتاح اكتشاف عبقريته',
]

/* ══ المكوّن الداخلي الذي يستخدم useSearchParams ══ */
function LoginForm() {
  const [username,     setUsername]     = useState('')
  const [password,     setPassword]     = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error,        setError]        = useState('')
  const [notice,       setNotice]       = useState('')
  const [loading,      setLoading]      = useState(false)
  const [quote,        setQuote]        = useState('')
  const [lang,         setLang]         = useState<'ar' | 'en'>('ar')
  /* نسيت كلمة المرور */
  const [forgot,       setForgot]       = useState(false)
  const [forgotEmail,  setForgotEmail]  = useState('')
  const [forgotMsg,    setForgotMsg]    = useState('')
  const [forgotLoad,   setForgotLoad]   = useState(false)

  const router       = useRouter()
  const searchParams = useSearchParams()
  const supabase     = createClient()
  const isAr         = lang === 'ar'

  useEffect(() => {
    setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)])
    const reason = searchParams.get('reason')
    if (reason === 'deactivated') {
      setError(isAr ? 'تم تعطيل حسابك، تواصل مع مشرف النظام' : 'Your account has been deactivated, contact your administrator')
    } else if (reason === 'school_suspended') {
      setError(isAr ? 'تم تعطيل اشتراك مدرستك، تواصل مع مشرف النظام' : 'Your school subscription has been suspended, contact the system administrator')
    } else if (reason === 'password_changed') {
      setNotice(isAr ? '✅ تم تغيير كلمة المرور بنجاح. سجّل دخولك بكلمة المرور الجديدة.' : 'Password changed successfully. Please sign in with your new password.')
    }

    /* رابط استرجاع كلمة المرور قد يهبط هنا (في hash) → وجّه لصفحة التعيين مع الحفاظ على الرمز */
    if (typeof window !== 'undefined' && /type=recovery|access_token=/.test(window.location.hash)) {
      router.replace('/auth/update-password' + window.location.hash)
    } else if (typeof window !== 'undefined' && /error_code=otp_expired|error=access_denied/.test(window.location.hash)) {
      /* رابط استرجاع منتهٍ/مستخدَم → رسالة واضحة بدل عنوان غامض */
      setError(isAr
        ? 'انتهت صلاحية رابط إعادة التعيين أو أنه استُخدم. اطلب من المشرف رابطاً/كلمة مرور مؤقتة جديدة.'
        : 'The reset link is invalid or has expired. Ask your administrator for a new one.')
      history.replaceState(null, '', window.location.pathname)
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') router.replace('/auth/update-password')
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) return
    setLoading(true)
    setError('')

    const input = username.trim()

    const trySignIn = async (email: string): Promise<boolean> => {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return !error
    }

    if (input.includes('@')) {
      const ok = await trySignIn(input)
      if (ok) {
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

    try {
      const res = await fetch('/api/auth/resolve-username', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username: input }),
        redirect: 'error',
      })

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

  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!forgotEmail.trim()) return
    setForgotLoad(true); setForgotMsg('')
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      })
      const j = await res.json().catch(() => ({}))
      setForgotMsg(res.ok
        ? (isAr ? `✅ إن كان البريد مسجّلاً، فسيصلك رابط إعادة التعيين إلى ${forgotEmail.trim()}` : `✅ If registered, a reset link was sent to ${forgotEmail.trim()}`)
        : `❌ ${j.error || (isAr ? 'تعذّر الإرسال' : 'Failed')}`)
    } catch {
      setForgotMsg(isAr ? '❌ تعذّر الاتصال بالخادم' : '❌ Cannot reach server')
    }
    setForgotLoad(false)
  }

  return (
    <div className="min-h-screen flex" dir={isAr ? 'rtl' : 'ltr'}>

      {/* ── اللوحة الجانبية ── */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-violet-700 via-purple-700 to-indigo-800 flex-col items-center justify-center p-12 text-white relative overflow-hidden">
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
          <div className="flex justify-center mb-6">
            <Logo size={80} />
          </div>
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

        <div className="absolute top-4 left-4">
          <button onClick={() => setLang(isAr ? 'en' : 'ar')}
            className="px-4 py-2 text-sm rounded-full border border-violet-300 text-violet-700 hover:bg-violet-50 transition-colors font-medium">
            {isAr ? 'English' : 'عربي'}
          </button>
        </div>

        <div className="w-full max-w-md">

          <div className="lg:hidden text-center mb-8">
            <div className="flex justify-center mb-3">
              <Logo size={56} tileBg="var(--maroon-50)" />
            </div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--maroon-700)' }}>
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

              {notice && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                  {notice}
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                  <span>⚠️</span> {error}
                </div>
              )}

              <button type="submit" disabled={loading || !username.trim() || !password}
                className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-violet-200 hover:shadow-violet-300">
                {loading
                  ? (isAr ? '⏳ جارٍ التحقق...' : '⏳ Signing in...')
                  : (isAr ? 'دخول' : 'Sign In')}
              </button>
            </form>
          </div>

          {/* نسيت كلمة المرور */}
          <div className="text-center mt-5">
            {!forgot ? (
              <button type="button" onClick={() => { setForgot(true); setForgotMsg('') }}
                className="text-sm text-violet-600 hover:underline font-medium">
                {isAr ? 'نسيت كلمة المرور؟' : 'Forgot your password?'}
              </button>
            ) : (
              <form onSubmit={submitForgot} className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-right space-y-3">
                <p className="text-sm font-semibold text-slate-700">
                  {isAr ? 'إعادة تعيين كلمة المرور' : 'Reset password'}
                </p>
                <p className="text-xs text-slate-500">
                  {isAr ? 'أدخل بريدك الإلكتروني وسيصلك رابط لتعيين كلمة مرور جديدة.' : 'Enter your email to receive a reset link.'}
                </p>
                <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required
                  dir="ltr" placeholder="example@gmail.com"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 text-sm bg-white" />
                {forgotMsg && (
                  <p className={`text-xs px-3 py-2 rounded-lg ${forgotMsg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{forgotMsg}</p>
                )}
                <div className="flex gap-2">
                  <button type="submit" disabled={forgotLoad || !forgotEmail.trim()}
                    className="flex-1 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50">
                    {forgotLoad ? (isAr ? 'جارٍ الإرسال...' : 'Sending...') : (isAr ? 'إرسال الرابط' : 'Send link')}
                  </button>
                  <button type="button" onClick={() => setForgot(false)}
                    className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-white">
                    {isAr ? 'إلغاء' : 'Cancel'}
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="flex items-center justify-center gap-3 mt-4 text-xs text-slate-400">
            <Link href="/privacy" className="hover:text-violet-600 transition-colors">
              {isAr ? 'سياسة الخصوصية' : 'Privacy Policy'}
            </Link>
            <span className="text-slate-300">·</span>
            <Link href="/terms" className="hover:text-violet-600 transition-colors">
              {isAr ? 'شروط الاستخدام' : 'Terms of Use'}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ══ الصفحة الرئيسية مع Suspense ══ */
export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}

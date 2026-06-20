'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Logo from '@/components/Logo'
import { LEVEL_COUNTS, levelOptionLabel } from '@/lib/planLevels'
import {
  Building2, UserRound, Map, Upload, ImageIcon, Loader2, Check,
  ArrowLeft, ArrowRight, PartyPopper, LogIn, Trash2,
} from 'lucide-react'

const ACADEMIC_YEARS = Array.from({ length: 8 }, (_, i) => `${2024 + i}-${2025 + i}`)
const MAX_LOGO = 2 * 1024 * 1024

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [authState, setAuthState] = useState<'checking' | 'ok' | 'denied'>('checking')
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ school_id: string; plan_id: string | null } | null>(null)

  /* بيانات المدرسة */
  const [nameAr, setNameAr] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [principal, setPrincipal] = useState('')
  const [ministry, setMinistry] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  /* المدير */
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminUser, setAdminUser] = useState('')
  const [adminPass, setAdminPass] = useState('')

  /* الخطة (اختياري) */
  const [planName, setPlanName] = useState('')
  const [planYear, setPlanYear] = useState('2025-2026')
  const [planLevels, setPlanLevels] = useState(4)

  /* حارس مشرف النظام */
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: prof } = await supabase
        .from('profiles').select('is_super_admin').eq('id', user.id).maybeSingle()
      setAuthState(prof?.is_super_admin ? 'ok' : 'denied')
    })()
  }, [])

  const onPickLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (e.target) e.target.value = ''
    if (!f) return
    if (f.size > MAX_LOGO) { setError('حجم الشعار يتجاوز 2MB'); return }
    if (!['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'].includes(f.type)) {
      setError('صيغة غير مدعومة (PNG/JPG/SVG/WEBP)'); return
    }
    setError('')
    setLogoFile(f)
    setLogoPreview(URL.createObjectURL(f))
  }
  const clearLogo = () => { setLogoFile(null); setLogoPreview(null) }

  const goStep2 = () => {
    if (!nameAr.trim()) { setError('اسم المدرسة (عربي) مطلوب'); return }
    setError(''); setStep(2)
  }
  const goStep3 = () => {
    if (!adminName.trim()) { setError('اسم المدير مطلوب'); return }
    if (!adminEmail.trim()) { setError('بريد المدير مطلوب'); return }
    if (!adminUser.trim()) { setError('اسم دخول المدير مطلوب'); return }
    if (adminPass && adminPass.length < 8) { setError('كلمة المرور 8 أحرف على الأقل'); return }
    setError(''); setStep(3)
  }

  const submit = async () => {
    setSaving(true); setError('')
    try {
      const fd = new FormData()
      fd.append('school_name_ar', nameAr)
      fd.append('school_name_en', nameEn)
      fd.append('address', address)
      fd.append('phone', phone)
      fd.append('email', email)
      fd.append('principal_name', principal)
      fd.append('ministry_number', ministry)
      fd.append('admin_name', adminName)
      fd.append('admin_email', adminEmail)
      fd.append('admin_username', adminUser)
      fd.append('admin_password', adminPass)
      if (planName.trim()) {
        fd.append('plan_name', planName)
        fd.append('plan_year', planYear)
        fd.append('plan_levels', String(planLevels))
      }
      if (logoFile) fd.append('logo', logoFile)

      const res = await fetch('/api/onboarding', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'تعذّر إكمال الإعداد'); setSaving(false); return }
      setDone({ school_id: json.school_id, plan_id: json.plan_id })
    } catch (e: any) {
      setError(e?.message || 'تعذّر الاتصال بالخادم'); setSaving(false)
    }
  }

  const enterSchool = async () => {
    if (!done) return
    await fetch('/api/impersonate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: done.school_id }),
    })
    window.location.href = done.plan_id ? `/dashboard/plans/${done.plan_id}` : '/dashboard'
  }

  /* ── حالات الحارس ── */
  if (authState === 'checking') return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--maroon-600)' }} />
    </div>
  )
  if (authState === 'denied') return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-center p-6">
      <p className="text-lg font-bold text-slate-700 mb-2">هذه الصفحة متاحة لمشرف النظام فقط</p>
      <button onClick={() => router.replace('/dashboard')}
        className="mt-3 px-5 py-2.5 rounded-xl text-white text-sm font-semibold" style={{ background: 'var(--gradient-button)' }}>
        العودة للوحة التحكم
      </button>
    </div>
  )

  /* ── شاشة النجاح ── */
  if (done) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6" dir="rtl">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-4" style={{ background: 'var(--maroon-50)' }}>
          <PartyPopper size={32} style={{ color: 'var(--maroon-600)' }} />
        </div>
        <h1 className="text-xl font-bold text-slate-800">تم إعداد المدرسة بنجاح</h1>
        <p className="text-slate-500 text-sm mt-2">
          أُنشئت المدرسة وحساب مديرها{done.plan_id ? ' وخطتها الأولى' : ''}. يمكنك الدخول للمدرسة الآن للبدء.
        </p>
        <div className="flex flex-col gap-2 mt-6">
          <button onClick={enterSchool}
            className="flex items-center justify-center gap-2 text-white px-5 py-3 rounded-xl text-sm font-semibold" style={{ background: 'var(--gradient-button)' }}>
            <LogIn size={16} /> الدخول إلى المدرسة
          </button>
          <button onClick={() => router.replace('/dashboard/schools')}
            className="px-5 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
            العودة لإدارة المدارس
          </button>
        </div>
      </div>
    </div>
  )

  const inputCls = 'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300'
  const labelCls = 'block text-xs font-semibold text-slate-600 mb-1.5'
  const STEPS = [
    { n: 1, label: 'المدرسة', Icon: Building2 },
    { n: 2, label: 'المدير', Icon: UserRound },
    { n: 3, label: 'الخطة الأولى', Icon: Map },
  ]

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      {/* الرأس */}
      <header className="text-white" style={{ background: 'var(--gradient-button)' }}>
        <div className="max-w-2xl mx-auto px-6 py-6 flex items-center gap-3">
          <Logo size={38} tileBg="rgba(255,255,255,.15)" />
          <div>
            <h1 className="font-bold">إعداد مدرسة جديدة</h1>
            <p className="text-xs opacity-80">معالج سريع لتجهيز المدرسة وحساب مديرها</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        {/* مؤشر الخطوات */}
        <div className="flex items-center gap-2 mb-6">
          {STEPS.map(({ n, label, Icon }, i) => (
            <div key={n} className="flex items-center gap-2 flex-1">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all
                ${step > n ? 'bg-green-500 text-white'
                : step === n ? 'text-white ring-4 ring-violet-100'
                : 'bg-slate-100 text-slate-400'}`}
                style={step === n ? { background: 'var(--maroon-600)' } : undefined}>
                <span className="inline-flex">{step > n ? <Check size={16} /> : <Icon size={16} />}</span>
              </div>
              <span className={`text-xs font-medium hidden sm:block ${step >= n ? 'text-slate-700' : 'text-slate-400'}`}>{label}</span>
              {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-1 rounded-full ${step > n ? 'bg-green-400' : 'bg-slate-200'}`} />}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">

          {/* ══ الخطوة 1: المدرسة ══ */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row gap-5">
                {/* الشعار */}
                <div className="flex flex-col items-center gap-2 flex-shrink-0">
                  <div className="w-28 h-28 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden bg-slate-50">
                    <span className="inline-flex w-full h-full items-center justify-center">
                      {logoPreview
                        ? <img src={logoPreview} alt="الشعار" className="w-full h-full object-contain" />
                        : <ImageIcon size={32} className="text-slate-300" />}
                    </span>
                  </div>
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={onPickLogo} className="hidden" />
                  <div className="flex gap-1">
                    <button onClick={() => fileRef.current?.click()}
                      className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors">
                      <span className="inline-flex"><Upload size={12} /></span>
                      <span>رفع شعار</span>
                    </button>
                    {logoPreview && (
                      <button onClick={clearLogo} aria-label="إزالة الشعار"
                        className="text-xs px-2 py-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400">PNG/JPG/SVG · حد 2MB</span>
                </div>
                {/* الأسماء */}
                <div className="flex-1 space-y-3">
                  <div>
                    <label className={labelCls}>اسم المدرسة (عربي) *</label>
                    <input value={nameAr} onChange={e => setNameAr(e.target.value)} className={inputCls} placeholder="مثال: مدرسة الأندلس" />
                  </div>
                  <div>
                    <label className={labelCls}>اسم المدرسة (إنجليزي)</label>
                    <input value={nameEn} onChange={e => setNameEn(e.target.value)} dir="ltr" className={inputCls} />
                  </div>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className={labelCls}>العنوان</label>
                  <input value={address} onChange={e => setAddress(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>الهاتف</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} dir="ltr" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>البريد الإلكتروني</label>
                  <input value={email} onChange={e => setEmail(e.target.value)} dir="ltr" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>اسم المدير (المدرسة)</label>
                  <input value={principal} onChange={e => setPrincipal(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>الرقم الوزاري</label>
                  <input value={ministry} onChange={e => setMinistry(e.target.value)} dir="ltr" className={inputCls} />
                </div>
              </div>

              {error && <p className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</p>}

              <button onClick={goStep2}
                className="w-full flex items-center justify-center gap-2 text-white font-semibold py-3 rounded-xl transition-all hover:brightness-110 shadow-lg"
                style={{ background: 'var(--gradient-button)' }}>
                التالي: حساب المدير <ArrowLeft size={16} />
              </button>
            </div>
          )}

          {/* ══ الخطوة 2: المدير ══ */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-xs text-slate-400">يُنشأ حساب مدير المدرسة بدور «مدير مدرسة» (كامل الصلاحيات داخل مدرسته).</p>
              <div>
                <label className={labelCls}>الاسم الكامل *</label>
                <input value={adminName} onChange={e => setAdminName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>البريد الإلكتروني *</label>
                <input value={adminEmail} onChange={e => setAdminEmail(e.target.value)} dir="ltr" className={inputCls} placeholder="admin@school.qa" />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>اسم الدخول *</label>
                  <input value={adminUser} onChange={e => setAdminUser(e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, ''))}
                    dir="ltr" className={inputCls} placeholder="ahmed.ali" />
                </div>
                <div>
                  <label className={labelCls}>كلمة المرور <span className="text-slate-400 font-normal">(تُولَّد تلقائياً إن تُركت)</span></label>
                  <input value={adminPass} onChange={e => setAdminPass(e.target.value)} dir="ltr" type="text" className={inputCls} placeholder="8 أحرف على الأقل" />
                </div>
              </div>

              {error && <p className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</p>}

              <div className="flex gap-3">
                <button onClick={goStep3}
                  className="flex-1 flex items-center justify-center gap-2 text-white font-semibold py-3 rounded-xl transition-all hover:brightness-110 shadow-lg"
                  style={{ background: 'var(--gradient-button)' }}>
                  التالي: الخطة الأولى <ArrowLeft size={16} />
                </button>
                <button onClick={() => { setError(''); setStep(1) }}
                  className="px-5 py-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1">
                  <ArrowRight size={16} /> رجوع
                </button>
              </div>
            </div>
          )}

          {/* ══ الخطوة 3: الخطة الأولى (اختياري) ══ */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                هذه الخطوة اختيارية — يمكنك إنشاء خطة أولى الآن، أو تخطّيها وإنشاؤها لاحقاً من داخل المدرسة.
              </div>
              <div>
                <label className={labelCls}>اسم الخطة</label>
                <input value={planName} onChange={e => setPlanName(e.target.value)} className={inputCls}
                  placeholder="مثال: الخطة التشغيلية 2025-2026" />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>العام الدراسي</label>
                  <select value={planYear} onChange={e => setPlanYear(e.target.value)} className={inputCls}>
                    {ACADEMIC_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>عدد مستويات الهيكل</label>
                  <select value={planLevels} onChange={e => setPlanLevels(parseInt(e.target.value, 10))} className={inputCls}>
                    {LEVEL_COUNTS.map(n => <option key={n} value={n}>{levelOptionLabel(n)}</option>)}
                  </select>
                </div>
              </div>

              {error && <p className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</p>}

              <div className="flex gap-3 pt-1">
                <button onClick={submit} disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 text-white font-semibold py-3 rounded-xl transition-all hover:brightness-110 disabled:opacity-60 shadow-lg"
                  style={{ background: 'var(--gradient-button)' }}>
                  <span className="inline-flex">{saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}</span>
                  <span>{saving ? 'جارٍ الإعداد...' : (planName.trim() ? 'إنهاء الإعداد وإنشاء الخطة' : 'إنهاء الإعداد (تخطّي الخطة)')}</span>
                </button>
                <button onClick={() => { setError(''); setStep(2) }} disabled={saving}
                  className="px-5 py-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1 disabled:opacity-60">
                  <ArrowRight size={16} /> رجوع
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

'use client'

import { useState, useEffect, useRef } from 'react'
import { usePermissions } from '@/lib/PermissionsContext'
import NoAccess from '@/components/NoAccess'
import { toast } from '@/components/Toast'
import {
  ShieldAlert, Lock, Loader2, AlertTriangle, Building2, UserX, RotateCcw,
  Trash2, Check, Eye, EyeOff,
} from 'lucide-react'

type SchoolRow = { id: string; name_ar: string; users: number; plans: number }
type Preview = {
  schools: SchoolRow[]
  totals: { schools: number; profiles: number; authUsers: number; orphanAuth: number }
}

const RESET_PHRASE = 'مسح نهائي'
const IDLE_LOCK_MS = 5000   // قفل تلقائي بعد 5 ثوانٍ من الخمول (منطقة خطر)

export default function AdminToolsPage() {
  const { isSuperAdmin, loading: permsLoading } = usePermissions()

  /* ── بوّابة إعادة المصادقة ── */
  const [unlocked, setUnlocked] = useState(false)
  const [pw, setPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [gateErr, setGateErr] = useState('')

  /* ── معاينة ── */
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  /* ── حالة الأدوات ── */
  const [schoolId, setSchoolId] = useState('')
  const [schoolConfirm, setSchoolConfirm] = useState('')
  const [resetConfirm, setResetConfirm] = useState('')
  const [busy, setBusy] = useState<'' | 'school' | 'orphans' | 'reset'>('')
  const busyRef = useRef(busy)
  busyRef.current = busy

  /* قفل الصفحة (إعادة الحالة لما قبل الفتح) */
  const lock = () => {
    setUnlocked(false); setPreview(null)
    setSchoolId(''); setSchoolConfirm(''); setResetConfirm(''); setPw(''); setGateErr('')
  }

  const loadPreview = async () => {
    setLoadingPreview(true)
    try {
      const res = await fetch('/api/admin/preview')
      const json = await res.json()
      if (res.ok) setPreview(json)
      else toast(json.error || 'تعذّر جلب المعاينة', 'error')
    } catch { toast('تعذّر جلب المعاينة', 'error') }
    setLoadingPreview(false)
  }

  useEffect(() => { if (unlocked) loadPreview() }, [unlocked])

  /* ── قفل تلقائي بعد 5 ثوانٍ من الخمول (لا يقفل أثناء تنفيذ عملية) ── */
  useEffect(() => {
    if (!unlocked) return
    let timer: ReturnType<typeof setTimeout>
    const arm = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (busyRef.current !== '') { arm(); return }   // لا تقفل أثناء عملية جارية
        lock()
      }, IDLE_LOCK_MS)
    }
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel']
    events.forEach(e => window.addEventListener(e, arm, { passive: true }))
    arm()
    return () => { clearTimeout(timer); events.forEach(e => window.removeEventListener(e, arm)) }
  }, [unlocked])

  if (!permsLoading && !isSuperAdmin) return <NoAccess />

  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pw) return
    setVerifying(true); setGateErr('')
    try {
      const res = await fetch('/api/admin/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      })
      const json = await res.json()
      if (res.ok) { setUnlocked(true); setPw('') }
      else setGateErr(json.error || 'تعذّر التحقّق')
    } catch { setGateErr('تعذّر التحقّق') }
    setVerifying(false)
  }

  const selectedSchool = preview?.schools.find(s => s.id === schoolId)

  const purgeSchool = async () => {
    if (!selectedSchool) return
    setBusy('school')
    try {
      const res = await fetch('/api/admin/purge-school', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolId, confirm: schoolConfirm }),
      })
      const json = await res.json()
      if (res.ok) {
        toast(`تم حذف «${json.school}» — ${json.usersPurged} مستخدماً (${json.authDeleted} حساب مصادقة)`, 'success')
        setSchoolId(''); setSchoolConfirm(''); await loadPreview()
      } else toast(json.error || 'تعذّر الحذف', 'error')
    } catch { toast('تعذّر الحذف', 'error') }
    setBusy('')
  }

  const purgeOrphans = async () => {
    setBusy('orphans')
    try {
      const res = await fetch('/api/admin/purge-orphans', { method: 'POST' })
      const json = await res.json()
      if (res.ok) { toast(`حُذف ${json.deleted} حساب مصادقة يتيم`, 'success'); await loadPreview() }
      else toast(json.error || 'تعذّر التنظيف', 'error')
    } catch { toast('تعذّر التنظيف', 'error') }
    setBusy('')
  }

  const resetAll = async () => {
    setBusy('reset')
    try {
      const res = await fetch('/api/admin/reset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: resetConfirm }),
      })
      const json = await res.json()
      if (res.ok) {
        toast(`اكتملت إعادة التهيئة — حُذف ${json.profilesDeleted} مستخدماً`, 'success')
        setResetConfirm(''); await loadPreview()
      } else toast(json.error || 'تعذّرت إعادة التهيئة', 'error')
    } catch { toast('تعذّرت إعادة التهيئة', 'error') }
    setBusy('')
  }

  /* ════ البوّابة (قبل الفتح) ════ */
  if (!unlocked) {
    return (
      <div className="max-w-md mx-auto mt-16">
        <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-6 text-center">
          <div className="flex justify-center mb-3 text-red-500"><ShieldAlert size={44} /></div>
          <h1 className="text-lg font-bold text-slate-800">أدوات المشرف</h1>
          <p className="text-sm text-slate-500 mt-1 mb-5">
            منطقة عمليات مدمّرة لا رجعة فيها. أكّد هويتك بإعادة إدخال كلمة المرور للمتابعة.
          </p>
          <form onSubmit={verify} className="space-y-3">
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)}
                placeholder="كلمة مرور حسابك" dir="ltr" autoComplete="current-password"
                className="w-full px-3 py-2.5 pr-9 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-300 text-sm bg-white" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 inline-flex"><Lock size={15} /></span>
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 px-1">
                <span className="inline-flex">{showPw ? <EyeOff size={15} /> : <Eye size={15} />}</span>
              </button>
            </div>
            {gateErr && (
              <p className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg w-full justify-center">
                <AlertTriangle size={12} /> {gateErr}
              </p>
            )}
            <button type="submit" disabled={verifying || !pw}
              className="w-full py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {verifying ? <><Loader2 size={15} className="animate-spin" /> جارٍ التحقّق…</> : <>دخول الأدوات</>}
            </button>
          </form>
        </div>
      </div>
    )
  }

  /* ════ الأدوات (بعد الفتح) ════ */
  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <ShieldAlert size={22} className="text-red-500" />
        <h1 className="text-xl font-bold text-slate-800">أدوات المشرف</h1>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">منطقة خطر</span>
        <span className="text-[11px] text-slate-400 inline-flex items-center gap-1 ms-auto"><Lock size={11} /> تُقفل تلقائياً بعد 5 ثوانٍ من الخمول</span>
      </div>

      {/* إجماليات */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'المدارس', value: preview?.totals.schools },
          { label: 'المستخدمون', value: preview?.totals.profiles },
          { label: 'حسابات المصادقة', value: preview?.totals.authUsers },
          { label: 'أشباح المصادقة', value: preview?.totals.orphanAuth },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-3 text-center">
            <div className="text-2xl font-bold text-slate-800">{loadingPreview ? '…' : (s.value ?? '—')}</div>
            <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── الأداة 1: حذف مدرسة قسري ── */}
      <div className="bg-white rounded-2xl border border-red-200 p-5">
        <div className="flex items-center gap-2 mb-1"><Building2 size={18} className="text-red-500" />
          <h2 className="font-bold text-slate-800">حذف مدرسة قسري متعاقب</h2></div>
        <p className="text-xs text-slate-500 mb-3">يحذف المدرسة بكل مستخدميها وحساباتهم وخططها وأدلتها وكل بياناتها. لا رجعة.</p>
        <select value={schoolId} onChange={e => { setSchoolId(e.target.value); setSchoolConfirm('') }}
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-300 text-sm bg-white mb-3">
          <option value="">— اختر مدرسة —</option>
          {preview?.schools.map(s => (
            <option key={s.id} value={s.id}>{s.name_ar} — {s.users} مستخدم · {s.plans} خطة</option>
          ))}
        </select>
        {selectedSchool && (
          <>
            <p className="text-xs text-slate-600 mb-2">
              للتأكيد، اكتب اسم المدرسة بالضبط: <span className="font-bold text-red-600">{selectedSchool.name_ar}</span>
            </p>
            <input value={schoolConfirm} onChange={e => setSchoolConfirm(e.target.value)}
              placeholder="اسم المدرسة" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-300 text-sm bg-white mb-3" />
            <button onClick={purgeSchool}
              disabled={busy !== '' || schoolConfirm.trim() !== selectedSchool.name_ar.trim()}
              className="w-full py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {busy === 'school' ? <><Loader2 size={15} className="animate-spin" /> جارٍ الحذف…</> : <><Trash2 size={15} /> حذف «{selectedSchool.name_ar}» نهائياً</>}
            </button>
          </>
        )}
      </div>

      {/* ── الأداة 2: تنظيف أشباح المصادقة ── */}
      <div className="bg-white rounded-2xl border border-amber-200 p-5">
        <div className="flex items-center gap-2 mb-1"><UserX size={18} className="text-amber-600" />
          <h2 className="font-bold text-slate-800">تنظيف حسابات المصادقة اليتيمة</h2></div>
        <p className="text-xs text-slate-500 mb-3">
          يحذف حسابات <code dir="ltr">auth.users</code> بلا ملف شخصي (
          <span className="font-bold text-amber-700">{preview?.totals.orphanAuth ?? '…'}</span> حالياً) — تمنع تصادم «البريد مسجَّل مسبقاً».
        </p>
        <button onClick={purgeOrphans} disabled={busy !== '' || (preview?.totals.orphanAuth ?? 0) === 0}
          className="w-full py-2.5 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 inline-flex items-center justify-center gap-2">
          {busy === 'orphans' ? <><Loader2 size={15} className="animate-spin" /> جارٍ التنظيف…</> : <><UserX size={15} /> تنظيف الأشباح</>}
        </button>
      </div>

      {/* ── الأداة 3: إعادة التهيئة الكاملة ── */}
      <div className="bg-white rounded-2xl border-2 border-red-300 p-5">
        <div className="flex items-center gap-2 mb-1"><RotateCcw size={18} className="text-red-600" />
          <h2 className="font-bold text-red-700">مسح بيانات الاختبار (إعادة تهيئة ما قبل الإطلاق)</h2></div>
        <p className="text-xs text-slate-500 mb-3">
          يحذف <strong>كل</strong> المدارس والمستخدمين والبيانات وحساباتهم — ويُبقيك أنت وحدك مع البذور
          (الأدوار العامة · القوائم · معايير QNSA · المجموعات). الأخطر على الإطلاق.
        </p>
        <p className="text-xs text-slate-600 mb-2">
          للتأكيد، اكتب: <span className="font-bold text-red-600">{RESET_PHRASE}</span>
        </p>
        <input value={resetConfirm} onChange={e => setResetConfirm(e.target.value)}
          placeholder={RESET_PHRASE} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-300 text-sm bg-white mb-3" />
        <button onClick={resetAll} disabled={busy !== '' || resetConfirm.trim() !== RESET_PHRASE}
          className="w-full py-2.5 rounded-xl bg-red-700 text-white text-sm font-semibold hover:bg-red-800 disabled:opacity-50 inline-flex items-center justify-center gap-2">
          {busy === 'reset' ? <><Loader2 size={15} className="animate-spin" /> جارٍ المسح…</> : <><Trash2 size={15} /> مسح كل البيانات وإعادة التهيئة</>}
        </button>
      </div>
    </div>
  )
}

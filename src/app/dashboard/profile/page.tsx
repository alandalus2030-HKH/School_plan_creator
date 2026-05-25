'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ProfilePage() {
  const supabase = createClient()

  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [saveMsg,       setSaveMsg]       = useState('')
  const [userId,        setUserId]        = useState('')
  const [userEmail,     setUserEmail]     = useState('')
  const [role,          setRole]          = useState('')
  const [roleName,      setRoleName]      = useState('')
  const [roleColor,     setRoleColor]     = useState('#7c3aed')
  const [jobTitle,      setJobTitle]      = useState('')
  const [department,    setDepartment]    = useState('')

  /* حقول قابلة للتعديل */
  const [firstNameAr,   setFirstNameAr]   = useState('')
  const [lastNameAr,    setLastNameAr]    = useState('')
  const [firstNameEn,   setFirstNameEn]   = useState('')
  const [lastNameEn,    setLastNameEn]    = useState('')
  const [phone,         setPhone]         = useState('')

  /* تغيير كلمة المرور */
  const [sendingReset,  setSendingReset]  = useState(false)
  const [resetMsg,      setResetMsg]      = useState('')

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      setUserEmail(user.email || '')

      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name_ar, last_name_ar, first_name_en, last_name_en, phone, role, job_title, department')
        .eq('id', user.id)
        .single()

      if (profile) {
        setFirstNameAr(profile.first_name_ar || '')
        setLastNameAr(profile.last_name_ar   || '')
        setFirstNameEn(profile.first_name_en || '')
        setLastNameEn(profile.last_name_en   || '')
        setPhone(profile.phone               || '')
        setRole(profile.role                 || '')
        setJobTitle(profile.job_title        || '')
        setDepartment(profile.department     || '')

        if (profile.role) {
          const { data: roleData } = await supabase
            .from('roles').select('name_ar, color').eq('code', profile.role).single()
          if (roleData) {
            setRoleName(roleData.name_ar)
            setRoleColor(roleData.color)
          }
        }
      }
      setLoading(false)
    })()
  }, [])

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!firstNameAr.trim()) return
    setSaving(true); setSaveMsg('')

    const fullNameAr = [firstNameAr.trim(), lastNameAr.trim()].filter(Boolean).join(' ')

    const { error } = await supabase.from('profiles').update({
      first_name_ar: firstNameAr.trim(),
      last_name_ar:  lastNameAr.trim(),
      first_name_en: firstNameEn.trim() || null,
      last_name_en:  lastNameEn.trim()  || null,
      name_ar:       fullNameAr,
      phone:         phone.trim()       || null,
    }).eq('id', userId)

    setSaveMsg(error ? `❌ ${error.message}` : '✅ تم حفظ التعديلات بنجاح')
    setSaving(false)
    setTimeout(() => setSaveMsg(''), 4000)
  }

  const sendPasswordReset = async () => {
    if (!userEmail) return
    setSendingReset(true); setResetMsg('')
    const res  = await fetch('/api/auth/reset-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail }),
    })
    const json = await res.json()
    setResetMsg(res.ok
      ? `✅ تم إرسال رابط تغيير كلمة المرور إلى ${userEmail}`
      : `❌ ${json.error || 'حدث خطأ'}`)
    setSendingReset(false)
    if (res.ok) setTimeout(() => setResetMsg(''), 6000)
  }

  const initial = (firstNameAr || userEmail || 'م')[0]

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* ══ بطاقة المعلومات الأساسية ══ */}
      <div className="bg-gradient-to-l from-violet-600 to-indigo-700 text-white rounded-2xl p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-3xl font-bold">
            {initial}
          </div>
          <div>
            <h1 className="text-xl font-bold">
              {[firstNameAr, lastNameAr].filter(Boolean).join(' ') || userEmail}
            </h1>
            <p className="text-violet-200 text-sm mt-0.5">{userEmail}</p>
            <div className="flex items-center gap-2 mt-2">
              {roleName && (
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-white/20">
                  {roleName}
                </span>
              )}
              {jobTitle && (
                <span className="text-xs text-violet-200">{jobTitle}</span>
              )}
              {department && (
                <span className="text-xs text-violet-200">· {department}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ══ نموذج تعديل البيانات الشخصية ══ */}
      <form onSubmit={saveProfile}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="font-bold text-slate-800">👤 البيانات الشخصية</h2>
          <p className="text-xs text-slate-500 mt-0.5">يمكنك تعديل اسمك ورقم هاتفك</p>
        </div>

        <div className="p-5 space-y-4">
          {/* الاسم بالعربية */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">الاسم بالعربية *</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <input value={firstNameAr} onChange={e => setFirstNameAr(e.target.value)} required
                  placeholder="الاسم الأول"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 text-sm bg-slate-50" />
              </div>
              <div>
                <input value={lastNameAr} onChange={e => setLastNameAr(e.target.value)}
                  placeholder="اسم العائلة"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 text-sm bg-slate-50" />
              </div>
            </div>
          </div>

          {/* الاسم بالإنجليزية */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">الاسم بالإنجليزية</label>
            <div className="grid grid-cols-2 gap-3">
              <input value={firstNameEn} onChange={e => setFirstNameEn(e.target.value)}
                placeholder="First name" dir="ltr"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 text-sm bg-slate-50" />
              <input value={lastNameEn} onChange={e => setLastNameEn(e.target.value)}
                placeholder="Last name" dir="ltr"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 text-sm bg-slate-50" />
            </div>
          </div>

          {/* رقم الهاتف */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">📞 رقم الهاتف</label>
            <input value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="+974 XXXX XXXX" dir="ltr"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 text-sm bg-slate-50" />
          </div>

          {/* معلومات للقراءة فقط */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-400 mb-0.5">البريد الإلكتروني</p>
              <p className="text-sm font-medium text-slate-700 truncate">{userEmail}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-400 mb-0.5">الدور في النظام</p>
              <p className="text-sm font-medium" style={{ color: roleColor }}>
                {roleName || role || '—'}
              </p>
            </div>
            {jobTitle && (
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-400 mb-0.5">المسمى الوظيفي</p>
                <p className="text-sm font-medium text-slate-700">{jobTitle}</p>
              </div>
            )}
            {department && (
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-400 mb-0.5">القسم / المادة</p>
                <p className="text-sm font-medium text-slate-700">{department}</p>
              </div>
            )}
          </div>

          {saveMsg && (
            <div className={`px-4 py-3 rounded-xl text-sm font-medium
              ${saveMsg.startsWith('✅') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {saveMsg}
            </div>
          )}

          <button type="submit" disabled={saving}
            className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 text-sm">
            {saving ? 'جارٍ الحفظ...' : '💾 حفظ التعديلات'}
          </button>
        </div>
      </form>

      {/* ══ تغيير كلمة المرور ══ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="font-bold text-slate-800">🔑 كلمة المرور</h2>
          <p className="text-xs text-slate-500 mt-0.5">سيُرسل رابط تغيير كلمة المرور إلى بريدك الإلكتروني</p>
        </div>
        <div className="p-5">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 bg-slate-50 rounded-xl px-4 py-3">
              <p className="text-xs text-slate-400">البريد الإلكتروني</p>
              <p className="text-sm font-medium text-slate-700">{userEmail}</p>
            </div>
            <button onClick={sendPasswordReset} disabled={sendingReset}
              className="flex items-center gap-2 px-5 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
              {sendingReset ? '⏳ جارٍ الإرسال...' : '📧 إرسال رابط التغيير'}
            </button>
          </div>
          {resetMsg && (
            <div className={`mt-3 px-4 py-3 rounded-xl text-sm
              ${resetMsg.startsWith('✅') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {resetMsg}
            </div>
          )}
        </div>
      </div>

    </div>
  )
}

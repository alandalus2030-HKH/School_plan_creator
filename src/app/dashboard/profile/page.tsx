'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { UserRound, Phone, Award, Star } from 'lucide-react'
import { BadgeIcon } from '@/lib/badgeIcons'

type MyBadge = { id: string; name_ar: string; icon: string; color: string; note: string | null; granted_at: string; by: string | null; points: number }

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

  /* أوسمتي + الإحصاء التحفيزي (النقاط/الترتيب) */
  const [myBadges, setMyBadges] = useState<MyBadge[]>([])
  const [badgeStats, setBadgeStats] = useState<{ total: number; count: number; rank: number; ranked: number } | null>(null)
  useEffect(() => {
    if (!userId) return
    ;(async () => {
      const [{ data: bs }, { data: ub }] = await Promise.all([
        supabase.from('badges').select('id, name_ar, icon, color, points'),
        supabase.from('user_badges').select('id, profile_id, badge_id, note, granted_at, granted_by'),
      ])
      const badges = bs || []
      const all = ub || []
      const bMap  = new Map(badges.map(b => [b.id, b]))
      const ptMap = new Map(badges.map(b => [b.id, b.points ?? 0]))

      const mine = all.filter(r => r.profile_id === userId)
        .sort((a, b) => +new Date(b.granted_at) - +new Date(a.granted_at))
      if (mine.length === 0) { setMyBadges([]); setBadgeStats(null); return }

      const granterIds = [...new Set(mine.map(r => r.granted_by).filter(Boolean))]
      const { data: gs } = granterIds.length
        ? await supabase.from('profiles').select('id, name_ar').in('id', granterIds as string[])
        : { data: [] as { id: string; name_ar: string }[] }
      const gMap = new Map((gs || []).map(g => [g.id, g.name_ar]))

      setMyBadges(mine.map(r => {
        const b = bMap.get(r.badge_id)
        return {
          id: r.id, name_ar: b?.name_ar || 'وسام', icon: b?.icon || 'Award',
          color: b?.color || '#8a1538', note: r.note, granted_at: r.granted_at,
          by: r.granted_by ? (gMap.get(r.granted_by) || null) : null,
          points: ptMap.get(r.badge_id) ?? 0,
        }
      }))

      /* الترتيب على مستوى المدرسة حسب مجموع النقاط */
      const agg = new Map<string, number>()
      for (const r of all) agg.set(r.profile_id, (agg.get(r.profile_id) || 0) + (ptMap.get(r.badge_id) ?? 0))
      const sorted = [...agg.entries()].sort((a, b) => b[1] - a[1])
      setBadgeStats({
        total: agg.get(userId) || 0,
        count: mine.length,
        rank:  sorted.findIndex(([id]) => id === userId) + 1,
        ranked: sorted.length,
      })
    })()
  }, [userId])

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
    <div className="max-w-3xl mx-auto space-y-5">

      {/* ══ بطاقة المعلومات الأساسية ══ */}
      <div className="bg-gradient-to-l from-violet-600 to-indigo-700 text-white rounded-2xl p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-3xl font-bold">
            {initial}
          </div>
          <div>
            <h1 className="text-xl font-bold">
              {[firstNameAr, lastNameAr].filter(Boolean).join(' ') || <span className="font-latin">{userEmail}</span>}
            </h1>
            <p className="text-violet-200 text-sm mt-0.5 font-latin">{userEmail}</p>
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

      {/* ══ أوسمتي ══ */}
      {myBadges.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
            <Award size={16} style={{ color: 'var(--maroon-600)' }} /> أوسمتي
            <span className="text-xs font-normal text-slate-400">({myBadges.length})</span>
          </h2>

          {/* شريط تحفيزي: النقاط · الترتيب · العدد */}
          {badgeStats && (
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="rounded-xl p-3 text-center" style={{ background: 'var(--maroon-50)' }}>
                <p className="text-2xl font-bold" style={{ color: 'var(--maroon-700)' }}>{badgeStats.total}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">إجمالي النقاط</p>
              </div>
              <div className="rounded-xl p-3 text-center bg-amber-50">
                <p className="text-2xl font-bold text-amber-600">{badgeStats.rank ? `#${badgeStats.rank}` : '—'}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">ترتيبك من {badgeStats.ranked}</p>
              </div>
              <div className="rounded-xl p-3 text-center bg-slate-50">
                <p className="text-2xl font-bold text-slate-700">{badgeStats.count}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">عدد الأوسمة</p>
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            {myBadges.map(b => (
              <div key={b.id} className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50/50">
                <span className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ background: b.color }}>
                  <BadgeIcon name={b.icon} size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-700">{b.name_ar}</p>
                    <span className="text-[10px] text-amber-600 flex items-center gap-0.5">
                      <Star size={9} className="fill-amber-400 text-amber-400" />{b.points}
                    </span>
                  </div>
                  {b.note && <p className="text-xs text-slate-500 leading-snug mt-0.5 break-words">{b.note}</p>}
                  <p className="text-[11px] text-slate-400 mt-1">
                    {b.by ? `منحك: ${b.by}` : ''}{b.by ? ' · ' : ''}{new Date(b.granted_at).toLocaleDateString('ar')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ نموذج تعديل البيانات الشخصية ══ */}
      <form onSubmit={saveProfile}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <UserRound size={16} style={{ color: 'var(--maroon-600)' }} /> البيانات الشخصية
          </h2>
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
            <label className="block text-xs font-medium text-slate-600 mb-2 flex items-center gap-1">
              <Phone size={12} /> رقم الهاتف
            </label>
            <input value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="+974 XXXX XXXX" dir="ltr"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 text-sm bg-slate-50" />
          </div>

          {/* معلومات للقراءة فقط */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-400 mb-0.5">البريد الإلكتروني</p>
              <p className="text-sm font-medium text-slate-700 truncate font-latin">{userEmail}</p>
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
              <p className="text-sm font-medium text-slate-700 font-latin">{userEmail}</p>
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

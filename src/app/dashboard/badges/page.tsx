'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/lib/PermissionsContext'
import NoAccess from '@/components/NoAccess'
import { toast } from '@/components/Toast'
import {
  Award, Trophy, Sparkles, Plus, X, Loader2, Trash2, Gift, Send, Star, Medal, BarChart3, Pencil,
} from 'lucide-react'
import { BadgeIcon, ICON_NAMES, BADGE_COLORS } from '@/lib/badgeIcons'

type Badge   = { id: string; name_ar: string; name_en: string | null; icon: string; color: string; points: number }
type Profile = { id: string; name_ar: string }
type Grant   = { id: string; badge_id: string; profile_id: string; note: string | null; granted_at: string }
type RankRow = { profile_id: string; name: string; total: number; count: number }

/* أسباب منح جاهزة (مستندة لأنظمة التقدير العالمية: Bonusly / PBIS / Credly) */
const PRESET_REASONS = [
  'التميّز في الأداء', 'التعاون وروح الفريق', 'المبادرة والابتكار',
  'الالتزام والانضباط', 'إنجاز المهام في وقتها', 'جودة عمل متميّزة',
  'القيادة الفاعلة', 'المثابرة وتجاوز التحديات', 'خدمة متميّزة للطلاب', 'تطوّر مهني مستمر',
]

const PERIODS = [
  { key: 'month', label: 'هذا الشهر',   days: 0 },
  { key: 'q',     label: 'آخر 3 أشهر',  days: 90 },
  { key: 'year',  label: 'هذه السنة',   days: 365 },
  { key: 'all',   label: 'الكل',        days: -1 },
] as const

function periodStart(key: string): string | null {
  if (key === 'all') return null
  const d = new Date()
  if (key === 'month') { d.setDate(1); d.setHours(0, 0, 0, 0); return d.toISOString() }
  const days = key === 'q' ? 90 : 365
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

export default function BadgesPage() {
  const supabase = createClient()
  const { can, loading: permsLoading } = usePermissions()

  const [badges,   setBadges]   = useState<Badge[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [grants,   setGrants]   = useState<Grant[]>([])
  const [loading,  setLoading]  = useState(true)

  /* نموذج إنشاء/تعديل وسام */
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [fName, setFName]   = useState('')
  const [fNameEn, setFNameEn] = useState('')
  const [fIcon, setFIcon]   = useState('Award')
  const [fColor, setFColor] = useState(BADGE_COLORS[0].value)
  const [fPoints, setFPoints] = useState(10)
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState<Badge | null>(null)

  /* منح وسام */
  const [grantBadge, setGrantBadge] = useState('')
  const [grantUser,  setGrantUser]  = useState('')
  const [grantNote,  setGrantNote]  = useState('')
  const [reasons,    setReasons]    = useState<string[]>([])
  const [granting,   setGranting]   = useState(false)

  /* لوحة الترتيب */
  const [period, setPeriod] = useState<string>('month')
  const [ranks, setRanks]   = useState<RankRow[]>([])

  const load = async () => {
    const [b, p, g] = await Promise.all([
      supabase.from('badges').select('id, name_ar, name_en, icon, color, points').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, name_ar').eq('is_active', true).order('name_ar').limit(500),
      supabase.from('user_badges').select('id, badge_id, profile_id, note, granted_at').order('granted_at', { ascending: false }).limit(100),
    ])
    setBadges((b.data || []) as Badge[])
    setProfiles((p.data || []) as Profile[])
    setGrants((g.data || []) as Grant[])
    setLoading(false)
  }
  useEffect(() => { if (!permsLoading && can('grant_badges')) load(); else if (!permsLoading) setLoading(false) }, [permsLoading])

  /* حساب لوحة الترتيب حسب الفترة */
  useEffect(() => {
    if (badges.length === 0) { setRanks([]); return }
    ;(async () => {
      const start = periodStart(period)
      let q = supabase.from('user_badges').select('profile_id, badge_id, granted_at')
      if (start) q = q.gte('granted_at', start)
      const { data } = await q.limit(5000)
      const ptMap = new Map(badges.map(b => [b.id, b.points ?? 0]))
      const agg = new Map<string, RankRow>()
      for (const r of (data || [])) {
        const pts = ptMap.get(r.badge_id) ?? 0
        const cur = agg.get(r.profile_id) || { profile_id: r.profile_id, name: '', total: 0, count: 0 }
        cur.total += pts; cur.count += 1
        agg.set(r.profile_id, cur)
      }
      const rows = [...agg.values()]
        .map(r => ({ ...r, name: profiles.find(p => p.id === r.profile_id)?.name_ar || '—' }))
        .sort((a, b) => b.total - a.total || b.count - a.count)
        .slice(0, 20)
      setRanks(rows)
    })()
  }, [period, badges, profiles])

  const openCreate = () => {
    setEditId(null); setFName(''); setFNameEn(''); setFIcon('Award'); setFColor(BADGE_COLORS[0].value); setFPoints(10)
    setShowForm(true)
  }
  const openEdit = (b: Badge) => {
    setEditId(b.id); setFName(b.name_ar); setFNameEn(b.name_en || ''); setFIcon(b.icon || 'Award')
    setFColor(b.color || BADGE_COLORS[0].value); setFPoints(b.points ?? 10)
    setShowForm(true)
  }

  const saveBadge = async () => {
    if (!fName.trim()) { toast('اسم الوسام مطلوب', 'error'); return }
    setSaving(true)
    const payload = { name_ar: fName, name_en: fNameEn, icon: fIcon, color: fColor, points: fPoints }
    const res = editId
      ? await fetch('/api/badges', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editId, ...payload }) })
      : await fetch('/api/badges', { method: 'POST',  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { toast(json.error || 'تعذّر الحفظ', 'error'); return }
    toast(editId ? 'تم تحديث الوسام' : 'تم إنشاء الوسام')
    setShowForm(false)
    await load()
  }

  const deleteBadge = async (b: Badge) => {
    const res = await fetch(`/api/badges?id=${b.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!res.ok) { toast(json.error || 'تعذّر الحذف', 'error'); setConfirmDel(null); return }
    toast('تم حذف الوسام')
    setConfirmDel(null); await load()
  }

  const toggleReason = (r: string) =>
    setReasons(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])

  const grant = async () => {
    if (!grantBadge || !grantUser) { toast('اختر الوسام والمستخدم', 'error'); return }
    const note = [...reasons, grantNote.trim()].filter(Boolean).join('، ')
    setGranting(true)
    const res = await fetch('/api/badges/grant', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ badge_id: grantBadge, profile_id: grantUser, note }),
    })
    const json = await res.json()
    setGranting(false)
    if (!res.ok) { toast(json.error || 'تعذّر المنح', 'error'); return }
    toast('تم منح الوسام')
    setGrantNote(''); setGrantUser(''); setReasons([])
    await load()
  }

  const revoke = async (id: string) => {
    const res = await fetch(`/api/badges/grant?id=${id}`, { method: 'DELETE' })
    if (!res.ok) { toast('تعذّر السحب', 'error'); return }
    toast('تم سحب الوسام'); await load()
  }

  const badgeById   = (id: string) => badges.find(b => b.id === id)
  const profileName = (id: string) => profiles.find(p => p.id === id)?.name_ar || '—'

  if (permsLoading || loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--maroon-600)' }} />
    </div>
  )
  if (!can('grant_badges')) return <NoAccess />

  return (
    <div className="space-y-5" dir="rtl">
      {/* رأس */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Award size={22} style={{ color: 'var(--maroon-600)' }} /> الأوسمة والتحفيز
          </h2>
          <p className="text-slate-500 text-sm mt-1">أنشئ أوسمة المدرسة وامنحها لتحفيز الفريق</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:brightness-110 shadow-lg"
          style={{ background: 'var(--gradient-button)' }}>
          <Plus size={16} /> وسام جديد
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* ══ كتالوج الأوسمة ══ */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Trophy size={18} style={{ color: 'var(--maroon-600)' }} /> أوسمة المدرسة
            <span className="text-xs font-normal text-slate-400">({badges.length})</span>
          </h3>
          {badges.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-8">لا توجد أوسمة بعد — أنشئ أول وسام</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {badges.map(b => (
                <div key={b.id} className="group flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ background: b.color }}>
                    <BadgeIcon name={b.icon} size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">{b.name_ar}</p>
                    <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                      <Star size={11} className="fill-amber-400 text-amber-400" /> {b.points ?? 0} نقطة
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={() => openEdit(b)} aria-label="تعديل الوسام"
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setConfirmDel(b)} aria-label="حذف الوسام"
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ══ منح وسام ══ */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Gift size={18} style={{ color: 'var(--maroon-600)' }} /> منح وسام
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">الوسام</label>
              <select value={grantBadge} onChange={e => setGrantBadge(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
                <option value="">— اختر وساماً —</option>
                {badges.map(b => <option key={b.id} value={b.id}>{b.name_ar}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">المستخدم</label>
              <select value={grantUser} onChange={e => setGrantUser(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
                <option value="">— اختر مستخدماً —</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.name_ar}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                أسباب المنح (يمكن اختيار أكثر من سبب)
                {reasons.length > 0 && <span className="text-violet-600"> · {reasons.length}</span>}
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {PRESET_REASONS.map(r => {
                  const on = reasons.includes(r)
                  return (
                    <button key={r} type="button" onClick={() => toggleReason(r)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors flex items-center gap-1
                        ${on ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500 hover:border-violet-300 hover:bg-violet-50'}`}>
                      {on && <span className="inline-flex"><Star size={10} className="fill-violet-500 text-violet-500" /></span>}
                      {r}
                    </button>
                  )
                })}
              </div>
              <input value={grantNote} onChange={e => setGrantNote(e.target.value)}
                placeholder="سبب إضافي مخصص (اختياري)..." className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
            <button onClick={grant} disabled={granting || !grantBadge || !grantUser}
              className="w-full flex items-center justify-center gap-2 text-white font-semibold py-2.5 rounded-xl transition-all hover:brightness-110 disabled:opacity-50 shadow-lg"
              style={{ background: 'var(--gradient-button)' }}>
              <span className="inline-flex">{granting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}</span>
              <span>{granting ? 'جارٍ المنح...' : 'منح الوسام'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ══ الأوسمة الممنوحة مؤخراً ══ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Sparkles size={18} style={{ color: 'var(--maroon-600)' }} /> الأوسمة الممنوحة
          <span className="text-xs font-normal text-slate-400">({grants.length})</span>
        </h3>
        {grants.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-8">لم تُمنح أوسمة بعد</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {grants.map(g => {
              const b = badgeById(g.badge_id)
              return (
                <div key={g.id} className="group flex items-center gap-3 py-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white flex-shrink-0" style={{ background: b?.color || '#8a1538' }}>
                    <BadgeIcon name={b?.icon || 'Award'} size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700">
                      <span className="font-semibold">{profileName(g.profile_id)}</span>
                      <span className="text-slate-400"> حصل على </span>
                      <span className="font-semibold">{b?.name_ar || 'وسام'}</span>
                    </p>
                    {g.note && <p className="text-xs text-slate-400 truncate">{g.note}</p>}
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0">
                    {new Date(g.granted_at).toLocaleDateString('ar')}
                  </span>
                  <button onClick={() => revoke(g.id)} aria-label="سحب الوسام"
                    className="opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex-shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ══ لوحة الترتيب ══ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 size={18} style={{ color: 'var(--maroon-600)' }} /> لوحة الترتيب (حسب النقاط)
          </h3>
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
            {PERIODS.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                  ${period === p.key ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {ranks.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-8">لا توجد نقاط في هذه الفترة</p>
        ) : (
          <div className="space-y-1.5">
            {ranks.map((r, i) => {
              const rankColor = i === 0 ? '#d4af37' : i === 1 ? '#9ca3af' : i === 2 ? '#cd7f32' : null
              return (
                <div key={r.profile_id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${i < 3 ? 'bg-slate-50' : ''}`}>
                  <div className="w-7 flex items-center justify-center flex-shrink-0">
                    {rankColor
                      ? <span className="inline-flex"><Medal size={20} style={{ color: rankColor }} /></span>
                      : <span className="text-sm font-bold text-slate-400">{i + 1}</span>}
                  </div>
                  <span className="flex-1 text-sm font-medium text-slate-700 truncate">{r.name}</span>
                  <span className="text-xs text-slate-400 flex-shrink-0">{r.count} وسام</span>
                  <span className="flex items-center gap-1 text-sm font-bold flex-shrink-0" style={{ color: 'var(--maroon-600)' }}>
                    <Star size={13} className="fill-amber-400 text-amber-400" /> {r.total}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ══ نافذة إنشاء وسام ══ */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-5" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <span className="inline-flex">{editId ? <Pencil size={18} style={{ color: 'var(--maroon-600)' }} /> : <Award size={18} style={{ color: 'var(--maroon-600)' }} />}</span>
                {editId ? 'تعديل الوسام' : 'وسام جديد'}
              </h3>
              <button onClick={() => setShowForm(false)} aria-label="إغلاق"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>

            {/* معاينة */}
            <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-slate-50">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ background: fColor }}>
                <BadgeIcon name={fIcon} size={24} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-700 truncate">{fName || 'اسم الوسام'}</p>
                {fNameEn && <p className="text-xs text-slate-400 truncate" dir="ltr">{fNameEn}</p>}
              </div>
            </div>

            <div className="space-y-3">
              <input value={fName} onChange={e => setFName(e.target.value)} placeholder="اسم الوسام (عربي) *"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
              <input value={fNameEn} onChange={e => setFNameEn(e.target.value)} placeholder="Badge name (English)" dir="ltr"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">الأيقونة</label>
                <div className="grid grid-cols-6 gap-2">
                  {ICON_NAMES.map(name => (
                    <button key={name} onClick={() => setFIcon(name)}
                      className={`aspect-square rounded-lg flex items-center justify-center border-2 transition-all
                        ${fIcon === name ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-400 hover:border-violet-200'}`}>
                      <BadgeIcon name={name} size={18} />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">اللون</label>
                <div className="flex gap-2 flex-wrap">
                  {BADGE_COLORS.map(c => (
                    <button key={c.value} onClick={() => setFColor(c.value)} title={c.name}
                      className={`w-8 h-8 rounded-full transition-all ${fColor === c.value ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'hover:scale-105'}`}
                      style={{ backgroundColor: c.value }} aria-label={`لون ${c.name}`} />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1">
                  <Star size={12} className="text-amber-500" /> النقاط (تُضاف لرصيد من يحصل عليه)
                </label>
                <div className="flex items-center gap-2">
                  {[5, 10, 25, 50, 100].map(v => (
                    <button key={v} onClick={() => setFPoints(v)}
                      className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition-colors
                        ${fPoints === v ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-500 hover:border-amber-300'}`}>
                      {v}
                    </button>
                  ))}
                  <input type="number" min={0} max={1000} value={fPoints}
                    onChange={e => setFPoints(Math.max(0, Math.min(1000, parseInt(e.target.value, 10) || 0)))}
                    dir="ltr" className="w-16 px-2 py-2 rounded-lg border border-slate-200 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-300" />
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={saveBadge} disabled={saving || !fName.trim()}
                  className="flex-1 flex items-center justify-center gap-2 text-white font-semibold py-2.5 rounded-xl transition-all hover:brightness-110 disabled:opacity-50"
                  style={{ background: 'var(--gradient-button)' }}>
                  <span className="inline-flex">{saving ? <Loader2 size={16} className="animate-spin" /> : (editId ? <Pencil size={16} /> : <Plus size={16} />)}</span>
                  <span>{saving ? 'جارٍ الحفظ...' : (editId ? 'حفظ التعديلات' : 'إنشاء الوسام')}</span>
                </button>
                <button onClick={() => setShowForm(false)}
                  className="px-5 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50 transition-colors">
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ تأكيد حذف الوسام ══ */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setConfirmDel(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 text-center" dir="rtl" onClick={e => e.stopPropagation()}>
            <p className="text-slate-700 mb-1 font-semibold">حذف وسام «{confirmDel.name_ar}»؟</p>
            <p className="text-xs text-slate-400 mb-4">ستُحذف كل منحاته من المستخدمين. لا يمكن التراجع.</p>
            <div className="flex gap-2">
              <button onClick={() => deleteBadge(confirmDel)} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors">حذف</button>
              <button onClick={() => setConfirmDel(null)} className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50 transition-colors">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

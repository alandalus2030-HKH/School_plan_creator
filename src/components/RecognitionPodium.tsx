'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/lib/PermissionsContext'
import { toast } from '@/components/Toast'
import { Trophy, Star, Crown, Pin, X, Loader2 } from 'lucide-react'

type Entry = {
  profile_id: string
  name: string
  avatar: string | null
  points: number
  count: number
  featured: boolean
}

const MEDAL = ['#d4af37', '#9ca3af', '#cd7f32'] // ذهبي/فضّي/برونزي
const ORDER = [1, 0, 2] // ترتيب العرض: الثاني · الأول · الثالث

function monthStartISO(): string {
  const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.toISOString()
}
function Avatar({ name, url, size }: { name: string; url: string | null; size: number }) {
  if (url) return <img src={url} alt={name} className="rounded-full object-cover" style={{ width: size, height: size }} />
  return (
    <div className="rounded-full flex items-center justify-center text-white font-bold"
      style={{ width: size, height: size, background: 'var(--maroon-400)', fontSize: size * 0.4 }}>
      {(name || '؟')[0]}
    </div>
  )
}

export default function RecognitionPodium() {
  const supabase = createClient()
  const { can, isFullAdmin, loading: permsLoading } = usePermissions()
  const canManage = isFullAdmin || can('manage_settings')

  const [podium, setPodium] = useState<Entry[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  /* نافذة التعيين */
  const [showSet, setShowSet] = useState(false)
  const [people, setPeople] = useState<{ id: string; name_ar: string }[]>([])
  const [pickUser, setPickUser] = useState('')
  const [pickNote, setPickNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [featuredId, setFeaturedId] = useState<string | null>(null)

  const load = async () => {
    const [featRes, b, ub, p] = await Promise.all([
      fetch('/api/featured-employee').then(r => r.json()).catch(() => ({})),
      supabase.from('badges').select('id, points'),
      supabase.from('user_badges').select('profile_id, badge_id, granted_at').gte('granted_at', monthStartISO()).limit(5000),
      supabase.from('profiles').select('id, name_ar, avatar_url').eq('is_active', true).limit(500),
    ])
    const featId  = featRes?.featured_employee_id || null
    setFeaturedId(featId)
    setNote(featRes?.featured_note || null)

    const ptMap = new Map((b.data || []).map(x => [x.id, x.points ?? 0]))
    const pMap  = new Map((p.data || []).map(x => [x.id, x]))
    setPeople((p.data || []).map(x => ({ id: x.id, name_ar: x.name_ar })))

    const agg = new Map<string, { points: number; count: number }>()
    for (const r of (ub.data || [])) {
      const cur = agg.get(r.profile_id) || { points: 0, count: 0 }
      cur.points += ptMap.get(r.badge_id) ?? 0; cur.count += 1
      agg.set(r.profile_id, cur)
    }
    const ranked = [...agg.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.points - a.points || b.count - a.count)

    const toEntry = (id: string, featured: boolean): Entry => {
      const pr = pMap.get(id) as any
      const a = agg.get(id)
      return { profile_id: id, name: pr?.name_ar || '—', avatar: pr?.avatar_url || null, points: a?.points || 0, count: a?.count || 0, featured }
    }

    let result: Entry[] = []
    if (featId && pMap.has(featId)) {
      result.push(toEntry(featId, true))
      for (const r of ranked) { if (result.length >= 3) break; if (r.id !== featId) result.push(toEntry(r.id, false)) }
    } else {
      result = ranked.slice(0, 3).map(r => toEntry(r.id, false))
    }
    setPodium(result)
    setLoading(false)
  }
  useEffect(() => { if (!permsLoading) load() }, [permsLoading])

  const setFeatured = async () => {
    if (!pickUser) { toast('اختر موظفاً', 'error'); return }
    setSaving(true)
    const res = await fetch('/api/featured-employee', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_id: pickUser, note: pickNote }),
    })
    setSaving(false)
    if (!res.ok) { const j = await res.json(); toast(j.error || 'تعذّر التعيين', 'error'); return }
    toast('تم تعيين موظف الشهر'); setShowSet(false); setPickUser(''); setPickNote(''); await load()
  }
  const clearFeatured = async () => {
    const res = await fetch('/api/featured-employee', { method: 'DELETE' })
    if (res.ok) { toast('عاد الاختيار للتلقائي'); await load() } else toast('تعذّر الإلغاء', 'error')
  }

  if (loading) return null

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 overflow-hidden">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <Trophy size={18} style={{ color: 'var(--maroon-600)' }} /> صدارة الشهر
        </h3>
        {canManage && (
          <div className="flex items-center gap-2 text-xs">
            <button onClick={() => setShowSet(true)} className="flex items-center gap-1 text-violet-700 hover:text-violet-800 font-medium">
              <span className="inline-flex"><Pin size={13} /></span> تعيين موظف الشهر
            </button>
            {featuredId && (
              <>
                <span className="text-slate-300">·</span>
                <button onClick={clearFeatured} className="text-slate-500 hover:text-slate-700">إلغاء التثبيت</button>
              </>
            )}
          </div>
        )}
      </div>

      {podium.length === 0 ? (
        /* حالة فارغة تشجيعية — لا أوسمة هذا الشهر بعد */
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-3" style={{ background: 'var(--maroon-50)' }}>
            <Trophy size={28} style={{ color: 'var(--maroon-400)' }} />
          </div>
          <p className="inline-flex items-center gap-1.5 font-semibold text-slate-700">كن أول من يتصدّر هذا الشهر <Trophy size={15} /></p>
          <p className="text-xs text-slate-500 mt-1 max-w-xs">أنجز مهامك واكسب الأوسمة لتظهر هنا في صدارة الشهر.</p>
        </div>
      ) : (
        <>
          {/* المنصة */}
          <div className="flex items-end justify-center gap-3 sm:gap-6">
            {ORDER.map(pos => {
              const e = podium[pos]
              if (!e) return <div key={pos} className="flex-1 max-w-[120px]" />
              const size = pos === 0 ? 76 : 60
              const podiumH = pos === 0 ? 'h-20' : pos === 1 ? 'h-14' : 'h-10'
              return (
                <div key={pos} className="flex-1 max-w-[140px] flex flex-col items-center">
                  {pos === 0 && <span className="inline-flex mb-1"><Crown size={20} style={{ color: MEDAL[0] }} /></span>}
                  <div className="relative">
                    <div className="rounded-full p-0.5" style={{ background: MEDAL[pos] }}>
                      <Avatar name={e.name} url={e.avatar} size={size} />
                    </div>
                    <span className="absolute -bottom-1 -left-1 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold border-2 border-white"
                      style={{ background: MEDAL[pos] }}>{pos + 1}</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-700 mt-2 text-center truncate w-full">{e.name}</p>
                  <p className="text-xs flex items-center gap-1" style={{ color: 'var(--maroon-600)' }}>
                    <Star size={11} className="fill-amber-400 text-amber-400" /> {e.points}
                  </p>
                  {e.featured && (
                    <span className="text-[10px] mt-1 px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">اختيار الإدارة</span>
                  )}
                  <div className={`w-full ${podiumH} mt-2 rounded-t-lg`} style={{ background: `${MEDAL[pos]}22` }} />
                </div>
              )
            })}
          </div>
          {note && <p className="text-center text-xs text-slate-500 mt-3 italic">“{note}”</p>}
        </>
      )}

      {/* نافذة التعيين */}
      {showSet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowSet(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Pin size={16} style={{ color: 'var(--maroon-600)' }} /> تعيين موظف الشهر</h3>
              <button onClick={() => setShowSet(false)} aria-label="إغلاق" className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">الموظف</label>
                <select value={pickUser} onChange={e => setPickUser(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
                  <option value="">— اختر موظفاً —</option>
                  {people.map(p => <option key={p.id} value={p.id}>{p.name_ar}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">عبارة تكريم (اختياري)</label>
                <input value={pickNote} onChange={e => setPickNote(e.target.value)}
                  placeholder="مثال: لجهوده المتميّزة هذا الشهر"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
              </div>
              <button onClick={setFeatured} disabled={saving || !pickUser}
                className="w-full flex items-center justify-center gap-2 text-white font-semibold py-2.5 rounded-xl transition-all hover:brightness-110 disabled:opacity-50"
                style={{ background: 'var(--gradient-button)' }}>
                <span className="inline-flex">{saving ? <Loader2 size={16} className="animate-spin" /> : <Pin size={16} />}</span>
                <span>{saving ? 'جارٍ التعيين...' : 'تثبيت موظف الشهر'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

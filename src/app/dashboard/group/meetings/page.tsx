'use client'

import { useState, useEffect } from 'react'
import { usePermissions } from '@/lib/PermissionsContext'
import NoAccess from '@/components/NoAccess'
import { toast } from '@/components/Toast'
import {
  CalendarDays, Plus, X, Loader2, Trash2, Video, Link2, UserRound, Clock,
  Briefcase, Monitor,
} from 'lucide-react'

/* ── منصات الاجتماع (نفس آلية صفحة الاجتماعات الرئيسية) ── */
const PLATFORM_META: Record<string, { name: string; Icon: React.ElementType; color: string; bg: string }> = {
  google_meet: { name: 'Google Meet',     Icon: Video,     color: '#1a73e8', bg: '#e8f0fe' },
  teams:       { name: 'Microsoft Teams', Icon: Briefcase, color: '#6264a7', bg: '#edecf6' },
  zoom:        { name: 'Zoom',            Icon: Monitor,   color: '#2d8cff', bg: '#e3f0ff' },
  other:       { name: 'رابط اجتماع',    Icon: Link2,     color: '#64748b', bg: '#f1f5f9' },
}
function detectPlatform(u: string): string {
  if (!u) return 'other'
  const url = u.toLowerCase()
  if (url.includes('meet.google.com'))                                    return 'google_meet'
  if (url.includes('teams.microsoft.com') || url.includes('teams.live.com')) return 'teams'
  if (url.includes('zoom.us'))                                            return 'zoom'
  return 'other'
}

type Principal = { id: string; name_ar: string; email: string | null; school_name: string }
type Meeting = {
  id: string; title: string; description: string | null
  meeting_url: string | null; platform: string | null; scheduled_at: string | null
  duration_minutes: number; attendees: string[]; created_at: string
}

export default function GroupMeetingsPage() {
  const { isGroupOwner, isSuperAdmin, loading: permsLoading } = usePermissions()
  const [meetings, setMeetings]     = useState<Meeting[]>([])
  const [principals, setPrincipals] = useState<Principal[]>([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [saving, setSaving]         = useState(false)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  /* النموذج */
  const [title, setTitle]       = useState('')
  const [url, setUrl]           = useState('')
  const platform = detectPlatform(url)
  const [date, setDate]         = useState('')
  const [time, setTime]         = useState('')
  const [duration, setDuration] = useState(60)
  const [invited, setInvited]   = useState<string[]>([])

  const load = async () => {
    setLoading(true)
    const [mRes, pRes] = await Promise.all([
      fetch('/api/groups/meetings'),
      fetch('/api/groups/principals'),
    ])
    if (mRes.ok) setMeetings((await mRes.json()).meetings || [])
    if (pRes.ok) setPrincipals((await pRes.json()).principals || [])
    setLoading(false)
  }

  useEffect(() => {
    if (permsLoading) return
    if (!isGroupOwner && !isSuperAdmin) { setLoading(false); return }
    load()
  }, [permsLoading, isGroupOwner, isSuperAdmin])

  const resetForm = () => {
    setTitle(''); setUrl(''); setDate(''); setTime(''); setDuration(60); setInvited([])
  }

  const toggleInvite = (id: string) =>
    setInvited(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    const scheduled_at = date && time
      ? new Date(`${date}T${time}`).toISOString()
      : date ? new Date(date).toISOString() : null
    const res = await fetch('/api/groups/meetings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title, meeting_url: url, platform, scheduled_at, duration_minutes: duration, attendees: invited,
      }),
    })
    setSaving(false)
    if (!res.ok) { toast('تعذّر إنشاء الاجتماع', 'error'); return }
    toast('تم جدولة الاجتماع وإشعار المدعوين')
    setShowForm(false); resetForm(); await load()
  }

  const doDelete = async () => {
    if (!confirmDel) return
    const res = await fetch('/api/groups/meetings', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: confirmDel }),
    })
    if (res.ok) { toast('تم حذف الاجتماع'); await load() }
    setConfirmDel(null)
  }

  if (permsLoading || loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--maroon-600)' }} />
    </div>
  )
  if (!isGroupOwner && !isSuperAdmin) return <NoAccess />

  const nameOf = (id: string) => principals.find(p => p.id === id)?.name_ar || 'مدير'

  return (
    <div className="space-y-5" dir="rtl">
      {/* رأس */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <CalendarDays size={22} style={{ color: 'var(--maroon-600)' }} /> اجتماعات المجموعة
          </h2>
          <p className="text-slate-500 text-sm mt-1">جدولة اجتماعات مع مديري مدارس المجموعة</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-2 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:brightness-110 shadow-lg"
          style={{ background: 'var(--gradient-button)' }}>
          <Plus size={16} /> اجتماع جديد
        </button>
      </div>

      {/* قائمة الاجتماعات */}
      {meetings.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center text-slate-400">
          <CalendarDays size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium text-slate-500">لا توجد اجتماعات بعد</p>
          <p className="text-xs mt-1">جدول اجتماعاً مع مديري مدارس مجموعتك</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {meetings.map(m => {
            const dt = m.scheduled_at ? new Date(m.scheduled_at) : null
            const isPast = dt ? dt < new Date() : false
            return (
              <div key={m.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between"
                  style={{ background: isPast ? '#f8fafc' : '#fbf2f4' }}>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: isPast ? '#e2e8f0' : 'var(--maroon-100)', color: isPast ? '#64748b' : 'var(--maroon-700)' }}>
                    {isPast ? 'منتهٍ' : 'قادم'}
                  </span>
                  <button onClick={() => setConfirmDel(m.id)} aria-label="حذف"
                    className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                </div>
                <div className="p-4">
                  <h4 className="font-bold text-slate-800 mb-2">{m.title}</h4>
                  {dt && (
                    <p className="text-xs text-slate-500 flex items-center gap-1.5 mb-1">
                      <Clock size={12} /> {dt.toLocaleDateString('ar-QA')} · {dt.toLocaleTimeString('ar-QA', { hour: '2-digit', minute: '2-digit' })} ({m.duration_minutes} د)
                    </p>
                  )}
                  {/* المدعوون */}
                  {m.attendees.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {m.attendees.map(uid => (
                        <span key={uid} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">
                          <UserRound size={9} /> {nameOf(uid)}
                        </span>
                      ))}
                    </div>
                  )}
                  {m.meeting_url ? (() => {
                    const pm = PLATFORM_META[m.platform || detectPlatform(m.meeting_url)] || PLATFORM_META.other
                    return (
                      <a href={m.meeting_url} target="_blank" rel="noopener noreferrer"
                        className="mt-3 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold text-white transition-all hover:brightness-110"
                        style={{ backgroundColor: isPast ? '#94a3b8' : 'var(--maroon-600)' }}>
                        <pm.Icon size={13} /> {isPast ? 'عرض الرابط' : `انضمام عبر ${pm.name}`}
                      </a>
                    )
                  })() : (
                    <span className="mt-3 block text-center text-xs text-slate-400 py-2 bg-slate-50 rounded-xl border border-dashed border-slate-200">لا يوجد رابط</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* نافذة الإنشاء */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><CalendarDays size={18} style={{ color: 'var(--maroon-600)' }} /> اجتماع جديد</h3>
              <button onClick={() => setShowForm(false)} aria-label="إغلاق" className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button>
            </div>
            <form onSubmit={save} className="p-5 space-y-3">
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="عنوان الاجتماع *"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
              {/* رابط الاجتماع + اكتشاف المنصة + إنشاء Meet */}
              <div>
                <div className="relative">
                  {(() => {
                    const pm = PLATFORM_META[platform]
                    const Ic = pm?.Icon || Link2
                    return <Ic size={15} className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: platform !== 'other' ? pm.color : '#94a3b8' }} />
                  })()}
                  <input value={url} onChange={e => setUrl(e.target.value)} placeholder="رابط الاجتماع (Meet/Zoom/Teams)" dir="ltr"
                    className="w-full pr-9 pl-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                </div>

                {/* شارة المنصة المكتشفة */}
                {url && platform !== 'other' && (() => {
                  const pm = PLATFORM_META[platform]
                  return (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-500">تم اكتشاف المنصة:</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1"
                        style={{ backgroundColor: pm.bg, color: pm.color }}>
                        <pm.Icon size={10} /> {pm.name}
                      </span>
                    </div>
                  )
                })()}

                {/* إنشاء اجتماع Google Meet */}
                <div className="mt-2 flex items-center gap-2">
                  <a href="https://meet.google.com/new" target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                    <Video size={12} className="inline ml-1" /> إنشاء اجتماع Google Meet جديد ↗
                  </a>
                  <span className="text-slate-300">·</span>
                  <span className="text-[10px] text-slate-400">الصق الرابط هنا بعد الإنشاء</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input type="date" value={date} onChange={e => setDate(e.target.value)} dir="ltr"
                  className="px-2 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-violet-300" />
                <input type="time" value={time} onChange={e => setTime(e.target.value)} dir="ltr"
                  className="px-2 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-violet-300" />
                <input type="number" value={duration} onChange={e => setDuration(+e.target.value)} placeholder="دقائق" min={15} step={15}
                  className="px-2 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-violet-300" />
              </div>

              {/* المدعوون — مديرو المجموعة */}
              <div>
                <p className="text-xs font-bold text-slate-500 mb-1.5">دعوة مديري المدارس ({invited.length})</p>
                <div className="border border-slate-200 rounded-xl max-h-44 overflow-y-auto divide-y divide-slate-50">
                  {principals.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-slate-400 text-center">لا يوجد مديرو مدارس في المجموعة</p>
                  ) : principals.map(p => (
                    <label key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
                      <input type="checkbox" checked={invited.includes(p.id)} onChange={() => toggleInvite(p.id)} className="w-4 h-4 accent-violet-600" />
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-700 truncate">{p.name_ar}</p>
                        <p className="text-[10px] text-slate-400 truncate">{p.school_name}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={saving || !title.trim()}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all hover:brightness-110" style={{ background: 'var(--gradient-button)' }}>
                  {saving ? 'جارٍ الجدولة...' : 'جدولة الاجتماع'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50 transition-colors">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* تأكيد الحذف */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setConfirmDel(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 text-center" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-3"><Trash2 size={22} className="text-red-500" /></div>
            <h3 className="font-bold text-slate-800 mb-1">حذف الاجتماع</h3>
            <p className="text-sm text-slate-500 mb-5">هل أنت متأكد من حذف هذا الاجتماع؟</p>
            <div className="flex gap-2">
              <button onClick={doDelete} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors">نعم، احذف</button>
              <button onClick={() => setConfirmDel(null)} className="px-5 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50 transition-colors">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

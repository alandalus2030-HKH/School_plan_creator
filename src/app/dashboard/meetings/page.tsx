'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/lib/PermissionsContext'
import { createNotification } from '@/lib/notifications'
import { CalendarDays, CalendarClock, CalendarCheck, UserRound,
  AlertTriangle, Inbox, Video, Briefcase, Link2, Monitor } from 'lucide-react'
import type { Plan, Team, TeamMember, Meeting } from '@/lib/types'

/* ══════════════════ ثوابت ══════════════════ */
const PLATFORM_META: Record<string, { name: string; Icon: React.ElementType; color: string; bg: string; border: string }> = {
  google_meet: { name: 'Google Meet',     Icon: Video,    color: '#1a73e8', bg: '#e8f0fe', border: '#c5d8fd' },
  teams:       { name: 'Microsoft Teams', Icon: Briefcase,color: '#6264a7', bg: '#edecf6', border: '#c8c8e8' },
  zoom:        { name: 'Zoom',            Icon: Monitor,  color: '#2d8cff', bg: '#e3f0ff', border: '#b3d4ff' },
  other:       { name: 'رابط اجتماع',    Icon: Link2,    color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
}

function detectPlatform(url: string): string {
  if (!url) return 'other'
  const u = url.toLowerCase()
  if (u.includes('meet.google.com'))                                       return 'google_meet'
  if (u.includes('teams.microsoft.com') || u.includes('teams.live.com'))  return 'teams'
  if (u.includes('zoom.us'))                                               return 'zoom'
  return 'other'
}

const EMPTY_FORM = {
  title:            '',
  description:      '',
  meeting_url:      '',
  platform:         'other',
  scheduled_at:     '',
  scheduled_time:   '',
  duration_minutes: 60,
  plan_id:          '',
  task_id:          '',
  attendees:        [] as string[],
}

const iCls = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-300 text-sm bg-white'

/* ══════════════════ صفحة الاجتماعات ══════════════════ */
export default function MeetingsPage() {
  const supabase = createClient()
  const { can, userId } = usePermissions()

  const [meetings,     setMeetings]     = useState<Meeting[]>([])
  const [plans,        setPlans]        = useState<Pick<Plan, 'id' | 'name_ar' | 'school_id'>[]>([])
  const [tasks,        setTasks]        = useState<{ id: string; name_ar: string }[]>([])
  const [profiles,     setProfiles]     = useState<{ id: string; name_ar: string; full_name_ar: string }[]>([])
  const [teams,        setTeams]        = useState<Pick<Team, 'id' | 'name_ar' | 'color'>[]>([])
  const [teamMembers,  setTeamMembers]  = useState<Pick<TeamMember, 'team_id' | 'profile_id'>[]>([])
  const [schoolId,     setSchoolId]     = useState<string | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [loadError,    setLoadError]    = useState('')
  const [saveError,    setSaveError]    = useState('')
  const [showForm,     setShowForm]     = useState(false)
  const [editId,       setEditId]       = useState<string | null>(null)
  const [form,         setForm]         = useState({ ...EMPTY_FORM })
  const [saving,       setSaving]       = useState(false)
  const [confirmDel,   setConfirmDel]   = useState<string | null>(null)
  const [filterPlan,   setFilterPlan]   = useState('')
  const [filterTime,   setFilterTime]   = useState<'mine' | 'upcoming' | 'past' | 'all'>('all')
  const [search,       setSearch]       = useState('')

  /* قائمة منسدلة الحضور */
  const [showAttendeesDrop, setShowAttendeesDrop] = useState(false)
  const attendeesRef = useRef<HTMLDivElement>(null)

  const canManage = can('manage_plans') || can('manage_tasks')

  /* ══ إغلاق قائمة الحضور عند الضغط خارجها ══ */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (attendeesRef.current && !attendeesRef.current.contains(e.target as Node))
        setShowAttendeesDrop(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  /* ════ جلب البيانات ════ */
  const load = async () => {
    setLoading(true)
    setLoadError('')

    /* جلب الاجتماعات أولاً بشكل مستقل لاكتشاف أي خطأ */
    const { data: mtgs, error: mtgsErr } = await supabase
      .from('meetings').select('*').order('scheduled_at', { ascending: true }).limit(500)

    if (mtgsErr) {
      console.error('[meetings] load error:', mtgsErr)
      setLoadError(`خطأ في تحميل الاجتماعات: ${mtgsErr.message}`)
      setLoading(false)
      return
    }

    /* باقي البيانات */
    const [
      { data: plns   },
      { data: tsks   },
      { data: profs  },
      { data: tms    },
      { data: tmMbrs },
    ] = await Promise.all([
      supabase.from('plans').select('id, name_ar, school_id').limit(100),
      supabase.from('tasks').select('id, name_ar').limit(1000),
      supabase.from('profiles').select('id, name_ar, full_name_ar').order('name_ar').limit(500),
      supabase.from('teams').select('id, name_ar, color').order('name_ar').limit(100),
      supabase.from('team_members').select('team_id, profile_id').limit(1000),
    ])

    setMeetings(mtgs    || [])
    setPlans(plns       || [])
    setTasks(tsks       || [])
    setProfiles(profs   || [])
    setTeams(tms        || [])
    setTeamMembers(tmMbrs || [])
    /* استخرج school_id من أول خطة */
    const sid = (plns || []).find((p: any) => p.school_id)?.school_id || null
    if (sid) setSchoolId(sid)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  /* ════ اسم المستخدم ════ */
  const profileName = (p: any) => p?.full_name_ar || p?.name_ar || '—'

  /* ════ فتح نموذج الإنشاء ════ */
  const openCreate = () => {
    setEditId(null)
    setForm({ ...EMPTY_FORM })
    setShowAttendeesDrop(false)
    setShowForm(true)
  }

  /* ════ فتح نموذج التعديل ════ */
  const openEdit = (m: any) => {
    const dt = m.scheduled_at ? new Date(m.scheduled_at) : null
    setEditId(m.id)
    setForm({
      title:            m.title || '',
      description:      m.description || '',
      meeting_url:      m.meeting_url || '',
      platform:         m.platform || 'other',
      scheduled_at:     dt ? dt.toISOString().split('T')[0] : '',
      scheduled_time:   dt ? dt.toTimeString().slice(0, 5) : '',
      duration_minutes: m.duration_minutes || 60,
      plan_id:          m.plan_id  || '',
      task_id:          m.task_id  || '',
      attendees:        Array.isArray(m.attendees) ? [...m.attendees] : [],
    })
    setShowAttendeesDrop(false)
    setShowForm(true)
  }

  /* ════ تحديث الرابط → اكتشاف المنصة ════ */
  const handleUrlChange = (url: string) => {
    setForm(f => ({ ...f, meeting_url: url, platform: detectPlatform(url) }))
  }

  /* ════ تبديل حضور فردي ════ */
  const toggleAttendee = (id: string) => {
    setForm(f => ({
      ...f,
      attendees: f.attendees.includes(id)
        ? f.attendees.filter(a => a !== id)
        : [...f.attendees, id],
    }))
  }

  /* ════ دعوة فريق كامل ════ */
  const inviteTeam = (teamId: string) => {
    if (!teamId) return
    const memberIds = teamMembers
      .filter(m => m.team_id === teamId)
      .map(m => m.profile_id)
      .filter(Boolean)

    setForm(f => ({
      ...f,
      attendees: [...new Set([...f.attendees, ...memberIds])],
    }))
  }

  /* ════ حفظ الاجتماع ════ */
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    setSaveError('')

    const scheduled_at = form.scheduled_at && form.scheduled_time
      ? new Date(`${form.scheduled_at}T${form.scheduled_time}`).toISOString()
      : form.scheduled_at
        ? new Date(form.scheduled_at).toISOString()
        : null

    const payload = {
      title:            form.title.trim(),
      description:      form.description.trim() || null,
      meeting_url:      form.meeting_url.trim()  || null,
      platform:         form.platform,
      scheduled_at,
      duration_minutes: form.duration_minutes,
      plan_id:          form.plan_id  || null,
      task_id:          form.task_id  || null,
      created_by:       userId || null,
      school_id:        schoolId || null,
      attendees:        form.attendees,
    }

    let dbError = null

    if (editId) {
      const { error } = await supabase.from('meetings').update(payload).eq('id', editId)
      dbError = error
    } else {
      const { error } = await supabase.from('meetings').insert(payload)
      dbError = error
    }

    if (dbError) {
      console.error('[meetings] save error:', dbError)
      setSaveError(`فشل الحفظ: ${dbError.message}`)
      setSaving(false)
      return
    }

    /* ══ إشعارات للحضور ══ */
    const prevAttendees: string[] = editId
      ? (meetings.find(m => m.id === editId)?.attendees || [])
      : []

    const dateLabel = scheduled_at
      ? new Date(scheduled_at).toLocaleString('ar-QA', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })
      : ''

    for (const recipientId of form.attendees) {
      if (recipientId === userId) continue

      const isNew = !prevAttendees.includes(recipientId)
      await createNotification({
        recipientId,
        senderId: userId || undefined,
        type:     isNew ? 'meeting_invite' : 'meeting_updated',
        title:    isNew
          ? `📅 دُعيت لاجتماع: ${form.title.trim()}`
          : `✏️ تحديث اجتماع: ${form.title.trim()}`,
        body: dateLabel || undefined,
        link: '/dashboard/meetings',
      })
    }

    setSaving(false)
    setShowForm(false)
    await load()
  }

  /* ════ حذف ════ */
  const deleteMeeting = async (id: string) => {
    await supabase.from('meetings').delete().eq('id', id)
    setMeetings(prev => prev.filter(m => m.id !== id))
    setConfirmDel(null)
  }

  /* ════ فلترة ════ */
  const now = new Date()

  const filtered = useMemo(() => {
    return meetings.filter(m => {
      /* فلتر الخطة */
      if (filterPlan && m.plan_id !== filterPlan) return false
      /* فلتر البحث */
      if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false

      const dt     = m.scheduled_at ? new Date(m.scheduled_at) : null
      const isPast = dt ? dt < now : false

      if (filterTime === 'mine') {
        /* مدير = يرى كل الاجتماعات */
        if (canManage) return true
        /* غيره = ما أنشأه أو دُعي إليه */
        return m.created_by === userId ||
          (Array.isArray(m.attendees) && m.attendees.includes(userId))
      }
      if (filterTime === 'upcoming') return !isPast
      if (filterTime === 'past')     return !!isPast
      return true   // 'all'
    })
  }, [meetings, filterPlan, search, filterTime, userId])

  /* ════ إحصائيات ════ */
  const todayCount    = meetings.filter(m => m.scheduled_at &&
    new Date(m.scheduled_at).toDateString() === now.toDateString()).length
  const upcomingCount = meetings.filter(m => m.scheduled_at && new Date(m.scheduled_at) >= now).length
  const myCount = canManage
    ? meetings.length
    : meetings.filter(m =>
        m.created_by === userId ||
        (Array.isArray(m.attendees) && m.attendees.includes(userId))
      ).length

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full" />
    </div>
  )

  if (loadError) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3" dir="rtl">
      <AlertTriangle size={40} style={{ color: 'var(--maroon-600)' }} />
      <p className="text-red-600 font-semibold">{loadError}</p>
      <button onClick={load} className="px-4 py-2 bg-violet-600 text-white rounded-xl text-sm">
        إعادة المحاولة
      </button>
    </div>
  )

  return (
    <div className="space-y-5" dir="rtl">

      {/* ══ رأس الصفحة ══ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <CalendarDays size={22} style={{ color: 'var(--maroon-600)' }} /> الاجتماعات
          </h2>
          <p className="text-slate-500 text-sm mt-1">إدارة روابط الاجتماعات وربطها بالخطط والمهام</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a href="https://meet.google.com/new" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 transition-colors">
            🎥 إنشاء اجتماع Google Meet
          </a>
          {canManage && (
            <button onClick={openCreate}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-violet-200">
              ➕ إضافة اجتماع
            </button>
          )}
        </div>
      </div>

      {/* ══ بطاقات الإحصاء ══ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'إجمالي الاجتماعات', value: meetings.length, Icon: CalendarDays,  tone: 'dark'   },
          { label: 'القادمة',            value: upcomingCount,   Icon: CalendarClock, tone: 'medium' },
          { label: 'اليوم',              value: todayCount,      Icon: CalendarCheck, tone: 'light2' },
          { label: 'اجتماعاتي',          value: myCount,         Icon: UserRound,     tone: 'light'  },
        ].map(s => {
          const tMap: Record<string,{bg:string;fg:string;iconFg:string}> = {
            dark:   { bg:'linear-gradient(135deg,#5a0d22,#8a1538)', fg:'#fff',    iconFg:'rgba(255,255,255,0.8)' },
            medium: { bg:'#f4dde2', fg:'#8a1538', iconFg:'#c25c74' },
            light2: { bg:'#fbf2f4', fg:'#8a1538', iconFg:'#d98ea0' },
            light:  { bg:'#f4dde2', fg:'#6f1029', iconFg:'#c25c74' },
          }
          const t = tMap[s.tone]
          return (
            <div key={s.label} className="rounded-2xl p-4 shadow-sm text-center"
              style={{ background: t.bg, color: t.fg }}>
              <s.Icon size={24} style={{ color: t.iconFg, margin: '0 auto 6px' }} />
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-xs font-medium mt-0.5 opacity-80">{s.label}</div>
            </div>
          )
        })}
      </div>

      {/* ══ فلاتر ══ */}
      <div className="flex items-center gap-3 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 بحث..."
          className="flex-1 min-w-[160px] px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />

        <select value={filterPlan} onChange={e => setFilterPlan(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
          <option value="">كل الخطط</option>
          {plans.map(p => <option key={p.id} value={p.id}>{p.name_ar}</option>)}
        </select>

        <div className="flex bg-slate-100 p-1 rounded-xl">
          {([
            { key: 'mine',     label: '👤 اجتماعاتي' },
            { key: 'upcoming', label: 'القادمة'       },
            { key: 'past',     label: 'المنتهية'      },
            { key: 'all',      label: 'الكل'          },
          ] as const).map(tab => (
            <button key={tab.key} onClick={() => setFilterTime(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filterTime === tab.key
                  ? 'bg-white text-violet-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ══ قائمة الاجتماعات ══ */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
          <div className="flex justify-center mb-3" style={{ color: 'var(--maroon-300)' }}>
            <CalendarDays size={48} />
          </div>
          <p className="text-slate-500 font-medium">
            {filterTime === 'mine' ? 'لا توجد اجتماعات مدعو إليها' : 'لا توجد اجتماعات'}
          </p>
          {canManage && (
            <button onClick={openCreate}
              className="mt-4 px-5 py-2 bg-violet-600 text-white text-sm rounded-xl hover:bg-violet-700 transition-colors">
              ➕ أضف اجتماعاً
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(m => {
            const pm      = PLATFORM_META[m.platform || 'other']
            const dt      = m.scheduled_at ? new Date(m.scheduled_at) : null
            const isPast  = dt ? dt < now : false
            const isToday = dt ? dt.toDateString() === now.toDateString() : false
            const plan    = plans.find(p => p.id === m.plan_id)
            const task    = tasks.find(t => t.id === m.task_id)
            const creator = profiles.find(p => p.id === m.created_by)
            const attends = Array.isArray(m.attendees)
              ? m.attendees.map((id: string) => profiles.find(p => p.id === id)).filter(Boolean)
              : []

            return (
              <div key={m.id}
                className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all hover:shadow-md ${
                  isPast  ? 'opacity-70 border-slate-200'
                  : isToday ? 'border-amber-300 ring-2 ring-amber-100'
                  : 'border-slate-200'
                }`}>

                {/* شريط المنصة */}
                <div className="px-4 py-2.5 flex items-center justify-between"
                  style={{ backgroundColor: pm.bg, borderBottom: `1px solid ${pm.border}` }}>
                  <div className="flex items-center gap-2">
                    <pm.Icon size={16} style={{ color: pm.color, flexShrink: 0 }} />
                    <span className="text-xs font-semibold" style={{ color: pm.color }}>{pm.name}</span>
                  </div>
                  <div className="flex gap-1.5">
                    {isToday && <span className="text-xs px-2 py-0.5 bg-amber-500 text-white rounded-full font-semibold">اليوم</span>}
                    {isPast  && <span className="text-xs px-2 py-0.5 bg-slate-400 text-white rounded-full">منتهي</span>}
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm leading-snug">{m.title}</h3>
                    {m.description && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{m.description}</p>
                    )}
                  </div>

                  {dt && (
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <span>🗓️</span>
                      <span className="font-medium">
                        {dt.toLocaleDateString('ar-QA', { weekday:'short', year:'numeric', month:'short', day:'numeric' })}
                      </span>
                      <span>·</span>
                      <span>{dt.toLocaleTimeString('ar-QA', { hour:'2-digit', minute:'2-digit' })}</span>
                      {m.duration_minutes && <span className="text-slate-400">({m.duration_minutes} د)</span>}
                    </div>
                  )}

                  {/* الحضور */}
                  {attends.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[10px] text-slate-400 ml-1">الحضور:</span>
                      {attends.slice(0, 4).map((p: any) => (
                        <span key={p.id}
                          className="text-[10px] px-2 py-0.5 bg-violet-50 text-violet-600 rounded-full border border-violet-100 font-medium">
                          {profileName(p)}
                        </span>
                      ))}
                      {attends.length > 4 && (
                        <span className="text-[10px] text-slate-400">+{attends.length - 4}</span>
                      )}
                    </div>
                  )}

                  {/* الخطة والمهمة والمنشئ */}
                  <div className="flex flex-wrap gap-1.5">
                    {plan && (
                      <span className="text-[10px] px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full font-medium">
                        🗺️ {plan.name_ar}
                      </span>
                    )}
                    {task && (
                      <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">
                        ✅ {task.name_ar}
                      </span>
                    )}
                    {creator && (
                      <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                        📌 {profileName(creator)}
                      </span>
                    )}
                  </div>

                  {/* أزرار */}
                  <div className="flex items-center gap-2 pt-1">
                    {m.meeting_url ? (
                      <a href={m.meeting_url} target="_blank" rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold text-white transition-all hover:brightness-110 hover:shadow-md"
                        style={{ backgroundColor: isPast ? '#94a3b8' : pm.color }}>
                        <pm.Icon size={14} /> {isPast ? 'عرض الرابط' : 'انضمام للاجتماع'}
                      </a>
                    ) : (
                      <span className="flex-1 text-center text-xs text-slate-400 py-2 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        لا يوجد رابط
                      </span>
                    )}
                    {canManage && (
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(m)}
                          className="w-8 h-8 flex items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-amber-500 hover:bg-amber-50 hover:border-amber-200 transition-colors text-sm">
                          ✏️
                        </button>
                        <button onClick={() => setConfirmDel(m.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-red-500 hover:bg-red-50 hover:border-red-200 transition-colors text-sm">
                          🗑️
                        </button>
                      </div>
                    )}
                  </div>

                  {confirmDel === m.id && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                      <span className="text-xs text-red-700 flex-1">حذف الاجتماع نهائياً؟</span>
                      <button onClick={() => deleteMeeting(m.id)}
                        className="px-3 py-1 bg-red-600 text-white text-xs rounded-lg">نعم</button>
                      <button onClick={() => setConfirmDel(null)}
                        className="px-3 py-1 border border-slate-200 text-xs rounded-lg">لا</button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ══════════ نموذج إنشاء / تعديل ══════════ */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}>

            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-base">
                {editId ? '✏️ تعديل الاجتماع' : '➕ اجتماع جديد'}
              </h3>
              <button onClick={() => setShowForm(false)}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
            </div>

            <form onSubmit={save} className="flex-1 overflow-y-auto p-5 space-y-4">

              {/* العنوان */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">عنوان الاجتماع *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="مثال: اجتماع متابعة خطة التطوير" required className={iCls} />
              </div>

              {/* الوصف */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">الوصف (اختياري)</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2} placeholder="موضوع الاجتماع أو ملاحظات..."
                  className={iCls + ' resize-none'} />
              </div>

              {/* رابط الاجتماع */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">رابط الاجتماع</label>
                <div className="relative">
                  <input value={form.meeting_url} onChange={e => handleUrlChange(e.target.value)}
                    placeholder="https://meet.google.com/xxx-xxxx-xxx"
                    dir="ltr" className={iCls + ' pl-10'} />
                  {form.platform !== 'other' && (() => {
                    const pm = PLATFORM_META[form.platform]
                    return pm ? (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2">
                        <pm.Icon size={16} style={{ color: pm.color }} />
                      </span>
                    ) : null
                  })()}
                </div>
                {form.meeting_url && (() => {
                  const pm = PLATFORM_META[form.platform]
                  return pm ? (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-500">تم اكتشاف المنصة:</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1"
                        style={{ backgroundColor: pm.bg, color: pm.color }}>
                        <pm.Icon size={10} /> {pm.name}
                      </span>
                    </div>
                  ) : null
                })()}
                <div className="mt-2 flex items-center gap-2">
                  <a href="https://meet.google.com/new" target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                    <Video size={12} className="inline ml-1" /> إنشاء اجتماع Google Meet جديد ↗
                  </a>
                  <span className="text-slate-300">·</span>
                  <span className="text-[10px] text-slate-400">الصق الرابط هنا بعد الإنشاء</span>
                </div>
              </div>

              {/* التاريخ والوقت والمدة */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">التاريخ</label>
                  <input type="date" value={form.scheduled_at}
                    onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))}
                    className={iCls} style={{ direction: 'ltr' }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">الوقت</label>
                  <input type="time" value={form.scheduled_time}
                    onChange={e => setForm(f => ({ ...f, scheduled_time: e.target.value }))}
                    className={iCls} style={{ direction: 'ltr' }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">المدة</label>
                  <select value={form.duration_minutes}
                    onChange={e => setForm(f => ({ ...f, duration_minutes: Number(e.target.value) }))}
                    className={iCls}>
                    {[15, 30, 45, 60, 90, 120].map(d => (
                      <option key={d} value={d}>{d} د</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* ══ الحضور ══ */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-600">
                    الحضور المدعوون
                    {form.attendees.length > 0 && (
                      <span className="mr-1.5 text-violet-600 font-normal">({form.attendees.length})</span>
                    )}
                  </label>
                  {/* دعوة فريق */}
                  {teams.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400">دعوة فريق:</span>
                      <select
                        defaultValue=""
                        onChange={e => { inviteTeam(e.target.value); e.target.value = '' }}
                        className="text-[11px] px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-violet-300 cursor-pointer">
                        <option value="" disabled>اختر فريقاً...</option>
                        {teams.map(t => {
                          const cnt = teamMembers.filter(m => m.team_id === t.id).length
                          return (
                            <option key={t.id} value={t.id}>
                              {t.name_ar} ({cnt} عضو)
                            </option>
                          )
                        })}
                      </select>
                    </div>
                  )}
                </div>

                {/* قائمة الاختيار الفردي */}
                <div ref={attendeesRef} className="relative">
                  <button type="button"
                    onClick={() => setShowAttendeesDrop(v => !v)}
                    className={iCls + ' flex items-center justify-between cursor-pointer text-right'}>
                    <span className={form.attendees.length === 0 ? 'text-slate-400' : 'text-slate-700'}>
                      {form.attendees.length === 0 ? 'اختر حضوراً فردياً...' : `${form.attendees.length} مدعو`}
                    </span>
                    <span className="text-slate-400 text-xs">{showAttendeesDrop ? '▲' : '▼'}</span>
                  </button>

                  {showAttendeesDrop && (
                    <div className="absolute top-full right-0 left-0 z-20 bg-white border border-slate-200 rounded-xl shadow-xl max-h-44 overflow-y-auto mt-1">
                      {profiles.map(p => (
                        <label key={p.id}
                          className="flex items-center gap-3 px-3 py-2.5 hover:bg-violet-50 cursor-pointer border-b border-slate-50 last:border-0">
                          <input
                            type="checkbox"
                            checked={form.attendees.includes(p.id)}
                            onChange={() => toggleAttendee(p.id)}
                            className="rounded accent-violet-600 w-4 h-4 flex-shrink-0 cursor-pointer"
                          />
                          <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center text-xs font-bold text-violet-700 flex-shrink-0">
                            {profileName(p).charAt(0)}
                          </div>
                          <span className="text-sm text-slate-700">{profileName(p)}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* chips المدعوين */}
                {form.attendees.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {form.attendees.map(id => {
                      const p = profiles.find(x => x.id === id)
                      if (!p) return null
                      return (
                        <span key={id}
                          className="flex items-center gap-1 text-[11px] px-2.5 py-1 bg-violet-100 text-violet-700 rounded-full font-medium">
                          {profileName(p)}
                          <button type="button" onClick={() => toggleAttendee(id)}
                            className="hover:text-red-500 transition-colors leading-none ml-0.5">✕</button>
                        </span>
                      )
                    })}
                    <button type="button" onClick={() => setForm(f => ({ ...f, attendees: [] }))}
                      className="text-[11px] px-2 py-1 text-slate-400 hover:text-red-500 transition-colors">
                      مسح الكل
                    </button>
                  </div>
                )}
              </div>

              {/* خطأ الحفظ */}
              {saveError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                  ⚠️ {saveError}
                </div>
              )}

              {/* ربط بخطة ومهمة */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">ربط بخطة</label>
                  <select value={form.plan_id}
                    onChange={e => setForm(f => ({ ...f, plan_id: e.target.value, task_id: '' }))}
                    className={iCls}>
                    <option value="">— بدون —</option>
                    {plans.map(p => <option key={p.id} value={p.id}>{p.name_ar}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">ربط بمهمة</label>
                  <select value={form.task_id}
                    onChange={e => setForm(f => ({ ...f, task_id: e.target.value }))}
                    className={iCls}>
                    <option value="">— بدون —</option>
                    {tasks.slice(0, 50).map(t => <option key={t.id} value={t.id}>{t.name_ar}</option>)}
                  </select>
                </div>
              </div>

            </form>

            {/* أزرار الحفظ */}
            <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-400">
                {form.attendees.filter(id => id !== userId).length > 0 &&
                  `📨 سيصل إشعار لـ ${form.attendees.filter(id => id !== userId).length} شخص`}
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50 transition-colors">
                  إلغاء
                </button>
                <button onClick={save} disabled={saving || !form.title.trim()}
                  className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl disabled:opacity-60 transition-colors">
                  {saving ? '⏳ جارٍ الحفظ...' : editId ? '💾 حفظ التعديلات' : '✅ إضافة الاجتماع'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

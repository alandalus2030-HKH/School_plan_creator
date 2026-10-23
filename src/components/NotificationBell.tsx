'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { usePermissions } from '@/lib/PermissionsContext'
import { NOTIF_ICONS, NOTIF_LABELS, timeAgo } from '@/lib/notifications'
import { Bell, Trash2, ClipboardList, Clock, AlertTriangle,
  RefreshCw, MessageCircle, TrendingUp, Trophy, Map,
  CalendarDays, FolderOpen, FileQuestion } from 'lucide-react'

/** أنواع مسار الاعتماد — الشطر الأزرق. ويلحق بها لاحقاً المهامّ الدورية. */
const EVIDENCE_TYPES = ['evidence_status', 'evidence_request']

/* خريطة أسماء Lucide → مكوّنات */
const LUCIDE_MAP: Record<string, React.ElementType> = {
  ClipboardList, Clock, AlertTriangle, RefreshCw,
  MessageCircle, TrendingUp, Trophy, Map, CalendarDays, Bell, FolderOpen,
  FileQuestion,
}

type Notif = {
  id:         string
  type:       string
  title:      string
  body:       string | null
  link:       string | null
  is_read:    boolean
  created_at: string
}

export default function NotificationBell() {
  const router          = useRouter()
  const { userId, loading: permsLoading } = usePermissions()
  const dropdownRef     = useRef<HTMLDivElement>(null)

  const [open,        setOpen]        = useState(false)
  const [notifs,      setNotifs]      = useState<Notif[]>([])
  const [unread,      setUnread]      = useState(0)
  /* شطرا البالونة: أحمر للمهامّ والخطط · أزرق لأحكام الأدلة (مسار الاعتماد).
     والمحور **نوع الحدث** لا مصدر الدليل — فطابور الفرز يحكم على
     أدلة الخطط وأدلة القناة المباشرة سواء. */
  const [unreadEv,    setUnreadEv]    = useState(0)
  const [unreadOther, setUnreadOther] = useState(0)
  const [lens,        setLens]        = useState<'all' | 'evidence' | 'other'>('all')
  const [fetching,    setFetching]    = useState(false)
  const [clearing,    setClearing]    = useState(false)

  /* ── جلب الإشعارات ── */
  const fetchNotifs = useCallback(async () => {
    if (!userId) return
    try {
      const res  = await fetch('/api/notifications?limit=20')
      if (!res.ok) return
      const json = await res.json()
      setNotifs(json.notifications || [])
      setUnread(json.unreadCount   || 0)
      setUnreadEv(json.unreadEvidence ?? 0)
      setUnreadOther(json.unreadOther ?? (json.unreadCount || 0))
    } catch { /* تجاهل أخطاء الشبكة */ }
  }, [userId])

  /* تحميل أولي + polling كل 30 ثانية */
  useEffect(() => {
    if (permsLoading || !userId) return
    fetchNotifs()
    const iv = setInterval(fetchNotifs, 30_000)
    return () => clearInterval(iv)
  }, [fetchNotifs, permsLoading, userId])

  /* إغلاق عند الضغط خارج القائمة */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  /* ── تحديد إشعار كمقروء والانتقال للرابط ── */
  const handleClick = async (notif: Notif) => {
    if (!notif.is_read) {
      await fetch('/api/notifications', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id: notif.id }),
      })
      setNotifs(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n))
      setUnread(prev => Math.max(0, prev - 1))
    }
    setOpen(false)
    if (notif.link) router.push(notif.link)
  }

  /* ── تحديد الكل كمقروء ── */
  const markAllRead = async () => {
    setFetching(true)
    await fetch('/api/notifications', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ markAllRead: true }),
    })
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnread(0)
    setFetching(false)
  }

  /* ── حذف المقروءة ── */
  const clearRead = async () => {
    setClearing(true)
    await fetch('/api/notifications', { method: 'DELETE' })
    setNotifs(prev => prev.filter(n => !n.is_read))
    setClearing(false)
  }

  const isEvidence   = (n: Notif) => EVIDENCE_TYPES.includes(n.type)
  const inLens       = (n: Notif) =>
    lens === 'all' ? true : lens === 'evidence' ? isEvidence(n) : !isEvidence(n)
  const shown        = notifs.filter(inLens)
  const unreadNotifs = shown.filter(n => !n.is_read)
  const readNotifs   = shown.filter(n =>  n.is_read)

  return (
    <div className="relative" ref={dropdownRef}>

      {/* ── زر الجرس ── */}
      <button
        onClick={() => { setOpen(o => !o); if (!open) { setLens('all'); fetchNotifs() } }}
        className="relative p-2 text-slate-500 hover:text-[#8a1538] hover:bg-[#fbf2f4] rounded-full transition-colors"
        title="الإشعارات"
      >
        <Bell size={20} />
        {/* رقمٌ واحد بالمجموع — ونقطةٌ زرقاء تقول «فيها جديدٌ من مسار الاعتماد».
            ورقمان على أيقونة 20px يتزاحمان ويُقرآن كعطل. */}
        {unread > 0 && (
          <>
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] text-white
                             text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none"
                  style={{ background: 'var(--maroon-700, #8a1538)' }}>
              {unread > 99 ? '99+' : unread}
            </span>
            {unreadEv > 0 && (
              <span title={`${unreadEv} من مسار الاعتماد`}
                className="absolute bottom-0.5 left-0.5 w-[9px] h-[9px] rounded-full bg-sky-600 ring-2 ring-white" />
            )}
          </>
        )}
      </button>

      {/* ── القائمة المنسدلة ── */}
      {open && (
        <div className="absolute left-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden"
             style={{ maxHeight: '80vh' }}>

          {/* رأس القائمة */}
          <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-slate-800 text-sm">الإشعارات</span>
              {unread > 0 && (
                <button onClick={markAllRead} disabled={fetching}
                  className="text-[11px] text-[#8a1538] hover:brightness-75 font-medium transition-colors">
                  {fetching ? '...' : 'تحديد الكل كمقروء'}
                </button>
              )}
            </div>
            {/* المرشِّح في صفٍّ مستقلّ — كان يلتفّ على سطرين ويزاحم «تحديد الكل» */}
            <div className="flex items-center gap-1.5">
              {([
                { k: 'all',      ar: 'الكل',       n: unread,      on: 'bg-slate-700' },
                { k: 'other',    ar: 'مهامّ وخطط', n: unreadOther, on: 'bg-[#8a1538]' },
                { k: 'evidence', ar: 'أدلة',       n: unreadEv,    on: 'bg-sky-600'   },
              ] as const).map(t => (
                (t.k === 'all' || t.n > 0 || lens === t.k) && (
                  <button key={t.k} onClick={() => setLens(t.k)}
                    className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full transition-colors
                      ${lens === t.k ? `${t.on} text-white` : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'}`}>
                    {t.ar}{t.n > 0 ? ` ${t.n}` : ''}
                  </button>
                )
              ))}
            </div>
          </div>

          {/* قائمة الإشعارات */}
          <div className="overflow-y-auto" style={{ maxHeight: 'calc(80vh - 100px)' }}>

            {shown.length === 0 ? (
              <div className="py-12 text-center">
                <Bell size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-slate-400 text-sm">
                  {lens === 'evidence' ? 'لا إشعارات عن الأدلة' : lens === 'other' ? 'لا إشعارات عن المهامّ والخطط' : 'لا توجد إشعارات'}
                </p>
              </div>
            ) : (
              <>
                {/* غير المقروءة — مجموعتان حين يختلط النوعان في مرشِّح «الكل» */}
                {unreadNotifs.length > 0 && (() => {
                  const evN  = unreadNotifs.filter(isEvidence)
                  const oth  = unreadNotifs.filter(n => !isEvidence(n))
                  const mixed = lens === 'all' && evN.length > 0 && oth.length > 0
                  if (!mixed) return <div>{unreadNotifs.map(n => <NotifItem key={n.id} notif={n} onClick={handleClick} />)}</div>
                  return (
                    <div>
                      <GroupHead ar="مسار الاعتماد" cls="bg-sky-50 text-sky-800 border-sky-100" />
                      {evN.map(n => <NotifItem key={n.id} notif={n} onClick={handleClick} />)}
                      <GroupHead ar="المهامّ والخطط" cls="bg-slate-50 text-slate-500 border-slate-100" />
                      {oth.map(n => <NotifItem key={n.id} notif={n} onClick={handleClick} />)}
                    </div>
                  )
                })()}

                {/* المقروءة */}
                {readNotifs.length > 0 && (
                  <div>
                    {unreadNotifs.length > 0 && (
                      <div className="px-4 py-1.5 bg-slate-50 border-y border-slate-100">
                        <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">السابقة</span>
                      </div>
                    )}
                    {readNotifs.map(n => (
                      <NotifItem key={n.id} notif={n} onClick={handleClick} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* تذييل */}
          {readNotifs.length > 0 && (
            <div className="border-t border-slate-100 px-4 py-2.5 bg-slate-50 flex justify-end">
              <button onClick={clearRead} disabled={clearing}
                className="text-[11px] text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1">
                <Trash2 size={12} />
                {clearing ? '...' : 'حذف المقروءة'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── رأس مجموعة داخل القائمة ── */
function GroupHead({ ar, cls }: { ar: string; cls: string }) {
  return (
    <div className={`px-4 py-1 border-y ${cls}`}>
      <span className="text-[10px] font-semibold tracking-wide">{ar}</span>
    </div>
  )
}

/* ── عنصر إشعار واحد ── */
function NotifItem({ notif, onClick }: { notif: Notif; onClick: (n: Notif) => void }) {
  const iconName  = NOTIF_ICONS[notif.type] || 'Bell'
  const IconComp  = LUCIDE_MAP[iconName] || Bell
  const ev        = EVIDENCE_TYPES.includes(notif.type)
  const unread    = !notif.is_read

  /* لون النوع: أزرق لمسار الاعتماد · عنابيّ للمهامّ والخطط.
     والمقروء يفقد لونه فيتراجع بصرياً بلا أن يختفي. */
  const tone = !unread
    ? { bar: '#e2e8f0', ring: 'bg-slate-100', icon: '#94a3b8', label: 'text-slate-400', bg: 'bg-white' }
    : ev
      ? { bar: '#0284c7', ring: 'bg-sky-50',    icon: '#0369a1', label: 'text-sky-700',    bg: 'bg-sky-50/40' }
      : { bar: '#8a1538', ring: 'bg-maroon-50', icon: '#8a1538', label: 'text-[#993556]',  bg: 'bg-rose-50/40' }

  return (
    <button
      onClick={() => onClick(notif)}
      style={{ borderRightWidth: 3, borderRightStyle: 'solid', borderRightColor: tone.bar }}
      className={`w-full text-right px-3.5 py-3 flex items-start gap-2.5 hover:bg-slate-50
                  transition-colors border-b border-slate-50 last:border-0 ${tone.bg}`}
    >
      {/* أيقونة النوع بلون نوعها */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${tone.ring}`}
           style={!unread ? undefined : { background: ev ? '#e0f2fe' : 'var(--maroon-50, #fbf2f4)' }}>
        <IconComp size={16} style={{ color: tone.icon }} />
      </div>

      <div className="flex-1 min-w-0 text-right">
        {/* وسم النوع — التسميات كانت في الكود ولا تُعرض */}
        <div className="flex items-start justify-between gap-2">
          <p className={`text-[10px] font-semibold ${tone.label} leading-none`}>
            {NOTIF_LABELS[notif.type] || 'إشعار'}{!unread ? ' · مقروء' : ''}
          </p>
          {unread && (
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: tone.bar }} />
          )}
        </div>
        <p className={`text-xs leading-snug mt-1
                       ${unread ? 'font-semibold text-slate-800' : 'font-medium text-slate-500'}`}>
          {notif.title}
        </p>
        {notif.body && (
          <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{notif.body}</p>
        )}
        <p className="text-[10px] text-slate-400 mt-1">{timeAgo(notif.created_at)}</p>
      </div>
    </button>
  )
}

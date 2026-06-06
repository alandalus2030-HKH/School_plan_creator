'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { usePermissions } from '@/lib/PermissionsContext'
import { NOTIF_ICONS, NOTIF_LABELS, timeAgo } from '@/lib/notifications'
import { Bell, Trash2 } from 'lucide-react'

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

  const unreadNotifs = notifs.filter(n => !n.is_read)
  const readNotifs   = notifs.filter(n =>  n.is_read)

  return (
    <div className="relative" ref={dropdownRef}>

      {/* ── زر الجرس ── */}
      <button
        onClick={() => { setOpen(o => !o); if (!open) fetchNotifs() }}
        className="relative p-2 text-slate-500 hover:text-violet-700 hover:bg-violet-50 rounded-full transition-colors"
        title="الإشعارات"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white
                           text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* ── القائمة المنسدلة ── */}
      {open && (
        <div className="absolute left-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden"
             style={{ maxHeight: '80vh' }}>

          {/* رأس القائمة */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-800 text-sm">الإشعارات</span>
              {unread > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {unread} جديد
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button onClick={markAllRead} disabled={fetching}
                  className="text-[11px] text-violet-600 hover:text-violet-800 font-medium transition-colors">
                  {fetching ? '...' : 'تحديد الكل كمقروء'}
                </button>
              )}
            </div>
          </div>

          {/* قائمة الإشعارات */}
          <div className="overflow-y-auto" style={{ maxHeight: 'calc(80vh - 100px)' }}>

            {notifs.length === 0 ? (
              <div className="py-12 text-center">
                <Bell size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-slate-400 text-sm">لا توجد إشعارات</p>
              </div>
            ) : (
              <>
                {/* غير المقروءة */}
                {unreadNotifs.length > 0 && (
                  <div>
                    {unreadNotifs.map(n => (
                      <NotifItem key={n.id} notif={n} onClick={handleClick} />
                    ))}
                  </div>
                )}

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

/* ── عنصر إشعار واحد ── */
function NotifItem({ notif, onClick }: { notif: Notif; onClick: (n: Notif) => void }) {
  const icon  = NOTIF_ICONS[notif.type]  || '🔔'

  return (
    <button
      onClick={() => onClick(notif)}
      className={`w-full text-right px-4 py-3 flex items-start gap-3 hover:bg-slate-50
                  transition-colors border-b border-slate-50 last:border-0
                  ${!notif.is_read ? 'bg-violet-50/60' : 'bg-white'}`}
    >
      {/* أيقونة النوع */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm
                        ${!notif.is_read ? 'bg-violet-100' : 'bg-slate-100'}`}>
        {icon}
      </div>

      {/* المحتوى */}
      <div className="flex-1 min-w-0 text-right">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-xs leading-snug flex-1
                         ${!notif.is_read ? 'font-semibold text-slate-800' : 'font-medium text-slate-600'}`}>
            {notif.title}
          </p>
          {!notif.is_read && (
            <span className="w-2 h-2 bg-violet-500 rounded-full flex-shrink-0 mt-1" />
          )}
        </div>
        {notif.body && (
          <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{notif.body}</p>
        )}
        <p className="text-[10px] text-slate-400 mt-1">{timeAgo(notif.created_at)}</p>
      </div>
    </button>
  )
}

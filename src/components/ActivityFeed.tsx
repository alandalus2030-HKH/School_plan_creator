'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ACTIVITY_LABELS } from '@/lib/activity'
import { timeAgo } from '@/lib/notifications'
import {
  Activity, CircleCheckBig, RefreshCw, Trash2, Star,
  FileText, Map, Plus, History,
} from 'lucide-react'

type Log = {
  id:         string
  user_id:    string | null
  action:     string
  record_id:  string | null
  new_values: any
  created_at: string
  _userName?: string
}

const ACTION_ICON: Record<string, React.ElementType> = {
  task_created:        Plus,
  task_status_changed: RefreshCw,
  task_deleted:        Trash2,
  task_rated:          Star,
  evidence_added:      FileText,
  plan_created:        Map,
  plan_deleted:        Trash2,
  node_created:        Plus,
}

export default function ActivityFeed({ limit = 8 }: { limit?: number }) {
  const supabase = createClient()
  const [logs,    setLogs]    = useState<Log[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('audit_logs')
        .select('id, user_id, action, record_id, new_values, created_at')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (!data || data.length === 0) { setLogs([]); setLoading(false); return }

      /* جلب أسماء المستخدمين */
      const userIds = [...new Set(data.map(l => l.user_id).filter(Boolean))]
      const { data: profs } = await supabase
        .from('profiles').select('id, name_ar').in('id', userIds as string[])
      const nameMap = Object.fromEntries((profs || []).map(p => [p.id, p.name_ar]))

      setLogs(data.map(l => ({ ...l, _userName: l.user_id ? nameMap[l.user_id] : undefined })))
      setLoading(false)
    })()
  }, [limit])

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
        <History size={16} style={{ color: 'var(--maroon-600)' }} />
        <h3 className="font-bold text-slate-700">آخر النشاطات</h3>
      </div>

      {loading ? (
        <div className="divide-y divide-slate-50">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-slate-200 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-slate-200 rounded-full w-2/3" />
                <div className="h-2.5 bg-slate-100 rounded-full w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="py-10 text-center text-slate-400">
          <Activity size={28} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">لا يوجد نشاط بعد</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-50">
          {logs.map(log => {
            const Icon    = ACTION_ICON[log.action] || Activity
            const label   = ACTIVITY_LABELS[log.action] || log.action
            const summary = log.new_values?._summary
            return (
              <div key={log.id} className="flex items-center gap-3 px-5 py-3">
                <div className="w-8 h-8 rounded-full bg-violet-50 flex items-center justify-center flex-shrink-0">
                  <Icon size={14} style={{ color: 'var(--maroon-600)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700 leading-snug">
                    <span className="font-semibold">{log._userName || 'مستخدم'}</span>
                    {' '}
                    <span className="text-slate-500">{label}</span>
                    {summary && <span className="text-slate-700">: {summary}</span>}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{timeAgo(log.created_at)}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

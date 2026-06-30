'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePermissions } from '@/lib/PermissionsContext'
import NoAccess from '@/components/NoAccess'
import { History, Search, ChevronDown, ChevronUp, Globe, Loader2, Filter } from 'lucide-react'

const actionAr: Record<string, string> = {
  insert: 'إضافة', update: 'تعديل', delete: 'حذف',
  user_created: 'إنشاء مستخدم', user_deleted: 'حذف مستخدم',
  admin_purge_school: 'حذف مدرسة قسري', admin_reset_tenants: 'إعادة تهيئة', admin_purge_orphan_auth: 'تنظيف أشباح المصادقة',
  impersonate_enter: 'دخول كمدرسة', impersonate_exit: 'خروج من تقمّص',
  task_created: 'إنشاء مهمة', task_status_changed: 'تغيير حالة مهمة', task_deleted: 'حذف مهمة',
  task_rated: 'تقييم مهمة', evidence_added: 'إضافة دليل', plan_created: 'إنشاء خطة', plan_deleted: 'حذف خطة', node_created: 'إضافة عنصر',
  plan_certified: 'اعتماد خطة', plan_uncertified: 'إلغاء اعتماد خطة', plan_frozen: 'تجميد خطة', plan_unfrozen: 'إلغاء تجميد خطة',
  user_invited: 'دعوة مستخدم', password_reset: 'إعادة تعيين كلمة مرور',
  badge_granted: 'منح وسام', badge_revoked: 'سحب وسام',
  evidence_accepted: 'اعتماد دليل', evidence_rejected: 'رفض دليل', evidence_reset: 'إعادة دليل للمراجعة',
  featured_set: 'تعيين موظف الشهر', featured_cleared: 'إلغاء موظف الشهر',
  school_created: 'إنشاء مدرسة',
  department_assigned: 'إسناد قسم', group_owner_set: 'تعيين مالك مجموعة',
}
const tableAr: Record<string, string> = {
  profiles: 'المستخدمون', plans: 'الخطط', plan_nodes: 'عناصر الخطة', tasks: 'المهام',
  evidence: 'الأدلة', evidence_files: 'ملفات الأدلة', roles: 'الأدوار', schools: 'المدارس',
  teams: 'الفرق', team_members: 'أعضاء الفرق', department_supervisors: 'مشرفو الأقسام',
  dropdown_options: 'القوائم', school_calendar: 'التقويم', school_locations: 'الأماكن',
  badges: 'الأوسمة', motivational_quotes: 'الاقتباسات', user_badges: 'منح الأوسمة',
  meetings: 'الاجتماعات', meeting_attendees: 'حضور الاجتماعات', meeting_notes: 'محاضر الاجتماعات',
  group_meetings: 'اجتماعات المجموعة', school_groups: 'مجموعات المدارس',
}
const actionColor: Record<string, string> = {
  insert: 'bg-green-100 text-green-700', update: 'bg-blue-100 text-blue-700', delete: 'bg-red-100 text-red-700',
}

type Row = {
  id: string; user_id: string | null; user_name: string; action: string
  table_name: string | null; record_id: string | null
  old_values: any; new_values: any; ip_address: string | null; user_agent: string | null; created_at: string
}

export default function AuditPage() {
  const { isSuperAdmin, can, loading: permsLoading } = usePermissions()
  const allowed = isSuperAdmin || can('manage_settings')

  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [actors, setActors] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  const [q, setQ] = useState('')
  const [fActor, setFActor] = useState('')
  const [fTable, setFTable] = useState('')
  const [fAction, setFAction] = useState('')
  const [fFrom, setFFrom] = useState('')
  const [fTo, setFTo] = useState('')
  const [offset, setOffset] = useState(0)
  const LIMIT = 50

  const load = useCallback(async (reset: boolean) => {
    setLoading(true)
    const off = reset ? 0 : offset
    const p = new URLSearchParams({ limit: String(LIMIT), offset: String(off) })
    if (q) p.set('q', q); if (fActor) p.set('user', fActor); if (fTable) p.set('table', fTable)
    if (fAction) p.set('action', fAction); if (fFrom) p.set('from', fFrom); if (fTo) p.set('to', fTo)
    try {
      const res = await fetch(`/api/audit?${p}`)
      const json = await res.json()
      if (res.ok) {
        setRows(reset ? json.rows : [...rows, ...json.rows])
        setTotal(json.total); setActors(json.actors || [])
        setOffset(off + LIMIT)
      }
    } catch {}
    setLoading(false)
  }, [q, fActor, fTable, fAction, fFrom, fTo, offset, rows])

  useEffect(() => { if (allowed) { setOffset(0); load(true) } /* eslint-disable-next-line */ }, [allowed, q, fActor, fTable, fAction, fFrom, fTo])

  if (!permsLoading && !allowed) return <NoAccess />

  const fmt = (iso: string) => new Date(iso).toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <History size={22} style={{ color: 'var(--maroon-600)' }} />
        <h1 className="text-xl font-bold text-slate-800">سجل التدقيق</h1>
        <span className="text-xs text-slate-400">{total} عملية</span>
      </div>

      {/* الفلاتر */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div className="relative">
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث (الإجراء/الجدول/المعرّف)…"
            className="w-full pr-9 pl-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-sm" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <select value={fActor} onChange={e => setFActor(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none">
            <option value="">كل المستخدمين</option>
            {actors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={fTable} onChange={e => setFTable(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none">
            <option value="">كل الجداول</option>
            {Object.entries(tableAr).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={fAction} onChange={e => setFAction(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none">
            <option value="">كل الإجراءات</option>
            {['insert', 'update', 'delete'].map(k => <option key={k} value={k}>{actionAr[k]}</option>)}
          </select>
          <input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} dir="ltr" title="من تاريخ"
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none" />
          <input type="date" value={fTo} onChange={e => setFTo(e.target.value)} dir="ltr" title="إلى تاريخ"
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none" />
        </div>
      </div>

      {/* القائمة */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="py-12 text-center text-slate-400"><Loader2 size={24} className="animate-spin mx-auto" /></div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-slate-400"><Filter size={28} className="mx-auto mb-2 opacity-40" /><p className="text-sm">لا توجد عمليات مطابقة</p></div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map(r => {
              const open = expanded === r.id
              const hasDiff = r.old_values || r.new_values
              return (
                <div key={r.id}>
                  <button onClick={() => hasDiff && setExpanded(open ? null : r.id)}
                    className={`w-full flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 px-4 py-3 text-right ${hasDiff ? 'hover:bg-slate-50 cursor-pointer' : 'cursor-default'}`}>
                    <div className="flex items-center gap-2 sm:contents">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${actionColor[r.action] || 'bg-slate-100 text-slate-600'}`}>
                        {actionAr[r.action] || r.action}
                      </span>
                      <span className="text-sm text-slate-700 flex-shrink-0">{r.table_name ? (tableAr[r.table_name] || r.table_name) : '—'}</span>
                    </div>
                    <span className="text-xs text-slate-500 sm:flex-1 truncate min-w-0">بواسطة <span className="font-semibold text-slate-700">{r.user_name}</span></span>
                    <div className="flex items-center gap-3 sm:contents">
                      {r.ip_address && <span className="text-[11px] text-slate-400 inline-flex items-center gap-1 flex-shrink-0" dir="ltr"><Globe size={11} /> {r.ip_address}</span>}
                      <span className="text-xs text-slate-400 flex-shrink-0">{fmt(r.created_at)}</span>
                      {hasDiff && (open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />)}
                    </div>
                  </button>
                  {open && hasDiff && (
                    <div className="px-4 pb-3 bg-slate-50/60 text-xs">
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div>
                          <div className="text-[11px] font-semibold text-red-600 mb-1">قبل</div>
                          <pre dir="ltr" className="bg-white rounded-lg border border-slate-200 p-2 overflow-x-auto text-[11px] text-slate-600 whitespace-pre-wrap">{r.old_values ? JSON.stringify(r.old_values, null, 1) : '—'}</pre>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold text-green-600 mb-1">بعد</div>
                          <pre dir="ltr" className="bg-white rounded-lg border border-slate-200 p-2 overflow-x-auto text-[11px] text-slate-600 whitespace-pre-wrap">{r.new_values ? JSON.stringify(r.new_values, null, 1) : '—'}</pre>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-400">
                        {r.record_id && <span dir="ltr">السجل: {r.record_id}</span>}
                        {r.user_agent && <span className="truncate max-w-full" dir="ltr">الجهاز: {r.user_agent}</span>}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {rows.length < total && (
        <div className="text-center">
          <button onClick={() => load(false)} disabled={loading}
            className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm text-slate-700 inline-flex items-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : null} عرض المزيد ({total - rows.length})
          </button>
        </div>
      )}
    </div>
  )
}

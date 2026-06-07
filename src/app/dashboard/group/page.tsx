'use client'

import { useState, useEffect } from 'react'
import { usePermissions } from '@/lib/PermissionsContext'
import NoAccess from '@/components/NoAccess'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import {
  Building2, CircleCheckBig, AlertTriangle, TrendingUp, Loader2, Inbox, Lock, Layers,
} from 'lucide-react'

type Row = {
  id: string; name_ar: string; is_active: boolean
  plans: number; tasks_total: number; tasks_done: number
  tasks_delayed: number; tasks_overdue: number; completion: number
  kpi_count: number; kpi_avg: number | null; users: number; active_users: number
}

const barColor = (pct: number) =>
  pct >= 80 ? '#16a34a' : pct >= 50 ? '#a83356' : '#8a1538'

export default function GroupDashboardPage() {
  const { isGroupOwner, isSuperAdmin, loading: permsLoading } = usePermissions()
  const [rows, setRows] = useState<Row[]>([])
  const [groupName, setGroupName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (permsLoading) return
    if (!isGroupOwner && !isSuperAdmin) { setLoading(false); return }
    ;(async () => {
      const res = await fetch('/api/groups/overview')
      const json = await res.json()
      if (res.ok) { setRows(json.schools || []); setGroupName(json.group_name || '') }
      setLoading(false)
    })()
  }, [permsLoading, isGroupOwner, isSuperAdmin])

  if (permsLoading || loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--maroon-600)' }} />
    </div>
  )

  if (!isGroupOwner && !isSuperAdmin) return <NoAccess />

  const totalPlans   = rows.reduce((s, r) => s + r.plans, 0)
  const totalTasks   = rows.reduce((s, r) => s + r.tasks_total, 0)
  const totalDone    = rows.reduce((s, r) => s + r.tasks_done, 0)
  const totalOverdue = rows.reduce((s, r) => s + r.tasks_overdue, 0)
  const overallRate  = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0

  const chartData = [...rows]
    .sort((a, b) => b.completion - a.completion)
    .map(r => ({ name: r.name_ar.length > 16 ? r.name_ar.slice(0, 16) + '…' : r.name_ar, completion: r.completion }))

  return (
    <div className="space-y-5" dir="rtl">
      {/* رأس */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Layers size={22} style={{ color: 'var(--maroon-600)' }} />
          {groupName ? `مجموعة ${groupName}` : 'نظرة المجموعة'}
        </h2>
        <p className="text-slate-500 text-sm mt-1">نظرة إجمالية على أداء مدارس المجموعة</p>
      </div>

      {/* تنويه الخصوصية */}
      <div className="flex items-center gap-2 bg-violet-50 border border-violet-100 rounded-xl px-4 py-2.5">
        <Lock size={14} className="text-violet-600 flex-shrink-0" />
        <p className="text-xs text-violet-700">
          عرض إجمالي لمدارس مجموعتك — أرقام مُجمَّعة فقط دون الاطّلاع على البيانات الفردية لأي مدرسة.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
          <Inbox size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium text-slate-500">لا توجد مدارس في مجموعتك بعد</p>
          <p className="text-xs mt-1">يقوم مشرف النظام بإسناد المدارس للمجموعة</p>
        </div>
      ) : (
        <>
          {/* إجماليات */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'مدارس المجموعة', value: rows.length,    Icon: Building2 },
              { label: 'إجمالي المهام',  value: totalTasks,      Icon: CircleCheckBig },
              { label: 'نسبة الإنجاز',   value: `${overallRate}%`, Icon: TrendingUp },
              { label: 'المتأخرات',      value: totalOverdue,    Icon: AlertTriangle },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-4 text-center shadow-sm">
                <s.Icon size={22} className="mx-auto mb-1.5" style={{ color: 'var(--maroon-500)' }} />
                <div className="text-2xl font-bold text-slate-800">{s.value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* رسم المقارنة */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h4 className="font-bold text-slate-700 mb-4 text-sm">مقارنة الإنجاز بين مدارس المجموعة</h4>
            <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 46)}>
              <BarChart data={chartData} layout="vertical" margin={{ right: 40, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} />
                <Tooltip formatter={(v: any) => [`${v}%`, 'الإنجاز']} />
                <Bar dataKey="completion" name="الإنجاز" radius={[0, 6, 6, 0]}>
                  {chartData.map((d, i) => <Cell key={i} fill={barColor(d.completion)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* جدول مُجمَّع */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
              <h4 className="font-bold text-slate-700 text-sm">أرقام مدارس المجموعة</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-xs text-slate-500 font-semibold">
                    <th className="px-4 py-2.5 text-right">المدرسة</th>
                    <th className="px-3 py-2.5 text-center">الخطط</th>
                    <th className="px-3 py-2.5 text-center">المهام</th>
                    <th className="px-3 py-2.5 text-center">منجزة</th>
                    <th className="px-3 py-2.5 text-center">متأخرة</th>
                    <th className="px-3 py-2.5 text-center">الإنجاز</th>
                    <th className="px-3 py-2.5 text-center hidden sm:table-cell">KPIs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {[...rows].sort((a, b) => b.completion - a.completion).map(r => (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-800">{r.name_ar}</span>
                          {!r.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">معطَّلة</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center text-slate-600">{r.plans}</td>
                      <td className="px-3 py-3 text-center text-slate-600">{r.tasks_total}</td>
                      <td className="px-3 py-3 text-center text-green-700 font-medium">{r.tasks_done}</td>
                      <td className="px-3 py-3 text-center">
                        {r.tasks_overdue > 0 ? <span className="text-red-600 font-medium">{r.tasks_overdue}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="font-bold" style={{ color: barColor(r.completion) }}>{r.completion}%</span>
                      </td>
                      <td className="px-3 py-3 text-center text-xs text-slate-500 hidden sm:table-cell">
                        {r.kpi_avg !== null ? `${r.kpi_avg}%` : `${r.kpi_count} مؤشر`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

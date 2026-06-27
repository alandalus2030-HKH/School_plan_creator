'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/lib/PermissionsContext'
import NoAccess from '@/components/NoAccess'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import {
  BookOpen, Archive, Pin, BarChart3, TrendingUp, PartyPopper, Inbox,
  ClipboardList, CheckCircle2, Clock, Circle, AlertTriangle, Star,
  LayoutDashboard, Network, Users, Printer, FileText,
  X, XCircle, Folder, Map, RefreshCw, ArrowLeft, Calendar, Lightbulb, User,
} from 'lucide-react'
import {
  STATUS_META, RATING_META, PRIORITY_META, TYPE_META,
} from '@/lib/constants/tasks'
import { SkeletonDashboard } from '@/components/Skeleton'
import type { Task, Plan, PlanNode, Profile, Kpi } from '@/lib/types'

/* «متأخرة» وسم محسوب لا حالة: غير منجزة وتجاوزت موعد الانتهاء (دليل المشروع) */
const isOverdue = (t: any) =>
  t.status !== 'completed' && !!t.end_date && new Date(t.end_date) < new Date()

/* ══════════════════ دالة الطباعة المشتركة ══════════════════ */
function printContent(html: string, title: string) {
  const win = window.open('', '_blank', 'width=960,height=720')
  if (!win) return
  win.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;padding:24px;color:#1e293b;direction:rtl;font-size:13px}
    h1{font-size:18px;font-weight:700;margin-bottom:4px;color:#1e293b}
    .subtitle{font-size:12px;color:#64748b;margin-bottom:20px}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}
    th{background:#f8fafc;padding:8px 12px;text-align:right;font-weight:600;color:#64748b;border-bottom:2px solid #e2e8f0}
    td{padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#334155;vertical-align:top}
    .badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600}
    .bg-green{background:#dcfce7;color:#16a34a}
    .bg-blue{background:#dbeafe;color:#1d4ed8}
    .bg-red{background:#fee2e2;color:#dc2626}
    .bg-amber{background:#fef3c7;color:#d97706}
    .bg-slate{background:#f1f5f9;color:#64748b}
    .kpi-card{border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:12px;page-break-inside:avoid}
    .kpi-row{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px}
    .kpi-nums{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
    .num-box{background:#f8fafc;border-radius:8px;padding:10px;text-align:center}
    .num-label{font-size:10px;color:#94a3b8;margin-bottom:4px}
    .num-value{font-size:14px;font-weight:700}
    .bar-bg{height:8px;background:#f1f5f9;border-radius:999px;overflow:hidden;margin:8px 0}
    .bar{height:100%;border-radius:999px}
    .tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
    .tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:600;background:#f1f5f9;color:#475569}
    .tag-violet{background:#ede9fe;color:#5b21b6}
    .footer{font-size:10px;color:#94a3b8;margin-top:20px;border-top:1px solid #f1f5f9;padding-top:10px;display:flex;justify-content:space-between}
    @media print{body{padding:10px}@page{margin:1cm}}
  </style>
</head>
<body>
  ${html}
  <div class="footer">
    <span>نظام متابعة الخطط المدرسية</span>
    <span>تاريخ الطباعة: ${new Date().toLocaleDateString('ar-QA')}</span>
  </div>
  <script>window.onload=()=>{window.print()}<\/script>
</body>
</html>`)
  win.document.close()
}

/* ══════════════════ مودال تفاصيل المهام ══════════════════ */
function TasksModal({
  title, tasks, profiles, nodeMap, planMap, onClose,
}: {
  title:    string
  tasks:    any[]
  profiles: any[]
  nodeMap:  Record<string, any>
  planMap:  Record<string, any>
  onClose:  () => void
}) {
  const profMap = Object.fromEntries(profiles.map(p => [p.id, p]))

  const handlePrint = () => {
    const badgeCls: Record<string, string> = {
      not_started: 'bg-slate', in_progress: 'bg-blue', completed: 'bg-green', delayed: 'bg-red',
    }
    const rows = tasks.map(t => {
      const assignee = t.assigned_to_user_id ? profMap[t.assigned_to_user_id] : null
      const node     = t.node_id   ? nodeMap[t.node_id]   : null
      const plan     = t.plan_id   ? planMap[t.plan_id]   : null
      const sm       = STATUS_META[t.status]
      const rating   = t.rating ? RATING_META[t.rating] : null
      const isLate   = t.end_date && t.status !== 'completed'
        ? new Date(t.end_date) < new Date() : false
      return `<tr style="${isLate ? 'background:#fff5f5' : ''}">
        <td><strong>${t.name_ar}</strong>${t.description ? `<br><small style="color:#94a3b8">${t.description}</small>` : ''}</td>
        <td>${node?.name_ar || '—'}</td>
        <td>${plan?.name_ar || '—'}</td>
        <td>${assignee?.name_ar || '—'}</td>
        <td style="${isLate ? 'color:#dc2626;font-weight:600' : ''}">${t.end_date ? new Date(t.end_date).toLocaleDateString('ar-QA') + (isLate ? ' (متأخرة)' : '') : '—'}</td>
        <td><span class="badge ${badgeCls[t.status] || 'bg-slate'}">${sm?.ar || t.status}</span></td>
        <td>${rating ? rating.label : '—'}</td>
      </tr>`
    }).join('')
    const html = `
      <h1>${title}</h1>
      <p class="subtitle">${tasks.length} مهمة</p>
      <table>
        <thead><tr>
          <th>اسم المهمة</th><th>المستوى / العقدة</th><th>الخطة</th>
          <th>المكلَّف</th><th>الموعد النهائي</th><th>الحالة</th><th>التقييم</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:20px">لا توجد مهام</td></tr>'}</tbody>
      </table>`
    printContent(html, title)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 pt-16 overflow-y-auto"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl"
        onClick={e => e.stopPropagation()}>

        {/* رأس المودال */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <div>
            <h3 className="text-base font-bold text-slate-800">{title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{tasks.length} مهمة</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* الجدول */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-[60px]">
              <tr className="text-xs text-slate-500 font-semibold">
                <th className="px-4 py-3 text-right">اسم المهمة</th>
                <th className="px-4 py-3 text-right hidden md:table-cell">المستوى / العقدة</th>
                <th className="px-4 py-3 text-right hidden lg:table-cell">الخطة</th>
                <th className="px-4 py-3 text-right">المكلَّف</th>
                <th className="px-4 py-3 text-center">النوع</th>
                <th className="px-4 py-3 text-center">الأولوية</th>
                <th className="px-4 py-3 text-center hidden sm:table-cell">الموعد النهائي</th>
                <th className="px-4 py-3 text-center">الحالة</th>
                <th className="px-4 py-3 text-center">التقييم</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {tasks.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400 text-sm">لا توجد مهام</td></tr>
              ) : tasks.map((t, i) => {
                const assignee = t.assigned_to_user_id ? profMap[t.assigned_to_user_id] : null
                const node     = t.node_id ? nodeMap[t.node_id] : null
                const plan     = t.plan_id ? planMap[t.plan_id] : null
                const sm       = STATUS_META[t.status]
                const rating   = t.rating ? RATING_META[t.rating] : null
                const isLate   = t.end_date && t.status !== 'completed'
                  ? new Date(t.end_date) < new Date() : false
                return (
                  <tr key={i} className={`hover:bg-slate-50 transition-colors ${isLate ? 'bg-red-50/30' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800 line-clamp-2">{t.name_ar}</p>
                      {t.description && (
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{t.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <p className="text-xs text-slate-600 line-clamp-1">{node?.name_ar || '—'}</p>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <p className="text-xs text-slate-500 line-clamp-1">{plan?.name_ar || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      {assignee ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                            {assignee.name_ar?.split(' ').map((w: string) => w[0]).slice(0,2).join('')}
                          </div>
                          <span className="text-xs text-slate-700 line-clamp-1">{assignee.name_ar}</span>
                        </div>
                      ) : <span className="text-xs text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span title={TYPE_META[t.task_type]?.ar} style={{ color: 'var(--maroon-400)' }}>
                        {t.task_type === 'academic' ? <BookOpen size={15} className="inline" />
                          : t.task_type === 'administrative' ? <Archive size={15} className="inline" />
                          : <Pin size={15} className="inline" />}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="w-3 h-3 rounded-full inline-block" style={{
                        background: t.priority === 'high' ? '#8a1538' : t.priority === 'medium' ? '#d98ea0' : '#f4dde2'
                      }} />
                    </td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      {t.end_date ? (
                        <span className={`inline-flex items-center gap-1 text-xs ${isLate ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                          {new Date(t.end_date).toLocaleDateString('ar-QA')}
                          {isLate && <AlertTriangle size={11} />}
                        </span>
                      ) : <span className="text-slate-400 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sm?.light || ''} ${sm?.text || ''}`}>
                        {sm?.ar || t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {rating
                        ? <span className="text-sm font-medium" title={rating.label} style={{ color: rating.color }}>{rating.label}</span>
                        : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between gap-2">
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition-colors font-semibold shadow-sm">
            <Printer size={14} className="inline ml-1" /> طباعة التقرير
          </button>
          <button onClick={onClose}
            className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors">
            إغلاق
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════ مودال تفاصيل مؤشرات الأداء ══════════════════ */
const KPI_TYPE_LABEL: Record<string, string> = {
  impact:  'أثر بعيد',
  outcome: 'نتيجة مباشرة',
  output:  'مخرج',
}
const FREQ_LABEL: Record<string, string> = {
  monthly:   'شهري',
  quarterly: 'ربع سنوي',
  semester:  'فصلي',
  yearly:    'سنوي',
}

function KpiDetailModal({
  title, kpis, color, planMap, onClose,
}: {
  title:   string
  kpis:    any[]
  color:   string
  planMap: Record<string, any>
  onClose: () => void
}) {
  const headerColor =
    color === 'green'  ? 'bg-green-600'  :
    color === 'amber'  ? 'bg-amber-500'  :
    color === 'orange' ? 'bg-orange-500' :
    color === 'red'    ? 'bg-red-600'    :
                         'bg-violet-600'

  const handlePrint = () => {
    const cards = kpis.map(k => {
      const p    = kpiProgress(k)
      const st   = getKpiStatus(p)
      const plan = k.plan_id ? planMap[k.plan_id] : null
      const bar  = p !== null ? Math.min(p, 100) : 0
      return `<div class="kpi-card">
        <div class="kpi-row">
          <div style="flex:1">
            <div style="font-size:14px;font-weight:600;color:#1e293b;margin-bottom:4px">${k.name_ar}</div>
            ${k.description ? `<div style="font-size:12px;color:#94a3b8;margin-bottom:8px">${k.description}</div>` : ''}
            <div class="tags">
              <span class="tag">${k.node_name}</span>
              ${plan ? `<span class="tag tag-violet">${plan.name_ar}</span>` : ''}
              ${k.kpi_type ? `<span class="tag" style="background:#dbeafe;color:#1d4ed8">${k.kpi_type}</span>` : ''}
              ${k.frequency ? `<span class="tag" style="background:#cffafe;color:#0e7490">${k.frequency}</span>` : ''}
            </div>
          </div>
          <div style="text-align:center;flex-shrink:0;min-width:60px">
            ${p !== null
              ? `<div style="font-size:22px;font-weight:700;color:${st.color}">${p}%</div>
                 <div style="font-size:11px;color:${st.color}">${st.label}</div>`
              : `<div style="font-size:18px;color:#94a3b8">—</div>
                 <div style="font-size:11px;color:#94a3b8">لا قراءات</div>`}
          </div>
        </div>
        <div class="bar-bg"><div class="bar" style="width:${bar}%;background-color:${st.color}"></div></div>
        <div class="kpi-nums">
          <div class="num-box">
            <div class="num-label">الخط الأساسي</div>
            <div class="num-value" style="color:#64748b">${k.baseline_value !== null ? `${k.baseline_value}${k.unit || ''}` : '—'}</div>
          </div>
          <div class="num-box">
            <div class="num-label">الهدف المستهدف</div>
            <div class="num-value" style="color:#1e293b">${k.target_value !== null ? `${k.target_value}${k.unit || ''}` : '—'}</div>
          </div>
          <div class="num-box" style="background-color:${st.color}18">
            <div class="num-label" style="color:${st.color}">آخر قراءة</div>
            <div class="num-value" style="color:${st.color}">${k.latest_reading !== null ? `${k.latest_reading}${k.unit || ''}` : '—'}</div>
            ${k.latest_date ? `<div style="font-size:9px;color:${st.color};opacity:0.7;margin-top:2px">${new Date(k.latest_date).toLocaleDateString('ar-QA')}</div>` : ''}
          </div>
        </div>
      </div>`
    }).join('')

    const modalTitle = `مؤشرات الأداء — ${title}`
    const html = `
      <h1>${modalTitle}</h1>
      <p class="subtitle">${kpis.length} مؤشر</p>
      ${kpis.length === 0
        ? '<p style="text-align:center;color:#94a3b8;padding:40px 0">لا توجد مؤشرات في هذه الفئة</p>'
        : cards}`
    printContent(html, modalTitle)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 pt-16 overflow-y-auto"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl"
        onClick={e => e.stopPropagation()}>

        {/* رأس */}
        <div className={`flex items-center justify-between px-6 py-4 rounded-t-2xl text-white ${headerColor}`}>
          <div>
            <h3 className="text-base font-bold">مؤشرات الأداء — {title}</h3>
            <p className="text-xs opacity-80 mt-0.5">{kpis.length} مؤشر</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* المحتوى */}
        <div className="p-5">
          {kpis.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <div className="flex justify-center mb-3" style={{ color: 'var(--maroon-300)' }}><Inbox size={40} /></div>
              <p>لا توجد مؤشرات في هذه الفئة</p>
            </div>
          ) : (
            <div className="space-y-4">
              {kpis.map((k, i) => {
                const p   = kpiProgress(k)
                const st  = getKpiStatus(p)
                const bar = p !== null ? Math.min(p, 100) : 0
                const plan = k.plan_id ? planMap[k.plan_id] : null
                return (
                  <div key={i} className="border border-slate-200 rounded-2xl p-4 hover:border-slate-300 transition-colors">

                    {/* رأس المؤشر */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800">{k.name_ar}</p>
                        {k.description && (
                          <p className="text-xs text-slate-500 mt-0.5">{k.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                            <Folder size={10} /> {k.node_name}
                          </span>
                          {plan && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">
                              <Map size={10} /> {plan.name_ar}
                            </span>
                          )}
                          {k.kpi_type && (
                            <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                              {KPI_TYPE_LABEL[k.kpi_type] || k.kpi_type}
                            </span>
                          )}
                          {k.frequency && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full">
                              <RefreshCw size={10} /> {FREQ_LABEL[k.frequency] || k.frequency}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* نسبة التحقق */}
                      <div className="text-left flex-shrink-0">
                        {p !== null ? (
                          <div className="text-center">
                            <span className="text-2xl font-bold" style={{ color: st.color }}>{p}%</span>
                            <p className="text-[10px] font-medium mt-0.5" style={{ color: st.color }}>{st.label}</p>
                          </div>
                        ) : (
                          <div className="text-center">
                            <span className="text-xl text-slate-400">—</span>
                            <p className="text-[10px] text-slate-400 mt-0.5">لا قراءات</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* شريط التقدم */}
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden mb-3">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${bar}%`, backgroundColor: st.color }} />
                    </div>

                    {/* أرقام: خط أساسي / هدف / آخر قراءة */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-slate-50 rounded-xl p-3 text-center">
                        <p className="text-[10px] text-slate-400 mb-1">الخط الأساسي</p>
                        <p className="text-sm font-bold text-slate-600">
                          {k.baseline_value !== null ? `${k.baseline_value}${k.unit || ''}` : '—'}
                        </p>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-3 text-center">
                        <p className="text-[10px] text-slate-400 mb-1">الهدف المستهدف</p>
                        <p className="text-sm font-bold text-slate-800">
                          {k.target_value !== null ? `${k.target_value}${k.unit || ''}` : '—'}
                        </p>
                      </div>
                      <div className="rounded-xl p-3 text-center" style={{ backgroundColor: st.color + '15' }}>
                        <p className="text-[10px] mb-1" style={{ color: st.color }}>آخر قراءة</p>
                        <p className="text-sm font-bold" style={{ color: st.color }}>
                          {k.latest_reading !== null ? `${k.latest_reading}${k.unit || ''}` : '—'}
                        </p>
                        {k.latest_date && (
                          <p className="text-[9px] mt-0.5 opacity-70" style={{ color: st.color }}>
                            {new Date(k.latest_date).toLocaleDateString('ar-QA')}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-2">
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition-colors font-semibold shadow-sm">
            <Printer size={14} className="inline ml-1" /> طباعة التقرير
          </button>
          <button onClick={onClose}
            className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors">
            إغلاق
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════ مكوّن صف عقدة (هيكل الخطة) ══════════════════ */
function NodeRow({
  node, depth, children, tasksByNode, onShowTasks, plan,
}: {
  node:        any
  depth:       number
  children:    any[]
  tasksByNode: Record<string, any[]>
  onShowTasks: (tasks: any[], title: string) => void
  plan:        any
}) {
  const [open, setOpen] = useState(depth < 2)

  /* اجمع مهام هذه العقدة + كل الأحفاد */
  const collectAllTasks = (n: any): any[] => {
    const own   = tasksByNode[n.id] || []
    const child = children.filter(c => c.parent_id === n.id)
    return [...own, ...child.flatMap(c => collectAllTasks(c))]
  }
  const allTasks = collectAllTasks(node)

  const total     = allTasks.length
  const done      = allTasks.filter(t => t.status === 'completed').length
  const delayed   = allTasks.filter(isOverdue).length
  const inProg    = allTasks.filter(t => t.status === 'in_progress').length
  const notStart  = allTasks.filter(t => t.status === 'not_started').length
  const rate      = total > 0 ? Math.round((done / total) * 100) : 0
  const ownTasks  = tasksByNode[node.id] || []
  const hasKids   = children.some(c => c.parent_id === node.id)

  const depthColors = [
    'bg-violet-600', 'bg-indigo-500', 'bg-blue-500', 'bg-cyan-500', 'bg-teal-500',
  ]
  const depthBg = [
    'bg-violet-50 border-violet-200', 'bg-indigo-50 border-indigo-200',
    'bg-blue-50 border-blue-200',     'bg-cyan-50 border-cyan-200',
    'bg-slate-50 border-slate-200',
  ]

  if (total === 0 && !hasKids) return null

  return (
    <div className={`border rounded-2xl overflow-hidden ${depthBg[Math.min(depth, 4)]} mb-2`}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}>
        {/* مؤشر العمق */}
        <div className={`w-1 h-8 rounded-full flex-shrink-0 ${depthColors[Math.min(depth, 4)]}`} />

        {/* اسم العقدة */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800 text-sm truncate">{node.name_ar}</span>
            {plan && depth === 0 && (
              <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full">
                {plan.name_ar}
              </span>
            )}
          </div>
          {total > 0 && (
            <div className="flex items-center gap-1 mt-1">
              <div className="flex-1 h-1.5 bg-white/70 rounded-full max-w-[120px] overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{ width:`${rate}%`, backgroundColor: rate>=80?'#22c55e':rate>=50?'#f59e0b':'#ef4444' }} />
              </div>
              <span className="text-[11px] font-bold"
                style={{ color: rate>=80?'#16a34a':rate>=50?'#d97706':'#dc2626' }}>
                {rate}%
              </span>
            </div>
          )}
        </div>

        {/* إحصائيات مدمجة */}
        {total > 0 && (
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
            <StatPill value={done}     label="منجزة" color="bg-green-100 text-green-700" />
            {inProg   > 0 && <StatPill value={inProg}   label="جارية"  color="bg-blue-100  text-blue-700"  />}
            {delayed  > 0 && <StatPill value={delayed}  label="متأخرة" color="bg-red-100   text-red-700"   />}
            {notStart > 0 && <StatPill value={notStart} label="لم تبدأ" color="bg-slate-100 text-slate-600" />}
            <button
              onClick={e => { e.stopPropagation(); onShowTasks(allTasks, `مهام: ${node.name_ar}`) }}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-white border border-slate-200 text-violet-700 hover:bg-violet-50 transition-colors font-semibold">
              <ClipboardList size={12} /> {total}
            </button>
          </div>
        )}

        {/* زر الطي */}
        {(hasKids || ownTasks.length > 0) && (
          <span className={`text-slate-400 text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
        )}
      </div>

      {/* المهام المباشرة لهذه العقدة */}
      {open && ownTasks.length > 0 && !hasKids && (
        <div className="border-t border-white/60 overflow-x-auto">
          <table className="w-full text-xs">
            <tbody className="divide-y divide-white/40">
              {ownTasks.map((t: any, i: number) => {
                const sm = STATUS_META[t.status]
                const r  = t.rating ? RATING_META[t.rating] : null
                return (
                  <tr key={i} className="hover:bg-white/40 transition-colors">
                    <td className="px-4 py-2 font-medium text-slate-700">{t.name_ar}</td>
                    <td className="px-2 py-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${sm?.light} ${sm?.text}`}>
                        {sm?.ar || t.status}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center text-slate-500">
                      {t.end_date ? new Date(t.end_date).toLocaleDateString('ar-QA') : '—'}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {r ? <span title={r.label} style={{ color: r.color }} className="font-medium text-xs">{r.label}</span> : '—'}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {PRIORITY_META[t.priority]?.ar || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* العقد الفرعية */}
      {open && hasKids && (
        <div className="px-3 pb-3 pt-1 border-t border-white/60 space-y-0">
          {children
            .filter(c => c.parent_id === node.id)
            .sort((a, b) => a.order_num - b.order_num)
            .map(child => (
              <NodeRow key={child.id} node={child} depth={depth + 1}
                children={children} tasksByNode={tasksByNode}
                onShowTasks={onShowTasks} plan={null} />
            ))}
        </div>
      )}
    </div>
  )
}

function StatPill({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${color}`}>
      {value} {label}
    </span>
  )
}

/* ══════════════════ صفحة التقارير ══════════════════ */
export default function ReportsPage() {
  const supabase = createClient()
  const { can, loading: permsLoading } = usePermissions()

  /* ── بيانات خام ── */
  const [tasks,       setTasks]       = useState<Task[]>([])
  const [plans,       setPlans]       = useState<Pick<Plan, 'id' | 'name_ar' | 'academic_year' | 'level_names' | 'level_count'>[]>([])
  const [nodes,       setNodes]       = useState<Pick<PlanNode, 'id' | 'plan_id' | 'parent_id' | 'name_ar' | 'level_num' | 'order_num'>[]>([])
  const [profiles,    setProfiles]    = useState<Pick<Profile, 'id' | 'name_ar' | 'department' | 'role'>[]>([])
  const [kpis,        setKpis]        = useState<Kpi[]>([])
  const [loading,     setLoading]     = useState(true)

  /* ── فلاتر ── */
  const [planFilter,  setPlanFilter]  = useState('all')
  const [activeTab,   setActiveTab]   = useState<'overview'|'hierarchy'|'kpis'|'users'|'delayed'>('overview')

  /* ── فلتر الفترة الزمنية ── */
  const [fromDate, setFromDate] = useState('')
  const [toDate,   setToDate]   = useState('')

  const isoDate = (d: Date) => d.toISOString().split('T')[0]
  const todayD  = (() => { const d = new Date(); d.setHours(0,0,0,0); return d })()

  const setPresetToday     = () => { setFromDate(isoDate(todayD)); setToDate(isoDate(todayD)) }
  const setPresetThisWeek  = () => {
    const mon = new Date(todayD); mon.setDate(todayD.getDate() - ((todayD.getDay()+6)%7))
    const sun = new Date(mon);    sun.setDate(mon.getDate() + 6)
    setFromDate(isoDate(mon)); setToDate(isoDate(sun))
  }
  const setPresetNextWeek  = () => {
    const mon = new Date(todayD); mon.setDate(todayD.getDate() - ((todayD.getDay()+6)%7) + 7)
    const sun = new Date(mon);    sun.setDate(mon.getDate() + 6)
    setFromDate(isoDate(mon)); setToDate(isoDate(sun))
  }
  const setPresetNextMonth = () => {
    const first = new Date(todayD.getFullYear(), todayD.getMonth() + 1, 1)
    const last  = new Date(todayD.getFullYear(), todayD.getMonth() + 2, 0)
    setFromDate(isoDate(first)); setToDate(isoDate(last))
  }
  const clearDateRange = () => { setFromDate(''); setToDate('') }

  /* وصف الفترة للعناوين */
  const dateRangeLabel = fromDate && toDate
    ? `${new Date(fromDate).toLocaleDateString('ar-QA')} — ${new Date(toDate).toLocaleDateString('ar-QA')}`
    : ''

  /* ── مودال المهام ── */
  const [modal,    setModal]    = useState<{ tasks: any[]; title: string } | null>(null)
  /* ── مودال KPI ── */
  const [kpiModal, setKpiModal] = useState<{ kpis: any[]; title: string; color: string } | null>(null)

  /* ══ جلب البيانات ══ */
  useEffect(() => {
    if (permsLoading) return
    ;(async () => {
      const [
        { data: tasksRaw },
        { data: assigns  },
        { data: plansRaw },
        { data: nodesRaw },
        { data: profsRaw },
        { data: kpisRaw  },
        { data: readings },
      ] = await Promise.all([
        supabase.from('tasks').select('id,name_ar,description,status,task_type,priority,start_date,end_date,rating,node_id,created_at').limit(2000),
        supabase.from('tasks').select('id,assigned_to_user_id,assigned_to_team_id,reviewer_id').limit(2000),
        supabase.from('plans').select('id,name_ar,academic_year,level_names,level_count').limit(100),
        supabase.from('plan_nodes').select('id,plan_id,parent_id,name_ar,level_num,order_num').order('order_num').limit(2000),
        supabase.from('profiles').select('id,name_ar,department,role').limit(500),
        supabase.from('kpis').select('id,name_ar,kpi_type,frequency,target_value,unit,baseline_value,description,node_id').limit(500),
        supabase.from('kpi_readings').select('kpi_id,actual_value,reading_date').order('reading_date',{ascending:false}).limit(2000),
      ])

      /* دمج بيانات التكليف */
      const assignMap: Record<string, any> = {}
      ;(assigns || []).forEach((a: any) => { assignMap[a.id] = a })
      const nodeMap: Record<string, any> = {}
      ;(nodesRaw || []).forEach((n: any) => { nodeMap[n.id] = n })

      /* ربط المهمة بالخطة */
      const merged = (tasksRaw || []).map((t: any) => ({
        ...t,
        ...(assignMap[t.id] || {}),
        plan_id: t.node_id ? nodeMap[t.node_id]?.plan_id ?? null : null,
      }))

      /* أحدث قراءة لكل KPI */
      const latestMap: Record<string, any> = {}
      ;(readings || []).forEach((r: any) => { if (!latestMap[r.kpi_id]) latestMap[r.kpi_id] = r })
      const kpisWithReading = (kpisRaw || []).map((k: any) => ({
        ...k,
        latest_reading: latestMap[k.id]?.actual_value ?? null,
        latest_date:    latestMap[k.id]?.reading_date ?? null,
        plan_id:        nodeMap[k.node_id]?.plan_id ?? null,
        node_name:      nodeMap[k.node_id]?.name_ar ?? '—',
        node_level:     nodeMap[k.node_id]?.level_num ?? 0,
      }))

      setTasks(merged)
      setPlans(plansRaw || [])
      setNodes(nodesRaw || [])
      setProfiles(profsRaw || [])
      setKpis(kpisWithReading)
      setLoading(false)
    })()
  }, [permsLoading])

  /* ══ فلترة المهام ══ */
  const filtered = useMemo(() => {
    let result = planFilter === 'all' ? tasks : tasks.filter(t => t.plan_id === planFilter)

    if (fromDate && toDate) {
      const from = new Date(fromDate).getTime()
      const to   = new Date(toDate).getTime() + 86399999   // حتى نهاية اليوم
      result = result.filter(t => {
        // المهام بدون تواريخ تبقى ظاهرة دائماً
        if (!t.start_date && !t.end_date) return true
        const tS = t.start_date ? new Date(t.start_date).getTime() : from
        const tE = t.end_date   ? new Date(t.end_date).getTime()   : to
        return tS <= to && tE >= from
      })
    }
    return result
  }, [tasks, planFilter, fromDate, toDate])

  /* ══ إحصائيات أساسية ══ */
  const stats = useMemo(() => {
    const total      = filtered.length
    const completed  = filtered.filter(t => t.status === 'completed').length
    const delayed    = filtered.filter(isOverdue).length
    const inProgress = filtered.filter(t => t.status === 'in_progress').length
    const notStarted = filtered.filter(t => t.status === 'not_started').length
    const rated      = filtered.filter(t => t.rating != null)
    const avgRating  = rated.length > 0
      ? (rated.reduce((s, t) => s + (t.rating || 0), 0) / rated.length).toFixed(1) : '—'
    const rate       = total > 0 ? Math.round((completed / total) * 100) : 0
    return { total, completed, delayed, inProgress, notStarted, rate, avgRating, ratedCount: rated.length }
  }, [filtered])

  /* ══ خريطة الخطط والعقد ══ */
  const planMap = useMemo(() => Object.fromEntries(plans.map(p => [p.id, p])), [plans])
  const nodeMap = useMemo(() => Object.fromEntries(nodes.map(n => [n.id, n])),  [nodes])

  /* ══ مهام حسب العقدة ══ */
  const tasksByNode = useMemo(() => {
    const map: Record<string, any[]> = {}
    filtered.forEach(t => {
      if (!t.node_id) return
      if (!map[t.node_id]) map[t.node_id] = []
      map[t.node_id].push(t)
    })
    return map
  }, [filtered])

  /* ══ بيانات الرسوم ══ */
  const statusData = useMemo(() =>
    Object.entries(STATUS_META).map(([k, v]) => ({
      name: v.ar, value: filtered.filter(t => t.status === k).length, fill: v.hex,
    })).filter(d => d.value > 0), [filtered])

  const typeData = useMemo(() => [
    { name: 'أكاديمية',  value: filtered.filter(t => t.task_type==='academic').length,       fill:'#8b5cf6' },
    { name: 'إدارية',    value: filtered.filter(t => t.task_type==='administrative').length,  fill:'#06b6d4' },
    { name: 'عامة',      value: filtered.filter(t => t.task_type==='general').length,         fill:'#f59e0b' },
  ].filter(d => d.value > 0), [filtered])

  /* ══ أداء الأفراد ══ */
  const userPerf = useMemo(() => {
    const map: Record<string, any> = {}
    filtered.forEach(t => {
      const uid = t.assigned_to_user_id; if (!uid) return
      const p = profiles.find(x => x.id === uid)
      if (!map[uid]) map[uid] = { name: p?.name_ar||'—', dept: p?.department||'', total:0, done:0, delayed:0 }
      map[uid].total++
      if (t.status==='completed') map[uid].done++
      if (isOverdue(t))           map[uid].delayed++
    })
    return Object.values(map)
      .map(u => ({ ...u, rate: u.total>0 ? Math.round(u.done/u.total*100):0 }))
      .sort((a,b) => b.total - a.total).slice(0,20)
  }, [filtered, profiles])

  /* ══ الأقسام ══ */
  const deptPerf = useMemo(() => {
    const map: Record<string, any> = {}
    filtered.forEach(t => {
      const dept = profiles.find(p=>p.id===t.assigned_to_user_id)?.department || 'غير محدد'
      if (!map[dept]) map[dept] = { total:0, done:0, delayed:0 }
      map[dept].total++
      if (t.status==='completed') map[dept].done++
      if (isOverdue(t))           map[dept].delayed++
    })
    return Object.entries(map)
      .map(([name,v]) => ({ name, ...(v as any), rate: (v as any).total>0 ? Math.round((v as any).done/(v as any).total*100):0 }))
      .filter(d => d.total>0).sort((a,b)=>b.rate-a.rate)
  }, [filtered, profiles])

  /* ══ المتأخرات ══ */
  const delayedTasks = useMemo(() => filtered
    .filter(isOverdue)
    .map(t => ({
      ...t,
      assigneeName: profiles.find(p=>p.id===t.assigned_to_user_id)?.name_ar || '—',
      nodeName:     t.node_id ? nodeMap[t.node_id]?.name_ar : '—',
      planName:     t.plan_id ? planMap[t.plan_id]?.name_ar : '—',
      daysLate:     t.end_date ? Math.max(0, Math.floor((Date.now()-new Date(t.end_date).getTime())/86400000)) : null,
    }))
    .sort((a,b) => (b.daysLate??0)-(a.daysLate??0)),
    [filtered, profiles, nodeMap, planMap]
  )

  /* ══ KPI مفلترة ══ */
  const filteredKpis = useMemo(() =>
    planFilter==='all' ? kpis : kpis.filter(k => k.plan_id===planFilter),
    [kpis, planFilter]
  )

  /* ══ طباعة التقرير الكامل ══ */
  const handlePagePrint = () => {
    const selectedPlanName = planFilter !== 'all' ? planMap[planFilter]?.name_ar : 'كل الخطط'

    const statColor = (rate: number) =>
      rate >= 80 ? '#16a34a' : rate >= 50 ? '#d97706' : '#dc2626'

    /* ── إحصائيات ── */
    const statsHtml = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px">
        ${[
          { val: stats.total,       label: 'إجمالي المهام',  bg: '#f8fafc', border: '#e2e8f0', color: '#334155'  },
          { val: stats.completed,   label: `منجزة (${stats.rate}%)`, bg: '#f0fdf4', border: '#bbf7d0', color: '#16a34a' },
          { val: stats.delayed,     label: 'متأخرة',         bg: '#fef2f2', border: '#fecaca', color: '#dc2626' },
          { val: stats.inProgress,  label: 'جارية',          bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' },
          { val: stats.notStarted,  label: 'لم تبدأ',        bg: '#fffbeb', border: '#fde68a', color: '#d97706' },
          { val: stats.avgRating,   label: 'متوسط التقييم',  bg: '#f5f3ff', border: '#ddd6fe', color: '#5b21b6' },
        ].map(s => `
          <div style="background:${s.bg};border:1px solid ${s.border};border-radius:12px;padding:14px;text-align:center">
            <div style="font-size:26px;font-weight:700;color:${s.color}">${s.val}</div>
            <div style="font-size:11px;color:${s.color};margin-top:4px">${s.label}</div>
          </div>`).join('')}
      </div>
      <div style="margin-bottom:20px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-weight:600;color:#374151;font-size:13px">نسبة الإنجاز الكلية</span>
          <span style="font-size:18px;font-weight:700;color:${statColor(stats.rate)}">${stats.rate}%</span>
        </div>
        <div style="height:10px;background:#f1f5f9;border-radius:999px;overflow:hidden">
          <div style="height:100%;width:${stats.rate}%;background:linear-gradient(to left,#6f1029,#8a1538 55%,#a83356);border-radius:999px"></div>
        </div>
      </div>`

    /* ── جدول المهام ── */
    const statusColor: Record<string, string> = {
      not_started: '#94a3b8', in_progress: '#3b82f6', completed: '#22c55e', delayed: '#ef4444',
    }
    const taskRows = filtered.map(t => {
      const assignee = profiles.find(p => p.id === t.assigned_to_user_id)
      const node     = t.node_id ? nodeMap[t.node_id] : null
      const plan     = t.plan_id ? planMap[t.plan_id] : null
      const sm       = STATUS_META[t.status]
      const isLate   = t.end_date && t.status !== 'completed'
        ? new Date(t.end_date) < new Date() : false
      const sc = statusColor[t.status] || '#94a3b8'
      return `<tr style="${isLate ? 'background:#fff5f5' : ''}">
        <td><strong>${t.name_ar}</strong>${t.description ? `<br><small style="color:#94a3b8">${t.description}</small>` : ''}</td>
        <td>${node?.name_ar || '—'}</td>
        <td>${plan?.name_ar || '—'}</td>
        <td>${assignee?.name_ar || '—'}</td>
        <td style="${isLate ? 'color:#dc2626;font-weight:600' : 'color:#64748b'}">${t.end_date ? new Date(t.end_date).toLocaleDateString('ar-QA') + (isLate ? ' (متأخرة)' : '') : '—'}</td>
        <td><span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;background:${sc}20;color:${sc}">${sm?.ar || t.status}</span></td>
      </tr>`
    }).join('')

    const tasksHtml = `
      <h2 style="font-size:15px;font-weight:700;color:#1e293b;margin:20px 0 10px">المهام (${filtered.length})</h2>
      <table>
        <thead><tr>
          <th>اسم المهمة</th><th>المستوى / العقدة</th><th>الخطة</th><th>المكلَّف</th><th>الموعد</th><th>الحالة</th>
        </tr></thead>
        <tbody>${taskRows || '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:20px">لا توجد مهام</td></tr>'}</tbody>
      </table>`

    /* ── جدول KPI ── */
    let kpiHtml = ''
    if (filteredKpis.length > 0) {
      const kpiRows = filteredKpis.map(k => {
        const p  = kpiProgress(k)
        const st = getKpiStatus(p)
        return `<tr>
          <td><strong>${k.name_ar}</strong>${k.description ? `<br><small style="color:#94a3b8">${k.description}</small>` : ''}</td>
          <td>${k.node_name}</td>
          <td>${k.baseline_value !== null ? `${k.baseline_value}${k.unit || ''}` : '—'}</td>
          <td style="font-weight:600;color:#334155">${k.target_value !== null ? `${k.target_value}${k.unit || ''}` : '—'}</td>
          <td style="font-weight:600;color:${st.color}">${k.latest_reading !== null ? `${k.latest_reading}${k.unit || ''}` : '—'}</td>
          <td><span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;background:${st.color}20;color:${st.color}">${p !== null ? `${p}%` : 'لا قراءات'}</span></td>
        </tr>`
      }).join('')
      kpiHtml = `
        <h2 style="font-size:15px;font-weight:700;color:#1e293b;margin:24px 0 10px">مؤشرات الأداء (${filteredKpis.length})</h2>
        <table>
          <thead><tr>
            <th>المؤشر</th><th>العقدة</th><th>الخط الأساسي</th><th>الهدف</th><th>آخر قراءة</th><th>التحقق</th>
          </tr></thead>
          <tbody>${kpiRows}</tbody>
        </table>`
    }

    /* ── المتأخرات ── */
    let delayedHtml = ''
    if (delayedTasks.length > 0) {
      const dRows = delayedTasks.map(t => `<tr>
        <td><strong>${t.name_ar}</strong></td>
        <td>${t.nodeName}</td>
        <td>${t.planName}</td>
        <td>${t.assigneeName}</td>
        <td style="color:#dc2626">${t.end_date ? new Date(t.end_date).toLocaleDateString('ar-QA') : '—'}</td>
        <td><span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;background:${(t.daysLate??0)>30?'#fee2e2':(t.daysLate??0)>7?'#ffedd5':'#fef3c7'};color:${(t.daysLate??0)>30?'#dc2626':(t.daysLate??0)>7?'#ea580c':'#d97706'}">${t.daysLate ?? 0} يوم</span></td>
      </tr>`).join('')
      delayedHtml = `
        <h2 style="font-size:15px;font-weight:700;color:#dc2626;margin:24px 0 10px">المهام المتأخرة (${delayedTasks.length})</h2>
        <table>
          <thead><tr>
            <th>المهمة</th><th>المستوى</th><th>الخطة</th><th>المكلَّف</th><th>الموعد</th><th>التأخر</th>
          </tr></thead>
          <tbody>${dRows}</tbody>
        </table>`
    }

    const periodLabel = dateRangeLabel
      ? `<span style="display:inline-block;margin-right:12px;padding:2px 10px;background:#ede9fe;color:#5b21b6;border-radius:999px;font-size:11px;font-weight:600">${dateRangeLabel}</span>`
      : ''

    printContent(
      `<h1>التقارير والإحصائيات</h1>
       <p class="subtitle">الخطة: ${selectedPlanName} ${periodLabel}</p>
       ${statsHtml}${tasksHtml}${kpiHtml}${delayedHtml}`,
      'التقارير والإحصائيات'
    )
  }

  /* ══ حماية ══ */
  if (!permsLoading && !can('view_reports') && !can('manage_plans')) return <NoAccess />
  if (loading) return (
    <div>
      <SkeletonDashboard />
    </div>
  )

  /* ══ عقد المستوى الأول لكل خطة ══ */
  const topNodes = nodes.filter(n => n.parent_id === null || n.level_num === 1)
    .filter(n => planFilter==='all' || n.plan_id===planFilter)

  const TABS = [
    { key:'overview',   Icon: LayoutDashboard, label:'نظرة عامة'     },
    { key:'hierarchy',  Icon: Network,         label:'هيكل الخطة'    },
    { key:'kpis',       Icon: TrendingUp,      label:`مؤشرات الأداء${filteredKpis.length>0?` (${filteredKpis.length})`:''}`},
    { key:'users',      Icon: Users,           label:'الأقسام والأفراد'},
    { key:'delayed',    Icon: AlertTriangle,   label:`المتأخرات (${delayedTasks.length})`},
  ] as const

  /* ── بطاقة قابلة للنقر ── */
  const ClickCard = ({ icon, label, value, sub, color, filterKey }: {
    icon:React.ReactNode; label:string; value:string|number; sub?:string; color:string; filterKey?:string
  }) => {
    const colorMap: Record<string,string> = {
      violet:'bg-violet-50 border-violet-200 text-violet-700 hover:border-violet-400',
      green: 'bg-green-50  border-green-200  text-green-700  hover:border-green-400',
      red:   'bg-red-50    border-red-200    text-red-700    hover:border-red-400',
      amber: 'bg-amber-50  border-amber-200  text-amber-700  hover:border-amber-400',
      blue:  'bg-blue-50   border-blue-200   text-blue-700   hover:border-blue-400',
      slate: 'bg-slate-50  border-slate-200  text-slate-700  hover:border-slate-400',
    }
    const modalTasks = filterKey ? filtered.filter(t => t.status===filterKey) : filtered
    const modalTitle = filterKey
      ? `${STATUS_META[filterKey]?.ar || label} — ${modalTasks.length} مهمة`
      : `${label} — ${modalTasks.length} مهمة`

    return (
      <button
        onClick={() => setModal({ tasks: modalTasks, title: modalTitle })}
        className={`rounded-2xl border p-5 shadow-sm text-right transition-all hover:shadow-md cursor-pointer w-full ${colorMap[color]||colorMap.slate}`}>
        <div className="mb-2 flex">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-black/[0.04] [&>svg]:w-[18px] [&>svg]:h-[18px]">{icon}</span>
        </div>
        <div className="text-3xl font-bold">{value}</div>
        <div className="text-sm font-semibold mt-1">{label}</div>
        {sub && <div className="text-xs opacity-70 mt-0.5">{sub}</div>}
        <div className="inline-flex items-center gap-1 text-xs mt-2 opacity-60 font-medium">انقر للتفاصيل <ArrowLeft size={11} /></div>
      </button>
    )
  }

  return (
    <div className="space-y-5" dir="rtl">

      {/* ══ رأس الصفحة ══ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 size={22} style={{ color: 'var(--maroon-600)' }} /> التقارير والإحصائيات
          </h2>
          <p className="text-slate-500 text-sm mt-1">نظرة تفصيلية شاملة على أداء الخطط والمهام والمؤشرات</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={planFilter} onChange={e => setPlanFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 min-w-[170px]">
            <option value="all">كل الخطط</option>
            {plans.map(p => <option key={p.id} value={p.id}>{p.name_ar}</option>)}
          </select>
          <button onClick={handlePagePrint}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            <Printer size={14} className="inline ml-1" /> طباعة
          </button>
          <a href="/dashboard/reports/official"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm text-white font-medium transition-all hover:brightness-110"
            style={{ background: 'var(--gradient-button, #8a1538)' }}>
            <FileText size={14} className="inline ml-1" /> التقارير الرسمية (PDF)
          </a>
        </div>
      </div>

      {/* ══ شريط الفترة الزمنية ══ */}
      <div className="flex items-center gap-2 flex-wrap bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm">
        <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 flex-shrink-0"><Calendar size={13} /> الفترة:</span>

        {/* أزرار الاختصار السريع */}
        {[
          { label: 'اليوم',           fn: setPresetToday     },
          { label: 'هذا الأسبوع',     fn: setPresetThisWeek  },
          { label: 'الأسبوع القادم',  fn: setPresetNextWeek  },
          { label: 'الشهر القادم',    fn: setPresetNextMonth },
        ].map(({ label, fn }) => (
          <button key={label} onClick={fn}
            className="px-3 py-1.5 rounded-xl text-xs font-medium border bg-white text-slate-600 border-slate-200 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-700 transition-all">
            {label}
          </button>
        ))}

        {/* فاصل */}
        <span className="text-slate-300 text-xs">|</span>

        {/* منتقي التاريخ اليدوي */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 flex-shrink-0">من:</span>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="px-2 py-1.5 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
            style={{ direction: 'ltr' }} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 flex-shrink-0">إلى:</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="px-2 py-1.5 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
            style={{ direction: 'ltr' }} />
        </div>

        {/* حالة الفلتر النشط + زر المسح */}
        {(fromDate || toDate) ? (
          <div className="flex items-center gap-2 mr-auto">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-3 py-1.5 rounded-xl">
              <BarChart3 size={12} /> {filtered.length} مهمة في هذه الفترة
            </span>
            <button onClick={clearDateRange}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-all">
              <X size={12} /> مسح الفترة
            </button>
          </div>
        ) : (
          <span className="text-xs text-slate-400 mr-auto">عرض كل المهام بدون تقييد زمني</span>
        )}
      </div>

      {/* ══ بطاقات قابلة للنقر ══ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <ClickCard icon={<ClipboardList size={24} />} label="إجمالي المهام"  value={stats.total}       color="slate"  />
        <ClickCard icon={<CheckCircle2  size={24} />} label="المنجزة"        value={stats.completed}   color="green"  filterKey="completed"
          sub={`${stats.rate}% من الإجمالي`} />
        <ClickCard icon={<Clock         size={24} />} label="جارية"          value={stats.inProgress}  color="blue"   filterKey="in_progress" />
        <ClickCard icon={<Circle        size={24} />} label="لم تبدأ"        value={stats.notStarted}  color="amber"  filterKey="not_started" />
        <ClickCard icon={<AlertTriangle size={24} />} label="متأخرة"         value={stats.delayed}     color="red"    filterKey="delayed" />
        <ClickCard icon={<Star          size={24} />} label="متوسط التقييم"
          value={stats.avgRating}
          color="violet"
          sub={stats.ratedCount>0 ? `من ${stats.ratedCount} مهمة مقيّمة` : 'لا يوجد تقييم'}
        />
      </div>

      {/* ══ شريط الإنجاز ══ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-700 flex items-center gap-2">
            <TrendingUp size={16} style={{ color: 'var(--maroon-600)' }} /> نسبة الإنجاز الكلية
          </h3>
          <span className="text-2xl font-bold text-violet-700">{stats.rate}%</span>
        </div>
        <div className="relative h-5 bg-slate-100 rounded-full overflow-hidden">
          <div className="absolute top-0 right-0 h-full rounded-full transition-all duration-700"
            style={{ width:`${stats.rate}%`, background:'linear-gradient(to left, #6f1029, #8a1538 55%, #a83356)' }} />
        </div>
        <div className="flex justify-between mt-2 text-xs text-slate-500 flex-wrap gap-y-1">
          {Object.entries(STATUS_META).map(([k,v]) => (
            <span key={k}>
              {v.ar}: <strong style={{color:v.hex}}>{filtered.filter(t=>t.status===k).length}</strong>
            </span>
          ))}
        </div>
      </div>

      {/* ══ تبويبات ══ */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl w-fit flex-wrap">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap
              ${activeTab===tab.key ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <tab.Icon size={14} className="inline ml-1" /> {tab.label}
          </button>
        ))}
      </div>

      {/* ══════════ تبويب: نظرة عامة ══════════ */}
      {activeTab==='overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* مخطط دائري: حالات */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <h4 className="font-bold text-slate-700 mb-4 text-sm">توزيع حالات المهام</h4>
              {statusData.length>0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                      dataKey="value" nameKey="name" paddingAngle={3}>
                      {statusData.map((e,i) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                    <Tooltip formatter={(v:any,n:any) => [v+' مهمة', n]} />
                    <Legend formatter={v => <span className="text-xs">{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <EmptyChart />}
            </div>
            {/* مخطط دائري: أنواع */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <h4 className="font-bold text-slate-700 mb-4 text-sm">توزيع أنواع المهام</h4>
              {typeData.length>0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={typeData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                      dataKey="value" nameKey="name" paddingAngle={3}>
                      {typeData.map((e,i) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                    <Tooltip formatter={(v:any,n:any) => [v+' مهمة', n]} />
                    <Legend formatter={v => <span className="text-xs">{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <EmptyChart />}
            </div>
          </div>

          {/* أداء كل خطة */}
          {plans.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <h4 className="font-bold text-slate-700 mb-4 text-sm">نسبة إنجاز كل خطة</h4>
              <div className="space-y-3">
                {plans.map(p => {
                  const pts     = tasks.filter(t => t.plan_id===p.id)
                  const done    = pts.filter(t => t.status==='completed').length
                  const delayed = pts.filter(isOverdue).length
                  const rate    = pts.length>0 ? Math.round(done/pts.length*100):0
                  if (pts.length===0) return null
                  return (
                    <div key={p.id}>
                      <div className="flex items-center justify-between mb-1">
                        <button
                          onClick={() => { setPlanFilter(p.id); setActiveTab('hierarchy') }}
                          className="text-sm font-semibold text-slate-700 hover:text-violet-700 transition-colors text-right">
                          {p.name_ar}
                        </button>
                        <div className="flex items-center gap-3 text-xs text-slate-500 flex-shrink-0">
                          {delayed>0 && <span className="inline-flex items-center gap-1 text-red-600"><AlertTriangle size={11} /> {delayed} متأخرة</span>}
                          <span>{done}/{pts.length}</span>
                          <span className="font-bold w-10 text-left"
                            style={{color:rate>=80?'#16a34a':rate>=50?'#d97706':'#dc2626'}}>
                            {rate}%
                          </span>
                        </div>
                      </div>
                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{
                            width:`${rate}%`,
                            backgroundColor:rate>=80?'#22c55e':rate>=50?'#f59e0b':'#ef4444',
                          }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════ تبويب: هيكل الخطة ══════════ */}
      {activeTab==='hierarchy' && (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-800 flex items-center gap-2">
            <Lightbulb size={14} className="flex-shrink-0" />
            <span>اضغط على أي عقدة لطي/فتحها · اضغط على زر العدد لعرض تفاصيل المهام كاملاً</span>
          </div>
          {topNodes.length===0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
              <div className="flex justify-center mb-2" style={{ color: 'var(--maroon-300)' }}><Network size={40} /></div>
              <p>لا توجد بيانات للخطة المحددة</p>
            </div>
          ) : topNodes
            .sort((a,b)=>a.order_num-b.order_num)
            .map(node => (
              <NodeRow
                key={node.id}
                node={node}
                depth={0}
                children={nodes.filter(n => n.plan_id===node.plan_id)}
                tasksByNode={tasksByNode}
                onShowTasks={(tasks, title) => setModal({ tasks, title })}
                plan={planMap[node.plan_id]}
              />
            ))
          }
        </div>
      )}

      {/* ══════════ تبويب: مؤشرات الأداء KPI ══════════ */}
      {activeTab==='kpis' && (
        <div className="space-y-4">
          {filteredKpis.length===0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
              <div className="flex justify-center mb-2" style={{ color: 'var(--maroon-300)' }}><TrendingUp size={40} /></div>
              <p>لا توجد مؤشرات أداء مضافة للخطة المحددة</p>
              <p className="text-xs mt-1">يمكن إضافتها من صفحة مؤشرات الأداء لكل خطة</p>
            </div>
          ) : (
            <>
              {/* ملخص KPI — أزرار تفاعلية (صف واحد) */}
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {([
                  {
                    label: 'إجمالي المؤشرات',
                    icon:  <TrendingUp size={20} />,
                    color: 'slate',
                    kpis:  filteredKpis,
                    filter: 'all',
                  },
                  {
                    label: 'على المسار',
                    icon:  <CheckCircle2 size={20} />,
                    color: 'green',
                    kpis:  filteredKpis.filter(k => { const p = kpiProgress(k); return p !== null && p >= 80 }),
                    filter: 'on_track',
                  },
                  {
                    label: 'تحت المستهدف',
                    icon:  <AlertTriangle size={20} />,
                    color: 'amber',
                    kpis:  filteredKpis.filter(k => { const p = kpiProgress(k); return p !== null && p >= 50 && p < 80 }),
                    filter: 'below',
                  },
                  {
                    label: 'بعيد عن الهدف',
                    icon:  <XCircle size={20} />,
                    color: 'orange',
                    kpis:  filteredKpis.filter(k => { const p = kpiProgress(k); return p !== null && p < 50 }),
                    filter: 'far',
                  },
                  {
                    label: 'بدون قراءات',
                    icon:  <Inbox size={20} />,
                    color: 'red',
                    kpis:  filteredKpis.filter(k => k.latest_reading === null),
                    filter: 'no_data',
                  },
                ] as const).map((s, i) => {
                  const colorCls =
                    s.color === 'green'  ? 'bg-green-50  border-green-200  text-green-700  hover:border-green-400  hover:shadow-green-100'  :
                    s.color === 'amber'  ? 'bg-amber-50  border-amber-200  text-amber-700  hover:border-amber-400  hover:shadow-amber-100'  :
                    s.color === 'orange' ? 'bg-orange-50 border-orange-200 text-orange-700 hover:border-orange-400 hover:shadow-orange-100' :
                    s.color === 'red'    ? 'bg-red-50    border-red-200    text-red-700    hover:border-red-400    hover:shadow-red-100'    :
                                          'bg-slate-50  border-slate-200  text-slate-700  hover:border-slate-400  hover:shadow-slate-100'
                  return (
                    <button
                      key={i}
                      onClick={() => setKpiModal({ kpis: s.kpis, title: s.label, color: s.color })}
                      className={`rounded-2xl border p-3 text-center shadow-sm transition-all hover:shadow-md cursor-pointer w-full ${colorCls}`}>
                      <div className="flex justify-center mb-1">{s.icon}</div>
                      <div className="text-xl font-bold">{s.kpis.length}</div>
                      <div className="text-[11px] font-semibold mt-0.5 leading-tight">{s.label}</div>
                      <div className="text-[9px] mt-1 opacity-60 font-medium">انقر للتفاصيل</div>
                    </button>
                  )
                })}
              </div>

              {/* مخطط شريطي للمؤشرات */}
              {filteredKpis.filter(k=>k.target_value&&k.latest_reading!==null).length>0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                  <h4 className="font-bold text-slate-700 mb-4 text-sm">نسبة تحقق المؤشرات</h4>
                  <ResponsiveContainer width="100%" height={Math.max(180, filteredKpis.filter(k=>k.target_value&&k.latest_reading!==null).length*40)}>
                    <BarChart
                      data={filteredKpis
                        .filter(k=>k.target_value&&k.latest_reading!==null)
                        .map(k=>({
                          name: k.name_ar.length>25 ? k.name_ar.slice(0,25)+'…' : k.name_ar,
                          progress: kpiProgress(k) ?? 0,
                        }))}
                      layout="vertical" margin={{right:50,left:10}}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" domain={[0,Math.max(100,...filteredKpis.map(k=>kpiProgress(k)??0))]}
                        tickFormatter={v=>`${v}%`} tick={{fontSize:11}} />
                      <YAxis dataKey="name" type="category" tick={{fontSize:11}} width={140} />
                      <Tooltip formatter={(v:any)=>`${v}%`} />
                      <Bar dataKey="progress" name="التحقق" radius={[0,6,6,0]}>
                        {filteredKpis
                          .filter(k=>k.target_value&&k.latest_reading!==null)
                          .map((k,i) => {
                            const p = kpiProgress(k)??0
                            return <Cell key={i} fill={p>=80?'#22c55e':p>=50?'#f59e0b':'#ef4444'} />
                          })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* جدول تفصيلي للمؤشرات */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                  <h4 className="font-bold text-slate-700 text-sm">تفاصيل مؤشرات الأداء</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr className="text-xs text-slate-500 font-semibold">
                        <th className="px-4 py-2.5 text-right">المؤشر</th>
                        <th className="px-4 py-2.5 text-right hidden md:table-cell">العقدة</th>
                        <th className="px-4 py-2.5 text-center">الخط الأساسي</th>
                        <th className="px-4 py-2.5 text-center">الهدف</th>
                        <th className="px-4 py-2.5 text-center">آخر قراءة</th>
                        <th className="px-4 py-2.5 text-center">التحقق</th>
                        <th className="px-4 py-2.5 text-center w-32 hidden sm:table-cell">التقدم</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredKpis.map((k,i) => {
                        const p  = kpiProgress(k)
                        const st = getKpiStatus(p)
                        return (
                          <tr key={i} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-medium text-slate-800">{k.name_ar}</p>
                              {k.description && (
                                <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{k.description}</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell">{k.node_name}</td>
                            <td className="px-4 py-3 text-center text-xs text-slate-500">
                              {k.baseline_value!==null ? `${k.baseline_value}${k.unit}` : '—'}
                            </td>
                            <td className="px-4 py-3 text-center text-xs font-semibold text-slate-700">
                              {k.target_value!==null ? `${k.target_value}${k.unit}` : '—'}
                            </td>
                            <td className="px-4 py-3 text-center text-xs font-bold" style={{color:st.color}}>
                              {k.latest_reading!==null ? `${k.latest_reading}${k.unit}` : '—'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {p!==null ? (
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                                  style={{color:st.color, backgroundColor:st.color+'20'}}>
                                  {p}%
                                </span>
                              ) : <span className="text-xs text-slate-400">لا قراءات</span>}
                            </td>
                            <td className="px-4 py-3 hidden sm:table-cell">
                              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all"
                                  style={{width:`${Math.min(p??0,100)}%`, backgroundColor:st.color}} />
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════ تبويب: الأقسام والأفراد ══════════ */}
      {activeTab==='users' && (
        <div className="space-y-5">
          {deptPerf.length>0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <h4 className="inline-flex items-center gap-1.5 font-bold text-slate-700 mb-4 text-sm"><Folder size={14} /> أداء الأقسام</h4>
              <ResponsiveContainer width="100%" height={Math.max(180, deptPerf.length*45)}>
                <BarChart data={deptPerf} layout="vertical" margin={{right:50,left:10}}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0,100]} tickFormatter={v=>`${v}%`} tick={{fontSize:11}} />
                  <YAxis dataKey="name" type="category" tick={{fontSize:11}} width={120} />
                  <Tooltip formatter={(v:any)=>`${v}%`} />
                  <Bar dataKey="rate" name="نسبة الإنجاز" radius={[0,6,6,0]}>
                    {deptPerf.map((e,i) => (
                      <Cell key={i} fill={e.rate>=80?'#22c55e':e.rate>=50?'#f59e0b':'#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {userPerf.length>0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                <h4 className="inline-flex items-center gap-1.5 font-bold text-slate-700 text-sm"><User size={14} /> ترتيب الأفراد حسب الأداء</h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-xs text-slate-500 font-semibold">
                      <th className="px-4 py-2.5 text-right w-8">#</th>
                      <th className="px-4 py-2.5 text-right">الموظف</th>
                      <th className="px-4 py-2.5 text-right hidden sm:table-cell">القسم</th>
                      <th className="px-4 py-2.5 text-center">إجمالي</th>
                      <th className="px-4 py-2.5 text-center">منجزة</th>
                      <th className="px-4 py-2.5 text-center">متأخرة</th>
                      <th className="px-4 py-2.5 text-center">الإنجاز</th>
                      <th className="px-4 py-2.5 text-center hidden md:table-cell w-32">التقدم</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {userPerf.map((u,i) => {
                      const tasksOfUser = filtered.filter(t=>t.assigned_to_user_id===profiles.find(p=>p.name_ar===u.name)?.id)
                      return (
                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-slate-400 font-mono text-xs">{i+1}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                                {u.name.split(' ').map((w:string)=>w[0]).slice(0,2).join('')}
                              </div>
                              <button
                                onClick={() => {
                                  const uid = profiles.find(p=>p.name_ar===u.name)?.id
                                  const ut  = filtered.filter(t=>t.assigned_to_user_id===uid)
                                  setModal({ tasks: ut, title: `مهام ${u.name}` })
                                }}
                                className="font-medium text-slate-800 hover:text-violet-700 transition-colors text-right">
                                {u.name}
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs hidden sm:table-cell">{u.dept||'—'}</td>
                          <td className="px-4 py-3 text-center font-semibold text-slate-700">{u.total}</td>
                          <td className="px-4 py-3 text-center text-green-700 font-semibold">{u.done}</td>
                          <td className="px-4 py-3 text-center">
                            {u.delayed>0
                              ? <span className="text-red-600 font-semibold">{u.delayed}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm font-bold"
                              style={{color:u.rate>=80?'#16a34a':u.rate>=50?'#d97706':'#94a3b8'}}>
                              {u.rate}%
                            </span>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all"
                                style={{width:`${u.rate}%`,backgroundColor:u.rate>=80?'#22c55e':u.rate>=50?'#f59e0b':'#94a3b8'}} />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : <EmptyState text="لا توجد مهام مُكلَّف بها أفراد" />}
        </div>
      )}

      {/* ══════════ تبويب: المتأخرات ══════════ */}
      {activeTab==='delayed' && (
        <div className="space-y-4">
          {delayedTasks.length===0 ? (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-12 text-center">
              <div className="flex justify-center mb-3" style={{ color: 'var(--maroon-400)' }}><PartyPopper size={48} /></div>
              <p className="text-green-700 font-bold text-lg">لا توجد مهام متأخرة!</p>
              <p className="text-green-600 text-sm mt-1">جميع المهام ضمن الجدول الزمني</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
                  <div className="text-3xl font-bold text-red-700">{delayedTasks.length}</div>
                  <div className="text-xs text-red-600 mt-1">مهمة متأخرة</div>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 text-center">
                  <div className="text-3xl font-bold text-orange-700">{delayedTasks[0]?.daysLate??0}</div>
                  <div className="text-xs text-orange-600 mt-1">أعلى تأخر (يوم)</div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
                  <div className="text-3xl font-bold text-amber-700">
                    {delayedTasks.filter(t=>(t.daysLate??0)>30).length}
                  </div>
                  <div className="text-xs text-amber-600 mt-1">تأخر &gt; شهر</div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-red-50">
                      <tr className="text-xs text-slate-600 font-semibold">
                        <th className="px-4 py-3 text-right">المهمة</th>
                        <th className="px-4 py-3 text-right hidden md:table-cell">المستوى</th>
                        <th className="px-4 py-3 text-right hidden lg:table-cell">الخطة</th>
                        <th className="px-4 py-3 text-right hidden sm:table-cell">المكلَّف</th>
                        <th className="px-4 py-3 text-center">الموعد</th>
                        <th className="px-4 py-3 text-center">التأخر</th>
                        <th className="px-4 py-3 text-center">الأولوية</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {delayedTasks.map((t,i) => (
                        <tr key={i} className="hover:bg-red-50/40 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-800 line-clamp-1">{t.name_ar}</p>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell line-clamp-1">{t.nodeName}</td>
                          <td className="px-4 py-3 text-xs text-slate-500 hidden lg:table-cell line-clamp-1">{t.planName}</td>
                          <td className="px-4 py-3 text-xs text-slate-700 hidden sm:table-cell">{t.assigneeName}</td>
                          <td className="px-4 py-3 text-center text-xs text-red-600">
                            {t.end_date ? new Date(t.end_date).toLocaleDateString('ar-QA') : '—'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {t.daysLate!=null ? (
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full
                                ${t.daysLate>30?'bg-red-100 text-red-700':t.daysLate>7?'bg-orange-100 text-orange-700':'bg-amber-100 text-amber-700'}`}>
                                {t.daysLate} يوم
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 text-center text-sm">
                            {PRIORITY_META[t.priority]?.ar||'—'}
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
      )}

      {/* ══ مودال تفاصيل المهام ══ */}
      {modal && (
        <TasksModal
          title={modal.title}
          tasks={modal.tasks}
          profiles={profiles}
          nodeMap={nodeMap}
          planMap={planMap}
          onClose={() => setModal(null)}
        />
      )}

      {/* ══ مودال تفاصيل مؤشرات الأداء ══ */}
      {kpiModal && (
        <KpiDetailModal
          title={kpiModal.title}
          kpis={kpiModal.kpis}
          color={kpiModal.color}
          planMap={planMap}
          onClose={() => setKpiModal(null)}
        />
      )}
    </div>
  )
}

/* ══ دوال مساعدة ══ */
function kpiProgress(k: any): number | null {
  if (k.latest_reading===null||k.target_value===null||k.target_value===0) return null
  return Math.round((k.latest_reading/k.target_value)*100)
}
function getKpiStatus(p: number|null) {
  if (p===null)  return { color:'#94a3b8', label:'لا قراءات' }
  if (p>=100)    return { color:'#3b82f6', label:'تجاوز الهدف' }
  if (p>=80)     return { color:'#22c55e', label:'على المسار' }
  if (p>=50)     return { color:'#f59e0b', label:'تحت المستهدف' }
  return               { color:'#ef4444', label:'بعيد عن الهدف' }
}
function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-[220px] text-slate-400">
      <div className="text-center"><div className="flex justify-center mb-2" style={{ color: 'var(--maroon-300)' }}><BarChart3 size={32} /></div><p className="text-xs">لا توجد بيانات</p></div>
    </div>
  )
}
function EmptyState({ text }: { text: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
      <div className="flex justify-center mb-3" style={{ color: 'var(--maroon-300)' }}><Inbox size={40} /></div>
      <p className="text-slate-500 font-medium">{text}</p>
    </div>
  )
}

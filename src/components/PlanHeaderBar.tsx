'use client'

/* ════════════════════════════════════════════════════════════
   رأس الخطة وأدواتها — مكوّن مشترك بين العرضين (الهرمي والقوائم)
   لضمان تكافؤ كامل بلا ازدواج كود: نسبة الإنجاز + تقدير الجودة +
   تصدير/استيراد Excel + إعدادات KPI + لوحة KPI + تقرير QNSA +
   الاعتماد + تنبيه صاحب الخطة + التعديل + الحذف + زر التحويل بين العرضين.
   يفتح بياناته بنفسه؛ ويُعلم الصفحة الأم عبر onChanged لإعادة تحميل المحتوى.
   ════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import { calcAvgRating } from '@/lib/rating'
import { Award, BarChart3, Star, Settings, Pencil, Trash2, BadgeCheck, ShieldOff, Bell, ListTree, ClipboardList, Lock, LockOpen,
  Tag, User, Calendar, Upload, Download, CircleCheckBig, X, Layers, FolderTree, Save, Lightbulb, Loader2 } from 'lucide-react'
import { generateQnsaReport } from '@/lib/qnsaReport'
import { toast } from '@/components/Toast'
import { usePermissions } from '@/lib/PermissionsContext'
import { createNotification } from '@/lib/notifications'
import ConfirmDialog from '@/components/ConfirmDialog'

const ACADEMIC_YEARS = Array.from({ length: 16 }, (_, i) => `${2024 + i}-${2025 + i}`)

function ratingBadgeClass(avg: number): { label: string } {
  if (avg >= 4.5) return { label: 'ممتاز' }
  if (avg >= 3.5) return { label: 'جيد جداً' }
  if (avg >= 2.5) return { label: 'جيد' }
  if (avg >= 1.5) return { label: 'مقبول' }
  return { label: 'ضعيف' }
}

const KPI_TYPE_LABELS: Record<string,string> = { impact: 'أثر بعيد', outcome: 'نتيجة مباشرة', output: 'مخرج' }
const KPI_TYPE_META: Record<string, { Icon: React.ElementType; def: string; example: string; timing: string; suitable: string }> = {
  impact:  { Icon: Award,     def: 'التحسّن في المؤشر النهائي الناتج عن تراكم النتائج على مدى سنوات', example: 'ارتفاع معدل التحصيل في امتحانات الدولة', timing: 'يُقاس بعد 3–5 سنوات', suitable: 'الأهداف الاستراتيجية العليا' },
  outcome: { Icon: BarChart3, def: 'التغيير في سلوك المستفيد الناتج عن الأنشطة والمبادرات', example: 'نسبة المعلمين الذين غيّروا طريقة تدريسهم', timing: 'يُقاس خلال 1–2 سنة', suitable: 'الأهداف العامة والمبادرات' },
  output:  { Icon: ClipboardList, def: 'ما قام به الفريق من إنجازات دون النظر إلى أثرها', example: 'عدد الدورات المنفّذة', timing: 'يُقاس فور الانتهاء', suitable: 'الأهداف التشغيلية والأنشطة' },
}
const KPI_FREQ_LABELS: Record<string,string> = { monthly: 'شهري', quarterly: 'ربع سنوي', semester: 'فصلي', yearly: 'سنوي' }

type KpiLevelConfig = { levelIndex: number; enabled: boolean; kpiType: string; frequency: string }

export default function PlanHeaderBar({ planId, active, onChanged }: {
  planId: string
  active: 'tree' | 'list'
  onChanged: () => void
}) {
  const router   = useRouter()
  const supabase = createClient()
  const { isSuperAdmin, userId, can } = usePermissions()

  const [plan,   setPlan]   = useState<any>(null)
  const [nodes,  setNodes]  = useState<any[]>([])
  const [tasks,  setTasks]  = useState<any[]>([])

  const [dimDepartments, setDimDepartments] = useState<string[]>([])
  const [dimPlanTypes,   setDimPlanTypes]   = useState<string[]>([])
  const [dimOwners,      setDimOwners]      = useState<any[]>([])

  const [editingPlan,    setEditingPlan]    = useState(false)
  const [editPlanName,   setEditPlanName]   = useState('')
  const [editPlanYear,   setEditPlanYear]   = useState('')
  const [editLevelCount, setEditLevelCount] = useState(3)
  const [editLevelNames, setEditLevelNames] = useState<string[]>([])
  const [editDept,       setEditDept]       = useState('')
  const [editCategory,   setEditCategory]   = useState('')
  const [editOwner,      setEditOwner]      = useState('')
  const [savingPlan,     setSavingPlan]     = useState(false)

  const [showKpiSettings, setShowKpiSettings] = useState(false)
  const [kpiLevels,       setKpiLevels]       = useState<KpiLevelConfig[]>([])
  const [savingKpi,       setSavingKpi]       = useState(false)

  const fileRef      = useRef<HTMLInputElement>(null)
  const [showImport, setShowImport] = useState(false)
  const [importRows, setImportRows] = useState<any[]>([])
  const [importing,  setImporting]  = useState(false)
  const [importMsg,  setImportMsg]  = useState('')

  const [confirmDelPlan, setConfirmDelPlan] = useState(false)
  const [deletingPlan,   setDeletingPlan]   = useState(false)
  const [certifying,     setCertifying]     = useState(false)
  const [notifyingOwner, setNotifyingOwner] = useState(false)

  /* بيانات الأبعاد (مرة واحدة) */
  useEffect(() => {
    ;(async () => {
      const [{ data: opts }, { data: profs }] = await Promise.all([
        supabase.from('dropdown_options').select('category, value').in('category', ['department', 'plan_type']).eq('is_active', true).order('sort_order'),
        supabase.from('profiles').select('id, name_ar, job_title').eq('is_active', true).order('name_ar'),
      ])
      setDimDepartments((opts || []).filter((o: any) => o.category === 'department').map((o: any) => o.value))
      setDimPlanTypes((opts || []).filter((o: any) => o.category === 'plan_type').map((o: any) => o.value))
      setDimOwners(profs || [])
    })()
  }, [])

  const load = useCallback(async () => {
    const [{ data: planData }, { data: nodesData }] = await Promise.all([
      supabase.from('plans').select('id, name_ar, academic_year, level_count, level_names, kpi_levels, approved_at, frozen_at, department, plan_category, owner_id').eq('id', planId).single(),
      supabase.from('plan_nodes').select('id, parent_id, level_num, name_ar, order_num, standard_code').eq('plan_id', planId).order('order_num'),
    ])
    setPlan(planData)
    setNodes(nodesData || [])
    const ids = (nodesData || []).map((n: any) => n.id)
    if (ids.length) {
      const { data: t } = await supabase.from('tasks').select('id, status, node_id, rating').in('node_id', ids)
      setTasks(t || [])
    } else setTasks([])
  }, [planId])

  useEffect(() => { load() }, [load])

  /* تنبيه صاحب الخطة */
  const notifyOwner = async () => {
    setNotifyingOwner(true)
    const res = await fetch(`/api/plans/${planId}/notify-owner`, { method: 'POST' })
    const j = await res.json().catch(() => ({}))
    setNotifyingOwner(false)
    if (!res.ok) { toast(j.error || 'تعذّر إرسال التنبيه', 'error'); return }
    toast('تم تنبيه صاحب الخطة')
  }

  /* تعديل الخطة */
  const openEditPlan = () => {
    setEditPlanName(plan.name_ar); setEditPlanYear(plan.academic_year)
    const lc = plan.level_count || 3
    const ln: string[] = plan.level_names || []
    setEditLevelCount(lc)
    setEditLevelNames(Array.from({ length: lc }, (_, i) => ln[i] || `المستوى ${i + 1}`))
    setEditDept(plan.department || ''); setEditCategory(plan.plan_category || ''); setEditOwner(plan.owner_id || '')
    setEditingPlan(true)
  }
  const handleLevelCountChange = (newCount: number) => {
    setEditLevelCount(newCount)
    setEditLevelNames(prev => Array.from({ length: newCount }, (_, i) => prev[i] || `المستوى ${i + 1}`))
  }
  const savePlan = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editPlanName.trim()) return
    setSavingPlan(true)
    const prevOwner = plan.owner_id || ''
    await supabase.from('plans').update({
      name_ar: editPlanName.trim(), academic_year: editPlanYear,
      level_count: editLevelCount, level_names: editLevelNames,
      department: editDept || null, plan_category: editCategory || null, owner_id: editOwner || null,
    }).eq('id', planId)
    if (editOwner && editOwner !== prevOwner && editOwner !== userId) {
      await createNotification({
        recipientId: editOwner, senderId: userId, type: 'task_status_changed',
        title: `📋 أصبحت صاحب خطة: ${editPlanName.trim()}`,
        body: 'تم تعيينك مسؤولاً عن هذه الخطة — تابعها من لوحة التجميع.',
        link: `/dashboard/plans/${planId}`,
      })
    }
    setSavingPlan(false); setEditingPlan(false)
    await load(); onChanged()
  }

  const deletePlan = async () => {
    setDeletingPlan(true)
    const res  = await fetch(`/api/plans/${planId}`, { method: 'DELETE' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { alert(`تعذّر حذف الخطة: ${json.error || res.status}`); setDeletingPlan(false); setConfirmDelPlan(false); return }
    router.push('/dashboard/plans')
  }

  const certifyPlan = async (approve: boolean) => {
    setCertifying(true)
    const res  = await fetch(`/api/plans/${planId}/certify`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approve }),
    })
    const json = await res.json().catch(() => ({}))
    setCertifying(false)
    if (!res.ok) { alert(`تعذّر ${approve ? 'اعتماد' : 'إلغاء اعتماد'} الخطة: ${json.error || res.status}`); return }
    await load(); onChanged()
  }

  const freezePlan = async (freeze: boolean) => {
    setCertifying(true)
    const res  = await fetch(`/api/plans/${planId}/freeze`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ freeze }),
    })
    const json = await res.json().catch(() => ({}))
    setCertifying(false)
    if (!res.ok) { alert(`تعذّر ${freeze ? 'تجميد' : 'إلغاء تجميد'} الخطة: ${json.error || res.status}`); return }
    await load(); onChanged()
  }

  /* إعدادات KPI */
  const openKpiSettings = () => {
    const lc     = plan.level_count || 3
    const saved  = (plan.kpi_levels || []) as KpiLevelConfig[]
    const configs = Array.from({ length: lc }, (_, idx): KpiLevelConfig => {
      const existing = saved.find(k => k.levelIndex === idx)
      const locked   = idx === 0
      if (existing) return { ...existing }
      return { levelIndex: idx, enabled: !locked, kpiType: idx <= 1 ? 'impact' : 'outcome', frequency: idx <= 1 ? 'yearly' : 'quarterly' }
    })
    setKpiLevels(configs); setShowKpiSettings(true)
  }
  const saveKpiSettings = async () => {
    setSavingKpi(true)
    const toSave = kpiLevels.filter(k => k.enabled).map(k => ({
      levelIndex: k.levelIndex, levelName: (plan.level_names || [])[k.levelIndex] || `المستوى ${k.levelIndex + 1}`,
      kpiType: k.kpiType, frequency: k.frequency,
    }))
    await supabase.from('plans').update({ kpi_levels: toSave }).eq('id', planId)
    setSavingKpi(false); setShowKpiSettings(false); await load(); onChanged()
  }
  const updateKpiLevel = (idx: number, patch: Partial<KpiLevelConfig>) =>
    setKpiLevels(prev => prev.map(k => k.levelIndex === idx ? { ...k, ...patch } : k))

  /* تصدير / استيراد Excel */
  const exportExcel = async () => {
    try {
      const res = await fetch(`/api/plans/${planId}/export-excel`)
      if (!res.ok) { alert('حدث خطأ أثناء التصدير'); return }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `${plan.name_ar}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch { alert('تعذّر الاتصال بالخادم') }
  }
  const parseDateCell = (val: any): string | null => {
    if (!val && val !== 0) return null
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString().split('T')[0]
    if (typeof val === 'number') {
      const p = XLSX.SSF.parse_date_code(val); if (!p) return null
      return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
    }
    const str = val.toString().trim(); if (!str) return null
    const dt = new Date(str); return isNaN(dt.getTime()) ? null : dt.toISOString().split('T')[0]
  }
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const wb   = XLSX.read(ev.target?.result, { type: 'array', cellDates: true })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[]
      setImportRows(rows); setShowImport(true); setImportMsg('')
    }
    reader.readAsArrayBuffer(file); e.target.value = ''
  }
  const STATUS_EN: Record<string,string>   = { 'لم تبدأ':'not_started', 'جارية':'in_progress', 'منجزة':'completed', 'متأخرة':'delayed' }
  const PRIORITY_EN: Record<string,string> = { 'عالية':'high', 'متوسطة':'medium', 'منخفضة':'low' }
  const TYPE_EN: Record<string,string>     = { 'أكاديمية':'academic', 'إدارية':'administrative', 'عامة':'general' }
  const TASK_COL = 'المهمة'
  const runImport = async () => {
    if (importRows.length === 0) return
    setImporting(true); setImportMsg('')
    const lNames = (plan.level_names || []) as string[]
    const lCount = plan.level_count || 3
    const colNames = Array.from({ length: lCount }, (_, i) => lNames[i] || `المستوى ${i + 1}`)
    const [{ data: profiles }, { data: teams }] = await Promise.all([
      supabase.from('profiles').select('id,name_ar'),
      supabase.from('teams').select('id,name_ar'),
    ])
    const profileNameMap: Record<string,string> = {}; (profiles || []).forEach((p:any) => { if (p.name_ar) profileNameMap[p.name_ar.trim()] = p.id })
    const teamNameMap: Record<string,string> = {}; (teams || []).forEach((t:any) => { if (t.name_ar) teamNameMap[t.name_ar.trim()] = t.id })
    const { data: existingNodes } = await supabase.from('plan_nodes').select('id,parent_id,level_num,name_ar,order_num').eq('plan_id', planId)
    const pathMap: Record<string,string> = {}
    const buildMap = (parentId: string|null, path: string[]) => {
      ;(existingNodes || []).filter((n:any) => n.parent_id === parentId).forEach((n:any) => {
        const p = [...path, n.name_ar]; pathMap[p.join('|||')] = n.id; buildMap(n.id, p)
      })
    }
    buildMap(null, [])
    const orderCounters: Record<string,number> = {}
    ;(existingNodes || []).forEach((n:any) => { const key = n.parent_id || 'root'; orderCounters[key] = Math.max(orderCounters[key] || 0, n.order_num || 0) })
    const nodeIds = Object.values(pathMap)
    const existingTaskNames = new Set<string>()
    if (nodeIds.length > 0) {
      const { data: et } = await supabase.from('tasks').select('name_ar,node_id').in('node_id', nodeIds)
      ;(et || []).forEach((t:any) => existingTaskNames.add(`${t.node_id}|||${t.name_ar}`))
    }
    let createdNodes = 0, createdTasks = 0
    for (const row of importRows) {
      const path: string[] = []
      for (let i = 0; i < lCount; i++) {
        const val = (row[colNames[i]] ?? '').toString().trim()
        if (!val) break
        path.push(val)
        const key = path.join('|||')
        if (!pathMap[key]) {
          const parentId  = path.length > 1 ? (pathMap[path.slice(0,-1).join('|||')] ?? null) : null
          const parentKey = parentId ?? 'root'
          orderCounters[parentKey] = (orderCounters[parentKey] || 0) + 1
          const { data: nd } = await supabase.from('plan_nodes').insert({
            plan_id: planId, parent_id: parentId, level_num: i + 1, name_ar: val, order_num: orderCounters[parentKey],
          }).select('id').single()
          if (nd) { pathMap[key] = nd.id; orderCounters[nd.id] = 0; createdNodes++ }
        }
      }
      const taskName = (row[TASK_COL] ?? '').toString().trim()
      if (taskName && path.length > 0) {
        const nodeId = pathMap[path.join('|||')]
        const taskKey = `${nodeId}|||${taskName}`
        if (nodeId && !existingTaskNames.has(taskKey)) {
          const assignedUserName = (row['المكلف'] ?? '').toString().trim()
          const assignedTeamName = (row['الفريق المكلف'] ?? '').toString().trim()
          const budgetRaw = (row['الموارد المالية (ر.ق)'] ?? '').toString().trim()
          const budgetVal = budgetRaw !== '' ? parseFloat(budgetRaw) : null
          const { error } = await supabase.from('tasks').insert({
            name_ar: taskName, node_id: nodeId,
            status: STATUS_EN[(row['الحالة'] ?? '').toString().trim()] || 'not_started',
            priority: PRIORITY_EN[(row['الأولوية'] ?? '').toString().trim()] || 'medium',
            task_type: TYPE_EN[(row['النوع'] ?? '').toString().trim()] || 'general',
            start_date: parseDateCell(row['تاريخ البداية']), end_date: parseDateCell(row['تاريخ الانتهاء']),
            assigned_to_user_id: assignedUserName ? (profileNameMap[assignedUserName] ?? null) : null,
            assigned_to_team_id: assignedTeamName ? (teamNameMap[assignedTeamName] ?? null) : null,
            budget_qar: budgetVal != null && !isNaN(budgetVal) ? budgetVal : null,
            other_resources: (row['الموارد الأخرى'] ?? '').toString().trim() || null,
            evidence_required: (row['أدلة الإنجاز'] ?? '').toString().trim() || null,
          })
          if (!error) { existingTaskNames.add(taskKey); createdTasks++ }
        }
      }
    }
    const parts = []
    if (createdNodes) parts.push(`${createdNodes} عنصر`)
    if (createdTasks) parts.push(`${createdTasks} مهمة`)
    setImportMsg(parts.length ? `✅ تم إضافة ${parts.join(' و ')}` : '⚠️ لم يُضَف شيء جديد (كل البيانات موجودة)')
    setImporting(false); await load(); onChanged()
  }

  if (!plan) return (
    <div className="bg-gradient-to-l from-violet-600 to-indigo-700 rounded-2xl p-6 animate-pulse h-40" />
  )

  const levelNames: string[] = plan.level_names || []
  const level1Name = levelNames[0] || 'المستوى الأول'
  const topNodes   = nodes.filter(n => n.level_num === 1)
  const totalTasks = tasks.length
  const progress   = totalTasks > 0 ? Math.round((tasks.filter(t => t.status === 'completed').length / totalTasks) * 100) : 0
  const planRatingAvg  = calcAvgRating(tasks.map(t => t.rating))
  const planRatingInfo = planRatingAvg != null ? ratingBadgeClass(planRatingAvg) : null

  const otherView = active === 'tree'
    ? { href: `/dashboard/plans/${planId}/build`, label: 'العرض بالقوائم', icon: <ClipboardList size={14} /> }
    : { href: `/dashboard/plans/${planId}`,       label: 'العرض الشجري',  icon: <ListTree size={14} /> }

  return (
    <>
      {!editingPlan ? (
        <div className="bg-gradient-to-l from-violet-600 to-indigo-700 text-white rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-2xl font-bold whitespace-nowrap">{plan.name_ar}</h2>
                {plan.approved_at && (
                  <span className="inline-flex items-center gap-1.5 bg-white/20 px-3 py-1 rounded-full text-sm font-medium border border-white/30">
                    <BadgeCheck size={14} /> معتمدة
                  </span>
                )}
                {plan.frozen_at && (
                  <span className="inline-flex items-center gap-1.5 bg-sky-400/25 px-3 py-1 rounded-full text-sm font-medium border border-sky-200/40">
                    <Lock size={14} /> مجمّدة
                  </span>
                )}
              </div>
              {/* القسم + المالك + العام — صفّ أفقي واحد يلتفّ كمجموعة (لا تكدّس عمودي) */}
              <div className="flex items-center gap-1.5 flex-wrap mt-2 text-violet-100">
                {plan.department && <span className="inline-flex items-center gap-1 text-[11px] bg-white/15 px-2 py-0.5 rounded-full whitespace-nowrap"><Tag size={11} /> {plan.department}</span>}
                {plan.owner_id && <span className="inline-flex items-center gap-1 text-[11px] bg-white/15 px-2 py-0.5 rounded-full whitespace-nowrap"><User size={11} /> {dimOwners.find((o: any) => o.id === plan.owner_id)?.name_ar || 'صاحب الخطة'}</span>}
                <span className="inline-flex items-center gap-1 text-[11px] bg-white/15 px-2 py-0.5 rounded-full whitespace-nowrap"><Calendar size={11} /> <span className="font-latin">{plan.academic_year}</span></span>
              </div>
              <div className="flex items-center gap-3 mt-2 text-sm text-violet-200 flex-wrap">
                <span className="whitespace-nowrap">{topNodes.length} {level1Name}</span>
                <span>·</span><span className="whitespace-nowrap">{nodes.length} عقدة</span>
                <span>·</span><span className="whitespace-nowrap">{totalTasks} مهمة</span>
              </div>
            </div>
            <div className="flex items-end gap-4 flex-shrink-0">
                {planRatingInfo && (
                  <div className="text-left">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 text-white font-bold text-sm">
                      <Star size={18} className="text-white" />
                      <div>
                        <div className="text-base font-bold leading-none">{planRatingInfo.label}</div>
                        <div className="text-white/60 text-xs mt-0.5">{planRatingAvg!.toFixed(1)} / 5</div>
                      </div>
                    </div>
                    <div className="text-violet-200 text-xs mt-1 text-center">تقدير الجودة</div>
                  </div>
                )}
                <div className="text-left">
                  <div className="text-4xl font-bold">{progress}%</div>
                  <div className="text-violet-200 text-xs mt-1">نسبة الإنجاز</div>
                </div>
            </div>
          </div>

          {/* صفّ الأزرار — عرض كامل أسفل البيانات (لا يضغط عمود البيانات) */}
          <div className="flex gap-2 mt-4 flex-wrap">
                {/* زر التحويل بين العرضين */}
                <Link href={otherView.href}
                  className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs px-3 py-1.5 rounded-lg transition-colors font-medium">
                  {otherView.icon} {otherView.label}
                </Link>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
                {(isSuperAdmin || can('manage_plans')) && !plan.frozen_at && (
                  <button onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"><Upload size={13} /> استيراد</button>
                )}
                <button onClick={exportExcel}
                  className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"><Download size={13} /> تصدير</button>
                <button onClick={() => generateQnsaReport(planId)}
                  className="flex items-center gap-1.5 bg-white text-xs px-3 py-1.5 rounded-lg font-semibold hover:bg-white/90" style={{ color: 'var(--maroon-700)' }}>
                  <Award size={14} /> تقرير QNSA
                </button>
                <Link href={`/dashboard/plans/${planId}/kpis`}
                  className="flex items-center gap-1.5 bg-violet-500/25 hover:bg-violet-500/40 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
                  <BarChart3 size={14} /> لوحة KPI
                </Link>
                {(isSuperAdmin || can('manage_plans')) && !plan.frozen_at && (
                  <button onClick={openKpiSettings}
                    className="flex items-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/35 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
                    <Settings size={14} /> إعدادات KPI
                  </button>
                )}
                {(isSuperAdmin || can('approve_plans')) && (
                  <button onClick={() => certifyPlan(!plan.approved_at)} disabled={certifying}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60
                      ${plan.approved_at ? 'bg-amber-400/25 hover:bg-amber-400/40 text-white' : 'bg-emerald-500/20 hover:bg-emerald-500/35 text-white'}`}>
                    <span className="inline-flex">{plan.approved_at ? <ShieldOff size={14} /> : <BadgeCheck size={14} />}</span>
                    <span>{plan.approved_at ? 'إلغاء الاعتماد' : 'اعتماد الخطة'}</span>
                  </button>
                )}
                {(isSuperAdmin || can('freeze_plans')) && (
                  <button onClick={() => freezePlan(!plan.frozen_at)} disabled={certifying}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60
                      ${plan.frozen_at ? 'bg-amber-400/25 hover:bg-amber-400/40 text-white' : 'bg-sky-500/20 hover:bg-sky-500/35 text-white'}`}>
                    <span className="inline-flex">{plan.frozen_at ? <LockOpen size={14} /> : <Lock size={14} />}</span>
                    <span>{plan.frozen_at ? 'إلغاء التجميد' : 'تجميد الخطة'}</span>
                  </button>
                )}
                {plan.owner_id && plan.owner_id !== userId && (isSuperAdmin || can('manage_plans') || can('view_aggregate')) && (
                  <button onClick={notifyOwner} disabled={notifyingOwner}
                    className="flex items-center gap-1.5 bg-amber-400/25 hover:bg-amber-400/40 text-white text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60" title="تنبيه صاحب الخطة">
                    <Bell size={14} /> {notifyingOwner ? 'جارٍ...' : 'تنبيه صاحب الخطة'}
                  </button>
                )}
                {(isSuperAdmin || can('manage_plans')) && !plan.frozen_at && (
                  <button onClick={openEditPlan}
                    className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
                    <Pencil size={14} /> تعديل
                  </button>
                )}
                {!plan.approved_at && !plan.frozen_at && (isSuperAdmin || can('delete_plans')) && (
                  <button onClick={() => setConfirmDelPlan(true)}
                    className="flex items-center gap-1.5 bg-red-500/20 hover:bg-red-500/40 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
                    <Trash2 size={14} /> حذف
                  </button>
                )}
          </div>

          <div className="mt-4 h-2 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>

          <div className="mt-4 flex items-center gap-2 flex-wrap">
            {levelNames.map((lname: string, idx: number) => {
              const hasKpi = (plan.kpi_levels || []).some((k: any) => k.levelIndex === idx)
              return (
                <span key={idx} className="flex items-center gap-1">
                  <span className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${hasKpi ? 'bg-emerald-400/25 text-emerald-100' : 'bg-white/15'}`}>
                    {lname}{hasKpi && <BarChart3 size={12} className="text-emerald-300 flex-shrink-0" />}
                  </span>
                  <span className="text-violet-300 text-xs">›</span>
                </span>
              )
            })}
            <span className="inline-flex items-center gap-1 bg-green-400/20 px-2.5 py-1 rounded-lg text-xs font-medium text-green-100"><CircleCheckBig size={12} /> المهمة</span>
          </div>
        </div>
      ) : (
        /* ── نموذج تعديل الخطة ── */
        <div className="bg-gradient-to-l from-violet-600 to-indigo-700 rounded-2xl p-6">
          <form onSubmit={savePlan} className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-bold">تعديل بيانات الخطة</span>
              <button type="button" onClick={() => setEditingPlan(false)} className="inline-flex items-center gap-1 text-white/60 hover:text-white text-sm"><X size={13} /> إلغاء</button>
            </div>
            <input value={editPlanName} onChange={e => setEditPlanName(e.target.value)} required
              className="w-full px-4 py-3 rounded-xl bg-white/15 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/40" placeholder="اسم الخطة *" />
            <select value={editPlanYear} onChange={e => setEditPlanYear(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/15 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-white/40">
              {ACADEMIC_YEARS.map(y => <option key={y} value={y} className="text-slate-800">{y}</option>)}
            </select>
            <div className="bg-white/10 rounded-xl p-4 space-y-3">
              <p className="inline-flex items-center gap-1.5 text-white text-sm font-bold"><Layers size={14} /> عدد مستويات الهيكل الهرمي</p>
              <div className="flex gap-2">
                {[2, 3, 4, 5].map(n => (
                  <button key={n} type="button" onClick={() => handleLevelCountChange(n)}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${editLevelCount === n ? 'bg-white text-violet-700 shadow' : 'bg-white/15 text-white/80 hover:bg-white/25'}`}>{n}</button>
                ))}
              </div>
              <div className="space-y-2 mt-2">
                {editLevelNames.map((lname, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-white/60 text-xs w-20 shrink-0">المستوى {idx + 1}</span>
                    <input value={lname} onChange={e => { const u = [...editLevelNames]; u[idx] = e.target.value; setEditLevelNames(u) }}
                      className="flex-1 px-3 py-2 rounded-lg bg-white/15 border border-white/20 text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-white/40" placeholder={`اسم المستوى ${idx + 1}`} />
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white/10 rounded-xl p-4 space-y-3">
              <p className="inline-flex items-center gap-1.5 text-white text-sm font-bold"><FolderTree size={14} /> تصنيف الخطة (للوحات التجميع)</p>
              <div className="grid grid-cols-2 gap-2">
                <select value={editDept} onChange={e => setEditDept(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-white/15 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/40">
                  <option value="" className="text-slate-800">— القسم —</option>
                  {dimDepartments.map(d => <option key={d} value={d} className="text-slate-800">{d}</option>)}
                </select>
                <select value={editCategory} onChange={e => setEditCategory(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-white/15 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/40">
                  <option value="" className="text-slate-800">— نوع الخطة —</option>
                  {dimPlanTypes.map(t => <option key={t} value={t} className="text-slate-800">{t}</option>)}
                </select>
              </div>
              <select value={editOwner} onChange={e => setEditOwner(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/15 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/40">
                <option value="" className="text-slate-800">— صاحب الخطة —</option>
                {dimOwners.map((o: any) => <option key={o.id} value={o.id} className="text-slate-800">{o.name_ar}{o.job_title ? ` — ${o.job_title}` : ''}</option>)}
              </select>
            </div>
            <button type="submit" disabled={savingPlan} className="w-full py-3 bg-white text-violet-700 font-bold rounded-xl disabled:opacity-60">
              <span className="inline-flex items-center justify-center gap-1.5">{savingPlan ? 'جارٍ الحفظ...' : <><Save size={14} /> حفظ التعديلات</>}</span>
            </button>
          </form>
        </div>
      )}

      {/* ══ مودال استيراد Excel ══ */}
      {showImport && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowImport(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h3 className="inline-flex items-center gap-1.5 text-lg font-bold text-slate-800"><Upload size={17} /> استيراد هيكل الخطة</h3>
                <p className="text-xs text-slate-400 mt-0.5">{importRows.length} صف في الملف — العناصر الموجودة لن تُكرَّر</p>
              </div>
              <button onClick={() => setShowImport(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-auto p-5">
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="text-xs w-full">
                  <thead className="bg-slate-50"><tr>
                    {importRows[0] && Object.keys(importRows[0]).map(k => (
                      <th key={k} className="px-3 py-2.5 text-right font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200">{k}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {importRows.slice(0, 8).map((row, i) => (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                        {Object.values(row).map((v: any, j) => (
                          <td key={j} className={`px-3 py-2 whitespace-nowrap ${v ? 'text-slate-700 font-medium' : 'text-slate-300'}`}>{v?.toString() || '—'}</td>
                        ))}
                      </tr>
                    ))}
                    {importRows.length > 8 && <tr><td colSpan={99} className="px-3 py-2 text-slate-400 text-center italic">... و {importRows.length - 8} صفوف أخرى</td></tr>}
                  </tbody>
                </table>
              </div>
              {importMsg && <div className={`mt-4 px-4 py-3 rounded-xl text-sm font-medium ${importMsg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{importMsg}</div>}
            </div>
            <div className="p-5 border-t border-slate-100 flex gap-3 justify-end">
              <button onClick={() => setShowImport(false)} className="px-5 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50">إغلاق</button>
              <button onClick={runImport} disabled={importing || !!importMsg.startsWith('✅')}
                className="px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl disabled:opacity-60 transition-colors">
                <span className="inline-flex items-center gap-1.5">{importing ? 'جارٍ الاستيراد...' : <><Upload size={14} /> استيراد {importRows.length} صف</>}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ مودال إعدادات KPI ══ */}
      {showKpiSettings && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowKpiSettings(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><BarChart3 size={18} /> إعدادات مؤشرات الأداء KPI</h3>
                <p className="text-xs text-slate-400 mt-0.5">فعّل أو عطّل مؤشرات الأداء لكل مستوى من مستويات الخطة</p>
              </div>
              <button onClick={() => setShowKpiSettings(false)} className="text-slate-400 hover:text-slate-600 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {kpiLevels.map((cfg) => {
                const locked = cfg.levelIndex === 0
                const lName  = (plan.level_names || [])[cfg.levelIndex] || `المستوى ${cfg.levelIndex + 1}`
                return (
                  <div key={cfg.levelIndex} className={`rounded-2xl border p-4 transition-all ${locked ? 'bg-slate-50 border-slate-200 opacity-60' : cfg.enabled ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${cfg.enabled && !locked ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>{cfg.levelIndex + 1}</span>
                        <div>
                          <p className="font-semibold text-slate-700 text-sm">{lName}</p>
                          {locked && <p className="inline-flex items-center gap-1 text-xs text-slate-400"><Lock size={11} /> المستوى الأول — حاوٍ عام للخطة</p>}
                        </div>
                      </div>
                      {!locked && (
                        <button type="button" onClick={() => updateKpiLevel(cfg.levelIndex, { enabled: !cfg.enabled })}
                          className={`relative inline-block h-6 w-11 rounded-full transition-colors flex-shrink-0 ${cfg.enabled ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                          <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all ${cfg.enabled ? 'left-1' : 'right-1'}`} />
                        </button>
                      )}
                    </div>
                    {!locked && cfg.enabled && (
                      <div className="mt-3 pt-3 border-t border-emerald-200 grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs font-semibold text-slate-500 mb-1.5">نوع المؤشر</p>
                          <div className="space-y-1">
                            {(['impact', 'outcome', 'output'] as const).map(t => {
                              const meta = KPI_TYPE_META[t]
                              return (
                                <label key={t} className={`flex items-center gap-2 p-1.5 rounded-lg cursor-pointer border text-xs transition-colors ${cfg.kpiType === t ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 hover:border-emerald-200 text-slate-600'}`}>
                                  <input type="radio" name={`kpiType-${cfg.levelIndex}`} value={t} checked={cfg.kpiType === t} onChange={() => updateKpiLevel(cfg.levelIndex, { kpiType: t })} className="accent-emerald-500" />
                                  <span className="flex items-center gap-1"><meta.Icon size={14} /> {KPI_TYPE_LABELS[t]}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-500 mb-1.5">دورية القياس</p>
                          <div className="space-y-1">
                            {(['monthly', 'quarterly', 'semester', 'yearly'] as const).map(f => (
                              <label key={f} className="flex items-center gap-2 cursor-pointer group">
                                <input type="radio" name={`kpiFreq-${cfg.levelIndex}`} value={f} checked={cfg.frequency === f} onChange={() => updateKpiLevel(cfg.levelIndex, { frequency: f })} className="accent-emerald-500" />
                                <span className="text-xs text-slate-600 group-hover:text-slate-800">{KPI_FREQ_LABELS[f]}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                <Lightbulb size={14} className="flex-shrink-0 mt-0.5" />
                <span>المستوى الأول (الحاوي العام) لا يمكن إضافة KPI له. أما المهام فهي كيان منفصل تحت جميع المستويات.</span>
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 flex gap-3 justify-end">
              <button onClick={() => setShowKpiSettings(false)} className="px-5 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50">إلغاء</button>
              <button onClick={saveKpiSettings} disabled={savingKpi} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl disabled:opacity-60 transition-colors">
                <span className="inline-flex items-center gap-1.5">{savingKpi ? <><Loader2 size={14} className="animate-spin" /> جارٍ الحفظ...</> : <><Save size={14} /> حفظ الإعدادات</>}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ تأكيد حذف الخطة ══ */}
      <ConfirmDialog
        open={confirmDelPlan}
        title="حذف الخطة نهائياً"
        loading={deletingPlan}
        message={<>سيتم حذف "<strong>{plan.name_ar}</strong>" وجميع هيكلها ومهامها بشكل نهائي لا يمكن التراجع عنه.</>}
        onConfirm={deletePlan}
        onCancel={() => setConfirmDelPlan(false)}
      />
    </>
  )
}

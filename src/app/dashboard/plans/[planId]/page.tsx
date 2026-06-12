'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import { calcAvgRating } from '@/lib/rating'
import { ClipboardList, AlertTriangle, Target, TrendingUp, Package, BarChart3, Star,
  Settings, Pencil, Trash2, Award, BadgeCheck, ShieldOff } from 'lucide-react'
import { generateQnsaReport } from '@/lib/qnsaReport'
import StandardPicker from '@/components/StandardPicker'
import { usePermissions } from '@/lib/PermissionsContext'

/* خريطة أيقونات KPI */
const KPI_ICON_MAP: Record<string, React.ElementType> = {
  impact: Target, outcome: TrendingUp, output: Package,
}

/* كلاسات التقييم — بدون emoji */
function ratingBadgeClass(avg: number): { label: string; cls: string } {
  if (avg >= 4.5) return { label: 'ممتاز',    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
  if (avg >= 3.5) return { label: 'جيد جداً', cls: 'bg-blue-50 text-blue-700 border-blue-200'          }
  if (avg >= 2.5) return { label: 'جيد',      cls: 'bg-violet-50 text-violet-700 border-violet-200'    }
  if (avg >= 1.5) return { label: 'مقبول',    cls: 'bg-amber-50 text-amber-700 border-amber-200'       }
  return                  { label: 'ضعيف',     cls: 'bg-red-50 text-red-700 border-red-200'             }
}

const ACADEMIC_YEARS = Array.from({ length: 16 }, (_, i) => `${2024 + i}-${2025 + i}`)

export default function PlanOverviewPage() {
  const params   = useParams()
  const planId   = params.planId as string
  const router   = useRouter()
  const supabase = createClient()
  const { isSuperAdmin } = usePermissions()

  const [plan,         setPlan]         = useState<any>(null)
  const [nodes,        setNodes]        = useState<any[]>([])
  const [tasks,        setTasks]        = useState<any[]>([])
  const [loading,      setLoading]      = useState(true)

  /* ── إعدادات KPI ── */
  type KpiLevelConfig = {
    levelIndex: number
    enabled:    boolean
    kpiType:    string
    frequency:  string
  }
  const [showKpiSettings, setShowKpiSettings] = useState(false)
  const [kpiLevels,       setKpiLevels]       = useState<KpiLevelConfig[]>([])
  const [savingKpi,       setSavingKpi]       = useState(false)

  /* ── إضافة محور ── */
  const [adding,       setAdding]       = useState(false)
  const [newName,      setNewName]      = useState('')
  const [saving,       setSaving]       = useState(false)

  /* ── تعديل الخطة ── */
  const [editingPlan,    setEditingPlan]    = useState(false)
  const [editPlanName,   setEditPlanName]   = useState('')
  const [editPlanYear,   setEditPlanYear]   = useState('')
  const [editLevelCount, setEditLevelCount] = useState(3)
  const [editLevelNames, setEditLevelNames] = useState<string[]>([])
  const [savingPlan,     setSavingPlan]     = useState(false)

  /* ── استيراد / تصدير ── */
  const fileRef      = useRef<HTMLInputElement>(null)
  const [showImport, setShowImport]  = useState(false)
  const [importRows, setImportRows]  = useState<any[]>([])
  const [importing,  setImporting]   = useState(false)
  const [importMsg,  setImportMsg]   = useState('')

  /* ── تعديل/حذف العقد ── */
  const [editNodeId,   setEditNodeId]   = useState<string|null>(null)
  const [editNodeName, setEditNodeName] = useState('')
  const [confirmDelId, setConfirmDelId] = useState<string|null>(null)
  const [confirmDelPlan, setConfirmDelPlan] = useState(false)
  const [deletingPlan, setDeletingPlan] = useState(false)
  const [certifying, setCertifying] = useState(false)

  const load = useCallback(async () => {
    const [{ data: planData }, { data: nodesData }] = await Promise.all([
      supabase.from('plans').select('id, name_ar, academic_year, level_count, level_names, kpi_levels, approved_at, approved_by').eq('id', planId).single(),
      supabase.from('plan_nodes').select('id, parent_id, level_num, name_ar, order_num, standard_code').eq('plan_id', planId).order('order_num'),
    ])
    if (!planData) { router.push('/dashboard/plans'); return }
    setPlan(planData)
    setNodes(nodesData || [])

    const nodeIds = (nodesData || []).map((n: any) => n.id)
    if (nodeIds.length > 0) {
      const { data: t } = await supabase.from('tasks')
        .select('id,name_ar,status,priority,task_type,start_date,end_date,node_id,order_num,rating')
        .in('node_id', nodeIds)
      setTasks(t || [])
    } else {
      setTasks([])
    }
    setLoading(false)
  }, [planId])

  useEffect(() => { load() }, [load])

  /* ── إضافة محور (من كتالوج معايير الاعتماد أو بند مخصص) ── */
  const addTopNode = async (choice: { name: string; standardCode: string | null }) => {
    setSaving(true)
    const existing = nodes.filter(n => n.parent_id === null && n.level_num === 1)
    const orderNum = existing.length > 0 ? Math.max(...existing.map((n:any) => n.order_num)) + 1 : 1
    await supabase.from('plan_nodes').insert({
      plan_id: planId, parent_id: null, level_num: 1, name_ar: choice.name,
      order_num: orderNum, standard_code: choice.standardCode,
    })
    setAdding(false); setSaving(false)
    await load()
  }

  /* ── تعديل الخطة ── */
  const openEditPlan = () => {
    setEditPlanName(plan.name_ar)
    setEditPlanYear(plan.academic_year)
    const lc = plan.level_count || 3
    const ln: string[] = plan.level_names || []
    setEditLevelCount(lc)
    setEditLevelNames(Array.from({ length: lc }, (_, i) => ln[i] || `المستوى ${i + 1}`))
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
    await supabase.from('plans').update({
      name_ar: editPlanName.trim(),
      academic_year: editPlanYear,
      level_count: editLevelCount,
      level_names: editLevelNames,
    }).eq('id', planId)
    setSavingPlan(false); setEditingPlan(false)
    await load()
  }

  /* ── حذف الخطة — عبر API خادمي (الحذف الناعم من العميل ترفضه سياسة القراءة) ── */
  const deletePlan = async () => {
    setDeletingPlan(true)
    const res  = await fetch(`/api/plans/${planId}`, { method: 'DELETE' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      alert(`تعذّر حذف الخطة: ${json.error || res.status}`)
      setDeletingPlan(false)
      setConfirmDelPlan(false)
      return
    }
    router.push('/dashboard/plans')
  }

  /* ── اعتماد / إلغاء اعتماد الخطة (مشرف النظام فقط) ── */
  const certifyPlan = async (approve: boolean) => {
    setCertifying(true)
    const res  = await fetch(`/api/plans/${planId}/certify`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approve }),
    })
    const json = await res.json().catch(() => ({}))
    setCertifying(false)
    if (!res.ok) {
      alert(`تعذّر ${approve ? 'اعتماد' : 'إلغاء اعتماد'} الخطة: ${json.error || res.status}`)
      return
    }
    await load()
  }

  /* ── إعدادات KPI ── */
  const KPI_TYPE_LABELS: Record<string,string> = {
    impact:  'أثر بعيد',
    outcome: 'نتيجة مباشرة',
    output:  'مخرج',
  }
  const KPI_TYPE_META: Record<string, { Icon: React.ElementType; def: string; example: string; timing: string; suitable: string }> = {
    impact: {
      Icon:     Target,
      def:      'التحسّن في المؤشر النهائي الناتج عن تراكم النتائج على مدى سنوات',
      example:  'ارتفاع معدل التحصيل في امتحانات الدولة — انخفاض نسبة التسرب المدرسي',
      timing:   'يُقاس بعد 3–5 سنوات من التنفيذ',
      suitable: 'الأهداف الاستراتيجية العليا',
    },
    outcome: {
      Icon:     TrendingUp,
      def:      'التغيير في سلوك المستفيد الناتج عن الأنشطة والمبادرات',
      example:  'نسبة المعلمين الذين غيّروا طريقة تدريسهم — تحسّن مشاركة الطلاب داخل الفصل',
      timing:   'يُقاس خلال 1–2 سنة من التنفيذ',
      suitable: 'الأهداف العامة والمبادرات',
    },
    output: {
      Icon:     Package,
      def:      'ما قام به الفريق من إنجازات دون النظر إلى تأثيرها أو أثرها',
      example:  'عدد الدورات المنفّذة — عدد الوثائق المُعدَّة — عدد الطلاب الملتحقين ببرنامج',
      timing:   'يُقاس فور الانتهاء من التنفيذ',
      suitable: 'الأهداف التشغيلية والأنشطة',
    },
  }
  const KPI_FREQ_LABELS: Record<string,string> = {
    monthly:   'شهري',
    quarterly: 'ربع سنوي',
    semester:  'فصلي',
    yearly:    'سنوي',
  }

  const openKpiSettings = () => {
    const lc      = plan.level_count || 3
    const lNames  = plan.level_names  || []
    const saved   = (plan.kpi_levels || []) as KpiLevelConfig[]
    const configs = Array.from({ length: lc }, (_, idx): KpiLevelConfig => {
      const existing = saved.find(k => k.levelIndex === idx)
      // فقط المستوى الأول (الحاوي العام) يُقفَل — المهام كيان منفصل يأتي بعد جميع المستويات
      const locked   = idx === 0
      if (existing) return { ...existing }
      return {
        levelIndex: idx,
        enabled:    !locked,   // كل المستويات عدا الأول مُفعَّلة بشكل افتراضي
        kpiType:    idx <= 1 ? 'impact' : 'outcome',
        frequency:  idx <= 1 ? 'yearly' : 'quarterly',
      }
    })
    setKpiLevels(configs)
    setShowKpiSettings(true)
  }

  const saveKpiSettings = async () => {
    setSavingKpi(true)
    const lc = plan.level_count || 3
    const toSave = kpiLevels
      .filter(k => k.enabled)
      .map(k => ({
        levelIndex: k.levelIndex,
        levelName:  (plan.level_names || [])[k.levelIndex] || `المستوى ${k.levelIndex + 1}`,
        kpiType:    k.kpiType,
        frequency:  k.frequency,
      }))
    await supabase.from('plans').update({ kpi_levels: toSave }).eq('id', planId)
    setSavingKpi(false)
    setShowKpiSettings(false)
    await load()
  }

  const updateKpiLevel = (idx: number, patch: Partial<KpiLevelConfig>) => {
    setKpiLevels(prev => prev.map(k => k.levelIndex === idx ? { ...k, ...patch } : k))
  }

  /* ── تعديل عقدة ── */
  const saveNodeEdit = async (nodeId: string) => {
    if (!editNodeName.trim()) return
    setSaving(true)
    await supabase.from('plan_nodes').update({ name_ar: editNodeName.trim() }).eq('id', nodeId)
    setEditNodeId(null); setSaving(false); await load()
  }

  /* ── حذف عقدة — عبر API خادمي (الحذف الناعم من العميل ترفضه سياسة القراءة) ── */
  const deleteNode = async (nodeId: string) => {
    const res  = await fetch(`/api/plans/${planId}/nodes/${nodeId}`, { method: 'DELETE' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      alert(`تعذّر الحذف: ${json.error || res.status}`)
      setConfirmDelId(null)
      return
    }
    setConfirmDelId(null); await load()
  }

  /* ══ ترجمة القيم ══ */
  const STATUS_AR: Record<string,string>   = { not_started:'لم تبدأ', in_progress:'جارية', completed:'منجزة', delayed:'متأخرة' }
  const PRIORITY_AR: Record<string,string> = { high:'عالية', medium:'متوسطة', low:'منخفضة' }
  const TYPE_AR: Record<string,string>     = { academic:'أكاديمية', administrative:'إدارية', general:'عامة' }
  const STATUS_EN: Record<string,string>   = Object.fromEntries(Object.entries(STATUS_AR).map(([k,v])=>[v,k]))
  const PRIORITY_EN: Record<string,string> = Object.fromEntries(Object.entries(PRIORITY_AR).map(([k,v])=>[v,k]))
  const TYPE_EN: Record<string,string>     = Object.fromEntries(Object.entries(TYPE_AR).map(([k,v])=>[v,k]))

  const TASK_COL     = 'المهمة'
  const TASK_HEADERS = [
    'الحالة', 'الأولوية', 'النوع',
    'تاريخ البداية', 'تاريخ الانتهاء',
    'المكلف', 'الفريق المكلف',
    'الموارد المالية (ر.ق)', 'الموارد الأخرى', 'أدلة الإنجاز',
  ]

  /* ══ تصدير Excel (عبر API Route — يشمل التحقق من البيانات) ══ */
  const exportExcel = async () => {
    try {
      const res = await fetch(`/api/plans/${planId}/export-excel`)
      if (!res.ok) { alert('حدث خطأ أثناء التصدير'); return }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${plan.name_ar}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('تعذّر الاتصال بالخادم')
    }
  }

  /* ══ تحويل قيمة خلية التاريخ من Excel إلى نص YYYY-MM-DD ══ */
  const parseDateCell = (val: any): string | null => {
    if (!val && val !== 0) return null
    if (val instanceof Date) {
      if (isNaN(val.getTime())) return null
      return val.toISOString().split('T')[0]
    }
    if (typeof val === 'number') {
      // رقم متسلسل لتاريخ Excel
      const parsed = XLSX.SSF.parse_date_code(val)
      if (!parsed) return null
      const m = String(parsed.m).padStart(2, '0')
      const d = String(parsed.d).padStart(2, '0')
      return `${parsed.y}-${m}-${d}`
    }
    const str = val.toString().trim()
    if (!str) return null
    const dt = new Date(str)
    return isNaN(dt.getTime()) ? null : dt.toISOString().split('T')[0]
  }

  /* ══ قراءة ملف الاستيراد ══ */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      // cellDates: true → يُرجع Date objects بدلاً من الأرقام المتسلسلة للتواريخ
      const wb   = XLSX.read(ev.target?.result, { type: 'array', cellDates: true })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[]
      setImportRows(rows); setShowImport(true); setImportMsg('')
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  /* ══ تنفيذ الاستيراد (هيكل + مهام) ══ */
  const runImport = async () => {
    if (importRows.length === 0) return
    setImporting(true); setImportMsg('')

    const lNames   = (plan.level_names || []) as string[]
    const lCount   = plan.level_count  || 3
    const colNames = Array.from({ length: lCount }, (_, i) => lNames[i] || `المستوى ${i + 1}`)

    // ── تحميل الملفات الشخصية والفرق لربط الأسماء بالمعرّفات ──
    const [{ data: profiles }, { data: teams }] = await Promise.all([
      supabase.from('profiles').select('id,name_ar'),
      supabase.from('teams').select('id,name_ar'),
    ])
    const profileNameMap: Record<string,string> = {}
    ;(profiles || []).forEach((p:any) => { if (p.name_ar) profileNameMap[p.name_ar.trim()] = p.id })
    const teamNameMap: Record<string,string> = {}
    ;(teams || []).forEach((t:any) => { if (t.name_ar) teamNameMap[t.name_ar.trim()] = t.id })

    // ── تحميل العناصر الموجودة ──
    const { data: existingNodes } = await supabase
      .from('plan_nodes').select('id,parent_id,level_num,name_ar,order_num').eq('plan_id', planId)

    const pathMap: Record<string,string> = {}
    const buildMap = (parentId: string|null, path: string[]) => {
      ;(existingNodes || []).filter((n:any) => n.parent_id === parentId).forEach((n:any) => {
        const p = [...path, n.name_ar]
        pathMap[p.join('|||')] = n.id
        buildMap(n.id, p)
      })
    }
    buildMap(null, [])

    const orderCounters: Record<string,number> = {}
    ;(existingNodes || []).forEach((n:any) => {
      const key = n.parent_id || 'root'
      orderCounters[key] = Math.max(orderCounters[key] || 0, n.order_num || 0)
    })

    // ── تحميل المهام الموجودة (لتجنب تكرارها) ──
    const nodeIds = Object.values(pathMap)
    let existingTaskNames = new Set<string>()
    if (nodeIds.length > 0) {
      const { data: et } = await supabase
        .from('tasks').select('name_ar,node_id').in('node_id', nodeIds)
      ;(et || []).forEach((t:any) => existingTaskNames.add(`${t.node_id}|||${t.name_ar}`))
    }

    let createdNodes = 0, createdTasks = 0

    for (const row of importRows) {
      // ── معالجة مسار العقدة ──
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
            plan_id: planId, parent_id: parentId,
            level_num: i + 1, name_ar: val,
            order_num: orderCounters[parentKey],
          }).select('id').single()
          if (nd) {
            pathMap[key] = nd.id
            orderCounters[nd.id] = 0
            createdNodes++
          }
        }
      }

      // ── معالجة المهمة إن وجدت ──
      const taskName = (row[TASK_COL] ?? '').toString().trim()
      if (taskName && path.length > 0) {
        const nodeId  = pathMap[path.join('|||')]
        const taskKey = `${nodeId}|||${taskName}`
        if (nodeId && !existingTaskNames.has(taskKey)) {
          // ربط المكلف والفريق بالمعرّفات
          const assignedUserName = (row['المكلف']         ?? '').toString().trim()
          const assignedTeamName = (row['الفريق المكلف']  ?? '').toString().trim()
          const budgetRaw        = (row['الموارد المالية (ر.ق)'] ?? '').toString().trim()
          const budgetVal        = budgetRaw !== '' ? parseFloat(budgetRaw) : null
          const otherResources   = (row['الموارد الأخرى'] ?? '').toString().trim() || null
          const evidenceRequired = (row['أدلة الإنجاز']   ?? '').toString().trim() || null

          const { error } = await supabase.from('tasks').insert({
            name_ar:               taskName,
            node_id:               nodeId,
            status:                STATUS_EN[(row['الحالة']      ?? '').toString().trim()] || 'not_started',
            priority:              PRIORITY_EN[(row['الأولوية']  ?? '').toString().trim()] || 'medium',
            task_type:             TYPE_EN[(row['النوع']         ?? '').toString().trim()] || 'general',
            start_date:            parseDateCell(row['تاريخ البداية']),
            end_date:              parseDateCell(row['تاريخ الانتهاء']),
            assigned_to_user_id:   assignedUserName ? (profileNameMap[assignedUserName] ?? null) : null,
            assigned_to_team_id:   assignedTeamName ? (teamNameMap[assignedTeamName]    ?? null) : null,
            budget_qar:            budgetVal != null && !isNaN(budgetVal) ? budgetVal : null,
            other_resources:       otherResources,
            evidence_required:     evidenceRequired,
          })
          if (!error) { existingTaskNames.add(taskKey); createdTasks++ }
        }
      }
    }

    const parts = []
    if (createdNodes) parts.push(`${createdNodes} عنصر`)
    if (createdTasks) parts.push(`${createdTasks} مهمة`)
    setImportMsg(parts.length ? `✅ تم إضافة ${parts.join(' و ')}` : '⚠️ لم يُضَف شيء جديد (كل البيانات موجودة)')
    setImporting(false)
    await load()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full" />
    </div>
  )
  if (!plan) return null

  const levelNames: string[] = plan.level_names || []
  const level1Name = levelNames[0] || 'المستوى الأول'
  const topNodes   = nodes.filter(n => n.level_num === 1).sort((a:any,b:any) => a.order_num - b.order_num)

  const totalTasks = tasks.length
  const doneTasks  = tasks.filter(t => t.status === 'completed').length
  const progress   = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

  // تقدير الخطة الكلي = متوسط تقييمات المهام المُقيَّمة
  const planRatingAvg  = calcAvgRating(tasks.map(t => t.rating))
  const planRatingInfo = planRatingAvg != null ? ratingBadgeClass(planRatingAvg) : null

  const getDescendantIds = (nodeId: string): string[] => {
    const children = nodes.filter(n => n.parent_id === nodeId)
    return [nodeId, ...children.flatMap((c:any) => getDescendantIds(c.id))]
  }

  return (
    <div className="space-y-5">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/dashboard/plans" className="hover:text-violet-600">الخطط</Link>
        <span>›</span>
        <span className="text-violet-700 font-medium">{plan.name_ar}</span>
      </div>

      {/* ══ Plan Header ══ */}
      {!editingPlan ? (
        <div className="bg-gradient-to-l from-violet-600 to-indigo-700 text-white rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-2xl font-bold">{plan.name_ar}</h2>
                {/* شارة الاعتماد */}
                {plan.approved_at && (
                  <span className="inline-flex items-center gap-1.5 bg-white/20 px-3 py-1 rounded-full text-sm font-medium border border-white/30">
                    <BadgeCheck size={14} />
                    معتمدة
                  </span>
                )}
              </div>
              <p className="text-violet-200 text-sm mt-1">العام الدراسي: <span className="font-latin">{plan.academic_year}</span></p>
              <div className="flex items-center gap-4 mt-3 text-sm text-violet-200">
                <span>{topNodes.length} {level1Name}</span>
                <span>·</span><span>{nodes.length} عقدة</span>
                <span>·</span><span>{totalTasks} مهمة</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-end gap-4">
                {/* تقدير الجودة الكلي */}
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
              {/* أزرار إجراءات الخطة */}
              <div className="flex gap-2 mt-1 flex-wrap justify-end">
                <button onClick={() => generateQnsaReport(planId)}
                  className="flex items-center gap-1.5 bg-white text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors hover:bg-white/90"
                  style={{ color: 'var(--maroon-700)' }}>
                  <Award size={14} /> تقرير QNSA
                </button>
                <Link href={`/dashboard/plans/${planId}/kpis`}
                  className="flex items-center gap-1.5 bg-violet-500/25 hover:bg-violet-500/40 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
                  <BarChart3 size={14} /> لوحة KPI
                </Link>
                <button onClick={openKpiSettings}
                  className="flex items-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/35 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
                  <Settings size={14} /> إعدادات KPI
                </button>
                {/* اعتماد / إلغاء الاعتماد — للمشرف العام فقط */}
                {isSuperAdmin && (
                  <button onClick={() => certifyPlan(!plan.approved_at)} disabled={certifying}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60
                      ${plan.approved_at
                        ? 'bg-amber-400/25 hover:bg-amber-400/40 text-white'
                        : 'bg-emerald-500/20 hover:bg-emerald-500/35 text-white'}`}>
                    {plan.approved_at
                      ? <><ShieldOff size={14} /> إلغاء الاعتماد</>
                      : <><BadgeCheck size={14} /> اعتماد الخطة</>}
                  </button>
                )}
                <button onClick={openEditPlan}
                  className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
                  <Pencil size={14} /> تعديل
                </button>
                {/* حذف — مخفي للخطط المعتمدة */}
                {!plan.approved_at && (
                  <button onClick={() => setConfirmDelPlan(true)}
                    className="flex items-center gap-1.5 bg-red-500/20 hover:bg-red-500/40 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
                    <Trash2 size={14} /> حذف
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 h-2 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>

          {/* مستويات الخطة */}
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            {levelNames.map((lname: string, idx: number) => {
              const hasKpi = (plan.kpi_levels || []).some((k: any) => k.levelIndex === idx)
              return (
                <span key={idx} className="flex items-center gap-1">
                  <span className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium
                    ${hasKpi ? 'bg-emerald-400/25 text-emerald-100' : 'bg-white/15'}`}>
                    {lname}
                    {hasKpi && <BarChart3 size={12} className="text-emerald-300 flex-shrink-0" />}
                  </span>
                  <span className="text-violet-300 text-xs">›</span>
                </span>
              )
            })}
            <span className="bg-green-400/20 px-2.5 py-1 rounded-lg text-xs font-medium text-green-100">✅ المهمة</span>
          </div>
        </div>
      ) : (
        /* ── نموذج تعديل الخطة ── */
        <div className="bg-gradient-to-l from-violet-600 to-indigo-700 rounded-2xl p-6">
          <form onSubmit={savePlan} className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-bold">تعديل بيانات الخطة</span>
              <button type="button" onClick={() => setEditingPlan(false)} className="text-white/60 hover:text-white text-sm">✕ إلغاء</button>
            </div>

            {/* اسم الخطة */}
            <input value={editPlanName} onChange={e => setEditPlanName(e.target.value)} required
              className="w-full px-4 py-3 rounded-xl bg-white/15 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/40"
              placeholder="اسم الخطة *" />

            {/* العام الدراسي */}
            <select value={editPlanYear} onChange={e => setEditPlanYear(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/15 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-white/40">
              {ACADEMIC_YEARS.map(y => <option key={y} value={y} className="text-slate-800">📅 {y}</option>)}
            </select>

            {/* عدد المستويات */}
            <div className="bg-white/10 rounded-xl p-4 space-y-3">
              <p className="text-white text-sm font-bold">🏗️ عدد مستويات الهيكل الهرمي</p>
              <div className="flex gap-2">
                {[2, 3, 4, 5].map(n => (
                  <button key={n} type="button"
                    onClick={() => handleLevelCountChange(n)}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors
                      ${editLevelCount === n
                        ? 'bg-white text-violet-700 shadow'
                        : 'bg-white/15 text-white/80 hover:bg-white/25'}`}>
                    {n}
                  </button>
                ))}
              </div>

              {/* أسماء المستويات */}
              <div className="space-y-2 mt-2">
                {editLevelNames.map((lname, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-white/60 text-xs w-20 shrink-0">المستوى {idx + 1}</span>
                    <input
                      value={lname}
                      onChange={e => {
                        const updated = [...editLevelNames]
                        updated[idx] = e.target.value
                        setEditLevelNames(updated)
                      }}
                      className="flex-1 px-3 py-2 rounded-lg bg-white/15 border border-white/20 text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-white/40"
                      placeholder={`اسم المستوى ${idx + 1}`}
                    />
                  </div>
                ))}
              </div>

              {/* معاينة */}
              <div className="flex items-center gap-1 flex-wrap mt-1">
                {editLevelNames.map((lname, idx) => (
                  <span key={idx} className="flex items-center gap-1">
                    <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">{lname || `المستوى ${idx+1}`}</span>
                    <span className="text-white/40 text-xs">›</span>
                  </span>
                ))}
                <span className="bg-green-300/30 text-green-100 text-xs px-2 py-0.5 rounded-full">✅ المهمة</span>
              </div>
            </div>

            <button type="submit" disabled={savingPlan}
              className="w-full py-3 bg-white text-violet-700 font-bold rounded-xl disabled:opacity-60">
              {savingPlan ? 'جارٍ الحفظ...' : '💾 حفظ التعديلات'}
            </button>
          </form>
        </div>
      )}

      {/* ══ قائمة المحاور ══ */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-bold text-slate-700">{level1Name} ({topNodes.length})</h3>
          <div className="flex items-center gap-2 flex-wrap">
            {/* تصدير */}
            <button onClick={exportExcel}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
              📤 تصدير Excel
            </button>
            {/* استيراد */}
            <button onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
              📥 استيراد Excel
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
            {/* إضافة يدوية */}
            <button onClick={() => setAdding(true)}
              className="flex items-center gap-2 text-sm font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-xl transition-colors">
              ➕ إضافة {level1Name}
            </button>
          </div>
        </div>

        {/* نموذج إضافة — قائمة متسلسلة من معايير الاعتماد */}
        {adding && (
          <div className="p-2 bg-violet-50 rounded-xl border border-violet-200">
            <StandardPicker
              levelNum={1}
              parentStandardCode={null}
              excludeCodes={topNodes.map((n: any) => n.standard_code).filter(Boolean)}
              placeholder={`اسم ${level1Name}...`}
              saving={saving}
              onSubmit={addTopNode}
              onCancel={() => setAdding(false)}
            />
          </div>
        )}

        {topNodes.length > 0 ? (
          <div className="grid gap-3">
            {topNodes.map((node: any, idx: number) => {
              const descIds   = getDescendantIds(node.id)
              const nodeTasks = tasks.filter(t => descIds.includes(t.node_id))
              const nodeTotal = nodeTasks.length
              const nodeDone  = nodeTasks.filter(t => t.status === 'completed').length
              const nodeProgress = nodeTotal > 0 ? Math.round((nodeDone / nodeTotal) * 100) : 0
              const childCount = nodes.filter(n => n.parent_id === node.id).length
              const nodeRatingAvg  = calcAvgRating(nodeTasks.map(t => t.rating))
              const nodeRatingInfo = nodeRatingAvg != null ? ratingBadgeClass(nodeRatingAvg) : null

              return (
                <div key={node.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-violet-200 transition-all">

                  {/* ── وضع التعديل ── */}
                  {editNodeId === node.id ? (
                    <div className="flex items-center gap-2 p-4 bg-amber-50 rounded-2xl border border-amber-200">
                      <input autoFocus value={editNodeName} onChange={e => setEditNodeName(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl border border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white text-sm font-medium" />
                      <button onClick={() => saveNodeEdit(node.id)} disabled={saving}
                        className="px-4 py-2 bg-amber-500 text-white text-sm rounded-xl font-medium disabled:opacity-50">
                        {saving ? '...' : '💾 حفظ'}
                      </button>
                      <button onClick={() => setEditNodeId(null)}
                        className="px-3 py-2 border border-slate-200 text-slate-500 text-sm rounded-xl">إلغاء</button>
                    </div>

                  /* ── وضع تأكيد الحذف ── */
                  ) : confirmDelId === node.id ? (
                    <div className="flex items-center gap-3 p-4 bg-red-50 rounded-2xl border border-red-200">
                      <span className="text-sm text-red-700 flex-1">حذف "{node.name_ar}" وكل محتوياته؟</span>
                      <button onClick={() => deleteNode(node.id)}
                        className="px-4 py-2 bg-red-600 text-white text-sm rounded-xl font-medium">نعم، احذف</button>
                      <button onClick={() => setConfirmDelId(null)}
                        className="px-3 py-2 border border-slate-200 text-slate-600 text-sm rounded-xl">إلغاء</button>
                    </div>

                  /* ── العرض الاعتيادي ── */
                  ) : (
                    <div className="flex items-center gap-3 p-4 group">
                      <Link href={`/dashboard/plans/${planId}/nodes/${node.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center font-bold text-lg flex-shrink-0">
                          {node.standard_code || idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-700 group-hover:text-violet-700 transition-colors">{node.name_ar}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {childCount} {levelNames[1] || 'عنصر'} · {nodeTotal} مهمة
                          </p>
                          {nodeTotal > 0 && (
                            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                              <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-violet-500 rounded-full" style={{ width: `${nodeProgress}%` }} />
                              </div>
                              <span className="text-xs font-bold text-violet-600">{nodeProgress}%</span>
                              {nodeRatingInfo && (
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${nodeRatingInfo.cls}`}>
                                  <Star size={12} className="inline ml-1" /> {nodeRatingInfo.label}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <span className="text-slate-300 group-hover:text-violet-400 text-xl flex-shrink-0">←</span>
                      </Link>

                      {/* أزرار التعديل والحذف */}
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button
                          onClick={() => { setEditNodeId(node.id); setEditNodeName(node.name_ar) }}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-50 transition-colors"
                          title="تعديل">✏️</button>
                        <button
                          onClick={() => setConfirmDelId(node.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="حذف">🗑️</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-10 text-center">
            <div className="flex justify-center mb-3" style={{ color: 'var(--maroon-300)' }}><ClipboardList size={36} /></div>
            <p className="text-slate-500 font-medium">لا يوجد {level1Name} بعد</p>
            <button onClick={() => setAdding(true)} className="mt-4 text-sm text-violet-600 hover:underline">
              ➕ إضافة أول {level1Name}
            </button>
          </div>
        )}
      </div>

      {/* ══ مودال استيراد Excel ══ */}
      {showImport && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setShowImport(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}>

            {/* رأس */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-800">📥 استيراد هيكل الخطة</h3>
                <p className="text-xs text-slate-400 mt-0.5">{importRows.length} صف في الملف — العناصر الموجودة لن تُكرَّر</p>
              </div>
              <button onClick={() => setShowImport(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>

            {/* معاينة */}
            <div className="flex-1 overflow-auto p-5">
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="text-xs w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      {importRows[0] && Object.keys(importRows[0]).map(k => (
                        <th key={k} className="px-3 py-2.5 text-right font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200">
                          {k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.slice(0, 8).map((row, i) => (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                        {Object.values(row).map((v: any, j) => (
                          <td key={j} className={`px-3 py-2 whitespace-nowrap ${v ? 'text-slate-700 font-medium' : 'text-slate-300'}`}>
                            {v?.toString() || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {importRows.length > 8 && (
                      <tr>
                        <td colSpan={99} className="px-3 py-2 text-slate-400 text-center italic">
                          ... و {importRows.length - 8} صفوف أخرى
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {importMsg && (
                <div className={`mt-4 px-4 py-3 rounded-xl text-sm font-medium ${importMsg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {importMsg}
                </div>
              )}
            </div>

            {/* أزرار */}
            <div className="p-5 border-t border-slate-100 flex gap-3 justify-end">
              <button onClick={() => setShowImport(false)}
                className="px-5 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50">
                إغلاق
              </button>
              <button onClick={runImport} disabled={importing || !!importMsg.startsWith('✅')}
                className="px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl disabled:opacity-60 transition-colors">
                {importing ? 'جارٍ الاستيراد...' : `✅ استيراد ${importRows.length} صف`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ مودال إعدادات KPI ══ */}
      {showKpiSettings && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setShowKpiSettings(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}>

            {/* رأس المودال */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><BarChart3 size={18} /> إعدادات مؤشرات الأداء KPI</h3>
                <p className="text-xs text-slate-400 mt-0.5">فعّل أو عطّل مؤشرات الأداء لكل مستوى من مستويات الخطة</p>
              </div>
              <button onClick={() => setShowKpiSettings(false)} className="text-slate-400 hover:text-slate-600 text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100">✕</button>
            </div>

            {/* المحتوى */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {kpiLevels.map((cfg, i) => {
                const lc      = plan.level_count || 3
                const isFirst = cfg.levelIndex === 0
                // المهام كيان منفصل — لا يوجد "مستوى أخير محجوز"، فقط المستوى الأول
                const locked  = isFirst
                const lName   = (plan.level_names || [])[cfg.levelIndex] || `المستوى ${cfg.levelIndex + 1}`

                return (
                  <div key={cfg.levelIndex}
                    className={`rounded-2xl border p-4 transition-all
                      ${locked        ? 'bg-slate-50 border-slate-200 opacity-60'
                      : cfg.enabled   ? 'bg-emerald-50 border-emerald-200'
                                      : 'bg-white border-slate-200'}`}>

                    {/* رأس المستوى */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold
                          ${cfg.enabled && !locked ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                          {cfg.levelIndex + 1}
                        </span>
                        <div>
                          <p className="font-semibold text-slate-700 text-sm">{lName}</p>
                          {locked && (
                            <p className="text-xs text-slate-400">🔒 المستوى الأول — حاوٍ عام للخطة</p>
                          )}
                        </div>
                      </div>

                      {/* مفتاح التفعيل */}
                      {!locked && (
                        <button
                          type="button"
                          onClick={() => updateKpiLevel(cfg.levelIndex, { enabled: !cfg.enabled })}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none
                            ${cfg.enabled ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                            ${cfg.enabled ? 'translate-x-1' : '-translate-x-5'}`}
                            style={{ transform: cfg.enabled ? 'translateX(24px)' : 'translateX(2px)' }} />
                        </button>
                      )}
                    </div>

                    {/* تفاصيل KPI عند التفعيل */}
                    {!locked && cfg.enabled && (
                      <div className="mt-3 pt-3 border-t border-emerald-200 grid grid-cols-2 gap-3">

                        {/* نوع المؤشر */}
                        <div>
                          <p className="text-xs font-semibold text-slate-500 mb-1.5">نوع المؤشر</p>
                          <div className="space-y-1">
                            {(['impact', 'outcome', 'output'] as const).map(t => {
                              const meta = KPI_TYPE_META[t]
                              return (
                                <div key={t} className="relative group/tip">
                                  <label className={`flex items-center gap-2 p-1.5 rounded-lg cursor-pointer border text-xs transition-colors
                                    ${cfg.kpiType === t
                                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                      : 'border-slate-200 hover:border-emerald-200 text-slate-600'}`}>
                                    <input type="radio"
                                      name={`kpiType-${cfg.levelIndex}`}
                                      value={t}
                                      checked={cfg.kpiType === t}
                                      onChange={() => updateKpiLevel(cfg.levelIndex, { kpiType: t })}
                                      className="accent-emerald-500" />
                                    <span className="flex items-center gap-1"><meta.Icon size={14} /> {KPI_TYPE_LABELS[t]}</span>
                                    <span className="mr-auto flex-shrink-0 w-4 h-4 rounded-full border border-slate-300 text-slate-400 group-hover/tip:border-emerald-400 group-hover/tip:text-emerald-500 flex items-center justify-center text-[9px] font-bold transition-colors">
                                      ?
                                    </span>
                                  </label>
                                  {/* Tooltip — يظهر للأعلى */}
                                  <div className="absolute z-50 right-0 bottom-full mb-2 w-64
                                                  bg-white border border-emerald-200 rounded-xl p-3 text-xs leading-relaxed
                                                  invisible opacity-0 group-hover/tip:visible group-hover/tip:opacity-100
                                                  transition-all duration-150 shadow-xl pointer-events-none">
                                    <div className="absolute -bottom-1.5 right-4 w-3 h-3 bg-white border-b border-r border-emerald-200 rotate-45 rounded-sm" />
                                    <p className="text-slate-800 font-semibold mb-2 flex items-center gap-1"><meta.Icon size={14} /> {KPI_TYPE_LABELS[t]}</p>
                                    <p className="text-slate-600 mb-2 leading-relaxed">{meta.def}</p>
                                    <p className="text-slate-500 mb-1.5">
                                      <span className="text-amber-600 font-semibold">مثال: </span>{meta.example}
                                    </p>
                                    <p className="text-slate-500 mb-1">
                                      <span className="text-blue-600 font-semibold">التوقيت: </span>{meta.timing}
                                    </p>
                                    <p className="text-slate-500">
                                      <span className="text-green-600 font-semibold">يناسب: </span>{meta.suitable}
                                    </p>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>

                        {/* دورية القياس */}
                        <div>
                          <p className="text-xs font-semibold text-slate-500 mb-1.5">دورية القياس</p>
                          <div className="space-y-1">
                            {(['monthly', 'quarterly', 'semester', 'yearly'] as const).map(f => (
                              <label key={f} className="flex items-center gap-2 cursor-pointer group">
                                <input type="radio"
                                  name={`kpiFreq-${cfg.levelIndex}`}
                                  value={f}
                                  checked={cfg.frequency === f}
                                  onChange={() => updateKpiLevel(cfg.levelIndex, { frequency: f })}
                                  className="accent-emerald-500" />
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

              {/* ملاحظة */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                💡 المستوى الأول (الحاوي العام) لا يمكن إضافة KPI له. أما المهام فهي كيان منفصل يأتي تحت جميع المستويات — لذا يمكن وضع KPI على أي مستوى آخر بما فيه المستوى الأخير.
              </div>
            </div>

            {/* أزرار الحفظ */}
            <div className="p-5 border-t border-slate-100 flex gap-3 justify-end">
              <button onClick={() => setShowKpiSettings(false)}
                className="px-5 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50">
                إلغاء
              </button>
              <button onClick={saveKpiSettings} disabled={savingKpi}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl disabled:opacity-60 transition-colors">
                {savingKpi ? '⏳ جارٍ الحفظ...' : '💾 حفظ الإعدادات'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ مربع تأكيد حذف الخطة ══ */}
      {confirmDelPlan && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setConfirmDelPlan(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center mb-3"><AlertTriangle size={40} style={{ color: 'var(--maroon-600)' }} /></div>
            <h3 className="text-lg font-bold text-slate-800 text-center mb-2">حذف الخطة نهائياً</h3>
            <p className="text-slate-500 text-sm text-center mb-5">
              سيتم حذف "<strong>{plan.name_ar}</strong>" وجميع هيكلها ومهامها بشكل نهائي لا يمكن التراجع عنه.
            </p>
            <div className="flex gap-3">
              <button onClick={deletePlan} disabled={deletingPlan}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl disabled:opacity-50">
                {deletingPlan ? 'جارٍ الحذف...' : 'نعم، احذف'}
              </button>
              <button onClick={() => setConfirmDelPlan(false)}
                className="flex-1 border border-slate-200 text-slate-600 font-semibold py-3 rounded-xl hover:bg-slate-50">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

/* ════════════════════════════════════════════════════════════
   صفحة بناء الخطة — نموذج «القوائم المنسدلة المتتالية».
   قائمة لكل مستوى تعرض مباشرةً: المضاف في خطتك + معايير الاعتماد
   المتاحة (المستويات 1-3) + «بند مخصص». اختيار العنصر يفعّل التالي.
   - المستويات الأعمق (الهدف): نص حر + ترقيم هرمي تلقائي.
   - المهمة: رابط ينقل لصفحة إنشاء المهمة الكاملة (تفاصيلها كثيرة).
   بديل مبسّط للشجرة المتداخلة — الشجرة لا تزال متاحة من صفحة العقدة.
   ════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Flag, Plus, ListTree, Trash2, Sparkles, X, AlertTriangle, RefreshCw, Pin } from 'lucide-react'
import { computeNodeCodes, computeTaskCodes } from '@/lib/planCodes'
import ConfirmDialog from '@/components/ConfirmDialog'
import PlanHeaderBar from '@/components/PlanHeaderBar'
import { usePermissions } from '@/lib/PermissionsContext'
import NoAccess from '@/components/NoAccess'

/* ═══ لوحة اقتراح أهداف/مهام بالذكاء الاصطناعي (Groq) ═══ */
function AiSuggest({ kind, contextName, contextCode, planName, existing, onAdd }: {
  kind: 'goal' | 'task'
  contextName: string
  contextCode: string | null
  planName: string
  existing: string[]
  onAdd: (names: string[]) => Promise<void>
}) {
  const [open,    setOpen]    = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [items,   setItems]   = useState<{ name: string; checked: boolean }[]>([])

  const label = kind === 'goal' ? 'أهداف' : 'مهام'

  const generate = async () => {
    setLoading(true); setError(''); setOpen(true); setItems([])
    try {
      const res = await fetch('/api/plan-nodes/suggest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, contextName, contextCode, planName, existing }),
      })
      const j = await res.json()
      if (!res.ok) { setError(j.error || 'تعذّر التوليد'); return }
      setItems((j.suggestions || []).map((name: string) => ({ name, checked: true })))
    } catch { setError('تعذّر الاتصال بالخادم') }
    finally { setLoading(false) }
  }

  const save = async () => {
    const chosen = items.filter(i => i.checked).map(i => i.name)
    if (!chosen.length) return
    setSaving(true)
    await onAdd(chosen)
    setSaving(false); setOpen(false); setItems([])
  }

  return (
    <div className="mt-2">
      {!open && (
        <button onClick={generate}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 bg-violet-100 hover:bg-violet-200 px-3 py-1.5 rounded-lg transition-colors">
          <Sparkles size={14} /> اقتراح {label} بالذكاء الاصطناعي
        </button>
      )}
      {open && (
        <div className="rounded-xl border-2 border-violet-200 bg-violet-50/60 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-violet-100">
            <span className="text-xs font-bold text-violet-800 flex items-center gap-1.5"><Sparkles size={14} /> مقترحات {label}</span>
            <button onClick={() => { setOpen(false); setItems([]) }} className="text-violet-400 hover:text-violet-700"><X size={15} /></button>
          </div>
          {loading && (
            <div className="px-3 py-5 text-center text-xs text-violet-600">
              <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              يولّد الذكاء الاصطناعي اقتراحات {label}...
            </div>
          )}
          {error && (
            <div className="px-3 py-3 text-xs text-red-700 bg-red-50 flex items-center gap-2">
              <AlertTriangle size={13} className="flex-shrink-0" /> {error}
              <button onClick={generate} className="underline font-semibold">إعادة المحاولة</button>
            </div>
          )}
          {!loading && items.length > 0 && (
            <div className="p-3 space-y-1.5">
              {items.map((it, idx) => (
                <label key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-white border border-slate-100 cursor-pointer hover:border-violet-200">
                  <input type="checkbox" checked={it.checked}
                    onChange={() => setItems(prev => prev.map((x, i) => i === idx ? { ...x, checked: !x.checked } : x))}
                    className="accent-violet-600" />
                  <span className="text-sm text-slate-700">{it.name}</span>
                </label>
              ))}
              <div className="flex gap-2 pt-1">
                <button onClick={save} disabled={saving || !items.some(i => i.checked)}
                  className="flex-1 py-2 text-sm text-white font-semibold rounded-xl disabled:opacity-50"
                  style={{ background: 'var(--gradient-button, #8a1538)' }}>
                  {saving ? 'جارٍ الإضافة...' : `إضافة المحدد (${items.filter(i => i.checked).length})`}
                </button>
                <button onClick={generate} disabled={loading} title="إعادة التوليد"
                  className="inline-flex px-3 py-2 text-sm border border-violet-300 text-violet-600 rounded-xl hover:bg-violet-50"><RefreshCw size={15} /></button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

type PlanNode = { id: string; plan_id: string; parent_id: string | null; level_num: number; name_ar: string; order_num: number; standard_code: string | null }
type TaskLite = { id: string; name_ar: string; status: string; node_id: string; end_date: string | null; order_num: number | null; created_at: string | null }
type Choice   = { name: string; standardCode: string | null }

const LEVEL_COLORS = ['#8a1538', '#7c3aed', '#0891b2', '#d97706', '#16a34a']
const statusAr: Record<string, string> = { not_started:'لم تبدأ', in_progress:'جارية', submitted:'مرفوعة', completed:'منجزة', returned:'مُعادة', delayed:'متأخرة' }
const statusColor: Record<string, string> = {
  not_started:'bg-slate-100 text-slate-600', in_progress:'bg-violet-100 text-violet-700',
  submitted:'bg-amber-100 text-amber-700', completed:'bg-emerald-100 text-emerald-700',
  returned:'bg-red-100 text-red-700', delayed:'bg-red-100 text-red-700',
}

/* ═══ صف مستوى واحد: قائمة تجمع المضاف + كتالوج الاعتماد + بند مخصص ═══ */
function LevelRow({ levelNum, levelName, color, existing, parentStandardCode, codes, selectedId, saving, onSelect, onAdd }: {
  levelNum: number; levelName: string; color: string
  existing: PlanNode[]; parentStandardCode: string | null
  codes: Record<string, string>
  selectedId: string; saving: boolean
  onSelect: (id: string) => void
  onAdd: (choice: Choice) => void
}) {
  const supabase = createClient()
  const catalogContext = levelNum <= 3 && (levelNum === 1 || !!parentStandardCode)
  const [catalog, setCatalog] = useState<{ code: string; name_ar: string }[]>([])
  const [customMode, setCustomMode] = useState(false)
  const [customText, setCustomText] = useState('')

  useEffect(() => {
    if (!catalogContext) { setCatalog([]); return }
    ;(async () => {
      let q = supabase.from('qnsa_standards').select('code, name_ar')
        .eq('level', levelNum).eq('is_active', true).order('sort_order')
      if (levelNum > 1) q = q.eq('parent_code', parentStandardCode)
      const { data } = await q
      setCatalog(data || [])
    })()
  }, [levelNum, parentStandardCode, catalogContext])

  const usedCodes  = existing.map(n => n.standard_code).filter(Boolean) as string[]
  const available  = catalog.filter(c => !usedCodes.includes(c.code))

  const handleChange = (val: string) => {
    if (val === '__custom__') { setCustomMode(true); setCustomText(''); return }
    setCustomMode(false)
    if (val === '') { onSelect(''); return }
    if (val.startsWith('cat:')) {
      const code = val.slice(4)
      const opt  = catalog.find(c => c.code === code)
      if (opt) onAdd({ name: opt.name_ar, standardCode: opt.code })
      return
    }
    onSelect(val)
  }

  const submitCustom = () => {
    const name = customText.trim()
    if (!name) return
    onAdd({ name, standardCode: null })   // الترقيم الهرمي يُحسب في addChild
    setCustomMode(false); setCustomText('')
  }

  const selectCls = 'flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-300'

  return (
    <div>
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium min-w-[110px] flex items-center gap-1.5" style={{ color }}>
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
          {levelName}
        </label>
        <select value={customMode ? '__custom__' : selectedId} onChange={e => handleChange(e.target.value)} className={selectCls} disabled={saving}>
          <option value="">— اختر {levelName} —</option>
          {existing.length > 0 && (
            <optgroup label="في خطتك">
              {existing.map(n => (
                <option key={n.id} value={n.id}>{codes[n.id] ? `${codes[n.id]} — ` : ''}{n.name_ar}</option>
              ))}
            </optgroup>
          )}
          {available.length > 0 && (
            <optgroup label="من معايير الاعتماد (اختر لإضافته)">
              {available.map(c => (
                <option key={c.code} value={`cat:${c.code}`}>{c.code} — {c.name_ar}</option>
              ))}
            </optgroup>
          )}
          <option value="__custom__">{levelName} مخصص (نص حر)...</option>
        </select>
      </div>

      {/* إدخال البند المخصص */}
      {customMode && (
        <div className="mt-2 flex items-center gap-2 p-2 rounded-xl border-2 border-dashed border-violet-300 bg-violet-50/60">
          <input autoFocus value={customText} onChange={e => setCustomText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitCustom(); if (e.key === 'Escape') setCustomMode(false) }}
            placeholder={`اسم ${levelName}...`}
            className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-violet-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
          <button onClick={submitCustom} disabled={saving || !customText.trim()}
            className="px-3 py-2 text-xs text-white rounded-xl font-medium disabled:opacity-50"
            style={{ background: 'var(--gradient-button, #8a1538)' }}>{saving ? '...' : 'إضافة'}</button>
          <button onClick={() => setCustomMode(false)} className="px-2.5 py-2 text-xs text-slate-500 rounded-xl hover:bg-slate-100">إلغاء</button>
        </div>
      )}
    </div>
  )
}

export default function PlanBuildPage() {
  const params   = useParams()
  const planId   = params.planId as string
  const supabase = createClient()
  const { can, isSuperAdmin, loading: permsLoading } = usePermissions()

  const [plan,    setPlan]    = useState<any>(null)
  const [nodes,   setNodes]   = useState<PlanNode[]>([])
  const [tasks,   setTasks]   = useState<TaskLite[]>([])
  const [loading, setLoading] = useState(true)
  const [path,    setPath]    = useState<string[]>([])      // معرّف العقدة المختارة لكل مستوى
  const [saving,  setSaving]  = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting,   setDeleting]   = useState(false)
  const [newTaskName, setNewTaskName] = useState('')
  const [addingTask,  setAddingTask]  = useState(false)
  const [confirmDelTask, setConfirmDelTask] = useState<TaskLite | null>(null)
  const [deletingTask,   setDeletingTask]   = useState(false)

  const load = useCallback(async () => {
    const [{ data: planData }, { data: nodesData }] = await Promise.all([
      supabase.from('plans').select('id, name_ar, level_count, level_names, approved_at, frozen_at').eq('id', planId).single(),
      supabase.from('plan_nodes').select('id, plan_id, parent_id, level_num, name_ar, order_num, standard_code').eq('plan_id', planId).order('order_num'),
    ])
    setPlan(planData)
    setNodes(nodesData || [])
    const ids = (nodesData || []).map(n => n.id)
    if (ids.length) {
      const { data: t } = await supabase.from('tasks')
        .select('id, name_ar, status, node_id, end_date, order_num, created_at').in('node_id', ids)
      setTasks(t || [])
    } else setTasks([])
    setLoading(false)
  }, [planId])

  useEffect(() => { load() }, [load])

  const byId    = (id: string) => nodes.find(n => n.id === id) || null
  const itemsAt = (L: number): PlanNode[] => {
    const parentId = L === 0 ? null : path[L - 1]
    return nodes.filter(n => n.level_num === L + 1 && n.parent_id === parentId)
                .sort((a, b) => a.order_num - b.order_num)
  }

  const onSelect = (L: number, id: string) => {
    setConfirmDel(false); setNewTaskName('')
    if (id === '') setPath(path.slice(0, L))
    else setPath([...path.slice(0, L), id])
  }

  /* إضافة عقدة جديدة + ترقيم هرمي تلقائي عند غياب كود رسمي */
  const addChild = async (L: number, choice: Choice) => {
    setSaving(true)
    const parentId = L === 0 ? null : path[L - 1]
    const siblings = nodes.filter(n => n.level_num === L + 1 && n.parent_id === parentId)
    const nextSeq  = siblings.length ? Math.max(...siblings.map(s => s.order_num)) + 1 : 1
    // الكود الرسمي فقط يُخزَّن؛ المخصص يُترك null ليُحسب رقمه تلقائياً (ويُعاد ترقيمه عند الحذف)
    const { data, error } = await supabase.from('plan_nodes').insert({
      plan_id: planId, parent_id: parentId, level_num: L + 1,
      name_ar: choice.name, order_num: nextSeq, standard_code: choice.standardCode,
    }).select('id').single()
    setSaving(false)
    if (error) { alert(`تعذّر الإضافة: ${error.message}`); return }
    await load()
    if (data) setPath([...path.slice(0, L), data.id])
  }

  /* إضافة سريعة لمهمة (الاسم فقط) تحت الهدف — التفاصيل تُستكمل لاحقاً من صفحة المهمة */
  const addQuickTask = async (nodeId: string) => {
    const name = newTaskName.trim()
    if (!name) return
    setAddingTask(true)
    const sibs = tasks.filter(t => t.node_id === nodeId)
    const nextOrder = sibs.length ? Math.max(...sibs.map(s => s.order_num ?? 0)) + 1 : 1
    const { error } = await supabase.from('tasks').insert({ name_ar: name, node_id: nodeId, order_num: nextOrder })
    setAddingTask(false)
    if (error) { alert(`تعذّر إضافة المهمة: ${error.message}`); return }
    setNewTaskName('')
    await load()
  }

  /* إضافة دفعة أهداف (أبناء العقدة المختارة) من اقتراحات الذكاء الاصطناعي */
  const addGoals = async (parent: PlanNode, names: string[]) => {
    const sibs = nodes.filter(n => n.level_num === parent.level_num + 1 && n.parent_id === parent.id)
    let order = sibs.length ? Math.max(...sibs.map(s => s.order_num)) + 1 : 1
    const rows = names.map(name => ({
      plan_id: planId, parent_id: parent.id, level_num: parent.level_num + 1,
      name_ar: name, order_num: order++, standard_code: null,
    }))
    const { error } = await supabase.from('plan_nodes').insert(rows)
    if (error) { alert(`تعذّر إضافة الأهداف: ${error.message}`); return }
    await load()
  }

  /* إضافة دفعة مهام تحت الهدف من اقتراحات الذكاء الاصطناعي */
  const addTasks = async (nodeId: string, names: string[]) => {
    const sibs = tasks.filter(t => t.node_id === nodeId)
    let order = sibs.length ? Math.max(...sibs.map(s => s.order_num ?? 0)) + 1 : 1
    const rows = names.map(name => ({ name_ar: name, node_id: nodeId, order_num: order++ }))
    const { error } = await supabase.from('tasks').insert(rows)
    if (error) { alert(`تعذّر إضافة المهام: ${error.message}`); return }
    await load()
  }

  /* حذف مهمة (حذف ناعم خادمي مع الحراسة) */
  const deleteTask = async (id: string) => {
    setDeletingTask(true)
    const res  = await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    const json = await res.json().catch(() => ({}))
    setDeletingTask(false); setConfirmDelTask(null)
    if (!res.ok) { alert(`تعذّر حذف المهمة: ${json.error || res.status}`); return }
    await load()
  }

  /* معرّفات العقدة وكل المنحدرات منها (لعدّ المهام وحذفها) */
  const subtreeIds = (rootId: string): string[] => {
    const out: string[] = []
    const stack = [rootId]
    while (stack.length) {
      const cur = stack.pop()!
      out.push(cur)
      for (const c of nodes.filter(n => n.parent_id === cur)) stack.push(c.id)
    }
    return out
  }

  /* حذف عقدة (متسلسل خادمياً) ثم العودة لمستوى الأب */
  const deleteNode = async (id: string, level: number) => {
    setDeleting(true)
    const res  = await fetch(`/api/plans/${planId}/nodes/${id}`, { method: 'DELETE' })
    const json = await res.json().catch(() => ({}))
    setDeleting(false); setConfirmDel(false)
    if (!res.ok) { alert(`تعذّر الحذف: ${json.error || res.status}`); return }
    setPath(path.slice(0, level))
    await load()
  }

  if (!permsLoading && !isSuperAdmin && !can('manage_plans')) {
    return <NoAccess message="بناء الخطط يتطلب صلاحية إنشاء/تعديل الخطط." />
  }
  if (!loading && plan?.frozen_at) {
    return <NoAccess message="الخطة مجمّدة — ألغِ التجميد أولاً لتعديل بنيتها." />
  }
  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full" />
    </div>
  )
  if (!plan) return null

  const levelCount: number   = plan.level_count || 3
  const levelNames: string[] = plan.level_names || []
  const lname = (L: number) => levelNames[L] || `المستوى ${L + 1}`

  /* المستويات المعروضة: 0، ثم كل مستوى أبوه مختار، حتى آخر مستوى */
  const rows: number[] = []
  for (let L = 0; L < levelCount; L++) {
    if (L > 0 && !path[L - 1]) break
    rows.push(L)
  }

  const codes = computeNodeCodes(nodes)
  const taskCodes = computeTaskCodes(tasks as any, codes)
  const leafSelected = path[levelCount - 1] ? byId(path[levelCount - 1]) : null
  const leafTasks    = leafSelected
    ? tasks.filter(t => t.node_id === leafSelected.id)
           .sort((a, b) => (a.order_num ?? 0) - (b.order_num ?? 0) || String(a.created_at || '').localeCompare(String(b.created_at || '')))
    : []
  const last = path.length - 1
  const sel  = last >= 0 ? byId(path[last]) : null
  const selTaskCount = sel ? tasks.filter(t => subtreeIds(sel.id).includes(t.node_id)).length : 0
  const canDelete = sel && !plan.approved_at

  return (
    <div className="space-y-4">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/dashboard/plans" className="hover:text-violet-600">الخطط</Link>
        <span>›</span>
        <Link href={`/dashboard/plans/${planId}`} className="hover:text-violet-600">{plan.name_ar}</Link>
        <span>›</span>
        <span className="text-violet-700 font-medium">بناء الخطة</span>
      </div>

      {/* رأس الخطة وأدواتها (مشترك مع العرض الشجري — بعرض كامل) */}
      <PlanHeaderBar planId={planId} active="list" onChanged={load} />

      {/* محتوى البناء بعرض مريح للقراءة — موسَّط */}
      <div className="max-w-3xl mx-auto space-y-4">

      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <ListTree size={20} className="text-violet-600" /> بناء الخطة بالقوائم المتتالية
        </h2>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 bg-gradient-to-l from-violet-100 to-fuchsia-100 border border-violet-200 px-2 py-0.5 rounded-full">
          <Sparkles size={12} /> مدعوم بالذكاء الاصطناعي · AI Powered
        </span>
      </div>

      <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 text-sm text-violet-800">
        افتح قائمة {lname(0)} لتظهر معايير الاعتماد فاختر منها مباشرةً (أو «مخصص» نص حر)، ثم انزل للمستوى التالي حتى المهمة. العناصر تُرقَّم تلقائياً. <strong>المهمة</strong> تُضاف من نموذجها الكامل عبر رابط في الأسفل.
      </div>

      {/* القوائم المتتالية */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
        {rows.map(L => (
          <LevelRow
            key={L}
            levelNum={L + 1}
            levelName={lname(L)}
            color={LEVEL_COLORS[L] || '#64748b'}
            existing={itemsAt(L)}
            parentStandardCode={L === 0 ? null : (byId(path[L - 1])?.standard_code || null)}
            codes={codes}
            selectedId={path[L] || ''}
            saving={saving}
            onSelect={id => onSelect(L, id)}
            onAdd={choice => addChild(L, choice)}
          />
        ))}
      </div>

      {/* لوحة «أنت في» + المهام في المستوى الأخير */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
        {!sel ? (
          <p className="text-sm text-slate-400">ابدأ باختيار {lname(0)} من القائمة الأولى.</p>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm flex items-center gap-2 flex-wrap flex-1">
                <Flag size={15} className="text-slate-500" /> أنت في:
                <span className="font-semibold" style={{ color: LEVEL_COLORS[last] || '#64748b' }}>{lname(last)}</span>
                <span className="text-slate-700">— {codes[sel.id] ? `${codes[sel.id]} ` : ''}{sel.name_ar}</span>
              </p>
              {/* حذف العقدة المختارة (متسلسل) — يفتح نافذة تأكيد */}
              {canDelete && (
                <button onClick={() => setConfirmDel(true)}
                  className="flex items-center gap-1 text-xs text-red-500 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-colors">
                  <Trash2 size={13} /> حذف {lname(last)}
                </button>
              )}
            </div>

            {/* قسم المهام يظهر فقط عند اختيار عقدة في المستوى الأخير */}
            {leafSelected && (
              <div className="mt-3 border-t border-slate-200 pt-3">
                <p className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 mb-2"><Pin size={13} /> مهام «{leafSelected.name_ar}» ({leafTasks.length})</p>

                {leafTasks.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {leafTasks.map(t => (
                      <div key={t.id}
                        className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-slate-100 hover:border-violet-200 hover:bg-violet-50/50 transition-colors group">
                        <Link href={`/dashboard/tasks/${t.id}`} className="flex items-center gap-2 flex-1 min-w-0">
                          {taskCodes[t.id] && (
                            <span className="font-mono text-[11px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded flex-shrink-0">{taskCodes[t.id]}</span>
                          )}
                          <span className="text-sm text-slate-700 flex-1 truncate">{t.name_ar}</span>
                          {t.end_date && <span className="text-xs text-slate-400 flex-shrink-0">{new Date(t.end_date).toLocaleDateString('ar-QA')}</span>}
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusColor[t.status] || 'bg-slate-100'}`}>
                            {statusAr[t.status] || t.status}
                          </span>
                        </Link>
                        <button onClick={() => setConfirmDelTask(t)} title="حذف المهمة"
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* إضافة سريعة: اكتب اسم المهمة واضغط Enter — كرّر لإضافة عدة مهام */}
                <div className="flex items-center gap-2 mb-2">
                  <input
                    value={newTaskName}
                    onChange={e => setNewTaskName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addQuickTask(leafSelected.id) }}
                    placeholder="اسم مهمة جديدة... ثم Enter"
                    className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                  <button onClick={() => addQuickTask(leafSelected.id)} disabled={addingTask || !newTaskName.trim()}
                    className="inline-flex items-center gap-1 text-sm text-white px-4 py-2.5 rounded-xl font-medium disabled:opacity-50"
                    style={{ background: 'var(--gradient-button, #8a1538)' }}>
                    <Plus size={15} /> {addingTask ? '...' : 'إضافة'}
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  أضف عدة مهام بسرعة بالاسم فقط، ثم افتح كل مهمة لاحقاً لاستكمال التفاصيل —{' '}
                  <Link href={`/dashboard/tasks/new?node=${leafSelected.id}&plan=${planId}`}
                    className="text-violet-600 hover:underline font-medium">
                    أو افتح النموذج الكامل
                  </Link>
                </p>

                {/* اقتراح مهام بالذكاء الاصطناعي */}
                <AiSuggest
                  kind="task"
                  contextName={leafSelected.name_ar}
                  contextCode={codes[leafSelected.id] || null}
                  planName={plan.name_ar}
                  existing={leafTasks.map(t => t.name_ar)}
                  onAdd={names => addTasks(leafSelected.id, names)}
                />
              </div>
            )}

            {/* تلميح للمستويات غير الأخيرة + اقتراح الأهداف للمعيار الفرعي */}
            {!leafSelected && (
              <>
                <p className="text-xs text-slate-500 mt-1">
                  افتح قائمة {lname(last + 1)} بالأعلى لاختيار/إضافة عنصر تحت هذا.
                </p>
                {sel.level_num === levelCount - 1 && (
                  <AiSuggest
                    kind="goal"
                    contextName={sel.name_ar}
                    contextCode={codes[sel.id] || null}
                    planName={plan.name_ar}
                    existing={nodes.filter(n => n.parent_id === sel.id && n.level_num === levelCount).map(n => n.name_ar)}
                    onAdd={names => addGoals(sel, names)}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* ══ نافذة تأكيد حذف العقدة ══ */}
      <ConfirmDialog
        open={confirmDel && !!sel}
        title={`حذف ${lname(last)}`}
        loading={deleting}
        message={sel ? (
          <>
            سيتم حذف «<strong>{sel.name_ar}</strong>» وكل ما تحته نهائياً.
            {selTaskCount > 0 && (
              <span className="inline-flex items-center gap-1 text-red-600 font-semibold mt-1"><AlertTriangle size={13} /> سيُحذف معه {selTaskCount} مهمة تابعة.</span>
            )}
          </>
        ) : null}
        onConfirm={() => sel && deleteNode(sel.id, last)}
        onCancel={() => setConfirmDel(false)}
      />

      {/* ══ نافذة تأكيد حذف المهمة ══ */}
      <ConfirmDialog
        open={!!confirmDelTask}
        title="حذف المهمة"
        loading={deletingTask}
        message={confirmDelTask ? <>سيتم حذف المهمة «<strong>{confirmDelTask.name_ar}</strong>» نهائياً.</> : null}
        onConfirm={() => confirmDelTask && deleteTask(confirmDelTask.id)}
        onCancel={() => setConfirmDelTask(null)}
      />
      </div>
    </div>
  )
}

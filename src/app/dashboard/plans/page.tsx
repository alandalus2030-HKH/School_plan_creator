'use client'

import { useState, useEffect, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Eye, Archive, ClipboardList, FolderOpen, Map, BadgeCheck, ShieldOff, ChevronDown } from 'lucide-react'
import { SkeletonCards, SkeletonTable } from '@/components/Skeleton'
import ConfirmDialog from '@/components/ConfirmDialog'
import { usePermissions } from '@/lib/PermissionsContext'
import NoAccess from '@/components/NoAccess'
import { toast } from '@/components/Toast'

/* ── قائمة الأعوام الدراسية 2024-2025 حتى 2039-2040 ── */
const ACADEMIC_YEARS = Array.from({ length: 16 }, (_, i) => {
  const start = 2024 + i
  return `${start}-${start + 1}`
})

type Plan = {
  id: string
  name_ar: string
  academic_year: string
  start_date: string | null
  end_date: string | null
  is_archived: boolean
  approved_at: string | null
  level_count?: number
  level_names?: string[]
}

/* الغلاف: useSearchParams يتطلب Suspense في الصفحات المُولّدة سلفاً */
export default function PlansPage() {
  return (
    <Suspense fallback={<div className="space-y-4"><SkeletonCards count={3} /><SkeletonTable rows={4} cols={3} /></div>}>
      <PlansPageInner />
    </Suspense>
  )
}

function PlansPageInner() {
  const { can, loading: permsLoading, isSuperAdmin } = usePermissions()
  if (!permsLoading && !can('manage_plans')) return <NoAccess message="إدارة الخطط متاحة للمديرين فقط. للاطلاع على مهامك انتقل إلى صفحة مهامي." />
  const supabase = createClient()
  const router       = useRouter()
  const searchParams = useSearchParams()
  /* وضع العرض مربوط بالرابط: النقر على "الخطط" في الشريط الجانبي يعيد دائماً للنشطة */
  const showArchived = searchParams.get('view') === 'archived'
  const setView = (archived: boolean) =>
    router.push(archived ? '/dashboard/plans?view=archived' : '/dashboard/plans')
  const [plans,        setPlans]        = useState<Plan[]>([])
  const [loading,      setLoading]      = useState(true)
  const [selectedYear, setSelectedYear] = useState('2025-2026')
  const [menuOpen,     setMenuOpen]     = useState<string | null>(null)
  const [confirmDel,   setConfirmDel]   = useState<string | null>(null)
  const [deleting,     setDeleting]     = useState(false)
  /* ── فلاتر + طيّ ── */
  const [q,        setQ]        = useState('')
  const [deptF,    setDeptF]    = useState('')
  const [ownerF,   setOwnerF]   = useState('')
  const [certF,    setCertF]    = useState<'all' | 'approved' | 'unapproved'>('all')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [statsByPlan, setStatsByPlan] = useState<Record<string, { total: number; done: number; progress: number }>>({})

  const loadPlans = async () => {
    const { data } = await supabase
      .from('plans')
      .select('id, name_ar, academic_year, start_date, end_date, is_archived, approved_at, level_count, level_names, department, owner_id')
      .order('created_at', { ascending: false })
    const rows = (data || []) as any[]
    /* أسماء أصحاب الخطط */
    const ownerIds = [...new Set(rows.map(p => p.owner_id).filter(Boolean))]
    if (ownerIds.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('id, name_ar').in('id', ownerIds)
      const nameById: Record<string, string> = {}
      ;(profs || []).forEach((p: any) => { nameById[p.id] = p.name_ar })
      rows.forEach(p => { p.owner_name = p.owner_id ? (nameById[p.owner_id] || null) : null })
    }
    setPlans(rows as unknown as Plan[])
    setLoading(false)

    /* ── حساب نسبة الإنجاز الفعلية لكل خطة (مهام عبر العقد) ── */
    const planIds = rows.map(p => p.id)
    if (planIds.length) {
      const { data: nodes } = await supabase.from('plan_nodes').select('id, plan_id').in('plan_id', planIds).limit(5000)
      /* كائن عادي لا new Map() — أيقونة Map من lucide تحجب المُنشئ (درس مستفاد) */
      const nodeToPlan: Record<string, string> = {}
      for (const n of nodes || []) nodeToPlan[n.id] = n.plan_id
      const nodeIds = Object.keys(nodeToPlan)
      const stats: Record<string, { total: number; done: number; progress: number }> = {}
      if (nodeIds.length) {
        const { data: tasks } = await supabase.from('tasks')
          .select('node_id, status').in('node_id', nodeIds).is('deleted_at', null).limit(10000)
        for (const t of tasks || []) {
          const pid = nodeToPlan[t.node_id]; if (!pid) continue
          const s = stats[pid] || (stats[pid] = { total: 0, done: 0, progress: 0 })
          s.total++; if (t.status === 'completed') s.done++
        }
        for (const pid of Object.keys(stats)) {
          const s = stats[pid]; s.progress = s.total ? Math.round((s.done / s.total) * 100) : 0
        }
      }
      setStatsByPlan(stats)
    }
  }

  useEffect(() => { loadPlans() }, [])

  /* ─── أرشفة / إلغاء أرشفة خطة ─── */
  const toggleArchive = async (plan: Plan) => {
    const { error } = await supabase.from('plans').update({ is_archived: !plan.is_archived }).eq('id', plan.id)
    if (error) {
      toast(`تعذّر ${plan.is_archived ? 'إلغاء أرشفة' : 'أرشفة'} الخطة: ${error.message}`, 'error')
      setMenuOpen(null)
      return
    }
    setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, is_archived: !p.is_archived } : p))
    setMenuOpen(null)
  }

  /* ─── اعتماد / إلغاء اعتماد خطة (مشرف النظام فقط) ─── */
  const certifyPlan = async (plan: Plan, approve: boolean) => {
    setMenuOpen(null)
    const res = await fetch(`/api/plans/${plan.id}/certify`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approve }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast(`تعذّر ${approve ? 'اعتماد' : 'إلغاء اعتماد'} الخطة: ${json.error || res.status}`, 'error')
      return
    }
    setPlans(prev => prev.map(p =>
      p.id === plan.id ? { ...p, approved_at: json.approved_at } : p
    ))
    toast(approve ? '✓ تم اعتماد الخطة بنجاح' : 'تم إلغاء الاعتماد', 'success')
  }

  /* ─── حذف خطة — عبر API خادمي (الحذف الناعم من العميل ترفضه سياسة القراءة) ─── */
  const deletePlan = async (id: string) => {
    setDeleting(true)
    try {
      const res  = await fetch(`/api/plans/${id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast(`تعذّر حذف الخطة: ${json.error || res.status}`, 'error')
        setDeleting(false)
        return
      }
      setPlans(prev => prev.filter(p => p.id !== id))
      setConfirmDel(null)
    } catch {
      toast('تعذّر الاتصال بالخادم', 'error')
    } finally {
      setDeleting(false)
    }
  }

  /* ─── إحصائيات الخطة الفعلية (محسوبة من المهام عبر العقد) ─── */
  const calcStats = (plan: Plan) => statsByPlan[plan.id] || { total: 0, done: 0, progress: 0 }

  /* خطط العام المحدد */
  const yearPlans = plans.filter(p => p.academic_year === selectedYear)
  const baseVisible = yearPlans.filter(p => showArchived ? p.is_archived : !p.is_archived)

  /* قوائم الفلاتر (من خطط العام) */
  const deptOptions  = [...new Set(yearPlans.map(p => (p as any).department).filter(Boolean))].sort() as string[]
  const ownerOptions = [...new Set(yearPlans.map(p => (p as any).owner_name).filter(Boolean))].sort() as string[]

  /* تطبيق الفلاتر */
  const visible = baseVisible.filter(p => {
    if (q && !p.name_ar.toLowerCase().includes(q.toLowerCase())) return false
    if (deptF && (p as any).department !== deptF) return false
    if (ownerF && (p as any).owner_name !== ownerF) return false
    if (certF === 'approved' && !p.approved_at) return false
    if (certF === 'unapproved' && p.approved_at) return false
    return true
  })
  const anyFilter = !!(q || deptF || ownerF || certF !== 'all')
  const clearFilters = () => { setQ(''); setDeptF(''); setOwnerF(''); setCertF('all') }

  /* طيّ/توسيع */
  const isCollapsed = (id: string) => collapsed.has(id)
  const toggleCollapse = (id: string) => setCollapsed(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const collapseAll = () => setCollapsed(new Set(visible.map(p => p.id)))
  const expandAll   = () => setCollapsed(new Set())

  /* عدد الخطط لكل عام (للشارة) */
  const countByYear = (y: string) => plans.filter(p => p.academic_year === y && !p.is_archived).length

  if (loading) return (
    <div className="space-y-4">
      <SkeletonCards count={3} />
      <SkeletonTable rows={4} cols={3} />
    </div>
  )

  return (
    <div onClick={() => setMenuOpen(null)}>

      {/* ═══ الجزء المثبّت: الترويسة + مجلد العام + الفلاتر ═══ */}
      <div className="sticky top-0 z-20 bg-slate-50 -mt-6 pt-6 pb-4 mb-4 border-b border-slate-200 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">الخطط المدرسية</h2>
          <p className="text-slate-500 text-sm mt-1">عرض وإدارة خطط المدرسة حسب العام الدراسي</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {can('view_aggregate') && (
            <Link href="/dashboard/aggregate"
              className="flex items-center gap-2 border border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
              📊 المتابعة في لوحة التجميع
            </Link>
          )}
          <Link href="/dashboard/plans/new"
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-lg shadow-violet-200">
            ➕ خطة جديدة
          </Link>
        </div>
      </div>

      {/* ── مجلد العام الدراسي ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <FolderOpen size={24} style={{ color: 'var(--maroon-400)', flexShrink: 0 }} />
            <div>
              <p className="font-bold text-slate-800 text-sm">العام الدراسي</p>
              <p className="text-xs text-slate-400">اختر العام لعرض خططه</p>
            </div>
          </div>

          {/* القائمة المنسدلة */}
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={selectedYear}
              onChange={e => { setSelectedYear(e.target.value); if (showArchived) setView(false) }}
              className="px-4 py-2.5 rounded-xl border-2 border-violet-200 focus:outline-none focus:border-violet-500 bg-violet-50 text-violet-800 font-bold text-sm min-w-[160px]"
              onClick={e => e.stopPropagation()}>
              {ACADEMIC_YEARS.map(y => (
                <option key={y} value={y}>
                  📅 {y}{countByYear(y) > 0 ? ` (${countByYear(y)})` : ''}
                </option>
              ))}
            </select>

            {/* زر التبديل بين النشطة والمؤرشفة —
                أيقونة معزولة + نص في span منفصل + شارة دائمة الوجود (درس مستفاد 2: insertBefore) */}
            <button
              onClick={e => { e.stopPropagation(); setView(!showArchived) }}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-colors
                ${showArchived
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'}`}>
              <span className="inline-flex">{showArchived ? <Eye size={14} /> : <Archive size={14} />}</span>
              <span>{showArchived ? 'النشطة' : 'المؤرشفة'}</span>
              <span className={`bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded-full
                ${yearPlans.filter(p => p.is_archived).length > 0 && !showArchived ? '' : 'hidden'}`}>
                {yearPlans.filter(p => p.is_archived).length}
              </span>
            </button>
          </div>
        </div>

        {/* إحصائية العام المحدد */}
        {yearPlans.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-6 text-sm text-slate-500">
            <span>📋 {yearPlans.filter(p => !p.is_archived).length} خطة نشطة</span>
            {yearPlans.filter(p => p.is_archived).length > 0 && (
              <span>📦 {yearPlans.filter(p => p.is_archived).length} مؤرشفة</span>
            )}
            {yearPlans.filter(p => p.approved_at).length > 0 && (
              <span className="flex items-center gap-1 text-emerald-600">
                <BadgeCheck size={14} />
                {yearPlans.filter(p => p.approved_at).length} معتمدة
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── الفلاتر ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 بحث باسم الخطة..."
          className="flex-1 min-w-[180px] px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
        {deptOptions.length > 0 && (
          <select value={deptF} onChange={e => setDeptF(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
            <option value="">كل الأقسام</option>
            {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        {ownerOptions.length > 0 && (
          <select value={ownerF} onChange={e => setOwnerF(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
            <option value="">كل أصحاب الخطط</option>
            {ownerOptions.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        <select value={certF} onChange={e => setCertF(e.target.value as any)}
          className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
          <option value="all">كل حالات الاعتماد</option>
          <option value="approved">معتمدة</option>
          <option value="unapproved">غير معتمدة</option>
        </select>
        {anyFilter && (
          <button onClick={clearFilters}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
            ✕ إزالة الفلاتر
          </button>
        )}
        {visible.length > 1 && (
          <div className="mr-auto flex items-center gap-1">
            <button onClick={collapseAll} className="px-3 py-2.5 rounded-xl text-sm border border-slate-200 bg-white text-slate-600 hover:border-violet-300 transition-colors">طيّ الكل</button>
            <button onClick={expandAll} className="px-3 py-2.5 rounded-xl text-sm border border-slate-200 bg-white text-slate-600 hover:border-violet-300 transition-colors">توسيع الكل</button>
          </div>
        )}
      </div>

      </div>{/* ═══ نهاية الجزء المثبّت ═══ */}

      {/* Plans */}
      {visible.length > 0 ? (
        <div className="space-y-4">
          {visible.map(plan => {
            const { total, done, progress } = calcStats(plan)
            const isCertified = !!plan.approved_at

            return (
              /*
               * تصحيح إصلاح قائمة ⋮ المقصوصة:
               * overflow-hidden على البطاقة الخارجية يقصّ القائمة المطلقة.
               * الحل: نزيله من البطاقة ونُضيف rounded-t-2xl/rounded-b-2xl
               * على العناصر الداخلية لاحتواء الخلفيات ضمن زوايا البطاقة.
               */
              <div key={plan.id} className={`rounded-2xl border shadow-sm transition-opacity
                ${plan.is_archived ? 'opacity-70 border-slate-200' : 'border-slate-200'}`}>

                {/* Plan Header — rounded-b-2xl للمؤرشفة أو المطويّة (لا قسم أبيض تحتها) */}
                <div className={`text-white p-5 rounded-t-2xl
                  ${(plan.is_archived || isCollapsed(plan.id)) ? 'rounded-b-2xl' : ''}
                  ${plan.is_archived ? 'bg-slate-500' : 'bg-gradient-to-l from-violet-600 to-indigo-700'}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-xl font-bold">
                          {plan.is_archived
                            ? plan.name_ar
                            : <Link href={`/dashboard/plans/${plan.id}`} className="hover:underline" onClick={e => e.stopPropagation()}>{plan.name_ar}</Link>}
                        </h3>
                        {/* شارة الاعتماد */}
                        {isCertified && (
                          <span className="inline-flex items-center gap-1 text-xs bg-white/20 px-2.5 py-0.5 rounded-full font-medium border border-white/30">
                            <BadgeCheck size={12} />
                            معتمدة
                          </span>
                        )}
                        {plan.is_archived && (
                          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">مؤرشفة</span>
                        )}
                      </div>
                      {/* القسم + صاحب الخطة */}
                      {((plan as any).department || (plan as any).owner_name) && (
                        <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                          {(plan as any).department && (
                            <span className="text-[11px] bg-white/15 px-2 py-0.5 rounded-full">🏷️ {(plan as any).department}</span>
                          )}
                          {(plan as any).owner_name && (
                            <span className="text-[11px] bg-white/15 px-2 py-0.5 rounded-full">👤 {(plan as any).owner_name}</span>
                          )}
                        </div>
                      )}
                      <p className={`text-sm mt-1 ${plan.is_archived ? 'text-slate-300' : 'text-violet-200'}`}>
                        العام الدراسي: {plan.academic_year}
                      </p>
                    </div>

                    <div className="flex items-start gap-3">
                      {/* طيّ/توسيع البطاقة */}
                      <button onClick={e => { e.stopPropagation(); toggleCollapse(plan.id) }}
                        title={isCollapsed(plan.id) ? 'توسيع' : 'طيّ'}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-white">
                        <ChevronDown size={16} className={`transition-transform ${isCollapsed(plan.id) ? '-rotate-90' : ''}`} />
                      </button>
                      <div className="text-left">
                        <div className="text-3xl font-bold">{progress}%</div>
                        <div className={`text-xs ${plan.is_archived ? 'text-slate-300' : 'text-violet-200'}`}>نسبة الإنجاز</div>
                      </div>

                      {/* قائمة الخيارات ⋮ — خارج overflow-hidden بعد إصلاح البطاقة */}
                      <div className="relative" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setMenuOpen(menuOpen === plan.id ? null : plan.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-white font-bold text-lg">
                          ⋮
                        </button>
                        {menuOpen === plan.id && (
                          <div className="absolute left-0 top-10 bg-white rounded-xl shadow-xl border border-slate-200 py-1 w-52 z-50">

                            {/* اعتماد / إلغاء اعتماد — للمشرف العام فقط */}
                            {isSuperAdmin && (
                              <button
                                onClick={() => certifyPlan(plan, !isCertified)}
                                className={`w-full text-right px-4 py-2.5 text-sm flex items-center gap-2 hover:bg-slate-50
                                  ${isCertified ? 'text-amber-600' : 'text-emerald-700'}`}>
                                <span className="inline-flex">
                                  {isCertified ? <ShieldOff size={14} /> : <BadgeCheck size={14} />}
                                </span>
                                <span>{isCertified ? 'إلغاء الاعتماد' : 'اعتماد الخطة'}</span>
                              </button>
                            )}

                            {/* أرشفة / إلغاء أرشفة */}
                            <button
                              onClick={() => toggleArchive(plan)}
                              className="w-full text-right px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                              <span className="inline-flex">{plan.is_archived ? <Eye size={14} /> : <Archive size={14} />}</span>
                              <span>{plan.is_archived ? 'إلغاء الأرشفة' : 'أرشفة الخطة'}</span>
                            </button>

                            {/* حذف — مخفي للخطط المعتمدة */}
                            {!isCertified && (
                              <>
                                <div className="border-t border-slate-100 my-1" />
                                <button
                                  onClick={() => { setConfirmDel(plan.id); setMenuOpen(null) }}
                                  className="w-full text-right px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                                  🗑️ حذف الخطة
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Progress bar — يُخفى عند الطيّ */}
                  {!isCollapsed(plan.id) && (
                    <>
                      <div className="mt-3 h-2 bg-white/20 rounded-full overflow-hidden">
                        <div className="h-full bg-white rounded-full transition-all" style={{ width: `${progress}%` }} />
                      </div>
                      <div className="flex justify-between text-xs mt-1" style={{ color: plan.is_archived ? '#cbd5e1' : '#ddd6fe' }}>
                        <span>{done} منجزة</span>
                        <span>{total} مهمة إجمالاً</span>
                      </div>
                    </>
                  )}
                </div>

                {/* فتح الخطة — القسم الأبيض، rounded-b-2xl (يُخفى عند الطيّ) */}
                {!plan.is_archived && !isCollapsed(plan.id) && (
                  <div className="p-4 bg-white rounded-b-2xl">
                    <Link href={`/dashboard/plans/${plan.id}`}
                      className="flex items-center justify-between p-4 rounded-xl border border-violet-100 bg-violet-50 hover:bg-violet-100 transition-colors group">
                      <div className="flex items-center gap-3">
                        <Map size={20} style={{ color: 'var(--maroon-600)', flexShrink: 0 }} />
                        <div>
                          <p className="font-semibold text-violet-700">فتح الخطة والهيكل الهرمي</p>
                          <p className="text-xs text-violet-400 mt-0.5">
                            {((plan as any).level_names as string[] || []).join(' › ')} › ✅ المهمة
                          </p>
                        </div>
                      </div>
                      <span className="text-violet-400 group-hover:text-violet-600">←</span>
                    </Link>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
          <div className="flex justify-center mb-4" style={{ color: 'var(--maroon-300)' }}>
            {showArchived ? <Archive size={48} /> : <ClipboardList size={48} />}
          </div>
          <h3 className="text-xl font-bold text-slate-700 mb-2">
            {showArchived
              ? `لا توجد خطط مؤرشفة في ${selectedYear}`
              : `لا توجد خطط للعام ${selectedYear}`}
          </h3>
          <p className="text-slate-400 text-sm mb-5">
            {showArchived ? '' : `أنشئ خطة جديدة للعام الدراسي ${selectedYear}`}
          </p>
          {!showArchived && (
            <Link href="/dashboard/plans/new"
              className="inline-flex items-center gap-2 bg-violet-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-violet-700 transition-colors">
              ➕ إنشاء خطة لعام {selectedYear}
            </Link>
          )}
        </div>
      )}

      {/* مربع تأكيد الحذف */}
      <ConfirmDialog
        open={!!confirmDel}
        title="حذف الخطة نهائياً"
        loading={deleting}
        confirmLabel="نعم، احذف الخطة"
        message="سيتم حذف الخطة وجميع معاييرها وأهدافها ومهامها بشكل نهائي لا يمكن التراجع عنه."
        onConfirm={() => confirmDel && deletePlan(confirmDel)}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  )
}

'use client'

import { useState, useEffect, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Eye, Archive, ClipboardList, FolderOpen, Map, AlertTriangle } from 'lucide-react'
import { SkeletonCards, SkeletonTable } from '@/components/Skeleton'
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
  const { can, loading: permsLoading, userId } = usePermissions()
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

  const loadPlans = async () => {
    const { data } = await supabase
      .from('plans')
      .select('id, name_ar, academic_year, start_date, end_date, is_archived, level_count, level_names')
      .order('created_at', { ascending: false })
    setPlans((data || []) as unknown as Plan[])
    setLoading(false)
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

  /* ─── إحصائيات بسيطة (بدون axes) ─── */
  const calcStats = (_plan: Plan) => ({ total: 0, done: 0, progress: 0 })

  /* خطط العام المحدد */
  const yearPlans = plans.filter(p => p.academic_year === selectedYear)
  const visible   = yearPlans.filter(p => showArchived ? p.is_archived : !p.is_archived)
  /* عدد الخطط لكل عام (للشارة) */
  const countByYear = (y: string) => plans.filter(p => p.academic_year === y && !p.is_archived).length

  if (loading) return (
    <div className="space-y-4">
      <SkeletonCards count={3} />
      <SkeletonTable rows={4} cols={3} />
    </div>
  )

  return (
    <div className="space-y-6" onClick={() => setMenuOpen(null)}>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">الخطط المدرسية</h2>
          <p className="text-slate-500 text-sm mt-1">عرض وإدارة خطط المدرسة حسب العام الدراسي</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
          </div>
        )}
      </div>

      {/* Plans */}
      {visible.length > 0 ? (
        <div className="space-y-4">
          {visible.map(plan => {
            const { total, done, progress } = calcStats(plan)

            return (
              <div key={plan.id} className={`rounded-2xl border shadow-sm overflow-hidden transition-opacity
                ${plan.is_archived ? 'opacity-70 border-slate-200' : 'border-slate-200'}`}>

                {/* Plan Header */}
                <div className={`text-white p-5 ${plan.is_archived ? 'bg-slate-500' : 'bg-gradient-to-l from-violet-600 to-indigo-700'}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-bold">{plan.name_ar}</h3>
                        {plan.is_archived && (
                          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">مؤرشفة</span>
                        )}
                      </div>
                      <p className={`text-sm mt-1 ${plan.is_archived ? 'text-slate-300' : 'text-violet-200'}`}>
                        العام الدراسي: {plan.academic_year}
                      </p>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="text-left">
                        <div className="text-3xl font-bold">{progress}%</div>
                        <div className={`text-xs ${plan.is_archived ? 'text-slate-300' : 'text-violet-200'}`}>نسبة الإنجاز</div>
                      </div>

                      {/* قائمة الخيارات ⋮ */}
                      <div className="relative" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setMenuOpen(menuOpen === plan.id ? null : plan.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-white font-bold text-lg">
                          ⋮
                        </button>
                        {menuOpen === plan.id && (
                          <div className="absolute left-0 top-10 bg-white rounded-xl shadow-xl border border-slate-200 py-1 w-44 z-50">
                            <button
                              onClick={() => toggleArchive(plan)}
                              className="w-full text-right px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                              <span className="inline-flex">{plan.is_archived ? <Eye size={14} /> : <Archive size={14} />}</span>
                              <span>{plan.is_archived ? 'إلغاء الأرشفة' : 'أرشفة الخطة'}</span>
                            </button>
                            <div className="border-t border-slate-100 my-1" />
                            <button
                              onClick={() => { setConfirmDel(plan.id); setMenuOpen(null) }}
                              className="w-full text-right px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                              🗑️ حذف الخطة
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3 h-2 bg-white/20 rounded-full overflow-hidden">
                    <div className="h-full bg-white rounded-full transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="flex justify-between text-xs mt-1" style={{ color: plan.is_archived ? '#cbd5e1' : '#ddd6fe' }}>
                    <span>{done} منجزة</span>
                    <span>{total} مهمة إجمالاً</span>
                  </div>
                </div>

                {/* فتح الخطة */}
                {!plan.is_archived && (
                  <div className="p-4 bg-white">
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
      {confirmDel && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setConfirmDel(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center mb-3"><AlertTriangle size={40} style={{ color: 'var(--maroon-600)' }} /></div>
            <h3 className="text-lg font-bold text-slate-800 text-center mb-2">حذف الخطة نهائياً</h3>
            <p className="text-slate-500 text-sm text-center mb-5">
              سيتم حذف الخطة وجميع محاورها ومبادراتها وأهدافها ومهامها بشكل نهائي لا يمكن التراجع عنه.
            </p>
            <div className="flex gap-3">
              <button onClick={() => deletePlan(confirmDel)} disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50">
                {deleting ? 'جارٍ الحذف...' : 'نعم، احذف الخطة'}
              </button>
              <button onClick={() => setConfirmDel(null)}
                className="flex-1 border border-slate-200 text-slate-600 font-semibold py-3 rounded-xl hover:bg-slate-50 transition-colors">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

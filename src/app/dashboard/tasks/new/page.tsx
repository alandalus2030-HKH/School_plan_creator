'use client'

import { useState, useEffect, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createNotification } from '@/lib/notifications'
import { findConflicts, type ConflictResult } from '@/lib/conflicts'
import ConflictWarning from '@/components/ConflictWarning'
import { todayInput } from '@/lib/dates'
import { loadCalendar, dayStatus, type CalendarData } from '@/lib/calendar'
import { usePermissions } from '@/lib/PermissionsContext'

function NewTaskForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const preNodeId    = searchParams.get('node')
  const prePlanId    = searchParams.get('plan')
  const supabase     = createClient()
  const { can }      = usePermissions()

  /* ── التقويم المدرسي (عطلات/اختبارات) ── */
  const [cal, setCal] = useState<CalendarData>({ events: [], weekend: [5, 6] })
  useEffect(() => { loadCalendar().then(setCal) }, [])
  const canOverride = can('manage_plans')

  /* ── بيانات الخطط والعقد ── */
  const [plans,     setPlans]     = useState<any[]>([])
  const [planNodes, setPlanNodes] = useState<any[]>([])
  const [fetching,  setFetching]  = useState(true)

  /* ── اختيار الموضع (متتابع) ── */
  const [selPlanId,    setSelPlanId]    = useState(prePlanId || '')
  const [selLevels,    setSelLevels]    = useState<string[]>([])   // nodeId لكل مستوى
  const [selectedNode, setSelectedNode] = useState(preNodeId || '') // العقدة النهائية

  /* ── بيانات المهمة ── */
  const [nameAr,      setNameAr]      = useState('')
  const [description, setDescription] = useState('')
  const [taskType,    setTaskType]    = useState('general')
  const [priority,    setPriority]    = useState('medium')
  const [startDate,        setStartDate]        = useState(todayInput())  // افتراضي: اليوم (إلزامي)
  const [endDate,          setEndDate]          = useState('')
  const [budgetQar,        setBudgetQar]        = useState('')
  const [otherResources,   setOtherResources]   = useState('')
  const [evidenceRequired, setEvidenceRequired] = useState('')
  const [evTypeOptions,    setEvTypeOptions]    = useState<string[]>([])   // أنواع الأدلة (للبوّابة)
  const [requiredTypes,    setRequiredTypes]    = useState<string[]>([])
  const [assignedUserId,   setAssignedUserId]   = useState('')
  const [reviewerId,       setReviewerId]       = useState('')
  const [assignMode,       setAssignMode]       = useState<'person' | 'department'>('person')
  const [deptOnly,         setDeptOnly]         = useState(true)   // حصر المكلَّفين بأعضاء قسم الخطة
  const [dependsOnTaskId,  setDependsOnTaskId]  = useState('')
  const [profiles,         setProfiles]         = useState<any[]>([])
  const [planTasksList,    setPlanTasksList]     = useState<any[]>([])
  const [locations,        setLocations]        = useState<any[]>([])   // أماكن المدرسة النشطة
  const [selLocationIds,   setSelLocationIds]   = useState<string[]>([])
  const [loading,          setLoading]          = useState(false)
  const [error,            setError]            = useState('')
  const [conflicts,        setConflicts]        = useState<ConflictResult>({ location: [], assignee: [] })

  /* ════ تحميل الخطط + المستخدمين ════ */
  useEffect(() => {
    Promise.all([
      supabase.from('plans').select('id,name_ar,academic_year,level_count,level_names,department').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id,name_ar,job_title,department').eq('is_active', true).order('name_ar'),
      supabase.from('dropdown_options').select('value').eq('category', 'evidence_type').eq('is_active', true).order('sort_order'),
    ]).then(([{ data: plansData }, { data: profsData }, { data: evTypes }]) => {
      setPlans(plansData || [])
      setProfiles(profsData || [])
      setEvTypeOptions((evTypes || []).map((o: any) => o.value))
      setFetching(false)
    })
    /* أماكن المدرسة النشطة (لاختيار مكان المهمة) */
    fetch('/api/locations?active=1')
      .then(r => r.ok ? r.json() : { locations: [] })
      .then(j => setLocations(j.locations || []))
      .catch(() => {})
  }, [])

  /* ════ تحميل مهام الخطة (للتبعية) عند اختيار الخطة ════ */
  useEffect(() => {
    if (!selPlanId) { setPlanTasksList([]); return }
    ;(async () => {
      const { data: nodesForPlan } = await supabase
        .from('plan_nodes').select('id').eq('plan_id', selPlanId)
      if (!nodesForPlan?.length) { setPlanTasksList([]); return }
      const nodeIds = nodesForPlan.map((n: any) => n.id)
      const { data: tasksData } = await supabase
        .from('tasks').select('id, name_ar, status').in('node_id', nodeIds).order('name_ar')
      setPlanTasksList(tasksData || [])
    })()
  }, [selPlanId])

  /* ════ تحميل عقد الخطة عند اختيارها ════ */
  useEffect(() => {
    if (!selPlanId) { setPlanNodes([]); return }
    supabase.from('plan_nodes').select('*').eq('plan_id', selPlanId).order('order_num')
      .then(({ data }) => {
        const nodes = data || []
        setPlanNodes(nodes)

        // إذا كان هناك عقدة محددة مسبقاً، أعد بناء المسار
        if (preNodeId) {
          const chain: string[] = []
          let cur: any = nodes.find(n => n.id === preNodeId)
          while (cur) {
            chain.unshift(cur.id)
            cur = cur.parent_id ? nodes.find((n:any) => n.id === cur.parent_id) : null
          }
          setSelLevels(chain)
          setSelectedNode(preNodeId)
        }
      })
  }, [selPlanId])

  /* ════ بيانات الخطة الحالية ════ */
  const currentPlan  = plans.find(p => p.id === selPlanId)
  const levelCount   = currentPlan?.level_count || 3
  const levelNames   = (currentPlan?.level_names || []) as string[]

  /* ════ عقد مستوى معين (مصفّاة بالأب) ════ */
  const getNodesAtLevel = (levelNum: number) => {
    const parentId = levelNum === 1 ? null : (selLevels[levelNum - 2] || null)
    if (levelNum > 1 && !parentId) return []
    return planNodes
      .filter((n:any) => n.level_num === levelNum && n.parent_id === parentId)
      .sort((a:any, b:any) => a.order_num - b.order_num)
  }

  /* ════ اختيار مستوى ════ */
  const handlePlanChange = (planId: string) => {
    setSelPlanId(planId); setSelLevels([]); setSelectedNode('')
  }

  const handleLevelSelect = (levelIdx: number, nodeId: string) => {
    const newLevels = [...selLevels.slice(0, levelIdx), nodeId]
    setSelLevels(newLevels)
    // إذا هذا آخر مستوى → هو العقدة المستهدفة
    setSelectedNode(levelIdx + 1 === levelCount ? nodeId : '')
  }

  /* ════ كشف التعارض الحيّ ════ */
  useEffect(() => {
    if (!startDate || (selLocationIds.length === 0 && !assignedUserId)) {
      setConflicts({ location: [], assignee: [] }); return
    }
    let cancelled = false
    const t = setTimeout(async () => {
      const r = await findConflicts(supabase, {
        startDate, endDate, locationIds: selLocationIds, assigneeId: assignedUserId,
      })
      if (!cancelled) setConflicts(r)
    }, 400)
    return () => { cancelled = true; clearTimeout(t) }
  }, [startDate, endDate, selLocationIds, assignedUserId])

  /* ════ حفظ المهمة ════ */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selPlanId)    { setError('يرجى اختيار الخطة'); return }
    if (!selectedNode) { setError(`يرجى إكمال الاختيار حتى مستوى "${levelNames[levelCount - 1] || 'الأخير'}"`); return }
    if (!nameAr.trim()) { setError('اسم المهمة مطلوب'); return }
    /* التاريخان إلزاميان — البدء لجانت/كشف التعارض، والانتهاء للإشعارات ووسم «متأخرة» */
    if (!startDate) { setError('تاريخ البدء مطلوب'); return }
    if (!endDate) { setError('تاريخ الانتهاء (الموعد النهائي) مطلوب'); return }
    if (endDate < startDate) { setError('تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء'); return }
    /* أيام محجوزة في التقويم المدرسي: منع (قابل لتجاوز المدير بتأكيد) */
    const blocked = [
      { d: startDate, label: 'البدء', s: dayStatus(startDate, cal) },
      { d: endDate,   label: 'الانتهاء', s: dayStatus(endDate, cal) },
    ].filter(x => x.s?.level === 'block')
    if (blocked.length) {
      const msg = blocked.map(b => `تاريخ ${b.label} (${b.d}) ضمن «${b.s!.reason}»`).join('، ')
      if (!canOverride) { setError(`${msg} — اختر تاريخاً آخر.`); return }
      if (!window.confirm(`${msg}.\nهذه أيام محجوزة في التقويم المدرسي. هل تريد المتابعة رغم ذلك؟`)) return
    }
    /* حارس: «القسم كله» يتطلب أن يكون للخطة قسم (يمنع حفظ تكليف فارغ صامتاً) */
    const deptForAssign = (plans.find((p: any) => p.id === selPlanId) as any)?.department || null
    if (assignMode === 'department' && !deptForAssign) {
      setError('الخطة بلا قسم — صنّفها بقسم أولاً أو اختر تكليف فرد'); return
    }
    setLoading(true); setError('')

    try {
      const { data: ex } = await supabase.from('tasks').select('order_num')
        .eq('node_id', selectedNode).order('order_num', { ascending: false }).limit(1)
      const orderNum = ex?.length ? ex[0].order_num + 1 : 1

      const { data: task, error: err } = await supabase.from('tasks').insert({
        node_id:          selectedNode,
        name_ar:          nameAr.trim(),
        description:      description.trim() || null,
        task_type:        taskType,
        priority,
        start_date:       startDate || null,
        end_date:         endDate   || null,
        status:           'not_started',
        order_num:        orderNum,
        budget_qar:            budgetQar ? Number(budgetQar) : null,
        other_resources:       otherResources.trim()   || null,
        evidence_required:     evidenceRequired.trim() || null,
        required_evidence_types: requiredTypes.length ? requiredTypes : null,
        assigned_to_user_id:   assignMode === 'person' ? (assignedUserId || null) : null,
        assigned_to_department: assignMode === 'department' ? deptForAssign : null,
        reviewer_id:           reviewerId      || null,
        depends_on_task_id:    dependsOnTaskId || null,
      }).select('id').single()

      if (err) throw err

      /* ربط الأماكن المختارة بالمهمة */
      if (selLocationIds.length > 0) {
        await supabase.from('task_locations')
          .insert(selLocationIds.map(id => ({ task_id: task.id, location_id: id })))
      }

      const { data: { user } } = await supabase.auth.getUser()

      /* إشعار المكلَّف إذا تم تعيينه */
      if (assignMode === 'person' && assignedUserId && assignedUserId !== user?.id) {
        await createNotification({
          recipientId: assignedUserId,
          senderId:    user?.id,
          type:        'task_assigned',
          title:       `📋 تم تكليفك بمهمة جديدة: ${nameAr.trim()}`,
          body:        description.trim() || undefined,
          link:        `/dashboard/tasks/${task.id}`,
        })
      }

      /* تكليف القسم كله → إشعار كل أعضاء القسم (عدا المُنشئ) */
      if (assignMode === 'department' && deptForAssign) {
        const members = profiles.filter((p: any) => p.department === deptForAssign && p.id !== user?.id)
        await Promise.all(members.map((m: any) => createNotification({
          recipientId: m.id,
          senderId:    user?.id,
          type:        'task_assigned',
          title:       `📋 مهمة جديدة لقسم ${deptForAssign}: ${nameAr.trim()}`,
          body:        description.trim() || undefined,
          link:        `/dashboard/tasks/${task.id}`,
        })))
      }

      /* إشعار المقيّم إذا تم تعيينه */
      if (reviewerId && reviewerId !== user?.id && reviewerId !== assignedUserId) {
        await createNotification({
          recipientId: reviewerId,
          senderId:    user?.id,
          type:        'task_assigned',
          title:       `🔍 تم تعيينك مقيّماً لمهمة جديدة: ${nameAr.trim()}`,
          body:        description.trim() || undefined,
          link:        `/dashboard/tasks/${task.id}`,
        })
      }

      router.push(`/dashboard/tasks/${task.id}`)
    } catch (e: any) {
      setError(e.message || 'حدث خطأ'); setLoading(false)
    }
  }

  /* ════ Loading ════ */
  if (fetching) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full" />
    </div>
  )

  /* ════ مسار الاختيار (نص توضيحي) ════ */
  const selectionPath = selLevels
    .map(id => planNodes.find((n:any) => n.id === id)?.name_ar)
    .filter(Boolean).join(' › ')

  return (
    <div className="max-w-2xl mx-auto">

      {/* رأس الصفحة */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/tasks"
          className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-400 hover:text-violet-600 hover:border-violet-300 transition-colors">←</Link>
        <div>
          <h2 className="text-2xl font-bold text-slate-800">مهمة جديدة</h2>
          <p className="text-slate-500 text-sm mt-0.5">إضافة مهمة للخطة التشغيلية</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* ══ بطاقة الموضع (متتابع) ══ */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
            📍 الموضع في الهيكل <span className="text-red-500">*</span>
          </h3>

          {/* اختيار الخطة */}
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-28">
              <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">📋 الخطة</span>
            </div>
            <select value={selPlanId} onChange={e => handlePlanChange(e.target.value)}
              className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-sm">
              <option value="">— اختر الخطة —</option>
              {plans.map(p => (
                <option key={p.id} value={p.id}>{p.name_ar}{p.academic_year ? ` (${p.academic_year})` : ''}</option>
              ))}
            </select>
          </div>

          {/* اختيار المستويات تتابعياً */}
          {selPlanId && Array.from({ length: levelCount }, (_, i) => {
            const levelNum  = i + 1
            const levelName = levelNames[i] || `المستوى ${levelNum}`
            const options   = getNodesAtLevel(levelNum)
            const isDisabled = levelNum > 1 && !selLevels[i - 1]
            const isSelected = !!selLevels[i]
            const isLast     = levelNum === levelCount

            return (
              <div key={levelNum}>
                {/* خط رابط */}
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-28 flex flex-col items-start gap-0.5">
                    <div className="w-px h-3 bg-slate-200 mr-3" />
                    <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${
                      isLast
                        ? 'bg-violet-100 text-violet-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {isLast ? '🎯' : `${levelNum}.`} {levelName}
                    </span>
                  </div>

                  <select
                    value={selLevels[i] || ''}
                    onChange={e => handleLevelSelect(i, e.target.value)}
                    disabled={isDisabled}
                    className={`flex-1 px-3 py-2.5 rounded-xl border focus:outline-none focus:ring-2 text-sm transition-all
                      ${isDisabled
                        ? 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed'
                        : isSelected && isLast
                          ? 'border-violet-300 bg-violet-50 text-violet-800 font-semibold focus:ring-violet-400'
                          : isSelected
                            ? 'border-green-200 bg-green-50 text-green-800 focus:ring-green-300'
                            : 'border-slate-200 bg-white text-slate-800 focus:ring-violet-400'
                      }`}>
                    <option value="">— اختر {levelName} —</option>
                    {options.map((n:any) => (
                      <option key={n.id} value={n.id}>{n.name_ar}</option>
                    ))}
                  </select>
                </div>
              </div>
            )
          })}

          {/* ملخص المسار */}
          {selectedNode && (
            <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-xl px-4 py-2.5">
              <span className="text-violet-400 text-sm">📍</span>
              <span className="text-xs text-violet-700 font-medium">
                {currentPlan?.name_ar} › {selectionPath}
              </span>
            </div>
          )}
        </div>

        {/* ══ بطاقة بيانات المهمة ══ */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <h3 className="font-bold text-slate-700 text-sm">📝 بيانات المهمة</h3>

          {/* اسم المهمة */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              اسم المهمة <span className="text-red-500">*</span>
            </label>
            <input type="text" value={nameAr} onChange={e => setNameAr(e.target.value)} required
              placeholder="مثال: إعداد تقرير النتائج الشهري"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-slate-800" />
          </div>

          {/* الوصف */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">الوصف (اختياري)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              placeholder="وصف تفصيلي للمهمة..."
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-slate-800 resize-none" />
          </div>

          {/* النوع والأولوية */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">نوع المهمة</label>
              <select value={taskType} onChange={e => setTaskType(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-slate-800">
                <option value="general">📌 عامة</option>
                <option value="academic">📚 أكاديمية</option>
                <option value="administrative">🗃️ إدارية</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">الأولوية</label>
              <select value={priority} onChange={e => setPriority(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-slate-800">
                <option value="low">🟢 منخفضة</option>
                <option value="medium">🟡 متوسطة</option>
                <option value="high">🔴 عالية</option>
              </select>
            </div>
          </div>

          {/* التواريخ */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">تاريخ البدء <span className="text-red-500">*</span></label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} dir="ltr" required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-slate-800" />
              {(() => { const s = dayStatus(startDate, cal); if (!s) return null
                return <p className={`text-xs mt-1 ${s.level === 'block' ? 'text-red-600' : 'text-amber-600'}`}>{s.level === 'block' ? '⛔' : '⚠️'} {s.reason}</p> })()}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">تاريخ الانتهاء <span className="text-red-500">*</span></label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} dir="ltr" required min={startDate || undefined}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-slate-800" />
              {(() => { const s = dayStatus(endDate, cal); if (!s) return null
                return <p className={`text-xs mt-1 ${s.level === 'block' ? 'text-red-600' : 'text-amber-600'}`}>{s.level === 'block' ? '⛔' : '⚠️'} {s.reason}</p> })()}
            </div>
          </div>

          {/* الموارد المادية */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              💰 الموارد المادية المطلوبة
              <span className="text-slate-400 font-normal text-xs mr-1">(بالريال القطري)</span>
            </label>
            <div className="relative">
              <input
                type="number" value={budgetQar} onChange={e => setBudgetQar(e.target.value)}
                min="0" max="9999999" step="0.01"
                placeholder="0.00"
                dir="ltr"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-slate-800 pl-16"
              />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium pointer-events-none">
                ر.ق
              </span>
            </div>
          </div>

          {/* الموارد الأخرى */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              📦 الموارد الأخرى
              <span className="text-slate-400 font-normal text-xs mr-1">(اختياري)</span>
            </label>
            <textarea
              value={otherResources} onChange={e => setOtherResources(e.target.value.slice(0, 300))}
              rows={2} maxLength={300}
              placeholder="مثال: أجهزة عرض، مواد مطبوعة، متطوعون..."
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-slate-800 resize-none"
            />
            <p className="text-xs text-slate-400 mt-1 text-left">{otherResources.length} / 300</p>
          </div>

          {/* الأماكن المطلوبة */}
          {locations.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                📍 الأماكن المطلوبة
                <span className="text-slate-400 font-normal text-xs mr-1">(اختياري — لمنع التعارض)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {locations.map((loc: any) => {
                  const on = selLocationIds.includes(loc.id)
                  return (
                    <button key={loc.id} type="button"
                      onClick={() => setSelLocationIds(prev => on ? prev.filter(x => x !== loc.id) : [...prev, loc.id])}
                      className={`px-3 py-1.5 rounded-xl text-sm border transition-colors ${
                        on ? 'bg-violet-600 text-white border-violet-600'
                           : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}>
                      📍 {loc.name_ar}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* أدلة الإنجاز */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              📋 أدلة الإنجاز المطلوبة
              <span className="text-slate-400 font-normal text-xs mr-1">(اختياري)</span>
            </label>
            <textarea
              value={evidenceRequired} onChange={e => setEvidenceRequired(e.target.value.slice(0, 500))}
              rows={3} maxLength={500}
              placeholder="مثال: تقرير مكتوب، صور، محضر اجتماع، شهادات..."
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-slate-800 resize-none"
            />
            <p className="text-xs text-slate-400 mt-1 text-left">{evidenceRequired.length} / 500</p>
          </div>

          {/* أنواع الأدلة المطلوبة — بوّابة الإنجاز */}
          {evTypeOptions.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                ✅ أنواع الأدلة المطلوبة للإنجاز
                <span className="text-slate-400 font-normal text-xs mr-1">(اختياري — إن حُدِّدت، لا تُعتمد المهمة قبل قبول دليل لكل نوع)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {evTypeOptions.map(t => {
                  const on = requiredTypes.includes(t)
                  return (
                    <button type="button" key={t}
                      onClick={() => setRequiredTypes(prev => on ? prev.filter(x => x !== t) : [...prev, t])}
                      className={`px-3 py-1.5 rounded-xl text-sm border transition-colors ${on ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}>
                      {on ? '✓ ' : ''}{t}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* المكلَّف بالمهمة */}
          {(() => {
            const planDept = (plans.find((p: any) => p.id === selPlanId) as any)?.department || null
            const people = (deptOnly && planDept)
              ? profiles.filter((p: any) => p.department === planDept)
              : profiles
            return (
              <div className="pt-1 border-t border-slate-100">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  👤 المكلَّف بالتنفيذ
                  <span className="text-slate-400 font-normal text-xs mr-1">(اختياري — يمكن تعيينه لاحقاً)</span>
                </label>

                {/* وضع التكليف: فرد / القسم كله — يظهر إن كان للخطة قسم */}
                {planDept && (
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <button type="button" onClick={() => setAssignMode('person')}
                      className={`px-3 py-1.5 rounded-xl text-sm border transition-colors ${assignMode === 'person' ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}>
                      فرد
                    </button>
                    <button type="button" onClick={() => setAssignMode('department')}
                      className={`px-3 py-1.5 rounded-xl text-sm border transition-colors ${assignMode === 'department' ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}>
                      القسم كله ({planDept})
                    </button>
                  </div>
                )}

                {assignMode === 'department' ? (
                  <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 text-sm text-violet-700">
                    📋 ستُكلَّف بهذه المهمة كل أعضاء قسم <strong>{planDept}</strong> — أي عضو يستطيع تنفيذها.
                  </div>
                ) : (
                  <>
                    {/* مصدر القائمة واضح: أعضاء القسم (افتراضي) أو كل المستخدمين — لا التباس */}
                    {planDept && (
                      <div className="flex items-center gap-2 mb-2 text-xs flex-wrap">
                        <button type="button" onClick={() => { setDeptOnly(true); setAssignedUserId('') }}
                          className={`px-3 py-1.5 rounded-lg border transition-colors ${deptOnly ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}>
                          أعضاء قسم «{planDept}» ({profiles.filter((p: any) => p.department === planDept).length})
                        </button>
                        <button type="button" onClick={() => { setDeptOnly(false); setAssignedUserId('') }}
                          className={`px-3 py-1.5 rounded-lg border transition-colors ${!deptOnly ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}>
                          كل مستخدمي المدرسة
                        </button>
                      </div>
                    )}
                    <select value={assignedUserId} onChange={e => setAssignedUserId(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-slate-800">
                      <option value="">— بدون تكليف محدد —</option>
                      {people.map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.name_ar}{p.job_title ? ` — ${p.job_title}` : ''}
                        </option>
                      ))}
                    </select>
                    {deptOnly && planDept && people.length === 0 && (
                      <p className="text-xs text-amber-600 mt-1.5">لا أعضاء في قسم «{planDept}» — اضممهم من الإعدادات ← أعضاء الأقسام، أو اختر «كل مستخدمي المدرسة».</p>
                    )}
                    {assignedUserId && (
                      <p className="text-xs text-violet-600 mt-1.5 flex items-center gap-1">
                        <span>📬</span>
                        <span>سيصل للمكلَّف إشعار فور إنشاء المهمة</span>
                      </p>
                    )}
                  </>
                )}
              </div>
            )
          })()}

          {/* المقيّم */}
          <div className="pt-1 border-t border-slate-100">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              🔍 مقيّم جودة التنفيذ
              <span className="text-slate-400 font-normal text-xs mr-1">(اختياري — يمكن تعيينه لاحقاً)</span>
            </label>
            <select value={reviewerId} onChange={e => setReviewerId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-slate-800">
              <option value="">— بدون مقيّم محدد —</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name_ar}{p.job_title ? ` — ${p.job_title}` : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-400 mt-1.5">
              سيتمكن المقيّم المعيّن من إضافة تقييم جودة التنفيذ بعد مراجعة الأدلة المرفوعة
            </p>
          </div>

          {/* التبعية */}
          {planTasksList.length > 0 && (
            <div className="pt-1 border-t border-slate-100">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                🔗 تتطلب إنهاء مهمة أخرى أولاً
                <span className="text-slate-400 font-normal text-xs mr-1">(اختياري)</span>
              </label>
              <select
                value={dependsOnTaskId}
                onChange={e => setDependsOnTaskId(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-slate-800">
                <option value="">— لا تبعية —</option>
                {planTasksList.map((t: any) => {
                  const icon =
                    t.status === 'completed'   ? '✅' :
                    t.status === 'in_progress' ? '🔄' :
                    t.status === 'delayed'     ? '⚠️' : '⏳'
                  return (
                    <option key={t.id} value={t.id}>{icon} {t.name_ar}</option>
                  )
                })}
              </select>
              {dependsOnTaskId && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-2">
                  <span className="text-amber-500 flex-shrink-0">⚠️</span>
                  <p className="text-xs text-amber-700">
                    ستظهر هذه المهمة بحالة <strong>محجوبة</strong> في Kanban وGantt حتى تكتمل المهمة المحددة
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* تحذير تعارض ناعم */}
        <ConflictWarning result={conflicts} />

        {/* خطأ */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* أزرار */}
        <div className="flex gap-3 pb-6">
          <button type="submit" disabled={loading}
            className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-semibold py-3.5 rounded-xl transition-colors disabled:opacity-60 shadow-lg shadow-violet-200">
            {loading ? 'جارٍ الإضافة...' : '✅ إضافة المهمة'}
          </button>
          <button type="button" onClick={() => router.back()}
            className="px-6 py-3.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            إلغاء
          </button>
        </div>
      </form>
    </div>
  )
}

export default function NewTaskPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full" />
      </div>
    }>
      <NewTaskForm />
    </Suspense>
  )
}

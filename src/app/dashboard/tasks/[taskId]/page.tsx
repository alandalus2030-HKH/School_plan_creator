'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { type RatingValue } from '@/lib/rating'
import { createNotification } from '@/lib/notifications'
import { BookOpen, Archive, Pin, Folder, Lock, Star, MessageCircle, Pencil, Trash2, Send, CircleCheckBig, Undo2, Play, Clock, Loader2, History, ChevronDown } from 'lucide-react'
import { STATUS_META, OVERDUE_META } from '@/lib/constants/tasks'
import { toast } from '@/components/Toast'

/* تسمية الانتقال حسب الحالة المُنتقَل إليها */
const TRANSITION_LABEL: Record<string, string> = {
  in_progress: 'بدء العمل',
  submitted:   'رفع للتقييم',
  returned:    'إعادة للتعديل',
  completed:   'اعتماد وإنجاز',
  not_started: 'إعادة فتح',
}
import Breadcrumb from '@/components/Breadcrumb'
import ConflictWarning from '@/components/ConflictWarning'
import { findConflicts, type ConflictResult } from '@/lib/conflicts'
import MentionInput, { extractMentions } from '@/components/MentionInput'
import Subtasks from '@/components/Subtasks'

/* ══ تعريف كلاسات التقييم كنصوص كاملة حتى يتعرف عليها Tailwind ══
   (يجب أن تكون هنا وليس في ملف خارجي لضمان إدراجها في CSS) */
const RATING_INFO: Record<number, {
  label: string; stars: string
  bg: string; fg: string; border: string; btn: string
}> = {
  5: {
    label: 'ممتاز',    stars: '★★★★★',
    bg: '#fbf2f4', fg: '#46091a', border: '#d98ea0',
    btn: 'border-2 scale-105 shadow-md',
  },
  4: {
    label: 'جيد جداً', stars: '★★★★☆',
    bg: '#f4dde2', fg: '#5a0d22', border: '#c25c74',
    btn: 'border-2 scale-105 shadow-md',
  },
  3: {
    label: 'جيد',      stars: '★★★☆☆',
    bg: '#e9bcc6', fg: '#46091a', border: '#a83356',
    btn: 'border-2 scale-105 shadow-md',
  },
  2: {
    label: 'مقبول',    stars: '★★☆☆☆',
    bg: '#d98ea0', fg: '#46091a', border: '#8a1538',
    btn: 'border-2 scale-105 shadow-md',
  },
  1: {
    label: 'ضعيف',     stars: '★☆☆☆☆',
    bg: '#8a1538', fg: '#ffffff', border: '#6f1029',
    btn: 'border-2 scale-105 shadow-md',
  },
}

function TaskTypeIcon({ type }: { type: string }) {
  const s = { size: 28, style: { color: 'var(--maroon-400)', flexShrink: 0 } as any }
  if (type === 'academic')       return <BookOpen {...s} />
  if (type === 'administrative') return <Archive  {...s} />
  return <Pin {...s} />
}

/* تلوين الإشارات @الاسم بالعنابي في نص التعليق */
function renderWithMentions(text: string) {
  const parts = text.split(/(@[^\s@]+(?:\s[^\s@]+)?)/g)
  return parts.map((part, i) =>
    part.startsWith('@')
      ? <span key={i} className="text-violet-700 font-semibold bg-violet-50 rounded px-1">{part}</span>
      : <span key={i}>{part}</span>
  )
}
const typeAr:   Record<string, string> = { academic: 'أكاديمية', administrative: 'إدارية', general: 'عامة' }
const statusList = [
  { value: 'not_started', label: 'لم تبدأ',  ring: 'ring-slate-400',  bg: 'bg-slate-100  text-slate-700  border-slate-200  hover:bg-slate-200'  },
  { value: 'in_progress', label: 'جارية',    ring: 'ring-violet-400', bg: 'bg-violet-50  text-violet-700 border-violet-200 hover:bg-violet-100' },
  { value: 'completed',   label: 'منجزة ✓',  ring: 'ring-violet-600', bg: 'bg-violet-100 text-violet-900 border-violet-300 hover:bg-violet-200' },
  { value: 'delayed',     label: 'متأخرة',   ring: 'ring-red-400',    bg: 'bg-red-50    text-red-700    border-red-200    hover:bg-red-100'    },
]
const priorityInfo: Record<string, { label: string; icon: string; cls: string }> = {
  high:   { label: 'عالية',   icon: '🔴', cls: 'text-red-600   bg-red-50   border-red-200'   },
  medium: { label: 'متوسطة', icon: '🟡', cls: 'text-amber-600 bg-amber-50 border-amber-200' },
  low:    { label: 'منخفضة', icon: '🟢', cls: 'text-slate-500 bg-slate-50 border-slate-200' },
}

export default function TaskPage() {
  const params   = useParams()
  const taskId   = params.taskId as string
  const router   = useRouter()
  const supabase = createClient()

  const [task,         setTask]         = useState<any>(null)
  const [loading,      setLoading]      = useState(true)
  const [taskNum,      setTaskNum]      = useState<string|null>(null)
  const [status,       setStatus]       = useState('')
  const [savingStatus, setSavingStatus] = useState(false)
  const [comments,     setComments]     = useState<any[]>([])
  const [comment,      setComment]      = useState('')
  const [sendingCmt,   setSendingCmt]   = useState(false)
  const [userId,       setUserId]       = useState('')
  const [userName,     setUserName]     = useState('')
  const [myDept,       setMyDept]       = useState<string | null>(null)
  const [confirmDel,   setConfirmDel]   = useState(false)
  const [deleting,     setDeleting]     = useState(false)
  const [canManageTasks, setCanManageTasks] = useState(false)
  const [canManageEvidence, setCanManageEvidence] = useState(false)
  const [canReviewEvidence, setCanReviewEvidence] = useState(false)

  /* ── التكليف والمقيّم ── */
  const [profiles,       setProfiles]       = useState<any[]>([])
  const [teams,          setTeams]          = useState<any[]>([])
  const [assignUserId,   setAssignUserId]   = useState('')
  const [assignTeamId,   setAssignTeamId]   = useState('')
  const [assignDept,     setAssignDept]     = useState('')
  const [deptOptions,    setDeptOptions]    = useState<string[]>([])
  const [assignReviewer, setAssignReviewer] = useState('')
  const [savingAssign,   setSavingAssign]   = useState(false)
  const [showAssign,     setShowAssign]     = useState(false)
  const [planDept,       setPlanDept]       = useState<string | null>(null)  // قسم خطة المهمة
  const [deptOnly,       setDeptOnly]       = useState(true)                 // حصر قائمة المكلَّفين بأعضاء قسم الخطة

  /* ── الأماكن المطلوبة ── */
  const [availLocations, setAvailLocations] = useState<any[]>([])
  const [selLocs,        setSelLocs]        = useState<string[]>([])
  const [editingLoc,     setEditingLoc]     = useState(false)
  const [savingLoc,      setSavingLoc]      = useState(false)
  const [conflicts,      setConflicts]      = useState<ConflictResult>({ location: [], assignee: [] })
  /* رفض الدليل مع سبب اختياري */
  const [rejectingEvId,  setRejectingEvId]  = useState<string | null>(null)
  const [rejectNote,     setRejectNote]     = useState('')

  /* ── وضع التعديل للمهمة ── */
  const [editing,      setEditing]      = useState(false)
  const [editName,     setEditName]     = useState('')
  const [editDesc,     setEditDesc]     = useState('')
  const [editType,     setEditType]     = useState('')
  const [editPriority, setEditPriority] = useState('')
  const [editStart,    setEditStart]    = useState('')
  const [editEnd,      setEditEnd]      = useState('')
  const [savingEdit,   setSavingEdit]   = useState(false)

  /* ── تعديل/حذف التعليقات ── */
  const [editingCmtId, setEditingCmtId] = useState<string | null>(null)
  const [editCmtText,  setEditCmtText]  = useState('')
  const [savingCmt,    setSavingCmt]    = useState(false)

  /* ── التبعية ── */
  const [dependsOnTask,     setDependsOnTask]     = useState<any>(null)
  const [siblingTasks,      setSiblingTasks]      = useState<any[]>([])
  const [editingDepends,    setEditingDepends]    = useState(false)
  const [newDependsId,      setNewDependsId]      = useState('')
  const [savingDepends,     setSavingDepends]     = useState(false)

  /* ── التقييم ── */
  const [ratingValue,       setRatingValue]       = useState<RatingValue | null>(null)
  const [ratingNote,        setRatingNote]        = useState('')
  const [savingRating,      setSavingRating]      = useState(false)
  const [editingRating,     setEditingRating]     = useState(false)
  const [ratingError,       setRatingError]       = useState('')
  const [confirmResetRating, setConfirmResetRating] = useState(false)
  const [resettingRating,   setResettingRating]   = useState(false)

  /* ════════════════════════════════════════ */

  const loadTask = useCallback(async () => {
    const { data } = await supabase
      .from('tasks')
      .select(`
        id, name_ar, description, task_type, status, priority,
        start_date, end_date, order_num, node_id,
        assigned_to_user_id, assigned_to_team_id, assigned_to_department,
        reviewer_id, rating, rating_note, rated_at,
        return_note, submitted_at, created_by,
        budget_qar, other_resources, evidence_required,
        depends_on_task_id,
        task_locations ( location_id, school_locations ( id, name_ar ) ),
        evidence ( id, name, description, evidence_number, status, file_url, video_url, file_type, created_at,
          evidence_files ( id, name, file_url, file_type, file_size, video_url, order_num ) ),
        task_comments (
          id, content, created_at,
          profiles:author_id ( id, full_name_ar )
        )
      `)
      .eq('id', taskId)
      .single()

    if (!data) { router.push('/dashboard/tasks'); return }

    /* حقول طلب إعادة الفتح — استعلام منفصل متسامح (قد لا يكون الترحيل 025 قد شُغّل بعد) */
    const { data: reopenReq } = await supabase
      .from('tasks')
      .select('reopen_requested_by, reopen_requested_at, reopen_request_note')
      .eq('id', taskId).maybeSingle()

    setTask({ ...data, ...(reopenReq || {}) })

    /* الأدلة المشتركة (المرتبطة من مهام أخرى عبر evidence_links) — استعلام متسامح */
    const { data: links } = await supabase
      .from('evidence_links')
      .select('evidence_number, evidence:evidence_id ( id, name, description, evidence_number, status, file_url, video_url, file_type, created_at, task_id, evidence_files ( id, name, file_url, file_type, file_size, video_url, order_num ) )')
      .eq('task_id', taskId)
    setLinkedEvidence((links || [])
      .map((l: any) => l.evidence ? { ...l.evidence, _linkNumber: l.evidence_number } : null)
      .filter(Boolean))
    setStatus(data.status)

    /* سجل تحوّلات المهمة (رفع/إعادة/اعتماد) */
    const { data: trans } = await supabase
      .from('task_transitions')
      .select('id, from_status, to_status, actor_id, note, created_at')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false })
    setTransitions(trans || [])

    setAssignUserId(data.assigned_to_user_id || '')
    setAssignTeamId(data.assigned_to_team_id  || '')
    setAssignDept(data.assigned_to_department || '')
    setAssignReviewer(data.reviewer_id || '')
    setRatingValue(data.rating || null)
    setRatingNote(data.rating_note || '')
    setNewDependsId(data.depends_on_task_id || '')

    /* جلب المهمة التابع لها */
    if (data.depends_on_task_id) {
      const { data: depTask } = await supabase
        .from('tasks').select('id, name_ar, status').eq('id', data.depends_on_task_id).single()
      setDependsOnTask(depTask || null)
    } else {
      setDependsOnTask(null)
    }

    /* جلب المهام الشقيقة (نفس العقدة + نفس الخطة) للقائمة المنسدلة */
    if (data.node_id) {
      const { data: nodeData } = await supabase
        .from('plan_nodes').select('plan_id').eq('id', data.node_id).single()
      if (nodeData?.plan_id) {
        /* قسم الخطة — لتصفية قائمة المكلَّفين في محرّر التكليف */
        const { data: planRow } = await supabase
          .from('plans').select('department').eq('id', nodeData.plan_id).single()
        setPlanDept(planRow?.department || null)
        const { data: planNodes } = await supabase
          .from('plan_nodes').select('id').eq('plan_id', nodeData.plan_id)
        if (planNodes?.length) {
          const nodeIds = planNodes.map((n: any) => n.id)
          const { data: sibs } = await supabase
            .from('tasks').select('id, name_ar, status')
            .in('node_id', nodeIds)
            .neq('id', taskId)
            .order('name_ar')
          setSiblingTasks(sibs || [])
        }
      }
    }
    if (data.node_id) {
      const num = await getTaskNumber(data.node_id, data.order_num)
      setTaskNum(num)
    }
    setComments(
      (data.task_comments || []).sort((a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    )
    setLoading(false)
  }, [taskId])

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)

      const [{ data: profile }, { data: profs }, { data: tms }, { data: deptOpts }] = await Promise.all([
        supabase.from('profiles').select('full_name_ar, role, department').eq('id', user.id).single(),
        supabase.from('profiles').select('id, name_ar, job_title, department').eq('is_active', true).order('name_ar'),
        supabase.from('teams').select('id, name_ar, color, leader_id'),
        supabase.from('dropdown_options').select('value').eq('category', 'department').eq('is_active', true).order('sort_order'),
      ])
      setUserName(profile?.full_name_ar || 'أنت')
      setMyDept(profile?.department || null)
      setProfiles(profs || [])
      setTeams(tms || [])
      setDeptOptions((deptOpts || []).map((o: any) => o.value))

      // التحقق من الصلاحيات (المهام + الأدلة)
      if (profile?.role) {
        const { data: roleData } = await supabase
          .from('roles').select('permissions').eq('code', profile.role).single()
        const perms: string[] = roleData?.permissions || []
        const all = perms.includes('all')
        setCanManageTasks(all || perms.includes('manage_tasks'))
        setCanManageEvidence(all || perms.includes('manage_evidence'))
        setCanReviewEvidence(all || perms.includes('review_evidence'))
      }

      await loadTask()
    })()
  }, [loadTask])

  /* كشف التعارض (تحذير ناعم) — يُعاد حسابه عند تغيّر المهمة */
  useEffect(() => {
    if (!task) return
    const locationIds = (task.task_locations || []).map((tl: any) => tl.location_id)
    if (!task.start_date || (locationIds.length === 0 && !task.assigned_to_user_id)) {
      setConflicts({ location: [], assignee: [] }); return
    }
    let cancelled = false
    findConflicts(supabase, {
      startDate: task.start_date, endDate: task.end_date,
      locationIds, assigneeId: task.assigned_to_user_id, excludeTaskId: taskId,
    }).then(r => { if (!cancelled) setConflicts(r) })
    return () => { cancelled = true }
  }, [task, taskId])

  /* المسار البنيوي للمهمة: الخطط › الخطة › المحور › ... › العقدة الأم */
  const [pathCrumbs, setPathCrumbs] = useState<{ label: string; href?: string }[]>([])

  const getTaskNumber = useCallback(async (nodeId: string, taskOrderNum: number): Promise<string|null> => {
    if (!nodeId) return null
    const { data: node } = await supabase.from('plan_nodes').select('plan_id').eq('id', nodeId).single()
    if (!node) return null
    const [{ data: allNodes }, { data: plan }] = await Promise.all([
      supabase.from('plan_nodes').select('id, parent_id, order_num, name_ar, standard_code').eq('plan_id', node.plan_id),
      supabase.from('plans').select('id, name_ar').eq('id', node.plan_id).single(),
    ])
    if (!allNodes) return null
    const chain: { id: string; name_ar: string; order_num: number; standard_code: string | null }[] = []
    let current = allNodes.find(n => n.id === nodeId)
    while (current) {
      chain.unshift({ id: current.id, name_ar: current.name_ar, order_num: current.order_num, standard_code: (current as any).standard_code || null })
      current = allNodes.find(n => n.id === current!.parent_id)
    }

    /* الترقيم: أعمق سلف له كود معيار رسمي يؤسس البادئة (مثل 1.2.3)،
       وما بعده يُرقَّم آلياً بترتيب العقد ثم المهمة — وإلا فالترقيم المحسوب كاملاً */
    let baseIdx = -1
    for (let i = chain.length - 1; i >= 0; i--) {
      if (chain[i].standard_code) { baseIdx = i; break }
    }
    const path: (string | number)[] = []
    if (baseIdx >= 0) {
      path.push(chain[baseIdx].standard_code as string)
      for (let i = baseIdx + 1; i < chain.length; i++) path.push(chain[i].order_num)
    } else {
      for (const n of chain) path.push(n.order_num)
    }
    path.push(taskOrderNum)

    /* بناء المسار القابل للنقر (نفس بيانات الترقيم — لا استعلام إضافياً للعقد) */
    const crumbs: { label: string; href?: string }[] = [{ label: 'الخطط', href: '/dashboard/plans' }]
    if (plan) crumbs.push({ label: plan.name_ar, href: `/dashboard/plans/${plan.id}` })
    chain.forEach(n => crumbs.push({ label: n.name_ar, href: `/dashboard/plans/${node.plan_id}/nodes/${n.id}` }))
    setPathCrumbs(crumbs)

    return path.join('.')
  }, [supabase])

  const saveDepends = async () => {
    setSavingDepends(true)
    await supabase.from('tasks')
      .update({ depends_on_task_id: newDependsId || null })
      .eq('id', taskId)
    setEditingDepends(false)
    setSavingDepends(false)
    await loadTask()
  }

  const updateStatus = async (newStatus: string) => {
    if (newStatus === status || savingStatus) return
    setSavingStatus(true)
    await supabase.from('tasks').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', taskId)
    setStatus(newStatus)
    setSavingStatus(false)
  }

  /* ── سير العمل: انتقالات عبر الخادم ── */
  const [transitioning, setTransitioning] = useState(false)
  const [wfError,       setWfError]       = useState('')
  const [returnNote,    setReturnNote]    = useState('')
  const [showReturn,    setShowReturn]    = useState(false)

  /* ── قفل المهمة المنجزة: إعادة الفتح / طلبها ── */
  const [showReopen,    setShowReopen]    = useState(false)
  const [reopenNote,    setReopenNote]    = useState('')
  const [showRequest,   setShowRequest]   = useState(false)
  const [requestNote,   setRequestNote]   = useState('')

  /* ── إعادة التصميم: الشريط اللاصق + طي السجلات الطويلة ── */
  const [showSticky,      setShowSticky]      = useState(false)
  const [transOpen,       setTransOpen]       = useState(false)
  const [transAll,        setTransAll]        = useState(false)
  const [showAllComments, setShowAllComments] = useState(false)
  const [showAllEvidence, setShowAllEvidence] = useState(false)
  /* حذف الأدلة: تأكيد + قفل أثناء التنفيذ (يمنع الضغط المتكرر) */
  const [confirmEvId,  setConfirmEvId]  = useState<string | null>(null)
  const [deletingEvId, setDeletingEvId] = useState<string | null>(null)

  /* الدليل المشترك: أدلة مرتبطة من مهام أخرى + أداة الإرفاق */
  const [linkedEvidence, setLinkedEvidence] = useState<any[]>([])
  const [showEvPicker,   setShowEvPicker]   = useState(false)
  const [evSearch,       setEvSearch]       = useState('')
  const [evResults,      setEvResults]      = useState<any[]>([])
  const [searchingEv,    setSearchingEv]    = useState(false)
  const [linkingEvId,    setLinkingEvId]    = useState<string | null>(null)

  /* الشريط اللاصق يظهر عندما يخرج رأس المهمة من الشاشة */
  useEffect(() => {
    if (loading) return
    const el = document.getElementById('task-header')
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => setShowSticky(!e.isIntersecting),
      { rootMargin: '-8px 0px 0px 0px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [loading])
  const [transitions,   setTransitions]   = useState<{ id: string; from_status: string | null; to_status: string; actor_id: string | null; note: string | null; created_at: string }[]>([])
  const doTransition = async (action: string, payload: Record<string, any> = {}) => {
    setTransitioning(true); setWfError('')
    try {
      const res = await fetch(`/api/tasks/${taskId}/transition`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      })
      let json: any = {}
      try { json = await res.json() } catch { /* استجابة غير JSON */ }
      if (!res.ok) {
        setWfError(json.error || `تعذّر تنفيذ الإجراء (${res.status})`)
        return false
      }
      setShowReturn(false); setReturnNote('')
      await loadTask()
      return true
    } catch (err: any) {
      console.error('[transition] failed:', err)
      setWfError('تعذّر الاتصال بالخادم: ' + (err?.message || 'خطأ غير معروف'))
      return false
    } finally {
      setTransitioning(false)
    }
  }

  const openEdit = () => {
    setEditName(task.name_ar || '')
    setEditDesc(task.description || '')
    setEditType(task.task_type || 'general')
    setEditPriority(task.priority || 'medium')
    setEditStart(task.start_date || '')
    setEditEnd(task.end_date || '')
    setEditing(true)
  }

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editName.trim()) return
    if (!editEnd) { toast('تاريخ الانتهاء (الموعد النهائي) مطلوب', 'error'); return }
    if (editStart && editEnd < editStart) { toast('تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء', 'error'); return }
    setSavingEdit(true)
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name_ar: editName.trim(),
        description: editDesc.trim() || null,
        task_type: editType,
        priority: editPriority,
        start_date: editStart || null,
        end_date: editEnd || null,
      }),
    })
    setSavingEdit(false)
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast(j.error || 'تعذّر حفظ التعديلات', 'error'); return }
    setEditing(false)
    await loadTask()
  }

  const sendComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!comment.trim() || sendingCmt) return
    setSendingCmt(true)
    const content = comment.trim()
    const { data } = await supabase
      .from('task_comments')
      .insert({ task_id: taskId, author_id: userId, content })
      .select('id, content, created_at')
      .single()
    if (data) setComments(prev => [{ ...data, profiles: { id: userId, full_name_ar: userName } }, ...prev])

    /* ── إشعار المستخدمين المذكورين بـ @ ── */
    const mentioned = extractMentions(content, profiles)
    for (const u of mentioned) {
      if (u.id === userId) continue   // لا تُشعر نفسك
      createNotification({
        recipientId: u.id,
        senderId:    userId,
        type:        'task_comment',
        title:       `ذكرك ${userName} في تعليق`,
        body:        content.length > 80 ? content.slice(0, 80) + '…' : content,
        link:        `/dashboard/tasks/${taskId}`,
      })
    }

    setComment('')
    setSendingCmt(false)
  }

  const saveCommentEdit = async (cmtId: string) => {
    if (!editCmtText.trim()) return
    setSavingCmt(true)
    await supabase.from('task_comments').update({ content: editCmtText.trim() }).eq('id', cmtId)
    setComments(prev => prev.map(c => c.id === cmtId ? { ...c, content: editCmtText.trim() } : c))
    setEditingCmtId(null); setSavingCmt(false)
  }

  const deleteComment = async (cmtId: string) => {
    await supabase.from('task_comments').delete().eq('id', cmtId)
    setComments(prev => prev.filter(c => c.id !== cmtId))
  }

  const deleteEvidence = async (evId: string) => {
    if (deletingEvId) return            // قفل: عملية حذف جارية بالفعل
    setDeletingEvId(evId)
    setConfirmEvId(null)
    try {
      /* نمرّر taskNum المحسوب مسبقاً ليتفادى الخادم إعادة حسابه (أسرع) */
      const res = await fetch(`/api/tasks/${taskId}/evidence/${evId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskNum }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        /* 404 = الدليل محذوف مسبقاً (ضغط مكرر) — نتجاهله بهدوء ونحدّث القائمة */
        if (res.status !== 404) toast(j.error || 'تعذّر حذف الدليل', 'error')
      }
      await loadTask()
    } finally {
      setDeletingEvId(null)
    }
  }

  /* ── الدليل المشترك: بحث/إرفاق/فك الارتباط ── */
  const searchEvidence = async (q: string) => {
    setEvSearch(q)
    if (!q.trim()) { setEvResults([]); return }
    setSearchingEv(true)
    /* أدلة المدرسة (RLS) عدا أدلة هذه المهمة؛ والمرتبطة تُستبعد لاحقاً في العرض */
    const { data } = await supabase
      .from('evidence')
      .select('id, name, evidence_number, task_id, file_type')
      .neq('task_id', taskId)
      .is('deleted_at', null)
      .or(`name.ilike.%${q}%,evidence_number.ilike.%${q}%`)
      .limit(20)
    const linkedIds = new Set(linkedEvidence.map((e: any) => e.id))
    setEvResults((data || []).filter((e: any) => !linkedIds.has(e.id)))
    setSearchingEv(false)
  }

  const linkEvidence = async (evId: string) => {
    setLinkingEvId(evId)
    /* رقم تسلسلي خاص بهذه المهمة (يتبع المملوكة ثم المشتركة) */
    const { count } = await supabase.from('evidence')
      .select('id', { count: 'exact', head: true }).eq('task_id', taskId).is('deleted_at', null)
    const seq = (count || 0) + linkedEvidence.length + 1
    const number = taskNum ? `${taskNum}.${seq}` : `دليل-${seq}`
    const { error } = await supabase.from('evidence_links')
      .insert({ evidence_id: evId, task_id: taskId, evidence_number: number })
    setLinkingEvId(null)
    if (error) { toast(error.message || 'تعذّر إرفاق الدليل', 'error'); return }
    setShowEvPicker(false); setEvSearch(''); setEvResults([])
    await loadTask()
  }

  const unlinkEvidence = async (evId: string) => {
    const { error } = await supabase.from('evidence_links').delete().eq('evidence_id', evId).eq('task_id', taskId)
    if (error) { toast(error.message || 'تعذّر فك الارتباط', 'error'); return }
    await loadTask()
  }

  /* اعتماد/رفض الدليل (للمقيّم/المدير) — عبر API محروس؛ note سبب رفض اختياري */
  const setEvidenceStatus = async (evId: string, status: 'accepted' | 'rejected' | 'pending', note?: string) => {
    const res = await fetch(`/api/evidence/${evId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, note }),
    })
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast(j.error || 'تعذّر تغيير حالة الدليل', 'error'); return }
    setRejectingEvId(null); setRejectNote('')
    await loadTask()
  }

  /* ── الأماكن: فتح المحرّر + الحفظ ── */
  const openLocEditor = async () => {
    try {
      const res = await fetch('/api/locations?active=1')
      const j = await res.json().catch(() => ({}))
      setAvailLocations(j.locations || [])
    } catch { setAvailLocations([]) }
    setSelLocs((task?.task_locations || []).map((tl: any) => tl.location_id))
    setEditingLoc(true)
  }

  const saveLocations = async () => {
    setSavingLoc(true)
    await supabase.from('task_locations').delete().eq('task_id', taskId)
    if (selLocs.length > 0) {
      await supabase.from('task_locations').insert(selLocs.map(id => ({ task_id: taskId, location_id: id })))
    }
    setEditingLoc(false); setSavingLoc(false)
    await loadTask()
  }

  const saveAssignment = async () => {
    if (!canManageTasks) return   // التكليف/المقيّم لمن يملك manage_tasks فقط
    setSavingAssign(true)

    const { data: { user } } = await supabase.auth.getUser()

    /* القيم القديمة قبل الحفظ */
    const prevAssignee = (task as any)?.assigned_to_user_id || ''
    const prevReviewer = (task as any)?.reviewer_id         || ''

    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assigned_to_user_id: assignUserId   || null,
        assigned_to_team_id: assignTeamId   || null,
        assigned_to_department: assignDept   || null,
        reviewer_id:         assignReviewer || null,
      }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast(j.error || 'تعذّر حفظ التكليف', 'error'); setSavingAssign(false); return
    }

    const taskName = (task as any)?.name_ar || 'مهمة'
    const link     = `/dashboard/tasks/${taskId}`

    /* إشعار المكلّف الجديد إذا تغيّر — ولا يُشعَر نفسه */
    if (assignUserId && assignUserId !== prevAssignee && assignUserId !== user?.id) {
      await createNotification({
        recipientId: assignUserId,
        senderId:    user?.id,
        type:        'task_assigned',
        title:       `📋 تم تعيينك على مهمة: ${taskName}`,
        link,
      })
    }

    /* إشعار المقيّم الجديد إذا تغيّر — ولا يُشعَر نفسه */
    if (assignReviewer && assignReviewer !== prevReviewer && assignReviewer !== user?.id) {
      await createNotification({
        recipientId: assignReviewer,
        senderId:    user?.id,
        type:        'task_assigned',
        title:       `🔍 تم تعيينك مقيّماً لمهمة: ${taskName}`,
        link,
      })
    }

    setSavingAssign(false); setShowAssign(false)
    await loadTask()
  }

  /* ── حفظ التقييم ── */
  const saveRating = async () => {
    if (!ratingValue) return
    setSavingRating(true)
    setRatingError('')

    const now = new Date().toISOString()
    const { error } = await supabase.from('tasks').update({
      rating:      ratingValue,
      rating_note: ratingNote.trim() || null,
      rated_at:    now,
    }).eq('id', taskId)

    if (error) {
      setRatingError(`فشل الحفظ: ${error.message}`)
      setSavingRating(false)
      return
    }

    /* تحديث فوري للـ state المحلي قبل إعادة التحميل */
    setTask((prev: any) => ({
      ...prev,
      rating:      ratingValue,
      rating_note: ratingNote.trim() || null,
      rated_at:    now,
    }))
    setSavingRating(false)
    setEditingRating(false)
    /* ثم إعادة تحميل من قاعدة البيانات للتأكد */
    await loadTask()
  }

  /* ── إعادة تعيين التقييم (حذف التقييم الحالي) ── */
  const resetRating = async () => {
    setResettingRating(true)
    setRatingError('')
    const { error } = await supabase.from('tasks').update({
      rating:      null,
      rating_note: null,
      rated_at:    null,
    }).eq('id', taskId)

    if (error) {
      setRatingError(`فشل إعادة التعيين: ${error.message}`)
      setResettingRating(false)
      setConfirmResetRating(false)
      return
    }

    /* تحديث فوري للـ state */
    setTask((prev: any) => ({ ...prev, rating: null, rating_note: null, rated_at: null }))
    setRatingValue(null)
    setRatingNote('')
    setResettingRating(false)
    setConfirmResetRating(false)
    setEditingRating(false)
    await loadTask()
  }

  const deleteTask = async () => {
    setDeleting(true)
    const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast(j.error || 'تعذّر حذف المهمة', 'error'); setDeleting(false); setConfirmDel(false); return
    }
    router.push('/dashboard/tasks')
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full" />
    </div>
  )
  if (!task) return null

  const pInfo     = priorityInfo[task.priority] || priorityInfo.medium
  const isOverdue = task.end_date && status !== 'completed' && new Date(task.end_date) < new Date()
  /* الأدلة المملوكة + المشتركة (مرتبطة من مهام أخرى)؛ ترتيب تصاعدي */
  const evidence  = [
    ...[...(task.evidence || [])].map((e: any) => ({ ...e, _shared: false })),
    ...linkedEvidence.map((e: any) => ({ ...e, _shared: true })),
  ].sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  /* المهمة المنجزة مقفلة: لا تعديلات (عدا التعليقات) إلا بعد إعادة فتحها */
  const isCompleted    = status === 'completed'
  /* المكلَّف = مباشرةً، أو عضو في القسم المُكلَّف (تكليف القسم كله) */
  const isAssignee     = task.assigned_to_user_id === userId
    || (!!task.assigned_to_department && task.assigned_to_department === myDept)
  const canAskReopen   = isAssignee || task.reviewer_id === userId

  // صلاحية التقييم: المقيّم المعيّن أو أصحاب manage_tasks
  const canRate = canManageTasks || (task.reviewer_id && task.reviewer_id === userId)

  // بيانات المقيّم
  const reviewerProfile = profiles.find((p: any) => p.id === task.reviewer_id)

  // بيانات التقدير الحالي — من المصفوفة المحلية الثابتة
  const currentRating = task.rating ? RATING_INFO[task.rating as RatingValue] : null

  /* إجراء الشريط اللاصق الأساسي حسب الدور والحالة */
  const scrollToHeader = () =>
    document.getElementById('task-header')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const stickyAction =
    isCompleted && canManageTasks
      ? { label: 'إعادة فتح', run: () => { setShowReopen(true); scrollToHeader() } } :
    isCompleted && canAskReopen && !task.reopen_requested_by
      ? { label: 'طلب إعادة فتح', run: () => { setShowRequest(true); scrollToHeader() } } :
    status === 'submitted' && canRate
      ? { label: 'تقييم المهمة', run: () => document.getElementById('rating-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) } :
    isAssignee && ['not_started', 'in_progress', 'returned'].includes(status)
      ? { label: 'إجراءات المهمة', run: scrollToHeader } :
    null

  return (
    <div className="max-w-6xl mx-auto space-y-5">

      {/* Breadcrumb — المسار البنيوي الكامل (الخطة › المحور › ... › المهمة)؛
          المهام الحرة بلا عقدة تعرض المسار العام */}
      <Breadcrumb items={
        pathCrumbs.length > 0
          ? [...pathCrumbs, { label: task.name_ar }]
          : [
              { label: 'الخطط',    href: '/dashboard/plans' },
              { label: 'كل المهام', href: '/dashboard/tasks' },
              { label: task.name_ar },
            ]
      } />

      {/* تحذير تعارض ناعم (مكان/موظف متداخل زمنياً) */}
      <ConflictWarning result={conflicts} />

      {/* ── الشريط اللاصق — يظهر عند التمرير بعد رأس المهمة ── */}
      <div className={`sticky top-2 z-30 transition-all duration-200 ${showSticky ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}`}>
        <div className="flex items-center gap-2.5 bg-white/95 backdrop-blur border border-slate-200 shadow-md rounded-2xl px-4 py-2.5">
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap"
            style={{ background: STATUS_META[status]?.bg, color: STATUS_META[status]?.fg }}>
            {STATUS_META[status]?.ar || status}
          </span>
          {taskNum && <span className="font-mono text-xs text-slate-400 hidden sm:inline">{taskNum}</span>}
          <p className="flex-1 min-w-0 text-sm font-semibold text-slate-800 truncate">{task.name_ar}</p>
          {isOverdue && (
            <span className="hidden sm:inline-flex text-[11px] px-2 py-0.5 rounded-lg bg-red-50 text-red-600 border border-red-100">متأخرة</span>
          )}
          {stickyAction && (
            <button onClick={stickyAction.run}
              className="px-3.5 py-1.5 rounded-xl text-white text-xs font-semibold hover:brightness-110 whitespace-nowrap"
              style={{ background: 'var(--gradient-button)' }}>
              {stickyAction.label}
            </button>
          )}
        </div>
      </div>

      {/* ══ شبكة عمودين: المحتوى الرئيسي + الشريط الجانبي ══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">

      {/* ── العمود الرئيسي ── */}
      <div className="lg:col-span-2 space-y-5">

      {/* ══ Header Card ══ */}
      <div id="task-header" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-l from-violet-600 to-indigo-700 text-white p-5">
          {!editing ? (
            <div className="flex items-start gap-3">
              <TaskTypeIcon type={task.task_type} />
              <div className="flex-1 min-w-0">
                {taskNum && (
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-lg font-bold bg-white/20 px-3 py-1 rounded-lg tracking-wider">{taskNum}</span>
                    <span className="text-violet-200 text-xs">رقم المهمة</span>
                  </div>
                )}
                <h1 className="text-xl font-bold leading-snug">{task.name_ar}</h1>
                {task.description && (
                  <p className="text-violet-200 text-sm mt-1.5 leading-relaxed">{task.description}</p>
                )}
                {/* التقدير في الهيدر إن وُجد */}
                {currentRating && (
                  <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-lg bg-white/15 text-white text-xs font-semibold">
                    <span>{currentRating.stars}</span>
                    <span>{currentRating.label}</span>
                    <span className="opacity-60 text-xs">(تقييم الجودة)</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`px-3 py-1 rounded-full text-sm font-semibold
                  ${status === 'completed'   ? 'bg-violet-400/20 text-violet-100' :
                    status === 'in_progress' ? 'bg-violet-300/20 text-violet-100' :
                    status === 'delayed'     ? 'bg-red-400/20   text-red-100'   :
                    'bg-white/20 text-white/80'}`}>
                  {STATUS_META[status]?.ar || status}
                </span>
                {canManageTasks && status !== 'completed' && (
                  <button onClick={openEdit}
                    className="text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg transition-colors">
                    ✏️ تعديل
                  </button>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={saveEdit} className="space-y-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-white">تعديل المهمة</span>
                <button type="button" onClick={() => setEditing(false)} className="text-white/60 hover:text-white text-sm">✕ إلغاء</button>
              </div>
              <input value={editName} onChange={e => setEditName(e.target.value)} required
                className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/40 text-sm"
                placeholder="اسم المهمة *" />
              <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={2}
                className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/40 text-sm resize-none"
                placeholder="الوصف (اختياري)" />
              <div className="grid grid-cols-2 gap-2">
                <select value={editType} onChange={e => setEditType(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white focus:outline-none text-sm">
                  <option value="general">📌 عامة</option>
                  <option value="academic">📚 أكاديمية</option>
                  <option value="administrative">🗃️ إدارية</option>
                </select>
                <select value={editPriority} onChange={e => setEditPriority(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white focus:outline-none text-sm">
                  <option value="low">🟢 منخفضة</option>
                  <option value="medium">🟡 متوسطة</option>
                  <option value="high">🔴 عالية</option>
                </select>
                <div>
                  <label className="block text-[11px] text-white/70 mb-1">تاريخ البدء</label>
                  <input type="date" value={editStart} onChange={e => setEditStart(e.target.value)} dir="ltr"
                    className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white focus:outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-[11px] text-white/70 mb-1">تاريخ الانتهاء <span className="text-amber-300">*</span></label>
                  <input type="date" value={editEnd} onChange={e => setEditEnd(e.target.value)} dir="ltr" required min={editStart || undefined}
                    className={`w-full px-3 py-2 rounded-xl bg-white/10 border text-white focus:outline-none text-sm ${editEnd ? 'border-white/20' : 'border-amber-300/70'}`} />
                </div>
              </div>
              <button type="submit" disabled={savingEdit}
                className="w-full py-2 bg-white text-violet-700 font-semibold rounded-xl text-sm disabled:opacity-50">
                {savingEdit ? 'جارٍ الحفظ...' : '💾 حفظ التعديلات'}
              </button>
            </form>
          )}
        </div>

        {/* Meta Row */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-3 bg-slate-50 border-b border-slate-100">
          <span className={`flex items-center gap-1 px-3 py-1 rounded-full border text-xs font-medium ${pInfo.cls}`}>
            {pInfo.icon} أولوية {pInfo.label}
          </span>
          <span className="text-xs text-slate-500">🏷️ {typeAr[task.task_type]}</span>
          {task.start_date && (
            <span className="text-xs text-slate-500">📅 البدء: {new Date(task.start_date).toLocaleDateString('ar-QA')}</span>
          )}
          {task.end_date && (
            <span className={`text-xs font-medium ${isOverdue ? 'text-red-600' : 'text-slate-500'}`}>
              {isOverdue ? '⚠️' : '🎯'} الانتهاء: {new Date(task.end_date).toLocaleDateString('ar-QA')}
              {isOverdue && ' (متأخرة)'}
            </span>
          )}
          {task.budget_qar != null && (
            <span className="text-xs text-slate-500">💰 {Number(task.budget_qar).toLocaleString('ar-QA')} ر.ق</span>
          )}
        </div>

        {/* حالة المهمة + سير العمل */}
        <div className="p-5">
          <p className="text-sm font-semibold text-slate-700 mb-3">حالة المهمة</p>

          {/* الحالة الحالية + وسم التأخير */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="px-3 py-1.5 rounded-xl text-sm font-semibold border border-transparent"
              style={{ background: STATUS_META[status]?.bg, color: STATUS_META[status]?.fg }}>
              {STATUS_META[status]?.ar || status}
            </span>
            {isOverdue && (
              <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1 ${OVERDUE_META.light} ${OVERDUE_META.text} ${OVERDUE_META.tailwindBorder}`}>
                <Clock size={12} /> {OVERDUE_META.ar}
              </span>
            )}
          </div>

          {/* سبب الإعادة */}
          {status === 'returned' && task.return_note && (
            <div className="mb-3 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 text-sm text-orange-700">
              <span className="font-semibold">سبب الإعادة: </span>{task.return_note}
            </div>
          )}

          {/* أزرار المكلّف (مباشر أو عضو القسم المُكلَّف) */}
          {isAssignee && status !== 'submitted' && status !== 'completed' && (
            <div className="flex flex-wrap gap-2">
              {(status === 'not_started' || status === 'returned') && (
                <button onClick={() => doTransition('start')} disabled={transitioning}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-violet-200 bg-violet-50 text-violet-700 text-sm font-medium hover:bg-violet-100 disabled:opacity-50">
                  <Play size={14} /> بدء العمل
                </button>
              )}
              <button onClick={() => doTransition('submit')} disabled={transitioning}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-semibold hover:brightness-110 disabled:opacity-50"
                style={{ background: 'var(--gradient-button)' }}>
                <span className="inline-flex">{transitioning ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}</span>
                رفع للتقييم
              </button>
            </div>
          )}

          {/* بانتظار التقييم */}
          {status === 'submitted' && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center gap-1.5">
              <Clock size={14} /> المهمة مرفوعة وبانتظار اعتماد المقيّم.
            </p>
          )}

          {/* ══ المهمة منجزة: مقفلة + إعادة الفتح / طلبها ══ */}
          {isCompleted && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                <span className="inline-flex mt-0.5"><Lock size={14} /></span>
                <span>المهمة منجزة ومعتمدة — جميع التعديلات مقفلة (عدا التعليقات) حفاظاً على مصداقية سجل الاعتماد. أي تعديل يتطلب إعادة فتح المهمة.</span>
              </div>

              {/* بطاقة الطلب المعلّق — للمشرف */}
              {canManageTasks && task.reopen_requested_by && (() => {
                const requester = profiles.find((p: any) => p.id === task.reopen_requested_by)
                const whoLabel = task.reopen_requested_by === task.assigned_to_user_id ? 'المكلّف'
                              : task.reopen_requested_by === task.reviewer_id        ? 'المقيّم' : 'مستخدم'
                return (
                  <div className="border border-amber-200 bg-amber-50 rounded-xl p-3 space-y-1">
                    <p className="text-sm font-semibold text-amber-800">
                      📨 طلب إعادة فتح معلّق من {whoLabel}: {requester?.name_ar || '—'}
                      {task.reopen_requested_at && (
                        <span className="text-xs font-normal text-amber-600 mr-2">
                          ({new Date(task.reopen_requested_at).toLocaleString('ar-QA')})
                        </span>
                      )}
                    </p>
                    {task.reopen_request_note && (
                      <p className="text-sm text-amber-700 bg-white/60 border border-amber-100 rounded-lg px-3 py-2">
                        {task.reopen_request_note}
                      </p>
                    )}
                  </div>
                )
              })()}

              {/* إعادة الفتح المباشرة — لصاحب manage_tasks */}
              {canManageTasks && (
                !showReopen ? (
                  <button onClick={() => setShowReopen(true)} disabled={transitioning}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-orange-200 bg-orange-50 text-orange-700 text-sm font-medium hover:bg-orange-100 disabled:opacity-50">
                    <Undo2 size={14} /> إعادة فتح المهمة
                  </button>
                ) : (
                  <div className="space-y-2 border border-orange-200 rounded-xl p-3 bg-orange-50/50">
                    <p className="text-xs text-orange-700">السبب اختياري ويُسجَّل في سجل سير العمل، وسيُصفَّر التقييم الحالي لإعادة دورة الاعتماد.</p>
                    <textarea value={reopenNote} onChange={e => setReopenNote(e.target.value.slice(0, 500))} rows={2}
                      placeholder="سبب إعادة الفتح (اختياري)..."
                      className="w-full px-3 py-2 rounded-lg border border-orange-200 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white text-sm" />
                    <div className="flex gap-2">
                      <button onClick={async () => { if (await doTransition('reopen', { note: reopenNote })) { setShowReopen(false); setReopenNote('') } }}
                        disabled={transitioning}
                        className="flex-1 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50">إعادة فتح المهمة</button>
                      <button onClick={() => { setShowReopen(false); setReopenNote('') }}
                        className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm">إلغاء</button>
                    </div>
                  </div>
                )
              )}

              {/* طلب إعادة الفتح — للمكلّف/المقيّم بلا manage_tasks */}
              {!canManageTasks && canAskReopen && (
                task.reopen_requested_by ? (
                  <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2 space-y-1">
                    <p>
                      {task.reopen_requested_by === userId
                        ? '✅ طلبك بإعادة فتح المهمة قيد الانتظار لدى مشرف نظام المدرسة.'
                        : `📨 يوجد طلب إعادة فتح معلّق من ${profiles.find((p: any) => p.id === task.reopen_requested_by)?.name_ar || 'مستخدم آخر'}.`}
                    </p>
                    {task.reopen_requested_by === userId && task.reopen_request_note && (
                      <p className="text-xs text-green-600">السبب: {task.reopen_request_note}</p>
                    )}
                  </div>
                ) : !showRequest ? (
                  <button onClick={() => setShowRequest(true)} disabled={transitioning}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-violet-200 bg-violet-50 text-violet-700 text-sm font-medium hover:bg-violet-100 disabled:opacity-50">
                    <Send size={14} /> طلب إعادة فتح المهمة
                  </button>
                ) : (
                  <div className="space-y-2 border border-violet-200 rounded-xl p-3 bg-violet-50/50">
                    <textarea value={requestNote} onChange={e => setRequestNote(e.target.value.slice(0, 500))} rows={2}
                      placeholder="سبب الطلب (إلزامي — يصل لمشرف نظام المدرسة)..."
                      className="w-full px-3 py-2 rounded-lg border border-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white text-sm" />
                    <div className="flex gap-2">
                      <button onClick={async () => { if (await doTransition('request_reopen', { note: requestNote })) { setShowRequest(false); setRequestNote('') } }}
                        disabled={transitioning || !requestNote.trim()}
                        className="flex-1 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50">إرسال الطلب</button>
                      <button onClick={() => { setShowRequest(false); setRequestNote('') }}
                        className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm">إلغاء</button>
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          {wfError && <p className="mt-2 text-sm text-red-600">{wfError}</p>}
        </div>
      </div>

      {/* ══ Evidence ══ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-slate-800">
            📎 الأدلة والإثباتات
            <span className="text-xs font-normal text-slate-400 mr-2">({evidence.length})</span>
          </h2>
          {!isCompleted && canManageEvidence && (
            <div className="flex items-center gap-2">
              <button onClick={() => setShowEvPicker(v => !v)}
                className="text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl transition-colors">
                🔗 إرفاق دليل موجود
              </button>
              <Link href={`/dashboard/tasks/${taskId}/evidence/new`}
                className="text-sm font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-xl transition-colors">
                ➕ إضافة دليل
              </Link>
            </div>
          )}
        </div>

        {/* أداة إرفاق دليل موجود (مشترك) */}
        {showEvPicker && !isCompleted && canManageEvidence && (
          <div className="mb-4 border border-slate-200 rounded-xl p-3 bg-slate-50/60">
            <input value={evSearch} onChange={e => searchEvidence(e.target.value)}
              placeholder="ابحث عن دليل بالاسم أو الرقم لإرفاقه..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-sm" />
            {searchingEv ? (
              <p className="text-xs text-slate-400 mt-2 px-1">جارٍ البحث...</p>
            ) : evSearch && evResults.length === 0 ? (
              <p className="text-xs text-slate-400 mt-2 px-1">لا نتائج مطابقة</p>
            ) : evResults.length > 0 ? (
              <div className="mt-2 space-y-1.5 max-h-60 overflow-auto">
                {evResults.map((r: any) => (
                  <div key={r.id} className="flex items-center gap-2 p-2 rounded-lg bg-white border border-slate-100">
                    {r.evidence_number && <span className="text-xs font-mono bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full flex-shrink-0">{r.evidence_number}</span>}
                    <span className="text-sm text-slate-700 flex-1 truncate">{r.name}</span>
                    <button onClick={() => linkEvidence(r.id)} disabled={linkingEvId === r.id}
                      className="px-2.5 py-1 text-xs bg-violet-600 text-white rounded-lg font-medium disabled:opacity-50 flex-shrink-0">
                      {linkingEvId === r.id ? '...' : 'إرفاق'}
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {evidence.length > 0 ? (
          <div className="space-y-2">
            {(showAllEvidence ? evidence : evidence.slice(0, 3)).map((ev: any) => {
              /* الدليل المشترك يأخذ رقمه الخاص بهذه المهمة (_linkNumber)؛ المملوك يتبع ترقيمها */
              const evNumDisplay = ev._shared
                ? (ev._linkNumber || ev.evidence_number)
                : /^\d/.test(ev.evidence_number)
                  ? ev.evidence_number
                  : taskNum
                    ? `${taskNum}.${ev.evidence_number.split('-').pop()}`
                    : ev.evidence_number
              /* ملفات الدليل — من evidence_files، مع احتياط لصف الدليل القديم */
              const files: any[] = (ev.evidence_files && ev.evidence_files.length > 0)
                ? [...ev.evidence_files].sort((a, b) => (a.order_num || 0) - (b.order_num || 0))
                : [{ id: ev.id, name: ev.name, file_url: ev.file_url, file_type: ev.file_type, video_url: ev.video_url, order_num: 1 }]
              const hasVideo = files.some(f => f.file_type === 'video/youtube')
              const stMeta = ev.status === 'accepted' ? { ar: 'معتمد', cls: 'bg-emerald-50 text-emerald-700' }
                : ev.status === 'rejected' ? { ar: 'مرفوض', cls: 'bg-red-50 text-red-600' }
                : { ar: 'قيد المراجعة', cls: 'bg-slate-100 text-slate-500' }
              return (
                <div key={ev.id} className="p-3 rounded-xl border border-slate-100 hover:border-violet-100 transition-all">
                  {/* رأس الدليل */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {ev.evidence_number && (
                          <span className="text-xs font-mono bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">{evNumDisplay}</span>
                        )}
                        <p className="text-sm font-semibold text-slate-700 truncate">{ev.name}</p>
                        <span className="text-xs text-slate-400">📎 {files.length} {files.length === 1 ? 'ملف' : 'ملفات'}</span>
                        {ev._shared && <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 inline-flex items-center gap-1">🔗 مشترك</span>}
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${stMeta.cls}`}>{stMeta.ar}</span>
                      </div>
                      {ev.description && <p className="text-xs text-slate-400 truncate mt-0.5">{ev.description}</p>}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* اعتماد/رفض الدليل — review_evidence على الأدلة المملوكة، والمهمة غير منجزة (المنجزة مقفلة) */}
                      {canReviewEvidence && !ev._shared && !isCompleted && (
                        <span className="flex items-center gap-1 ml-1">
                          <button onClick={() => setEvidenceStatus(ev.id, ev.status === 'accepted' ? 'pending' : 'accepted')}
                            title="اعتماد الدليل"
                            className={`px-2 py-1.5 text-xs rounded-lg transition-colors ${ev.status === 'accepted' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
                            ✓
                          </button>
                          <button onClick={() => ev.status === 'rejected' ? setEvidenceStatus(ev.id, 'pending') : (setRejectingEvId(ev.id), setRejectNote(''))}
                            title={ev.status === 'rejected' ? 'إلغاء الرفض' : 'رفض الدليل'}
                            className={`px-2 py-1.5 text-xs rounded-lg transition-colors ${ev.status === 'rejected' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}>
                            ✕
                          </button>
                        </span>
                      )}
                      {/* المملوك غير المعتمد: تعديل (المعتمد سجلّ موثّق يلزم إلغاء اعتماده أولاً) */}
                      {!isCompleted && !ev._shared && canManageEvidence && ev.status !== 'accepted' && (
                        <Link href={`/dashboard/tasks/${taskId}/evidence/${ev.id}/edit`}
                          className="px-2.5 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors">
                          ✏️
                        </Link>
                      )}
                      <a href={ev._shared ? `/dashboard/evidence/${ev.id}/print?task=${taskId}` : `/dashboard/evidence/${ev.id}/print`} target="_blank"
                        className="px-2.5 py-1.5 text-xs bg-violet-50 hover:bg-violet-100 text-violet-600 rounded-lg transition-colors">
                        🖨️
                      </a>
                      {/* المشترك: فك الارتباط فقط (لا يُحذف الدليل الأصلي) */}
                      {!isCompleted && ev._shared && canManageEvidence && (
                        <button onClick={() => unlinkEvidence(ev.id)}
                          className="px-2.5 py-1.5 text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg transition-colors" title="فك الارتباط">
                          🔗✕
                        </button>
                      )}
                      {/* المملوك غير المعتمد: حذف (المعتمد محميّ — يلزم إلغاء اعتماده أولاً) */}
                      {!isCompleted && !ev._shared && canManageEvidence && ev.status !== 'accepted' && (
                        deletingEvId === ev.id ? (
                          <span className="px-2.5 py-1.5 inline-flex"><Loader2 size={14} className="animate-spin text-red-500" /></span>
                        ) : confirmEvId === ev.id ? (
                          <span className="flex items-center gap-1">
                            <button onClick={() => deleteEvidence(ev.id)} disabled={!!deletingEvId}
                              className="px-2.5 py-1.5 text-xs bg-red-600 text-white rounded-lg font-medium disabled:opacity-50">تأكيد</button>
                            <button onClick={() => setConfirmEvId(null)}
                              className="px-2.5 py-1.5 text-xs border border-slate-200 text-slate-500 rounded-lg">إلغاء</button>
                          </span>
                        ) : (
                          <button onClick={() => setConfirmEvId(ev.id)} disabled={!!deletingEvId}
                            className="px-2.5 py-1.5 text-xs bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors disabled:opacity-50">🗑️</button>
                        )
                      )}
                    </div>
                  </div>

                  {/* شبكة الملفات */}
                  <div className="flex flex-wrap gap-2">
                    {files.map((f: any) => {
                      const isVid = f.file_type === 'video/youtube'
                      return (
                        <a key={f.id} href={isVid ? f.video_url : f.file_url} target="_blank" rel="noopener noreferrer"
                          title={f.name}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-colors max-w-[200px] ${
                            isVid ? 'border-red-100 bg-red-50/60 hover:bg-red-100 text-red-700'
                                  : 'border-slate-100 bg-slate-50 hover:bg-slate-100 text-slate-600'}`}>
                          {isVid && f.file_url ? (
                            <span className="relative w-8 h-6 rounded overflow-hidden flex-shrink-0 bg-slate-200">
                              <img src={f.file_url} alt="" className="w-full h-full object-cover" />
                              <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white text-[8px]">▶</span>
                            </span>
                          ) : (
                            <span className="flex-shrink-0">
                              {f.file_type?.startsWith('image') ? '🖼️' : f.file_type === 'application/pdf' ? '📄' : '📎'}
                            </span>
                          )}
                          <span className="truncate">{f.name || (isVid ? 'فيديو' : 'ملف')}</span>
                        </a>
                      )
                    })}
                  </div>

                  {/* رفض الدليل مع سبب اختياري */}
                  {rejectingEvId === ev.id && (
                    <div className="mt-2 flex items-center gap-2 bg-red-50/60 border border-red-100 rounded-lg p-2">
                      <input value={rejectNote} onChange={e => setRejectNote(e.target.value)}
                        placeholder="سبب الرفض (اختياري) — يصل لصاحب المهمة"
                        className="flex-1 px-3 py-1.5 rounded-lg border border-red-200 focus:outline-none focus:ring-2 focus:ring-red-300 bg-white text-sm" />
                      <button onClick={() => setEvidenceStatus(ev.id, 'rejected', rejectNote)}
                        className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg font-medium">تأكيد الرفض</button>
                      <button onClick={() => { setRejectingEvId(null); setRejectNote('') }}
                        className="px-3 py-1.5 text-xs border border-slate-200 text-slate-500 rounded-lg">إلغاء</button>
                    </div>
                  )}
                </div>
              )
            })}
            {!showAllEvidence && evidence.length > 3 && (
              <button onClick={() => setShowAllEvidence(true)} className="text-xs text-violet-600 hover:underline">
                عرض كل الأدلة ({evidence.length})
              </button>
            )}
          </div>
        ) : (
          <div className="text-center py-6">
            <Folder size={36} className="mx-auto mb-2" style={{ color: 'var(--maroon-300)' }} />
            <p className="text-sm text-slate-400">لا توجد أدلة مرفقة بعد</p>
          </div>
        )}

        {/* أدلة الإنجاز المطلوبة */}
        {task.evidence_required && (
          <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-xl">
            <p className="text-xs font-semibold text-blue-700 mb-1">📋 أدلة الإنجاز المطلوبة:</p>
            <p className="text-xs text-blue-600 leading-relaxed">{task.evidence_required}</p>
          </div>
        )}
      </div>

      {/* ══ تقييم جودة التنفيذ ══ */}
      <div id="rating-panel" className="bg-white rounded-2xl border shadow-sm p-5"
        style={{ borderColor: currentRating ? currentRating.border : '#e2e8f0' }}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <Star size={16} style={{ color: 'var(--maroon-600)' }} /> تقييم جودة التنفيذ
            {currentRating && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full border"
                style={{ background: currentRating.bg, color: currentRating.fg, borderColor: currentRating.border }}>
                {currentRating.stars} {currentRating.label}
              </span>
            )}
          </h2>

        </div>

        {/* معلومات المقيّم */}
        <div className="flex items-center gap-2 mb-4 text-xs text-slate-500">
          <span>المقيّم:</span>
          {reviewerProfile ? (
            <span className="font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
              🔍 {reviewerProfile.name_ar}
            </span>
          ) : (
            <span className="text-slate-400 italic">لم يُعيَّن مقيّم</span>
          )}
          {task.rated_at && (
            <span className="mr-auto text-slate-400">
              آخر تقييم: {new Date(task.rated_at).toLocaleDateString('ar-QA')}
            </span>
          )}
        </div>

        {/* عرض التقييم المحفوظ */}
        {task.rating && !editingRating && currentRating && (
          <div className="rounded-xl border p-4"
            style={{ background: currentRating.bg, borderColor: currentRating.border }}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl font-bold" style={{ color: currentRating.fg }}>{currentRating.stars}</span>
              <div>
                <p className="text-lg font-bold" style={{ color: currentRating.fg }}>{currentRating.label}</p>
                <p className="text-xs text-slate-500 font-mono">{task.rating}/5</p>
              </div>
            </div>
            {task.rating_note && (
              <p className="text-sm text-slate-600 mt-2 border-t border-slate-200 pt-2 leading-relaxed">
                {task.rating_note}
              </p>
            )}
          </div>
        )}

        {/* لوحة المقيّم — تظهر عند رفع المهمة للتقييم */}
        {canRate && status === 'submitted' && (
          <div className="space-y-4">
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
              المهمة مرفوعة للتقييم. راجع الأدلة والتعليقات، ثم <strong>اعتمدها مع تقييم الجودة</strong>، أو <strong>أعدها للتعديل</strong> مع بيان السبب.
            </p>

            {/* أزرار التقدير الخماسي */}
            <div>
              <p className="text-xs font-medium text-slate-600 mb-2">تقييم جودة التنفيذ:</p>
              <div className="grid grid-cols-5 gap-2">
                {([5,4,3,2,1] as RatingValue[]).map(val => {
                  const info = RATING_INFO[val]
                  const isSelected = ratingValue === val
                  return (
                    <button key={val} type="button" onClick={() => setRatingValue(val)}
                      className={`flex flex-col items-center gap-1 py-3 px-1 rounded-xl text-xs font-bold transition-all border-2 ${isSelected ? info.btn : ''}`}
                      style={isSelected
                        ? { background: info.bg, color: info.fg, borderColor: info.border }
                        : { background: '#fff', color: '#64748b', borderColor: '#e2e8f0' }}>
                      <span className="font-mono text-base">{info.stars.slice(0,val)}</span>
                      <span>{info.label}</span>
                      <span className="opacity-60 font-mono">{val}/5</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ملاحظة الاعتماد */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">ملاحظة الاعتماد <span className="text-slate-400 font-normal">(اختياري)</span></label>
              <textarea value={ratingNote} onChange={e => setRatingNote(e.target.value.slice(0, 500))} rows={2} maxLength={500}
                placeholder="ملاحظاتك حول جودة التنفيذ..."
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-slate-50 text-slate-800 resize-none text-sm" />
            </div>

            {wfError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-xl text-sm">{wfError}</div>}

            {/* اعتماد */}
            <button onClick={() => doTransition('approve', { rating: ratingValue, note: ratingNote })}
              disabled={transitioning || !ratingValue}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-white font-semibold rounded-xl text-sm disabled:opacity-50 hover:brightness-110"
              style={{ background: 'var(--gradient-button)' }}>
              <span className="inline-flex">{transitioning ? <Loader2 size={16} className="animate-spin" /> : <CircleCheckBig size={16} />}</span>
              اعتماد المهمة (إنجاز)
            </button>

            {/* إعادة للتعديل */}
            {!showReturn ? (
              <button onClick={() => setShowReturn(true)} disabled={transitioning}
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-orange-200 text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-xl text-sm font-medium disabled:opacity-50">
                <Undo2 size={16} /> إعادة للتعديل
              </button>
            ) : (
              <div className="space-y-2 border border-orange-200 rounded-xl p-3 bg-orange-50/50">
                <textarea value={returnNote} onChange={e => setReturnNote(e.target.value.slice(0, 500))} rows={2}
                  placeholder="سبب الإعادة (إلزامي)..."
                  className="w-full px-3 py-2 rounded-lg border border-orange-200 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white text-sm" />
                <div className="flex gap-2">
                  <button onClick={() => doTransition('return', { note: returnNote })} disabled={transitioning || !returnNote.trim()}
                    className="flex-1 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50">إعادة المهمة</button>
                  <button onClick={() => { setShowReturn(false); setReturnNote('') }} className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm">إلغاء</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* حالات أخرى للمقيّم/غيره */}
        {canRate && status !== 'submitted' && !task.rating && (
          <div className="text-center py-4 text-slate-400">
            <Clock size={24} className="mx-auto mb-1" style={{ color: 'var(--maroon-300)' }} />
            <p className="text-sm">لم تُرفَع المهمة للتقييم بعد.</p>
          </div>
        )}
        {!canRate && !task.rating && (
          <div className="text-center py-4 text-slate-400">
            <Lock size={24} className="mx-auto mb-1" style={{ color: 'var(--maroon-300)' }} />
            <p className="text-sm">لم يتم التقييم بعد — بانتظار المقيّم المعيّن</p>
          </div>
        )}
      </div>

      {/* ══ Comments ══ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
          <MessageCircle size={18} style={{ color: 'var(--maroon-600)' }} /> التعليقات
          <span className="text-xs font-normal text-slate-400">({comments.length})</span>
        </h2>

        {(showAllComments ? comments : comments.slice(0, 3)).map((c: any) => (
          <div key={c.id} className="flex gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
              {(c.profiles?.full_name_ar || '؟')[0]}
            </div>
            <div className="flex-1 bg-slate-50 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">{c.profiles?.full_name_ar || 'مستخدم'}</span>
                  <span className="text-xs text-slate-400">{new Date(c.created_at).toLocaleDateString('ar-QA')}</span>
                </div>
                {c.profiles?.id === userId && editingCmtId !== c.id && (
                  <div className="flex gap-1">
                    <button onClick={() => { setEditingCmtId(c.id); setEditCmtText(c.content) }}
                      aria-label="تعديل التعليق"
                      className="text-slate-400 hover:text-violet-600 p-1 rounded transition-colors"><Pencil size={13} /></button>
                    <button onClick={() => deleteComment(c.id)}
                      aria-label="حذف التعليق"
                      className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors"><Trash2 size={13} /></button>
                  </div>
                )}
              </div>
              {editingCmtId === c.id ? (
                <div className="space-y-2 mt-1">
                  <textarea value={editCmtText} onChange={e => setEditCmtText(e.target.value)} rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-400 text-sm resize-none bg-white" />
                  <div className="flex gap-2">
                    <button onClick={() => saveCommentEdit(c.id)} disabled={savingCmt}
                      className="px-3 py-1.5 bg-violet-600 text-white text-xs rounded-lg font-medium disabled:opacity-50">
                      {savingCmt ? '...' : 'حفظ'}
                    </button>
                    <button onClick={() => setEditingCmtId(null)}
                      className="px-3 py-1.5 border border-slate-200 text-slate-500 text-xs rounded-lg">إلغاء</button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-700 leading-relaxed">{renderWithMentions(c.content)}</p>
              )}
            </div>
          </div>
        ))}

        {!showAllComments && comments.length > 3 && (
          <button onClick={() => setShowAllComments(true)} className="text-xs text-violet-600 hover:underline mb-3">
            عرض كل التعليقات ({comments.length})
          </button>
        )}

        <form onSubmit={sendComment} className="space-y-2 mt-2">
          <MentionInput
            value={comment}
            onChange={setComment}
            users={profiles}
            rows={3}
            placeholder="اكتب تعليقاً... استخدم @ لذكر مستخدم"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-slate-50 text-slate-800 resize-none text-sm"
          />
          <button type="submit" disabled={sendingCmt || !comment.trim()}
            className="inline-flex items-center gap-1.5 px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
            <MessageCircle size={14} /> {sendingCmt ? 'جارٍ الإرسال...' : 'إرسال التعليق'}
          </button>
        </form>
      </div>

      </div>

      {/* ── الشريط الجانبي ── */}
      <div className="space-y-5">

      {/* ══ التبعية بين المهام ══ */}
      {(task.depends_on_task_id || canManageTasks) && (
        <div className={`bg-white rounded-2xl border shadow-sm p-5 ${
          dependsOnTask && dependsOnTask.status !== 'completed'
            ? 'border-orange-200 bg-orange-50/30'
            : 'border-slate-200'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-slate-800">🔗 التبعية</h2>
            {canManageTasks && !isCompleted && (
              <button
                onClick={() => { setNewDependsId(task.depends_on_task_id || ''); setEditingDepends(!editingDepends) }}
                className="text-sm text-violet-600 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-xl transition-colors">
                {editingDepends ? '✕ إلغاء' : '✏️ تعديل'}
              </button>
            )}
          </div>

          {!editingDepends ? (
            dependsOnTask ? (
              <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${
                dependsOnTask.status === 'completed'
                  ? 'bg-green-50 border-green-200'
                  : 'bg-orange-50 border-orange-200'
              }`}>
                <span className="text-2xl flex-shrink-0">
                  {dependsOnTask.status === 'completed' ? '✅' :
                   dependsOnTask.status === 'in_progress' ? '🔄' :
                   dependsOnTask.status === 'delayed' ? '⚠️' : '🔒'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{dependsOnTask.name_ar}</p>
                  <p className={`text-xs mt-0.5 font-medium ${
                    dependsOnTask.status === 'completed' ? 'text-violet-700' : 'text-orange-600'
                  }`}>
                    {dependsOnTask.status === 'completed'
                      ? '✓ اكتملت — هذه المهمة متاحة للبدء'
                      : 'هذه المهمة محجوبة حتى تكتمل المهمة أعلاه'}
                  </p>
                </div>
                <a href={`/dashboard/tasks/${dependsOnTask.id}`}
                  className="text-xs text-violet-600 hover:underline flex-shrink-0 bg-violet-50 px-2 py-1 rounded-lg border border-violet-200">
                  عرض ←
                </a>
              </div>
            ) : (
              <p className="text-sm text-slate-400">لا تبعية — يمكن بدء هذه المهمة في أي وقت</p>
            )
          ) : (
            <div className="space-y-3">
              <select
                value={newDependsId}
                onChange={e => setNewDependsId(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-slate-800 text-sm">
                <option value="">— لا تبعية —</option>
                {siblingTasks.map((t: any) => {
                  const icon =
                    t.status === 'completed'   ? '✅' :
                    t.status === 'in_progress' ? '🔄' :
                    t.status === 'delayed'     ? '⚠️' : '⏳'
                  return <option key={t.id} value={t.id}>{icon} {t.name_ar}</option>
                })}
              </select>
              {newDependsId && newDependsId !== task.depends_on_task_id && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700">
                  <span>⚠️</span>
                  <span>ستظهر هذه المهمة بحالة محجوبة حتى تكتمل المهمة المختارة</span>
                </div>
              )}
              <button
                onClick={saveDepends}
                disabled={savingDepends}
                className="w-full py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors disabled:opacity-60">
                {savingDepends ? 'جارٍ الحفظ...' : '💾 حفظ التبعية'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══ التكليف والمقيّم ══ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-slate-800">👥 التكليف والمقيّم</h2>
          {canManageTasks && !isCompleted && (
            <button onClick={() => setShowAssign(!showAssign)}
              className="text-sm text-violet-600 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-xl transition-colors">
              {showAssign ? '✕ إلغاء' : '✏️ تعديل'}
            </button>
          )}
        </div>

        {(!showAssign || !canManageTasks) ? (
          <div className="flex flex-wrap gap-3">
            {/* المكلف */}
            {task.assigned_to_user_id ? (() => {
              const p = profiles.find((x: any) => x.id === task.assigned_to_user_id)
              return p ? (
                <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {p.name_ar?.[0]}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-violet-800">{p.name_ar}</p>
                    <p className="text-xs text-violet-500">{p.job_title || 'المكلَّف'}</p>
                  </div>
                </div>
              ) : null
            })() : (
              <p className="text-sm text-slate-400">لم يُكلَّف أحد بعد</p>
            )}

            {/* الفريق */}
            {task.assigned_to_team_id && (() => {
              const t = teams.find((x: any) => x.id === task.assigned_to_team_id)
              return t ? (
                <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-white"
                  style={{ backgroundColor: t.color || '#7c3aed' }}>
                  <span className="text-lg">👥</span>
                  <div>
                    <p className="text-sm font-semibold">{t.name_ar}</p>
                    <p className="text-xs opacity-75">فريق مكلَّف</p>
                  </div>
                </div>
              ) : null
            })()}

            {/* القسم المكلَّف (كل أعضائه) */}
            {task.assigned_to_department && (
              <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2">
                <span className="text-lg">🏷️</span>
                <div>
                  <p className="text-sm font-semibold text-violet-800">{task.assigned_to_department}</p>
                  <p className="text-xs text-violet-500">قسم مكلَّف — كل الأعضاء</p>
                </div>
              </div>
            )}

            {/* المقيّم */}
            {reviewerProfile ? (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {reviewerProfile.name_ar?.[0]}
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-800">{reviewerProfile.name_ar}</p>
                  <p className="text-xs text-amber-600">🔍 مقيّم الجودة</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400 flex items-center gap-1">🔍 <span>لم يُعيَّن مقيّم بعد</span></p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">المسؤول (شخص)</label>
              {/* تصفية بقسم خطة المهمة — تمنع ظهور غير المعنيين */}
              {planDept && (
                <div className="flex gap-2 mb-1.5">
                  <button type="button" onClick={() => setDeptOnly(true)}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${deptOnly ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}>
                    أعضاء قسم «{planDept}» ({profiles.filter((p: any) => p.department === planDept).length})
                  </button>
                  <button type="button" onClick={() => setDeptOnly(false)}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${!deptOnly ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}>
                    كل المستخدمين
                  </button>
                </div>
              )}
              {(() => {
                const people = (deptOnly && planDept)
                  ? profiles.filter((p: any) => p.department === planDept || p.id === assignUserId)
                  : profiles
                return (
                  <select value={assignUserId} onChange={e => setAssignUserId(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-slate-50 text-sm">
                    <option value="">— بدون تكليف شخصي —</option>
                    {people.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name_ar}{p.job_title ? ` — ${p.job_title}` : ''}</option>
                    ))}
                  </select>
                )
              })()}
              {deptOnly && planDept && profiles.filter((p: any) => p.department === planDept).length === 0 && (
                <p className="text-xs text-amber-600 mt-1.5">لا أعضاء في قسم «{planDept}» — اضممهم من الإعدادات ← أعضاء الأقسام، أو اختر «كل المستخدمين».</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">الفريق المكلَّف</label>
              <select value={assignTeamId} onChange={e => setAssignTeamId(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-slate-50 text-sm">
                <option value="">— بدون تكليف فريق —</option>
                {teams.map((t: any) => {
                  const leader = profiles.find((p: any) => p.id === t.leader_id)
                  return (
                    <option key={t.id} value={t.id}>
                      {t.name_ar}{leader ? ` (القائد: ${leader.name_ar})` : ''}
                    </option>
                  )
                })}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">القسم المكلَّف (كل أعضائه)</label>
              <select value={assignDept} onChange={e => setAssignDept(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-slate-50 text-sm">
                <option value="">— بدون تكليف قسم —</option>
                {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">🔍 مقيّم جودة التنفيذ</label>
              <select value={assignReviewer} onChange={e => setAssignReviewer(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-amber-50 text-sm">
                <option value="">— بدون مقيّم محدد —</option>
                {profiles.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name_ar}{p.job_title ? ` — ${p.job_title}` : ''}</option>
                ))}
              </select>
            </div>
            <button onClick={saveAssignment} disabled={savingAssign}
              className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl text-sm disabled:opacity-50 transition-colors">
              {savingAssign ? 'جارٍ الحفظ...' : '💾 حفظ'}
            </button>
          </div>
        )}
      </div>

      {/* ══ الأماكن المطلوبة ══ */}
      {(() => {
        const taskLocs = (task.task_locations || [])
        if (taskLocs.length === 0 && (!canManageTasks || isCompleted)) return null
        return (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-slate-800">📍 الأماكن المطلوبة</h2>
              {canManageTasks && !isCompleted && (
                <button onClick={() => editingLoc ? setEditingLoc(false) : openLocEditor()}
                  className="text-sm text-violet-600 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-xl transition-colors">
                  {editingLoc ? '✕ إلغاء' : '✏️ تعديل'}
                </button>
              )}
            </div>

            {!editingLoc ? (
              taskLocs.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {taskLocs.map((tl: any) => (
                    <span key={tl.location_id} className="px-3 py-1.5 rounded-xl text-sm bg-violet-50 text-violet-700 border border-violet-200">
                      📍 {tl.school_locations?.name_ar || '—'}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">لا مكان محدد لهذه المهمة</p>
              )
            ) : (
              <div className="space-y-3">
                {availLocations.length === 0 ? (
                  <p className="text-sm text-slate-400">لا توجد أماكن مُعرّفة — أضفها من الإعدادات ← الأماكن</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {availLocations.map((loc: any) => {
                      const on = selLocs.includes(loc.id)
                      return (
                        <button key={loc.id} type="button"
                          onClick={() => setSelLocs(prev => on ? prev.filter(x => x !== loc.id) : [...prev, loc.id])}
                          className={`px-3 py-1.5 rounded-xl text-sm border transition-colors ${
                            on ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}>
                          📍 {loc.name_ar}
                        </button>
                      )
                    })}
                  </div>
                )}
                <button onClick={saveLocations} disabled={savingLoc}
                  className="w-full py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors disabled:opacity-60">
                  {savingLoc ? 'جارٍ الحفظ...' : '💾 حفظ الأماكن'}
                </button>
              </div>
            )}
          </div>
        )
      })()}

      {/* ══ Subtasks ══ */}
      <Subtasks
        taskId={taskId}
        userId={userId}
        users={profiles.map((p: any) => ({ id: p.id, name_ar: p.name_ar }))}
        canEdit={canManageTasks && !isCompleted}
      />

      {/* ══ سجل سير العمل (قابل للطي) ══ */}
      {transitions.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <button onClick={() => setTransOpen(v => !v)} className="w-full flex items-center gap-2 text-right">
            <History size={16} style={{ color: 'var(--maroon-600)' }} />
            <span className="font-bold text-slate-800 text-sm">سجل سير العمل</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 font-semibold">{transitions.length}</span>
            <span className={`mr-auto text-slate-400 transition-transform ${transOpen ? 'rotate-180' : ''}`}><ChevronDown size={16} /></span>
          </button>
          {!transOpen && transitions[0] && (
            <p className="text-xs text-slate-400 mt-2">
              آخر حدث: {transitions[0].from_status === 'completed' && transitions[0].to_status === 'in_progress' ? 'إعادة فتح' : (TRANSITION_LABEL[transitions[0].to_status] || transitions[0].to_status)} · {new Date(transitions[0].created_at).toLocaleDateString('ar-QA')}
            </p>
          )}
          {transOpen && (
            <div className="space-y-3 mt-4">
              {(transAll ? transitions : transitions.slice(0, 3)).map(tr => {
                const actor = profiles.find((p: any) => p.id === tr.actor_id)
                const meta = STATUS_META[tr.to_status]
                return (
                  <div key={tr.id} className="flex items-start gap-3">
                    <span className="mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: meta?.hex || '#94a3b8' }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-700">
                          {tr.from_status === 'completed' && tr.to_status === 'in_progress'
                            ? 'إعادة فتح'
                            : (TRANSITION_LABEL[tr.to_status] || tr.to_status)}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: meta?.bg, color: meta?.fg }}>{meta?.ar || tr.to_status}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {(actor as any)?.name_ar || '—'} · {new Date(tr.created_at).toLocaleString('ar-QA')}
                      </p>
                      {tr.note && (
                        <p className="text-sm text-slate-600 mt-1 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 break-words">
                          {tr.note}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
              {!transAll && transitions.length > 3 && (
                <button onClick={() => setTransAll(true)} className="text-xs text-violet-600 hover:underline">
                  عرض كل الأحداث ({transitions.length})
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ Danger Zone — للمدير أو منشئ المهمة فقط (لا المكلّف)، وتُخفى للمهمة المنجزة (أعد فتحها أولاً) ══ */}
      {(canManageTasks || task.created_by === userId) && !isCompleted && (
      <div className="bg-white rounded-2xl border border-red-100 p-5">
        <p className="text-sm font-semibold text-slate-700 mb-2">منطقة الخطر</p>
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">حذف هذه المهمة وجميع بياناتها نهائياً</p>
          {confirmDel ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">هل أنت متأكد؟</span>
              <button onClick={deleteTask} disabled={deleting}
                className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg font-medium disabled:opacity-50">
                {deleting ? 'جارٍ الحذف...' : 'نعم، احذف'}
              </button>
              <button onClick={() => setConfirmDel(false)}
                className="px-3 py-1.5 border border-slate-200 text-slate-600 text-xs rounded-lg">إلغاء</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDel(true)}
              className="px-4 py-2 border border-red-200 text-red-600 text-sm rounded-xl hover:bg-red-50 transition-colors">
              🗑️ حذف المهمة
            </button>
          )}
        </div>
      </div>
      )}

      </div>

      </div>
    </div>
  )
}

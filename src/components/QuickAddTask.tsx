'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/lib/PermissionsContext'
import { Plus, X, ChevronLeft } from 'lucide-react'
import { toast } from '@/components/Toast'
import { logActivity } from '@/lib/activity'

/**
 * Quick Add Task — زر عائم لإنشاء مهمة سريعة من أي صفحة
 * يُشغَّل بالضغط على الزر أو بالاختصار N
 */
export default function QuickAddTask() {
  const supabase = createClient()
  const router   = useRouter()
  const { userId, can } = usePermissions()
  const inputRef  = useRef<HTMLInputElement>(null)

  const [open,    setOpen]    = useState(false)
  const [name,    setName]    = useState('')
  const [planId,  setPlanId]  = useState('')
  const [nodeId,  setNodeId]  = useState('')
  const [endDate, setEndDate] = useState('')
  const [saving,  setSaving]  = useState(false)
  const [plans,   setPlans]   = useState<{ id: string; name_ar: string }[]>([])
  const [nodes,   setNodes]   = useState<{ id: string; name_ar: string; level_num: number }[]>([])

  /* ── اختصار لوحة المفاتيح: N ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'n' || e.key === 'N') {
        const active = document.activeElement
        const isInput = active instanceof HTMLInputElement ||
                        active instanceof HTMLTextAreaElement ||
                        active instanceof HTMLSelectElement
        if (!isInput) {
          e.preventDefault()
          setOpen(true)
        }
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  /* ── تركيز تلقائي عند الفتح ── */
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      loadPlans()
    } else {
      setName(''); setPlanId(''); setNodeId(''); setEndDate('')
    }
  }, [open])

  /* ── تحميل الخطط ── */
  const loadPlans = async () => {
    const { data } = await supabase
      .from('plans').select('id, name_ar')
      .eq('is_archived', false).limit(50).order('created_at', { ascending: false })
    setPlans(data || [])
  }

  /* ── تحميل العقد عند اختيار خطة ── */
  useEffect(() => {
    if (!planId) { setNodes([]); setNodeId(''); return }
    ;(async () => {
      const { data } = await supabase
        .from('plan_nodes').select('id, name_ar, level_num')
        .eq('plan_id', planId).order('order_num').limit(100)
      setNodes(data || [])
    })()
  }, [planId])

  /* ── حفظ المهمة ── */
  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    const { error } = await supabase.from('tasks').insert({
      name_ar:             name.trim(),
      status:              'not_started',
      priority:            'medium',
      task_type:           'general',
      node_id:             nodeId || null,
      end_date:            endDate || null,
      assigned_to_user_id: userId || null,
      created_by:          userId || null,
      order_num:           1,
    })
    setSaving(false)
    if (error) { toast('حدث خطأ أثناء الإنشاء', 'error'); return }
    toast(`✓ تم إنشاء "${name.trim()}"`)
    logActivity({
      action:    'task_created',
      tableName: 'tasks',
      summary:   name.trim(),
    })
    setOpen(false)
  }

  /* ── فتح صفحة الإنشاء الكاملة ── */
  const handleFullForm = () => {
    setOpen(false)
    router.push(`/dashboard/tasks/new${planId ? `?planId=${planId}` : ''}`)
  }

  if (!can('manage_tasks') && !can('view_tasks')) return null

  return (
    <>
      {/* ── الزر العائم ── */}
      <button
        onClick={() => setOpen(true)}
        aria-label="إضافة مهمة جديدة (N)"
        className="fixed bottom-6 left-6 z-40 w-14 h-14 rounded-full text-white shadow-xl
                   flex items-center justify-center transition-all hover:scale-110 hover:shadow-2xl"
        style={{ background: 'var(--gradient-brand)' }}>
        <Plus size={24} />
      </button>

      {/* ── الـ Modal ── */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4"
            dir="rtl" onClick={e => e.stopPropagation()}>

            {/* رأس */}
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800">إضافة مهمة سريعة</h3>
              <button onClick={() => setOpen(false)}
                aria-label="إغلاق"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>

            {/* اسم المهمة */}
            <input
              ref={inputRef}
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="اسم المهمة..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm
                         focus:outline-none focus:ring-2 focus:ring-violet-300"
            />

            {/* الخطة والعقدة */}
            <div className="grid grid-cols-2 gap-3">
              <select value={planId} onChange={e => setPlanId(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm
                           focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white">
                <option value="">اختر خطة...</option>
                {plans.map(p => <option key={p.id} value={p.id}>{p.name_ar}</option>)}
              </select>

              <select value={nodeId} onChange={e => setNodeId(e.target.value)}
                disabled={!planId}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm
                           focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white
                           disabled:opacity-50">
                <option value="">المستوى...</option>
                {nodes.map(n => (
                  <option key={n.id} value={n.id}>
                    {'— '.repeat(n.level_num - 1)}{n.name_ar}
                  </option>
                ))}
              </select>
            </div>

            {/* الموعد النهائي */}
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm
                         focus:outline-none focus:ring-2 focus:ring-violet-300"
              style={{ direction: 'ltr' }}
            />

            {/* الأزرار */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={!name.trim() || saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white
                           disabled:opacity-50 transition-all hover:brightness-110"
                style={{ background: 'var(--gradient-button)' }}>
                {saving ? 'جارٍ الإنشاء...' : '+ إضافة'}
              </button>
              <button
                onClick={handleFullForm}
                className="flex items-center gap-1 px-4 py-2.5 rounded-xl text-sm
                           border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                تفاصيل أكثر <ChevronLeft size={14} />
              </button>
            </div>

            <p className="text-center text-[10px] text-slate-400">
              Enter للإضافة · Esc للإغلاق · N لفتح من أي صفحة
            </p>
          </div>
        </div>
      )}
    </>
  )
}

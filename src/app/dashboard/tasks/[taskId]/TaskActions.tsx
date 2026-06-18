'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { createNotification } from '@/lib/notifications'
import { Check } from 'lucide-react'
import ConfirmDialog from '@/components/ConfirmDialog'

type Status = 'not_started' | 'in_progress' | 'completed' | 'delayed'

const STATUSES: { value: Status; label: string; color: string; bg: string }[] = [
  { value: 'not_started', label: 'لم تبدأ',  color: 'text-slate-600',  bg: 'bg-slate-100  hover:bg-slate-200  border-slate-200'  },
  { value: 'in_progress', label: 'جارية',    color: 'text-violet-700', bg: 'bg-violet-50  hover:bg-violet-100 border-violet-200' },
  { value: 'completed',   label: 'منجزة',    color: 'text-violet-900', bg: 'bg-violet-100 hover:bg-violet-200 border-violet-300' },
  { value: 'delayed',     label: 'متأخرة',   color: 'text-red-700',    bg: 'bg-red-50     hover:bg-red-100    border-red-200'    },
]

export function StatusButtons({ taskId, currentStatus }: { taskId: string; currentStatus: string }) {
  const [status, setStatus] = useState<Status>(currentStatus as Status)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const STATUS_LABELS: Record<string, string> = {
    not_started: 'لم تبدأ', in_progress: 'جارية', completed: 'منجزة', delayed: 'متأخرة',
  }

  const updateStatus = async (newStatus: Status) => {
    if (newStatus === status) return
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()

    /* تحديث الحالة */
    await supabase.from('tasks').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', taskId)
    setStatus(newStatus)

    /* إشعار المكلّف والمقيّم (عدا من غيّر الحالة) */
    const { data: task } = await supabase
      .from('tasks').select('name_ar, assigned_to_user_id, reviewer_id').eq('id', taskId).single()

    if (task && user) {
      const link = `/dashboard/tasks/${taskId}`

      /* عند الاكتمال: رسالة خاصة للمراجع تطلب التقييم */
      if (newStatus === 'completed' && task.reviewer_id && task.reviewer_id !== user.id) {
        await createNotification({
          recipientId: task.reviewer_id,
          senderId:    user.id,
          type:        'task_status_changed',
          title:       `مهمة بانتظار تقييمك: ${task.name_ar}`,
          body:        'اكتملت المهمة — يُرجى مراجعتها وتقييمها',
          link,
        })
      }

      /* إشعار عام بتغيير الحالة لباقي المعنيين */
      const notifTitle = `تحديث حالة المهمة: ${task.name_ar}`
      const notifBody  = `الحالة الجديدة: ${STATUS_LABELS[newStatus] || newStatus}`
      const targets    = [task.assigned_to_user_id, task.reviewer_id]
        .filter((id): id is string => !!id && id !== user.id)
        /* لا تُكرّر إشعار المراجع عند الاكتمال (أُشعر أعلاه) */
        .filter(id => !(newStatus === 'completed' && id === task.reviewer_id))

      for (const recipientId of targets) {
        await createNotification({ recipientId, senderId: user.id, type: 'task_status_changed', title: notifTitle, body: notifBody, link })
      }
    }

    setSaving(false)
    router.refresh()
  }

  return (
    <div className="flex flex-wrap gap-2">
      {STATUSES.map(s => (
        <button
          key={s.value}
          onClick={() => updateStatus(s.value)}
          disabled={saving}
          className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${s.bg} ${s.color}
            ${status === s.value ? 'ring-2 ring-offset-1 ring-current shadow-sm scale-105' : 'opacity-80'}
            disabled:opacity-50`}>
          {status === s.value && <Check size={13} className="inline ml-1" />}{s.label}
        </button>
      ))}
    </div>
  )
}

export function AddCommentForm({ taskId, userName }: { taskId: string; userName: string }) {
  const [content, setContent]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [comments, setComments] = useState<{ id: string; content: string; author: string; time: string }[]>([])
  const router  = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('task_comments')
      .insert({ task_id: taskId, author_id: user.id, content: content.trim() })
      .select('id, content, created_at')
      .single()

    if (data) {
      setComments(prev => [
        { id: data.id, content: data.content, author: userName, time: data.created_at },
        ...prev,
      ])
    }

    /* إشعار المكلّف والمقيّم بالتعليق الجديد — عدا كاتب التعليق نفسه */
    const { data: task } = await supabase
      .from('tasks').select('name_ar, assigned_to_user_id, reviewer_id').eq('id', taskId).single()

    if (task) {
      const notifTitle = `💬 تعليق جديد على مهمة: ${task.name_ar}`
      const notifBody  = content.trim().slice(0, 120)
      const link       = `/dashboard/tasks/${taskId}`
      const targets    = [task.assigned_to_user_id, task.reviewer_id]
        .filter((id): id is string => !!id && id !== user.id)

      for (const recipientId of targets) {
        await createNotification({ recipientId, senderId: user.id, type: 'task_comment', title: notifTitle, body: notifBody, link })
      }
    }

    setContent('')
    setLoading(false)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        rows={3}
        placeholder="اكتب تعليقاً..."
        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-slate-50 text-slate-800 resize-none text-sm"
      />
      {comments.map(c => (
        <div key={c.id} className="p-3 bg-violet-50 rounded-xl border border-violet-100 text-sm">
          <p className="text-slate-700">{c.content}</p>
          <p className="text-xs text-slate-400 mt-1">{c.author}</p>
        </div>
      ))}
      <button
        type="submit"
        disabled={loading || !content.trim()}
        className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
        {loading ? 'جارٍ الإرسال...' : 'إرسال التعليق'}
      </button>
    </form>
  )
}

export function DeleteTaskButton({ taskId }: { taskId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading]       = useState(false)
  const router  = useRouter()
  const supabase = createClient()

  const handleDelete = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('tasks').update({
      deleted_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    }).eq('id', taskId)
    router.push('/dashboard/tasks')
  }

  return (
    <>
      <button onClick={() => setConfirming(true)}
        className="px-4 py-2 border border-red-200 text-red-600 text-sm rounded-xl hover:bg-red-50 transition-colors">
        🗑️ حذف المهمة
      </button>
      <ConfirmDialog
        open={confirming}
        title="حذف المهمة"
        loading={loading}
        message="سيتم حذف هذه المهمة نهائياً مع أدلتها وسجلّها."
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
      />
    </>
  )
}

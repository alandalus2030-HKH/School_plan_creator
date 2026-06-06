'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Subtask } from '@/lib/types'
import { Plus, Trash2, ListChecks, Check } from 'lucide-react'

type MiniUser = { id: string; name_ar: string }

interface SubtasksProps {
  taskId:   string
  userId:   string
  users:    MiniUser[]
  canEdit:  boolean
}

export default function Subtasks({ taskId, userId, users, canEdit }: SubtasksProps) {
  const supabase = createClient()
  const [items,   setItems]   = useState<Subtask[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [adding,  setAdding]  = useState(false)

  const load = async () => {
    const { data } = await supabase
      .from('subtasks').select('*')
      .eq('task_id', taskId).order('order_num').order('created_at')
    setItems((data as Subtask[]) || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [taskId])

  const addItem = async () => {
    if (!newName.trim() || adding) return
    setAdding(true)
    const { data } = await supabase.from('subtasks').insert({
      task_id:    taskId,
      name_ar:    newName.trim(),
      created_by: userId || null,
      order_num:  items.length + 1,
    }).select('*').single()
    if (data) setItems(prev => [...prev, data as Subtask])
    setNewName('')
    setAdding(false)
  }

  const toggle = async (st: Subtask) => {
    setItems(prev => prev.map(s => s.id === st.id ? { ...s, is_done: !s.is_done } : s))
    await supabase.from('subtasks').update({ is_done: !st.is_done }).eq('id', st.id)
  }

  const remove = async (id: string) => {
    setItems(prev => prev.filter(s => s.id !== id))
    await supabase.from('subtasks').delete().eq('id', id)
  }

  const setAssignee = async (id: string, assignee: string) => {
    setItems(prev => prev.map(s => s.id === id ? { ...s, assignee_id: assignee || null } : s))
    await supabase.from('subtasks').update({ assignee_id: assignee || null }).eq('id', id)
  }

  const setDue = async (id: string, date: string) => {
    setItems(prev => prev.map(s => s.id === id ? { ...s, due_date: date || null } : s))
    await supabase.from('subtasks').update({ due_date: date || null }).eq('id', id)
  }

  const done  = items.filter(s => s.is_done).length
  const total = items.length
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      {/* رأس + تقدم */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-slate-800 flex items-center gap-2">
          <ListChecks size={18} style={{ color: 'var(--maroon-600)' }} />
          الخطوات الفرعية
          {total > 0 && (
            <span className="text-xs font-normal text-slate-400">({done}/{total})</span>
          )}
        </h2>
        {total > 0 && (
          <span className="text-sm font-bold" style={{ color: 'var(--maroon-600)' }}>{pct}%</span>
        )}
      </div>

      {/* شريط التقدم */}
      {total > 0 && (
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-4">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: 'var(--gradient-button)' }} />
        </div>
      )}

      {/* القائمة */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="h-9 bg-slate-100 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map(st => {
            const overdue = st.due_date && !st.is_done && st.due_date < new Date().toISOString().split('T')[0]
            return (
              <div key={st.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors group">
                {/* checkbox */}
                <button onClick={() => canEdit && toggle(st)}
                  disabled={!canEdit}
                  aria-label={st.is_done ? 'إلغاء الإنجاز' : 'تحديد كمنجز'}
                  className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-all
                    ${st.is_done
                      ? 'bg-violet-600 border-violet-600 text-white'
                      : 'border-slate-300 hover:border-violet-400'}`}>
                  {st.is_done && <Check size={13} />}
                </button>

                {/* الاسم */}
                <span className={`flex-1 text-sm ${st.is_done ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                  {st.name_ar}
                </span>

                {/* المكلَّف */}
                {canEdit ? (
                  <select value={st.assignee_id || ''} onChange={e => setAssignee(st.id, e.target.value)}
                    className="text-[11px] border border-slate-200 rounded-lg px-1.5 py-0.5 bg-white text-slate-500
                               opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity max-w-[90px]">
                    <option value="">— مكلَّف</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name_ar}</option>)}
                  </select>
                ) : st.assignee_id && (
                  <span className="text-[11px] text-slate-400">
                    {users.find(u => u.id === st.assignee_id)?.name_ar}
                  </span>
                )}

                {/* الموعد */}
                {canEdit ? (
                  <input type="date" value={st.due_date || ''} onChange={e => setDue(st.id, e.target.value)}
                    className={`text-[11px] border border-slate-200 rounded-lg px-1.5 py-0.5 bg-white
                               opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity
                               ${overdue ? 'text-red-600 border-red-200' : 'text-slate-500'}`}
                    style={{ direction: 'ltr' }} />
                ) : st.due_date && (
                  <span className={`text-[11px] ${overdue ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>
                    {new Date(st.due_date).toLocaleDateString('ar-QA')}
                  </span>
                )}

                {/* حذف */}
                {canEdit && (
                  <button onClick={() => remove(st.id)}
                    aria-label="حذف الخطوة"
                    className="text-slate-300 hover:text-red-500 p-0.5 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            )
          })}

          {total === 0 && !canEdit && (
            <p className="text-sm text-slate-400 text-center py-3">لا توجد خطوات فرعية</p>
          )}
        </div>
      )}

      {/* إضافة خطوة */}
      {canEdit && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addItem()}
            placeholder="أضف خطوة فرعية..."
            className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm
                       focus:outline-none focus:ring-2 focus:ring-violet-300" />
          <button onClick={addItem} disabled={!newName.trim() || adding}
            className="px-3 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-all hover:brightness-110 flex items-center gap-1"
            style={{ background: 'var(--gradient-button)' }}>
            <Plus size={15} /> إضافة
          </button>
        </div>
      )}
    </div>
  )
}

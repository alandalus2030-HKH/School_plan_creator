'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

/* ─── إضافة هدف عام داخل مبادرة ─── */
export function AddGeneralObjective({ initiativeId }: { initiativeId: string }) {
  const [open,    setOpen]    = useState(false)
  const [name,    setName]    = useState('')
  const [loading, setLoading] = useState(false)
  const router   = useRouter()
  const supabase = createClient()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)

    const { data: existing } = await supabase
      .from('general_objectives')
      .select('order_num')
      .eq('initiative_id', initiativeId)
      .order('order_num', { ascending: false })
      .limit(1)

    const orderNum = existing && existing.length > 0 ? existing[0].order_num + 1 : 1

    await supabase
      .from('general_objectives')
      .insert({ initiative_id: initiativeId, name_ar: name.trim(), order_num: orderNum })

    setName('')
    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-indigo-500 hover:bg-indigo-50 text-xs font-medium transition-colors w-full">
        ➕ إضافة هدف عام
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 p-2">
      <input
        autoFocus
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="اسم الهدف العام..."
        className="flex-1 px-3 py-2 text-sm rounded-xl border border-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
      />
      <button
        type="submit"
        disabled={loading || !name.trim()}
        className="px-3 py-2 bg-indigo-600 text-white text-xs rounded-xl disabled:opacity-50 font-medium">
        {loading ? '...' : 'إضافة'}
      </button>
      <button
        type="button"
        onClick={() => { setOpen(false); setName('') }}
        className="px-3 py-2 border border-slate-200 text-slate-500 text-xs rounded-xl hover:bg-slate-50">
        إلغاء
      </button>
    </form>
  )
}

/* ─── إضافة هدف فرعي داخل هدف عام ─── */
export function AddSubObjective({ generalObjectiveId }: { generalObjectiveId: string }) {
  const [open,    setOpen]    = useState(false)
  const [name,    setName]    = useState('')
  const [loading, setLoading] = useState(false)
  const router   = useRouter()
  const supabase = createClient()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)

    const { data: existing } = await supabase
      .from('sub_objectives')
      .select('order_num')
      .eq('general_objective_id', generalObjectiveId)
      .order('order_num', { ascending: false })
      .limit(1)

    const orderNum = existing && existing.length > 0 ? existing[0].order_num + 1 : 1

    await supabase
      .from('sub_objectives')
      .insert({ general_objective_id: generalObjectiveId, name_ar: name.trim(), order_num: orderNum })

    setName('')
    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-emerald-500 hover:bg-emerald-50 text-xs font-medium transition-colors w-full">
        ➕ إضافة هدف فرعي
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 p-2">
      <input
        autoFocus
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="اسم الهدف الفرعي..."
        className="flex-1 px-3 py-2 text-sm rounded-xl border border-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
      />
      <button
        type="submit"
        disabled={loading || !name.trim()}
        className="px-3 py-2 bg-emerald-600 text-white text-xs rounded-xl disabled:opacity-50 font-medium">
        {loading ? '...' : 'إضافة'}
      </button>
      <button
        type="button"
        onClick={() => { setOpen(false); setName('') }}
        className="px-3 py-2 border border-slate-200 text-slate-500 text-xs rounded-xl hover:bg-slate-50">
        إلغاء
      </button>
    </form>
  )
}

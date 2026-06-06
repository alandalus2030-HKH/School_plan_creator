'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Pencil, Trash2 } from 'lucide-react'

type Task       = { id: string; name_ar: string; status: string; end_date: string|null; task_type: string; priority: string }
type SubObj     = { id: string; name_ar: string; order_num: number; tasks: Task[] }
type GenObj     = { id: string; name_ar: string; order_num: number; sub_objectives: SubObj[] }
type Initiative = { id: string; name_ar: string; order_num: number; general_objectives: GenObj[] }
type Axis       = { id: string; name_ar: string; order_num: number; plan: {id:string;name_ar:string}|null; initiatives: Initiative[] }

const statusColor: Record<string,string> = {
  not_started:'bg-slate-100 text-slate-600', in_progress:'bg-blue-100 text-blue-700',
  completed:'bg-green-100 text-green-700',   delayed:'bg-red-100 text-red-700',
}
const statusAr: Record<string,string> = {
  not_started:'لم تبدأ', in_progress:'جارية', completed:'منجزة', delayed:'متأخرة',
}

/* ────── زر إضافة/تعديل مضمّن ────── */
function InlineAdd({ placeholder, onAdd, color='violet' }: {
  placeholder: string; onAdd: (name:string)=>Promise<void>; color?:'violet'|'indigo'|'emerald'
}) {
  const [open,loading,name,setName,setOpen,setLoading] = (() => {
    const [o,setO] = useState(false)
    const [l,setL] = useState(false)
    const [n,setN] = useState('')
    return [o,l,n,setN,setO,setL]
  })()
  const c = {
    violet:  {btn:'text-violet-500 hover:bg-violet-50',  border:'border-violet-200 focus:ring-violet-400', sub:'bg-violet-600'},
    indigo:  {btn:'text-indigo-500 hover:bg-indigo-50',  border:'border-indigo-200 focus:ring-indigo-400', sub:'bg-indigo-600'},
    emerald: {btn:'text-emerald-500 hover:bg-emerald-50', border:'border-emerald-200 focus:ring-emerald-400', sub:'bg-emerald-600'},
  }[color]
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!name.trim()) return
    setLoading(true); await onAdd(name.trim()); setName(''); setOpen(false); setLoading(false)
  }
  if (!open) return (
    <button onClick={()=>setOpen(true)}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors w-full ${c.btn}`}>
      ➕ {placeholder}
    </button>
  )
  return (
    <form onSubmit={submit} className="flex items-center gap-2 p-2">
      <input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder={`${placeholder}...`}
        className={`flex-1 px-3 py-2 text-sm rounded-xl border focus:outline-none focus:ring-2 bg-white ${c.border}`} />
      <button type="submit" disabled={loading||!name.trim()}
        className={`px-3 py-2 text-white text-xs rounded-xl disabled:opacity-50 font-medium ${c.sub}`}>
        {loading?'...':'إضافة'}
      </button>
      <button type="button" onClick={()=>{setOpen(false);setName('')}}
        className="px-3 py-2 border border-slate-200 text-slate-500 text-xs rounded-xl hover:bg-slate-50">إلغاء</button>
    </form>
  )
}

/* ────── سطر قابل للتعديل/الحذف ────── */
function EditableRow({ name, onSave, onDelete, children }: {
  name: string; onSave:(n:string)=>Promise<void>; onDelete:()=>Promise<void>; children: React.ReactNode
}) {
  const [editing,setEditing] = useState(false)
  const [val,setVal]         = useState(name)
  const [saving,setSaving]   = useState(false)
  const [confirming,setConfirming] = useState(false)

  const save = async () => {
    if (!val.trim()) return; setSaving(true); await onSave(val.trim()); setEditing(false); setSaving(false)
  }
  const del = async () => { setSaving(true); await onDelete(); }

  return (
    <div>
      {editing ? (
        <div className="flex items-center gap-2 p-2 bg-amber-50 rounded-xl border border-amber-200">
          <input autoFocus value={val} onChange={e=>setVal(e.target.value)}
            className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
          <button onClick={save} disabled={saving||!val.trim()}
            className="px-3 py-1.5 bg-amber-500 text-white text-xs rounded-lg font-medium disabled:opacity-50">
            {saving?'...':'حفظ'}
          </button>
          <button onClick={()=>setEditing(false)}
            className="px-2 py-1.5 border border-slate-200 text-slate-500 text-xs rounded-lg">إلغاء</button>
        </div>
      ) : confirming ? (
        <div className="flex items-center gap-2 p-2 bg-red-50 rounded-xl border border-red-200">
          <span className="text-xs text-red-700 flex-1">هل تريد حذف هذا العنصر؟</span>
          <button onClick={del} disabled={saving}
            className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg disabled:opacity-50">{saving?'...':'نعم'}</button>
          <button onClick={()=>setConfirming(false)}
            className="px-2 py-1.5 border border-slate-200 text-slate-500 text-xs rounded-lg">إلغاء</button>
        </div>
      ) : (
        <div className="group/row flex items-center gap-1">
          <div className="flex-1">{children}</div>
          <div className="flex gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
            <button onClick={()=>setEditing(true)} title="تعديل"
              className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded transition-colors"><Pencil size={12} /></button>
            <button onClick={()=>setConfirming(true)} title="حذف"
              className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"><Trash2 size={12} /></button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════ الصفحة الرئيسية ══════ */
export default function AxisPage() {
  const params   = useParams()
  const axisId   = params.axisId as string
  const router   = useRouter()
  const supabase = createClient()

  const [axis,    setAxis]    = useState<Axis|null>(null)
  const [loading, setLoading] = useState(true)

  const loadAxis = useCallback(async () => {
    const { data } = await supabase
      .from('axes')
      .select(`
        id, name_ar, order_num,
        plan:plans ( id, name_ar ),
        initiatives (
          id, name_ar, order_num,
          general_objectives (
            id, name_ar, order_num,
            sub_objectives (
              id, name_ar, order_num,
              tasks ( id, name_ar, status, end_date, task_type, priority )
            )
          )
        )
      `)
      .eq('id', axisId)
      .single()
    if (!data) { router.push('/dashboard/plans'); return }
    setAxis(data as any)
    setLoading(false)
  }, [axisId])

  useEffect(() => { loadAxis() }, [loadAxis])

  /* ─── إضافة/تعديل/حذف ─── */
  const addGenObj = async (initId:string, name:string) => {
    const { data: ex } = await supabase.from('general_objectives').select('order_num').eq('initiative_id',initId).order('order_num',{ascending:false}).limit(1)
    const n = ex?.length ? ex[0].order_num+1 : 1
    await supabase.from('general_objectives').insert({initiative_id:initId, name_ar:name, order_num:n})
    await loadAxis()
  }
  const editGenObj = async (id:string, name:string) => {
    await supabase.from('general_objectives').update({name_ar:name}).eq('id',id); await loadAxis()
  }
  const deleteGenObj = async (id:string) => {
    await supabase.from('general_objectives').delete().eq('id',id); await loadAxis()
  }
  const addSubObj = async (genId:string, name:string) => {
    const { data: ex } = await supabase.from('sub_objectives').select('order_num').eq('general_objective_id',genId).order('order_num',{ascending:false}).limit(1)
    const n = ex?.length ? ex[0].order_num+1 : 1
    await supabase.from('sub_objectives').insert({general_objective_id:genId, name_ar:name, order_num:n})
    await loadAxis()
  }
  const editSubObj = async (id:string, name:string) => {
    await supabase.from('sub_objectives').update({name_ar:name}).eq('id',id); await loadAxis()
  }
  const deleteSubObj = async (id:string) => {
    await supabase.from('sub_objectives').delete().eq('id',id); await loadAxis()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full" />
    </div>
  )
  if (!axis) return null

  return (
    <div className="space-y-4">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/dashboard/plans" className="hover:text-violet-600">الخطط</Link>
        <span>›</span><span className="text-slate-400">{axis.plan?.name_ar}</span>
        <span>›</span><span className="text-violet-700 font-medium">{axis.name_ar}</span>
      </div>

      {/* Axis Header */}
      <div className="bg-gradient-to-l from-violet-600 to-indigo-700 text-white rounded-2xl p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center font-bold text-lg">
            {axis.order_num}
          </div>
          <div>
            <h2 className="text-xl font-bold">{axis.name_ar}</h2>
            <p className="text-violet-200 text-sm">{axis.initiatives?.length||0} مبادرة</p>
          </div>
        </div>
      </div>

      {/* Initiatives */}
      <div className="space-y-4">
        {axis.initiatives?.slice().sort((a,b)=>a.order_num-b.order_num).map(initiative => {
          let total=0, done=0
          initiative.general_objectives?.forEach(o=>o.sub_objectives?.forEach(s=>{
            total+=s.tasks?.length||0; done+=s.tasks?.filter(t=>t.status==='completed').length||0
          }))
          const progress = total>0 ? Math.round((done/total)*100) : 0

          return (
            <div key={initiative.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Initiative Header */}
              <div className="flex items-center justify-between p-4 bg-slate-50 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center font-bold text-xs">
                    {axis.order_num}.{initiative.order_num}
                  </div>
                  <h3 className="font-bold text-slate-700">{initiative.name_ar}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-500 rounded-full" style={{width:`${progress}%`}} />
                  </div>
                  <span className="text-xs font-bold text-violet-600">{progress}%</span>
                </div>
              </div>

              {/* Body */}
              <div className="p-3 space-y-1">
                {initiative.general_objectives?.slice().sort((a,b)=>a.order_num-b.order_num).map(obj => (
                  <details key={obj.id} className="group">
                    <EditableRow
                      name={obj.name_ar}
                      onSave={n=>editGenObj(obj.id,n)}
                      onDelete={()=>deleteGenObj(obj.id)}>
                      <summary className="flex items-center gap-2 p-3 rounded-xl hover:bg-slate-50 cursor-pointer list-none select-none">
                        <span className="text-slate-400 group-open:rotate-90 transition-transform inline-block">▶</span>
                        <span className="text-sm font-semibold text-slate-700 flex-1">{obj.name_ar}</span>
                        <span className="text-xs text-slate-400">
                          {obj.sub_objectives?.reduce((acc,s)=>acc+(s.tasks?.length||0),0)} مهمة
                        </span>
                      </summary>
                    </EditableRow>

                    <div className="mr-6 mt-1 space-y-1 pb-1">
                      {obj.sub_objectives?.slice().sort((a,b)=>a.order_num-b.order_num).map(sub => (
                        <details key={sub.id} className="group/sub">
                          <EditableRow
                            name={sub.name_ar}
                            onSave={n=>editSubObj(sub.id,n)}
                            onDelete={()=>deleteSubObj(sub.id)}>
                            <summary className="flex items-center gap-2 p-2.5 rounded-xl hover:bg-slate-50 cursor-pointer list-none select-none">
                              <span className="text-slate-300 group-open/sub:rotate-90 transition-transform text-xs inline-block">▶</span>
                              <span className="text-sm text-slate-600 flex-1">{sub.name_ar}</span>
                              <span className="text-xs text-slate-400">{sub.tasks?.length||0} مهام</span>
                            </summary>
                          </EditableRow>

                          <div className="mr-5 mt-1 space-y-1">
                            {sub.tasks?.map(task => (
                              <Link key={task.id} href={`/dashboard/tasks/${task.id}`}
                                className="flex items-center gap-2 p-2.5 rounded-xl hover:bg-violet-50 transition-colors border border-transparent hover:border-violet-100">
                                <span className="text-sm">{task.task_type==='academic'?'📚':task.task_type==='administrative'?'🗃️':'📌'}</span>
                                <span className="text-sm text-slate-700 flex-1">{task.name_ar}</span>
                                {task.end_date&&<span className="text-xs text-slate-400">{new Date(task.end_date).toLocaleDateString('ar-QA')}</span>}
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[task.status]||'bg-slate-100'}`}>
                                  {statusAr[task.status]}
                                </span>
                              </Link>
                            ))}
                            <Link href={`/dashboard/tasks/new?sub_objective=${sub.id}`}
                              className="flex items-center gap-2 p-2 rounded-xl text-violet-500 hover:bg-violet-50 text-xs font-medium transition-colors">
                              ➕ إضافة مهمة
                            </Link>
                          </div>
                        </details>
                      ))}
                      <InlineAdd placeholder="إضافة هدف فرعي" color="emerald" onAdd={n=>addSubObj(obj.id,n)} />
                    </div>
                  </details>
                ))}
                <InlineAdd placeholder="إضافة هدف عام" color="indigo" onAdd={n=>addGenObj(initiative.id,n)} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

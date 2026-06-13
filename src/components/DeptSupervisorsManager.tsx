'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { UserCog, Plus, Trash2, Loader2 } from 'lucide-react'
import { toast } from '@/components/Toast'

type Sup = { id: string; user_id: string; department: string; profiles?: { name_ar: string } }

export default function DeptSupervisorsManager() {
  const supabase = createClient()
  const [sups,        setSups]        = useState<Sup[]>([])
  const [departments, setDepartments] = useState<string[]>([])
  const [users,       setUsers]       = useState<any[]>([])
  const [loading,     setLoading]     = useState(true)
  const [selUser,     setSelUser]     = useState('')
  const [selDept,     setSelDept]     = useState('')
  const [adding,      setAdding]      = useState(false)

  const load = async () => {
    const [{ data: opts }, { data: profs }, supRes] = await Promise.all([
      supabase.from('dropdown_options').select('value').eq('category', 'department').eq('is_active', true).order('sort_order'),
      supabase.from('profiles').select('id, name_ar, job_title').eq('is_active', true).order('name_ar'),
      fetch('/api/department-supervisors').then(r => r.ok ? r.json() : { supervisors: [] }),
    ])
    setDepartments((opts || []).map((o: any) => o.value))
    setUsers(profs || [])
    setSups(supRes.supervisors || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selUser || !selDept || adding) return
    setAdding(true)
    const res = await fetch('/api/department-supervisors', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: selUser, department: selDept }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { toast(j.error || 'تعذّرت الإضافة', 'error'); setAdding(false); return }
    setSups(prev => {
      if (prev.some(s => s.id === j.supervisor.id)) return prev
      return [...prev, j.supervisor]
    })
    setSelDept(''); setAdding(false)
  }

  const remove = async (id: string) => {
    const res = await fetch(`/api/department-supervisors/${id}`, { method: 'DELETE' })
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast(j.error || 'تعذّر الحذف', 'error'); return }
    setSups(prev => prev.filter(s => s.id !== id))
  }

  /* تجميع حسب المستخدم */
  const byUser = users
    .map(u => ({ user: u, depts: sups.filter(s => s.user_id === u.id) }))
    .filter(x => x.depts.length > 0)

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-5 border-b border-slate-100 bg-gradient-to-l from-violet-50 to-white">
        <UserCog size={28} style={{ color: 'var(--maroon-600)', flexShrink: 0 }} />
        <div>
          <h3 className="font-bold text-slate-800">إشراف الأقسام</h3>
          <p className="text-xs text-slate-400">حدّد من يشرف على أي قسم — يحكم ما يراه كل مستخدم في لوحة التجميع</p>
        </div>
      </div>

      {/* إضافة */}
      <form onSubmit={add} className="flex flex-wrap items-end gap-3 p-4 bg-violet-50 border-b border-violet-100">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-slate-600 mb-1">المستخدم</label>
          <select value={selUser} onChange={e => setSelUser(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-sm">
            <option value="">— اختر —</option>
            {users.map((u: any) => <option key={u.id} value={u.id}>{u.name_ar}{u.job_title ? ` — ${u.job_title}` : ''}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-slate-600 mb-1">القسم</label>
          <select value={selDept} onChange={e => setSelDept(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-sm">
            <option value="">— اختر —</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <button type="submit" disabled={adding || !selUser || !selDept}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-50">
          <span className="inline-flex">{adding ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}</span>
          تعيين
        </button>
      </form>

      {/* القائمة */}
      {loading ? (
        <div className="p-8 text-center"><Loader2 size={24} className="animate-spin mx-auto text-violet-400" /></div>
      ) : byUser.length === 0 ? (
        <p className="p-8 text-center text-sm text-slate-400">لا تعيينات بعد — عيّن مشرفاً على قسم أعلاه</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {byUser.map(({ user, depts }) => (
            <div key={user.id} className="px-5 py-3">
              <p className="text-sm font-semibold text-slate-700 mb-2">{user.name_ar}</p>
              <div className="flex flex-wrap gap-2">
                {depts.map(s => (
                  <span key={s.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm bg-violet-50 text-violet-700 border border-violet-200">
                    {s.department}
                    <button onClick={() => remove(s.id)} className="text-violet-400 hover:text-red-600" title="إزالة"><Trash2 size={13} /></button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

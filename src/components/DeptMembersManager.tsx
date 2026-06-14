'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BookOpen, Plus, X, Loader2, Search } from 'lucide-react'
import { toast } from '@/components/Toast'

type Profile = { id: string; name_ar: string; job_title: string | null; department: string | null }

export default function DeptMembersManager() {
  const supabase = createClient()
  const [departments, setDepartments] = useState<string[]>([])
  const [profiles,    setProfiles]    = useState<Profile[]>([])
  const [selDept,     setSelDept]     = useState('')
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [picked,      setPicked]      = useState<string[]>([])
  const [saving,      setSaving]      = useState(false)
  const [showAdd,     setShowAdd]     = useState(false)

  const load = async () => {
    const [{ data: opts }, { data: profs }] = await Promise.all([
      supabase.from('dropdown_options').select('value').eq('category', 'department').eq('is_active', true).order('sort_order'),
      supabase.from('profiles').select('id, name_ar, job_title, department').eq('is_active', true).order('name_ar'),
    ])
    const depts = (opts || []).map((o: any) => o.value)
    setDepartments(depts)
    setProfiles((profs || []) as Profile[])
    if (!selDept && depts.length) setSelDept(depts[0])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const members  = useMemo(() => profiles.filter(p => p.department === selDept), [profiles, selDept])
  const outsiders = useMemo(() =>
    profiles.filter(p => p.department !== selDept &&
      (`${p.name_ar} ${p.job_title || ''}`.toLowerCase().includes(search.toLowerCase()))),
    [profiles, selDept, search])

  const assign = async (userIds: string[], department: string | null) => {
    if (userIds.length === 0) return
    setSaving(true)
    const res = await fetch('/api/departments/assign', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_ids: userIds, department }),
    })
    const j = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { toast(j.error || 'تعذّرت العملية', 'error'); return }
    /* تحديث محلي */
    setProfiles(prev => prev.map(p => userIds.includes(p.id) ? { ...p, department } : p))
    setPicked([]); setShowAdd(false); setSearch('')
    toast(department ? 'تم ضمّ الأعضاء للقسم' : 'تمت الإزالة من القسم')
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-5 border-b border-slate-100 bg-gradient-to-l from-violet-50 to-white">
        <BookOpen size={28} style={{ color: 'var(--maroon-600)', flexShrink: 0 }} />
        <div>
          <h3 className="font-bold text-slate-800">أعضاء الأقسام</h3>
          <p className="text-xs text-slate-400">ضمّ المستخدمين إلى أقسامهم دفعة واحدة (يضبط قسم كل مستخدم)</p>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center"><Loader2 size={24} className="animate-spin mx-auto text-violet-400" /></div>
      ) : departments.length === 0 ? (
        <p className="p-8 text-center text-sm text-slate-400">لا أقسام معرّفة — أضِفها من «القسم / المادة».</p>
      ) : (
        <div className="p-4 space-y-4">
          {/* اختيار القسم */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-slate-500">القسم:</span>
            <select value={selDept} onChange={e => { setSelDept(e.target.value); setShowAdd(false); setPicked([]) }}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <span className="text-xs text-slate-400">({members.length} عضو)</span>
            <button onClick={() => setShowAdd(v => !v)}
              className="mr-auto flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold">
              <Plus size={15} /> ضمّ أعضاء
            </button>
          </div>

          {/* أداة الضمّ */}
          {showAdd && (
            <div className="border border-violet-200 rounded-xl p-3 bg-violet-50/40 space-y-2">
              <div className="relative">
                <Search size={15} className="absolute right-3 top-2.5 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث عن مستخدم لضمّه..."
                  className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-sm" />
              </div>
              <div className="max-h-56 overflow-auto space-y-1">
                {outsiders.length === 0 ? (
                  <p className="text-xs text-slate-400 px-1 py-2">لا مستخدمين مطابقين خارج القسم</p>
                ) : outsiders.map(p => {
                  const on = picked.includes(p.id)
                  return (
                    <label key={p.id} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer ${on ? 'bg-violet-100' : 'hover:bg-white'}`}>
                      <input type="checkbox" checked={on} className="accent-violet-600"
                        onChange={() => setPicked(prev => on ? prev.filter(x => x !== p.id) : [...prev, p.id])} />
                      <span className="text-sm text-slate-700 flex-1">{p.name_ar}{p.job_title ? ` — ${p.job_title}` : ''}</span>
                      {p.department && <span className="text-[11px] text-slate-400">({p.department})</span>}
                    </label>
                  )
                })}
              </div>
              <button onClick={() => assign(picked, selDept)} disabled={saving || picked.length === 0}
                className="w-full py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-50">
                {saving ? 'جارٍ الضمّ...' : `ضمّ ${picked.length} للقسم «${selDept}»`}
              </button>
            </div>
          )}

          {/* الأعضاء الحاليون */}
          {members.length === 0 ? (
            <p className="text-sm text-slate-400 px-1">لا أعضاء في هذا القسم بعد.</p>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl">
              {members.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {p.name_ar?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{p.name_ar}</p>
                    {p.job_title && <p className="text-xs text-slate-400">{p.job_title}</p>}
                  </div>
                  <button onClick={() => assign([p.id], null)} disabled={saving}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="إزالة من القسم">
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

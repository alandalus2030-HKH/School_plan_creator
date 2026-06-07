'use client'

import { useState, useEffect } from 'react'
import { toast } from '@/components/Toast'
import {
  Layers, Plus, X, Loader2, Pencil, Trash2, Building2, UserRound,
} from 'lucide-react'

type Group = {
  id: string; name_ar: string; name_en: string | null
  is_active: boolean; school_count: number
  owner: { id: string; name_ar: string; email: string } | null
}
type SchoolOpt = { id: string; name_ar: string; group_id: string | null }
type UserOpt   = { id: string; name_ar: string; email: string | null }

export default function GroupsManager() {
  const [groups, setGroups]   = useState<Group[]>([])
  const [schools, setSchools] = useState<SchoolOpt[]>([])
  const [users, setUsers]     = useState<UserOpt[]>([])
  const [loading, setLoading] = useState(true)

  /* نموذج إنشاء */
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving]   = useState(false)

  /* نموذج إدارة (إسناد مدارس + مالك) */
  const [manage, setManage]   = useState<Group | null>(null)
  const [selSchools, setSelSchools] = useState<string[]>([])
  const [selOwner, setSelOwner]     = useState('')
  const [mgSaving, setMgSaving]     = useState(false)

  const [confirmDel, setConfirmDel] = useState<Group | null>(null)

  const load = async () => {
    setLoading(true)
    const [gRes, sRes, uRes] = await Promise.all([
      fetch('/api/groups'),
      fetch('/api/schools/list'),
      fetch('/api/users/list-min'),
    ])
    const g = await gRes.json()
    const s = await sRes.json()
    const u = uRes.ok ? await uRes.json() : { users: [] }
    if (gRes.ok) setGroups(g.groups || [])
    if (sRes.ok) setSchools((s.schools || []).map((x: any) => ({ id: x.id, name_ar: x.name_ar, group_id: x.group_id ?? null })))
    setUsers(u.users || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const createGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    const res = await fetch('/api/groups', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name_ar: newName }),
    })
    setSaving(false)
    if (!res.ok) { toast('تعذّر إنشاء المجموعة', 'error'); return }
    toast('تم إنشاء المجموعة')
    setShowCreate(false); setNewName(''); await load()
  }

  const openManage = (g: Group) => {
    setManage(g)
    setSelSchools(schools.filter(s => s.group_id === g.id).map(s => s.id))
    setSelOwner(g.owner?.id || '')
  }

  const saveManage = async () => {
    if (!manage) return
    setMgSaving(true)
    const res = await fetch(`/api/groups/${manage.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_ids: selSchools, owner_id: selOwner || null }),
    })
    setMgSaving(false)
    if (!res.ok) { toast('تعذّر الحفظ', 'error'); return }
    toast('تم تحديث المجموعة')
    setManage(null); await load()
  }

  const doDelete = async () => {
    if (!confirmDel) return
    const res = await fetch(`/api/groups/${confirmDel.id}`, { method: 'DELETE' })
    if (!res.ok) { toast('تعذّر الحذف', 'error'); setConfirmDel(null); return }
    toast('تم حذف المجموعة')
    setConfirmDel(null); await load()
  }

  const toggleSchool = (id: string) =>
    setSelSchools(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--maroon-600)' }} />
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => { setNewName(''); setShowCreate(true) }}
          className="flex items-center gap-2 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all hover:brightness-110 shadow-lg"
          style={{ background: 'var(--gradient-button)' }}>
          <Plus size={16} /> مجموعة جديدة
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center text-slate-400">
          <Layers size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium text-slate-500">لا توجد مجموعات بعد</p>
          <p className="text-xs mt-1">أنشئ مجموعة ثم أسند لها المدارس وعيّن مالكها</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {groups.map(g => (
            <div key={g.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
                    <Layers size={18} style={{ color: 'var(--maroon-600)' }} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">{g.name_ar}</p>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                      <span className="flex items-center gap-1"><Building2 size={11} /> {g.school_count} مدرسة</span>
                      <span className="flex items-center gap-1">
                        <UserRound size={11} /> {g.owner ? g.owner.name_ar : 'بلا مالك'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openManage(g)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors">
                    إدارة المدارس والمالك
                  </button>
                  <button onClick={() => setConfirmDel(g)} aria-label="حذف المجموعة"
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* نافذة إنشاء */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Layers size={16} style={{ color: 'var(--maroon-600)' }} /> مجموعة جديدة</h3>
              <button onClick={() => setShowCreate(false)} aria-label="إغلاق" className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button>
            </div>
            <form onSubmit={createGroup} className="space-y-3">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="اسm المجموعة (مثل: مجمع الأندلس) *"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
              <div className="flex gap-2">
                <button type="submit" disabled={saving || !newName.trim()}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all hover:brightness-110" style={{ background: 'var(--gradient-button)' }}>
                  {saving ? 'جارٍ الإنشاء...' : 'إنشاء'}
                </button>
                <button type="button" onClick={() => setShowCreate(false)} className="px-5 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50 transition-colors">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة إدارة المدارس والمالك */}
      {manage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setManage(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
              <h3 className="font-bold text-slate-800">إدارة: {manage.name_ar}</h3>
              <button onClick={() => setManage(null)} aria-label="إغلاق" className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* المالك */}
              <div>
                <p className="text-xs font-bold text-slate-500 mb-1.5">مالك المجموعة</p>
                <select value={selOwner} onChange={e => setSelOwner(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-300">
                  <option value="">— بلا مالك —</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name_ar} {u.email ? `(${u.email})` : ''}</option>)}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">المالك يرى أرقام مدارس المجموعة المُجمَّعة فقط.</p>
              </div>

              {/* المدارس */}
              <div>
                <p className="text-xs font-bold text-slate-500 mb-1.5">مدارس المجموعة ({selSchools.length})</p>
                <div className="border border-slate-200 rounded-xl max-h-52 overflow-y-auto divide-y divide-slate-50">
                  {schools.map(s => {
                    const inOther = s.group_id && s.group_id !== manage.id
                    return (
                      <label key={s.id} className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 ${inOther ? 'opacity-50' : ''}`}>
                        <input type="checkbox" checked={selSchools.includes(s.id)} onChange={() => toggleSchool(s.id)} disabled={!!inOther}
                          className="w-4 h-4 accent-violet-600" />
                        <span className="text-slate-700">{s.name_ar}</span>
                        {inOther && <span className="text-[10px] text-amber-600 mr-auto">في مجموعة أخرى</span>}
                      </label>
                    )
                  })}
                  {schools.length === 0 && <p className="px-3 py-3 text-xs text-slate-400 text-center">لا توجد مدارس</p>}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={saveManage} disabled={mgSaving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all hover:brightness-110" style={{ background: 'var(--gradient-button)' }}>
                  {mgSaving ? 'جارٍ الحفظ...' : 'حفظ'}
                </button>
                <button onClick={() => setManage(null)} className="px-5 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50 transition-colors">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* تأكيد الحذف */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setConfirmDel(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 text-center" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-3"><Trash2 size={22} className="text-red-500" /></div>
            <h3 className="font-bold text-slate-800 mb-1">حذف المجموعة</h3>
            <p className="text-sm text-slate-500 mb-5">حذف <span className="font-semibold text-slate-700">{confirmDel.name_ar}</span>؟ المدارس <span className="font-semibold">لن تُحذف</span> — ستصبح مستقلة.</p>
            <div className="flex gap-2">
              <button onClick={doDelete} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors">نعم، احذف</button>
              <button onClick={() => setConfirmDel(null)} className="px-5 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50 transition-colors">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

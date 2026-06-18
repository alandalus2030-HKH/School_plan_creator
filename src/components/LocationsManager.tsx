'use client'

import { useState, useEffect } from 'react'
import { MapPin, Plus, Trash2, Pencil, Eye, EyeOff, Loader2 } from 'lucide-react'
import { toast } from '@/components/Toast'
import ConfirmDialog from '@/components/ConfirmDialog'

type Loc = { id: string; name_ar: string; sort_order: number; is_active: boolean }

export default function LocationsManager() {
  const [locs,      setLocs]      = useState<Loc[]>([])
  const [loading,   setLoading]   = useState(true)
  const [newName,   setNewName]   = useState('')
  const [adding,    setAdding]    = useState(false)
  const [editId,    setEditId]    = useState<string | null>(null)
  const [editName,  setEditName]  = useState('')
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  const load = async () => {
    const res = await fetch('/api/locations')
    const j = await res.json().catch(() => ({}))
    if (res.ok) setLocs(j.locations || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim() || adding) return
    setAdding(true)
    const res = await fetch('/api/locations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name_ar: newName.trim() }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { toast(j.error || 'تعذّرت الإضافة', 'error'); setAdding(false); return }
    setLocs(prev => [...prev, j.location])
    setNewName(''); setAdding(false)
  }

  const saveEdit = async (id: string) => {
    if (!editName.trim()) return
    const res = await fetch(`/api/locations/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name_ar: editName.trim() }),
    })
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast(j.error || 'تعذّر الحفظ', 'error'); return }
    setLocs(prev => prev.map(l => l.id === id ? { ...l, name_ar: editName.trim() } : l))
    setEditId(null)
  }

  const toggle = async (l: Loc) => {
    const res = await fetch(`/api/locations/${l.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !l.is_active }),
    })
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast(j.error || 'تعذّر التغيير', 'error'); return }
    setLocs(prev => prev.map(x => x.id === l.id ? { ...x, is_active: !x.is_active } : x))
  }

  const remove = async (id: string) => {
    const res = await fetch(`/api/locations/${id}`, { method: 'DELETE' })
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast(j.error || 'تعذّر الحذف', 'error'); return }
    setLocs(prev => prev.filter(l => l.id !== id))
    setConfirmDel(null)
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-5 border-b border-slate-100 bg-gradient-to-l from-violet-50 to-white">
        <MapPin size={28} style={{ color: 'var(--maroon-600)', flexShrink: 0 }} />
        <div>
          <h3 className="font-bold text-slate-800">الأماكن والموارد المكانية</h3>
          <p className="text-xs text-slate-400">الصفوف والساحات والقاعات — تُستخدم لتحديد مكان المهمة ومنع التعارض</p>
        </div>
      </div>

      {/* إضافة */}
      <form onSubmit={add} className="flex items-center gap-3 p-4 bg-violet-50 border-b border-violet-100">
        <input value={newName} onChange={e => setNewName(e.target.value)}
          placeholder="اسم المكان (مثال: المختبر العلمي)"
          className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-sm" />
        <button type="submit" disabled={adding || !newName.trim()}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-50">
          <span className="inline-flex">{adding ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}</span>
          إضافة
        </button>
      </form>

      {/* القائمة */}
      {loading ? (
        <div className="p-8 text-center"><Loader2 size={24} className="animate-spin mx-auto text-violet-400" /></div>
      ) : locs.length === 0 ? (
        <p className="p-8 text-center text-sm text-slate-400">لا توجد أماكن — أضف أول مكان أعلاه</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {locs.map(l => (
            <div key={l.id} className={`flex items-center gap-3 px-5 py-3 ${!l.is_active ? 'bg-slate-50 opacity-60' : ''}`}>
              <MapPin size={16} className="text-slate-400 flex-shrink-0" />
              {editId === l.id ? (
                <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(l.id); if (e.key === 'Escape') setEditId(null) }}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-400 text-sm" />
              ) : (
                <span className="flex-1 text-sm text-slate-700">{l.name_ar}{!l.is_active && <span className="text-xs text-slate-400 mr-2">(معطّل)</span>}</span>
              )}

              {editId === l.id ? (
                <div className="flex items-center gap-1">
                  <button onClick={() => saveEdit(l.id)} className="px-3 py-1.5 bg-violet-600 text-white text-xs rounded-lg font-medium">حفظ</button>
                  <button onClick={() => setEditId(null)} className="px-3 py-1.5 border border-slate-200 text-slate-500 text-xs rounded-lg">إلغاء</button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <button onClick={() => toggle(l)} title={l.is_active ? 'تعطيل' : 'تفعيل'}
                    className="p-1.5 text-slate-400 hover:text-violet-600 rounded-lg transition-colors">
                    {l.is_active ? <Eye size={15} /> : <EyeOff size={15} />}
                  </button>
                  <button onClick={() => { setEditId(l.id); setEditName(l.name_ar) }} title="تعديل"
                    className="p-1.5 text-slate-400 hover:text-violet-600 rounded-lg transition-colors"><Pencil size={15} /></button>
                  <button onClick={() => setConfirmDel(l.id)} title="حذف"
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition-colors"><Trash2 size={15} /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {(() => {
        const d = confirmDel ? locs.find(l => l.id === confirmDel) : null
        return (
          <ConfirmDialog
            open={!!d}
            title="حذف الموقع"
            message={d ? <>سيتم حذف «<strong>{d.name_ar}</strong>» نهائياً.</> : null}
            onConfirm={() => confirmDel && remove(confirmDel)}
            onCancel={() => setConfirmDel(null)}
          />
        )
      })()}
    </div>
  )
}

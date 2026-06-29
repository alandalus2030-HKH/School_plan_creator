'use client'

import { useState, useEffect } from 'react'
import { usePermissions } from '@/lib/PermissionsContext'
import NoAccess from '@/components/NoAccess'
import { toast } from '@/components/Toast'
import ConfirmDialog from '@/components/ConfirmDialog'
import {
  Building2, Plus, Users, Map, X, Loader2, Pencil, Trash2,
  Power, PowerOff, BarChart3, List, Layers, Eye,
} from 'lucide-react'
import SchoolsOverview from '@/components/SchoolsOverview'
import GroupsManager from '@/components/GroupsManager'

type School = {
  id:           string
  name_ar:      string
  name_en:      string | null
  is_active:    boolean
  created_at:   string
  user_count:   number
  active_count: number
  plan_count:   number
}

export default function SchoolsPage() {
  const { isSuperAdmin, loading: permsLoading } = usePermissions()

  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'manage' | 'overview' | 'groups'>('manage')
  const [error, setError] = useState('')

  /* تعديل / حذف */
  const [editSchool, setEditSchool] = useState<School | null>(null)
  const [editAr, setEditAr]   = useState('')
  const [editEn, setEditEn]   = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState<School | null>(null)
  const [deleting, setDeleting]   = useState(false)
  const [confirmToggle, setConfirmToggle] = useState<School | null>(null)
  const [toggling, setToggling]   = useState(false)

  const openEdit = (s: School) => {
    setEditSchool(s); setEditAr(s.name_ar); setEditEn(s.name_en || ''); setError('')
  }

  const enterAsSchool = async (s: School) => {
    const res = await fetch('/api/impersonate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: s.id }),
    })
    if (res.ok) {
      window.location.href = '/dashboard'   // إعادة تحميل لتطبيق سياق المدرسة
    } else {
      toast('تعذّر الدخول كمدرسة', 'error')
    }
  }

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editSchool || !editAr.trim()) return
    setEditSaving(true); setError('')
    const res = await fetch(`/api/schools/${editSchool.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name_ar: editAr, name_en: editEn }),
    })
    const json = await res.json()
    setEditSaving(false)
    if (!res.ok) { setError(json.error || 'حدث خطأ'); return }
    toast('تم تحديث بيانات المدرسة')
    setEditSchool(null); await load()
  }

  const doToggleActive = async () => {
    if (!confirmToggle) return
    const s = confirmToggle
    setToggling(true)
    const res = await fetch(`/api/schools/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !s.is_active }),
    })
    setToggling(false)
    setConfirmToggle(null)
    if (res.ok) {
      toast(s.is_active ? 'تم تعطيل المدرسة' : 'تم تفعيل المدرسة')
      await load()
    } else {
      toast('تعذّر تغيير الحالة', 'error')
    }
  }

  const doDelete = async () => {
    if (!confirmDel) return
    setDeleting(true)
    const res = await fetch(`/api/schools/${confirmDel.id}`, { method: 'DELETE' })
    const json = await res.json()
    setDeleting(false)
    if (!res.ok) { toast(json.error || 'تعذّر الحذف', 'error'); setConfirmDel(null); return }
    toast('تم حذف المدرسة')
    setConfirmDel(null); await load()
  }

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/schools/list')
    const json = await res.json()
    if (res.ok) setSchools(json.schools || [])
    setLoading(false)
  }

  useEffect(() => {
    if (!permsLoading && isSuperAdmin) load()
    else if (!permsLoading) setLoading(false)
  }, [permsLoading, isSuperAdmin])

  if (permsLoading || loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--maroon-600)' }} />
    </div>
  )

  if (!isSuperAdmin) return <NoAccess />

  return (
    <div className="space-y-5" dir="rtl">
      {/* رأس */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Building2 size={22} style={{ color: 'var(--maroon-600)' }} /> إدارة المدارس
          </h2>
          <p className="text-slate-500 text-sm mt-1">إنشاء وإدارة المدارس المشتركة في النظام</p>
        </div>
        {view === 'manage' && (
          <a href="/onboarding"
            className="flex items-center gap-2 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:brightness-110 shadow-lg"
            style={{ background: 'var(--gradient-button)' }}>
            <Plus size={16} /> مدرسة جديدة
          </a>
        )}
      </div>

      {/* تبويبات */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl w-fit">
        <button onClick={() => setView('manage')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-1.5
            ${view === 'manage' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <List size={14} /> الإدارة
        </button>
        <button onClick={() => setView('overview')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-1.5
            ${view === 'overview' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <BarChart3 size={14} /> نظرة إجمالية
        </button>
        <button onClick={() => setView('groups')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-1.5
            ${view === 'groups' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <Layers size={14} /> المجموعات
        </button>
      </div>

      {/* عرض النظرة الإجمالية */}
      {view === 'overview' && <SchoolsOverview />}

      {/* عرض المجموعات */}
      {view === 'groups' && <GroupsManager />}

      {/* ════ عرض الإدارة ════ */}
      {view === 'manage' && (<>

      {/* إحصائية */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'إجمالي المدارس', value: schools.length, Icon: Building2 },
          { label: 'إجمالي المستخدمين', value: schools.reduce((s, x) => s + x.user_count, 0), Icon: Users },
          { label: 'إجمالي الخطط', value: schools.reduce((s, x) => s + x.plan_count, 0), Icon: Map },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-4 text-center shadow-sm">
            <s.Icon size={22} className="mx-auto mb-1.5" style={{ color: 'var(--maroon-500)' }} />
            <div className="text-2xl font-bold text-slate-800">{s.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* قائمة المدارس */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* ═══ بطاقات (الجوال) ═══ */}
        <div className="sm:hidden divide-y divide-slate-100">
          {schools.length === 0 ? (
            <p className="px-4 py-10 text-center text-slate-400">لا توجد مدارس بعد</p>
          ) : schools.map(s => (
            <div key={s.id} className="p-4">
              <div className="min-w-0 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-slate-800">{s.name_ar}</p>
                  {s.is_active
                    ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">نشطة</span>
                    : <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-medium">معطَّلة</span>}
                </div>
                {s.name_en && <p className="text-xs text-slate-400 font-latin">{s.name_en}</p>}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 mb-2 flex-wrap">
                <span>المستخدمون: <strong className="text-slate-700">{s.user_count}</strong></span>
                <span>النشطون: <strong className="text-green-700">{s.active_count}</strong></span>
                <span>الخطط: <strong className="text-slate-600">{s.plan_count}</strong></span>
              </div>
              <div className="flex items-center gap-1 border-t border-slate-100 pt-2">
                <button onClick={() => enterAsSchool(s)} title="دخول كمدرسة (متابعة)"
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"><Eye size={16} /></button>
                <button onClick={() => setConfirmToggle(s)} title={s.is_active ? 'تعطيل المدرسة' : 'تفعيل المدرسة'}
                  className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${s.is_active ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50' : 'text-green-500 hover:text-green-700 hover:bg-green-50'}`}>
                  {s.is_active ? <PowerOff size={16} /> : <Power size={16} />}</button>
                <button onClick={() => openEdit(s)} title="تعديل المدرسة"
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"><Pencil size={16} /></button>
                <button onClick={() => setConfirmDel(s)} title="حذف المدرسة"
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
        {/* ═══ جدول (سطح المكتب) ═══ */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-xs text-slate-500 font-semibold">
                <th className="px-4 py-3 text-right">المدرسة</th>
                <th className="px-4 py-3 text-center">المستخدمون</th>
                <th className="px-4 py-3 text-center">النشطون</th>
                <th className="px-4 py-3 text-center">الخطط</th>
                <th className="px-4 py-3 text-center hidden sm:table-cell">تاريخ الإنشاء</th>
                <th className="px-4 py-3 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {schools.map(s => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-800">{s.name_ar}</p>
                      {s.is_active ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">نشطة</span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-medium">معطَّلة</span>
                      )}
                    </div>
                    {s.name_en && <p className="text-xs text-slate-400 font-latin">{s.name_en}</p>}
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-slate-700">{s.user_count}</td>
                  <td className="px-4 py-3 text-center text-green-700">{s.active_count}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{s.plan_count}</td>
                  <td className="px-4 py-3 text-center text-xs text-slate-400 hidden sm:table-cell">
                    {new Date(s.created_at).toLocaleDateString('ar-QA')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => enterAsSchool(s)}
                        aria-label="دخول كمدرسة" title="دخول كمدرسة (متابعة)"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors">
                        <Eye size={14} />
                      </button>
                      <button onClick={() => setConfirmToggle(s)}
                        aria-label={s.is_active ? 'تعطيل المدرسة' : 'تفعيل المدرسة'}
                        title={s.is_active ? 'تعطيل المدرسة' : 'تفعيل المدرسة'}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors
                          ${s.is_active
                            ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                            : 'text-green-500 hover:text-green-700 hover:bg-green-50'}`}>
                        {s.is_active ? <PowerOff size={14} /> : <Power size={14} />}
                      </button>
                      <button onClick={() => openEdit(s)} aria-label="تعديل المدرسة"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setConfirmDel(s)} aria-label="حذف المدرسة"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {schools.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">لا توجد مدارس بعد</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      </>)}

      {/* نافذة التعديل */}
      {editSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setEditSchool(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-5"
            dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Pencil size={16} style={{ color: 'var(--maroon-600)' }} /> تعديل المدرسة
              </h3>
              <button onClick={() => setEditSchool(null)} aria-label="إغلاق"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={saveEdit} className="space-y-3">
              <input value={editAr} onChange={e => setEditAr(e.target.value)}
                placeholder="اسم المدرسة بالعربية *"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
              <input value={editEn} onChange={e => setEditEn(e.target.value)}
                placeholder="School name (English)" dir="ltr"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-xl">{error}</div>
              )}
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={editSaving || !editAr.trim()}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all hover:brightness-110"
                  style={{ background: 'var(--gradient-button)' }}>
                  {editSaving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
                </button>
                <button type="button" onClick={() => setEditSchool(null)}
                  className="px-5 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50 transition-colors">
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* تأكيد الحذف */}
      <ConfirmDialog
        open={!!confirmDel}
        title="حذف المدرسة"
        loading={deleting}
        message={confirmDel ? (
          <>
            هل أنت متأكد من حذف «<strong>{confirmDel.name_ar}</strong>»؟
            {(confirmDel.user_count > 0 || confirmDel.plan_count > 0) && (
              <span className="block mt-2 text-xs text-red-600">
                ملاحظة: المدرسة تحتوي على {confirmDel.user_count} مستخدم و {confirmDel.plan_count} خطة — لن يُسمح بالحذف.
              </span>
            )}
          </>
        ) : null}
        onConfirm={doDelete}
        onCancel={() => setConfirmDel(null)}
      />

      {/* تأكيد التفعيل / التعطيل */}
      {confirmToggle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setConfirmToggle(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 text-center"
            dir="rtl" onClick={e => e.stopPropagation()}>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3
              ${confirmToggle.is_active ? 'bg-amber-50' : 'bg-green-50'}`}>
              {confirmToggle.is_active
                ? <PowerOff size={22} className="text-amber-500" />
                : <Power size={22} className="text-green-500" />}
            </div>
            <h3 className="font-bold text-slate-800 mb-1">
              {confirmToggle.is_active ? 'تعطيل المدرسة' : 'تفعيل المدرسة'}
            </h3>
            <p className="text-sm text-slate-500 mb-2">
              {confirmToggle.is_active ? (
                <>سيتم منع دخول <span className="font-semibold text-slate-700">جميع مستخدمي</span>{' '}
                  <span className="font-semibold text-slate-700">{confirmToggle.name_ar}</span>{' '}
                  ({confirmToggle.active_count} مستخدم نشط). تُحفظ كل البيانات ويمكن التفعيل لاحقاً.</>
              ) : (
                <>سيعود دخول مستخدمي <span className="font-semibold text-slate-700">{confirmToggle.name_ar}</span>{' '}
                  للنظام بشكل طبيعي.</>
              )}
            </p>
            {confirmToggle.is_active && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-4">
                يُستخدم التعطيل عند انتهاء التعاقد — بديل آمن للحذف يحفظ البيانات.
              </p>
            )}
            <div className="flex gap-2 mt-2">
              <button onClick={doToggleActive} disabled={toggling}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-colors
                  ${confirmToggle.is_active ? 'bg-amber-500 hover:bg-amber-600' : 'bg-green-600 hover:bg-green-700'}`}>
                {toggling
                  ? 'جارٍ التنفيذ...'
                  : confirmToggle.is_active ? 'نعم، عطّل المدرسة' : 'نعم، فعّل المدرسة'}
              </button>
              <button onClick={() => setConfirmToggle(null)}
                className="px-5 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50 transition-colors">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

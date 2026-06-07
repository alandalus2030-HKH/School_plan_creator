'use client'

import { useState, useEffect } from 'react'
import { usePermissions } from '@/lib/PermissionsContext'
import NoAccess from '@/components/NoAccess'
import { toast } from '@/components/Toast'
import {
  Building2, Plus, Users, Map, X, Loader2,
} from 'lucide-react'

type School = {
  id:           string
  name_ar:      string
  name_en:      string | null
  created_at:   string
  user_count:   number
  active_count: number
  plan_count:   number
}

export default function SchoolsPage() {
  const { isSuperAdmin, loading: permsLoading } = usePermissions()

  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  /* حقول النموذج */
  const [schoolAr, setSchoolAr]   = useState('')
  const [schoolEn, setSchoolEn]   = useState('')
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminUser, setAdminUser] = useState('')
  const [adminPass, setAdminPass] = useState('')

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

  const resetForm = () => {
    setSchoolAr(''); setSchoolEn(''); setAdminName('')
    setAdminEmail(''); setAdminUser(''); setAdminPass(''); setError('')
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!schoolAr.trim() || !adminEmail.trim() || !adminUser.trim()) return
    setSaving(true); setError('')

    const res = await fetch('/api/schools/create', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_name_ar: schoolAr,
        school_name_en: schoolEn,
        admin_email:    adminEmail,
        admin_name:     adminName,
        admin_username: adminUser,
        admin_password: adminPass,
      }),
    })
    const json = await res.json()
    setSaving(false)

    if (!res.ok) { setError(json.error || 'حدث خطأ'); return }
    toast(json.message || 'تم إنشاء المدرسة بنجاح')
    setShowForm(false); resetForm(); await load()
  }

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
        <button onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-2 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:brightness-110 shadow-lg"
          style={{ background: 'var(--gradient-button)' }}>
          <Plus size={16} /> مدرسة جديدة
        </button>
      </div>

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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-xs text-slate-500 font-semibold">
                <th className="px-4 py-3 text-right">المدرسة</th>
                <th className="px-4 py-3 text-center">المستخدمون</th>
                <th className="px-4 py-3 text-center">النشطون</th>
                <th className="px-4 py-3 text-center">الخطط</th>
                <th className="px-4 py-3 text-center hidden sm:table-cell">تاريخ الإنشاء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {schools.map(s => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800">{s.name_ar}</p>
                    {s.name_en && <p className="text-xs text-slate-400 font-latin">{s.name_en}</p>}
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-slate-700">{s.user_count}</td>
                  <td className="px-4 py-3 text-center text-green-700">{s.active_count}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{s.plan_count}</td>
                  <td className="px-4 py-3 text-center text-xs text-slate-400 hidden sm:table-cell">
                    {new Date(s.created_at).toLocaleDateString('ar-QA')}
                  </td>
                </tr>
              ))}
              {schools.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">لا توجد مدارس بعد</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* نافذة الإنشاء */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setShowForm(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
            dir="rtl" onClick={e => e.stopPropagation()}>

            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Building2 size={18} style={{ color: 'var(--maroon-600)' }} /> مدرسة جديدة
              </h3>
              <button onClick={() => setShowForm(false)} aria-label="إغلاق"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-5 space-y-4">
              {/* بيانات المدرسة */}
              <div>
                <p className="text-xs font-bold text-slate-400 mb-2 uppercase">بيانات المدرسة</p>
                <div className="space-y-3">
                  <input value={schoolAr} onChange={e => setSchoolAr(e.target.value)}
                    placeholder="اسم المدرسة بالعربية *"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                  <input value={schoolEn} onChange={e => setSchoolEn(e.target.value)}
                    placeholder="School name (English)"
                    dir="ltr"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                </div>
              </div>

              {/* بيانات المدير الأول */}
              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs font-bold text-slate-400 mb-2 uppercase">حساب المدير الأول</p>
                <div className="space-y-3">
                  <input value={adminName} onChange={e => setAdminName(e.target.value)}
                    placeholder="اسم المدير"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                  <input value={adminEmail} onChange={e => setAdminEmail(e.target.value)}
                    placeholder="البريد الإلكتروني *" type="email" dir="ltr"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                  <input value={adminUser} onChange={e => setAdminUser(e.target.value)}
                    placeholder="اسم الدخول *" dir="ltr"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                  <input value={adminPass} onChange={e => setAdminPass(e.target.value)}
                    placeholder="كلمة المرور (8 أحرف على الأقل)" type="text" dir="ltr"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-xl">
                  {error}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={saving || !schoolAr.trim() || !adminEmail.trim() || !adminUser.trim()}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all hover:brightness-110"
                  style={{ background: 'var(--gradient-button)' }}>
                  {saving ? 'جارٍ الإنشاء...' : 'إنشاء المدرسة'}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-5 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50 transition-colors">
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

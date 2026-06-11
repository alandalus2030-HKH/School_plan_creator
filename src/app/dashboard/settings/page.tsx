'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ALL_PERMISSIONS, ROLE_COLORS_PALETTE, PERMISSION_GROUPS } from '@/lib/permissions'
import {
  Bell, Crown, Briefcase, BookOpen, GraduationCap,
  Globe, Heart, ClipboardList, MessageCircle, Users,
  Unlock, AlertTriangle, Save, CircleCheckBig, Building2, Loader2,
} from 'lucide-react'
import SchoolProfile from '@/components/SchoolProfile'
import { usePermissions } from '@/lib/PermissionsContext'
import NoAccess from '@/components/NoAccess'

/* ══════════════════════ فئات القوائم المنسدلة ══════════════════════ */
const CATEGORIES = [
  { key: 'job_title',       label: 'المسمى الوظيفي',   Icon: Briefcase,      desc: 'الوظائف والمسميات الوظيفية' },
  { key: 'department',      label: 'القسم / المادة',     Icon: BookOpen,       desc: 'الأقسام والمواد الدراسية'   },
  { key: 'education_level', label: 'المؤهل العلمي',      Icon: GraduationCap,  desc: 'مستويات التأهيل الأكاديمي' },
  { key: 'nationality',     label: 'الجنسية',            Icon: Globe,          desc: 'قائمة الجنسيات'             },
  { key: 'marital_status',  label: 'الحالة الاجتماعية', Icon: Heart,          desc: 'الحالات الاجتماعية'         },
]

type Option = { id: string; category: string; value: string; sort_order: number; is_active: boolean }
type Role   = { id: string; code: string; name_ar: string; color: string; permissions: string[]; is_system: boolean; sort_order: number }

export default function SettingsPage() {
  const supabase = createClient()
  const { can, loading: permsLoading } = usePermissions()

  /* ══ dropdown_options ══ */
  const [options,    setOptions]    = useState<Option[]>([])
  const [loading,    setLoading]    = useState(true)
  const [activeCat,  setActiveCat]  = useState('job_title')
  const [newValue,   setNewValue]   = useState('')
  const [adding,     setAdding]     = useState(false)
  const [editId,     setEditId]     = useState<string | null>(null)
  const [editValue,  setEditValue]  = useState('')
  const [saving,     setSaving]     = useState(false)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  /* ══ roles ══ */
  const [roles,          setRoles]          = useState<Role[]>([])
  const [showRoleForm,   setShowRoleForm]   = useState(false)
  const [editRole,       setEditRole]       = useState<Role | null>(null)
  const [roleFormName,   setRoleFormName]   = useState('')
  const [roleFormCode,   setRoleFormCode]   = useState('')
  const [roleFormColor,  setRoleFormColor]  = useState(ROLE_COLORS_PALETTE[0])
  const [roleFormPerms,  setRoleFormPerms]  = useState<string[]>([])
  const [roleSaving,     setRoleSaving]     = useState(false)
  const [roleFormError,  setRoleFormError]  = useState('')
  const [confirmDelRole, setConfirmDelRole] = useState<string | null>(null)

  /* ══ إرسال إشعار ══ */
  const [notifTitle,         setNotifTitle]         = useState('')
  const [notifBody,          setNotifBody]          = useState('')
  const [notifLink,          setNotifLink]          = useState('')
  const [notifType,          setNotifType]          = useState('system')
  const [notifRecipient,     setNotifRecipient]     = useState<'me'|'all'|'selected'>('me')
  const [notifUsers,         setNotifUsers]         = useState<{id:string; name_ar:string}[]>([])
  const [notifSelectedUsers, setNotifSelectedUsers] = useState<string[]>([])
  const [sendingNotif,       setSendingNotif]       = useState(false)
  const [notifMsg,           setNotifMsg]           = useState<{ok:boolean; text:string} | null>(null)

  /* ══ تحميل ══ */
  const loadDropdowns = async () => {
    const { data } = await supabase.from('dropdown_options').select('*').order('sort_order').order('value')
    setOptions((data || []) as Option[])
    setLoading(false)
  }
  const loadRoles = async () => {
    const { data } = await supabase.from('roles').select('*').order('sort_order')
    setRoles((data || []).map(r => ({ ...r, permissions: Array.isArray(r.permissions) ? r.permissions : [] })) as Role[])
  }
  useEffect(() => { loadDropdowns(); loadRoles() }, [])

  /* ══ تحميل المستخدمين لقائمة الإشعارات ══ */
  useEffect(() => {
    supabase.from('profiles').select('id, name_ar').eq('is_active', true).order('name_ar')
      .then(({ data }) => setNotifUsers((data || []) as {id:string; name_ar:string}[]))
  }, [])

  /* ══ عمليات القوائم ══ */
  const catOptions = options.filter(o => o.category === activeCat).sort((a, b) => a.sort_order - b.sort_order)

  const addOption = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newValue.trim()) return
    setAdding(true)
    const maxOrder = catOptions.length > 0 ? Math.max(...catOptions.map(o => o.sort_order)) + 1 : 1
    const { error } = await supabase.from('dropdown_options').insert({ category: activeCat, value: newValue.trim(), sort_order: maxOrder })
    if (!error) setNewValue('')
    setAdding(false); await loadDropdowns()
  }

  const saveEdit = async () => {
    if (!editId || !editValue.trim()) return
    setSaving(true)
    await supabase.from('dropdown_options').update({ value: editValue.trim() }).eq('id', editId)
    setEditId(null); setSaving(false); await loadDropdowns()
  }

  const toggleActive = async (opt: Option) => {
    await supabase.from('dropdown_options').update({ is_active: !opt.is_active }).eq('id', opt.id)
    setOptions(prev => prev.map(o => o.id === opt.id ? { ...o, is_active: !o.is_active } : o))
  }

  const deleteOption = async (id: string) => {
    await supabase.from('dropdown_options').delete().eq('id', id)
    setOptions(prev => prev.filter(o => o.id !== id)); setConfirmDel(null)
  }

  const move = async (opt: Option, dir: 'up' | 'down') => {
    const list  = [...catOptions]
    const idx   = list.findIndex(o => o.id === opt.id)
    const other = dir === 'up' ? list[idx - 1] : list[idx + 1]
    if (!other) return
    await Promise.all([
      supabase.from('dropdown_options').update({ sort_order: other.sort_order }).eq('id', opt.id),
      supabase.from('dropdown_options').update({ sort_order: opt.sort_order  }).eq('id', other.id),
    ])
    await loadDropdowns()
  }

  /* ══ عمليات الأدوار ══ */
  const openCreateRole = () => {
    setEditRole(null)
    setRoleFormName(''); setRoleFormCode(''); setRoleFormColor(ROLE_COLORS_PALETTE[0])
    setRoleFormPerms([]); setRoleFormError('')
    setShowRoleForm(true)
  }
  const openEditRole = (r: Role) => {
    setEditRole(r)
    setRoleFormName(r.name_ar); setRoleFormCode(r.code); setRoleFormColor(r.color)
    setRoleFormPerms([...r.permissions]); setRoleFormError('')
    setShowRoleForm(true)
  }
  const togglePerm = (code: string) => {
    setRoleFormPerms(prev => prev.includes(code) ? prev.filter(p => p !== code) : [...prev, code])
  }
  const saveRole = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!roleFormName.trim() || (!editRole && !roleFormCode.trim())) {
      setRoleFormError('الاسم والكود مطلوبان'); return
    }
    setRoleSaving(true); setRoleFormError('')
    const payload: any = {
      name_ar:     roleFormName.trim(),
      color:       roleFormColor,
      permissions: roleFormPerms,
      sort_order:  editRole?.sort_order ?? (roles.length + 1),
    }
    if (!editRole) payload.code = roleFormCode.trim().toLowerCase().replace(/\s+/g, '_')
    let error
    if (editRole) {
      ;({ error } = await supabase.from('roles').update(payload).eq('id', editRole.id))
    } else {
      ;({ error } = await supabase.from('roles').insert(payload))
    }
    if (error) { setRoleFormError(error.message); setRoleSaving(false); return }
    setRoleSaving(false); setShowRoleForm(false); await loadRoles()
  }
  const deleteRole = async (id: string) => {
    await supabase.from('roles').delete().eq('id', id)
    setConfirmDelRole(null); await loadRoles()
  }

  /* ══ loading / access guard ══ */
  if (loading || permsLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full" />
    </div>
  )

  if (!can('manage_settings')) return <NoAccess />

  const activeCatInfo = CATEGORIES.find(c => c.key === activeCat)
  const isRoles  = activeCat === '__roles__'
  const isNotifs = activeCat === '__notifications__'
  const isSchool = activeCat === '__school__'

  const sendNotif = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!notifTitle.trim()) return
    if (notifRecipient === 'selected' && notifSelectedUsers.length === 0) {
      setNotifMsg({ ok: false, text: '⚠️ اختر مستخدماً واحداً على الأقل' }); return
    }
    setSendingNotif(true); setNotifMsg(null)

    const payload: Record<string, unknown> = {
      title: notifTitle,
      body:  notifBody  || undefined,
      link:  notifLink  || undefined,
      type:  notifType,
    }
    if (notifRecipient === 'selected') {
      payload.recipientIds = notifSelectedUsers
    } else {
      payload.recipientId = notifRecipient
    }

    const res  = await fetch('/api/notifications/send', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })
    const json = await res.json()
    setSendingNotif(false)
    if (res.ok) {
      setNotifMsg({ ok: true, text: `✅ تم الإرسال بنجاح (${json.count} مستخدم)` })
      setNotifTitle(''); setNotifBody(''); setNotifLink(''); setNotifSelectedUsers([])
    } else {
      setNotifMsg({ ok: false, text: `⚠️ ${json.error}` })
    }
  }

  return (
    <div className="space-y-5">

      {/* ── رأس الصفحة ── */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800">الإعدادات</h2>
        <p className="text-slate-500 text-sm mt-1">إدارة القوائم المنسدلة، الأدوار، والصلاحيات</p>
      </div>

      <div className="flex gap-5 items-start">

        {/* ══ الشريط الجانبي ══ */}
        <div className="w-56 flex-shrink-0 space-y-2">
          {/* بيانات المدرسة */}
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide px-1 mb-3">المدرسة</p>
          <button
            onClick={() => { setActiveCat('__school__'); setEditId(null); setConfirmDel(null) }}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-right transition-all mb-3
              ${isSchool
                ? 'text-white shadow-lg'
                : 'bg-white border border-slate-200 text-slate-700 hover:border-violet-200 hover:bg-violet-50'}`}
            style={isSchool ? { background: 'var(--gradient-button)' } : undefined}>
            <Building2 size={18} className="flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold truncate ${isSchool ? 'text-white' : 'text-slate-700'}`}>بيانات المدرسة</p>
            </div>
          </button>

          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide px-1 mb-3">القوائم المنسدلة</p>

          {CATEGORIES.map(cat => {
            const count  = options.filter(o => o.category === cat.key).length
            const active = activeCat === cat.key
            return (
              <button key={cat.key}
                onClick={() => { setActiveCat(cat.key); setEditId(null); setConfirmDel(null) }}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-right transition-all
                  ${active
                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-200'
                    : 'bg-white border border-slate-200 text-slate-700 hover:border-violet-200 hover:bg-violet-50'}`}>
                <cat.Icon size={18} className="flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${active ? 'text-white' : 'text-slate-700'}`}>{cat.label}</p>
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold flex-shrink-0
                  ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {count}
                </span>
              </button>
            )
          })}

          {/* فاصل */}
          <div className="pt-3 pb-1">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide px-1">الصلاحيات</p>
          </div>

          {/* زر الأدوار */}
          <button
            onClick={() => { setActiveCat('__roles__'); setEditId(null); setConfirmDel(null) }}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-right transition-all
              ${isRoles
                ? 'bg-amber-500 text-white shadow-lg shadow-amber-200'
                : 'bg-white border border-slate-200 text-slate-700 hover:border-amber-200 hover:bg-amber-50'}`}>
            <Crown size={18} className="flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold truncate ${isRoles ? 'text-white' : 'text-slate-700'}`}>الأدوار والصلاحيات</p>
            </div>
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold flex-shrink-0
              ${isRoles ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
              {roles.length}
            </span>
          </button>

          {/* فاصل */}
          <div className="pt-3 pb-1">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide px-1">التواصل</p>
          </div>

          {/* زر الإشعارات */}
          <button
            onClick={() => { setActiveCat('__notifications__'); setEditId(null); setConfirmDel(null) }}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-right transition-all
              ${activeCat === '__notifications__'
                ? 'bg-violet-600 text-white shadow-lg shadow-violet-200'
                : 'bg-white border border-slate-200 text-slate-700 hover:border-violet-200 hover:bg-violet-50'}`}>
            <Bell size={18} className="flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold truncate ${activeCat === '__notifications__' ? 'text-white' : 'text-slate-700'}`}>إرسال إشعار</p>
            </div>
          </button>
        </div>

        {/* ══ المحتوى الرئيسي ══ */}
        <div className="flex-1 min-w-0">

          {isSchool ? (
            /* ════ قسم بيانات المدرسة ════ */
            <SchoolProfile />
          ) : isNotifs ? (
            /* ════ قسم إرسال الإشعارات ════ */
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 p-5 border-b border-slate-100 bg-gradient-to-l from-violet-50 to-white">
                <Bell size={28} style={{ color: 'var(--maroon-600)', flexShrink: 0 }} />
                <div>
                  <h3 className="font-bold text-slate-800">إرسال إشعار</h3>
                  <p className="text-xs text-slate-400">أرسل إشعاراً لمستخدم محدد أو لجميع المستخدمين</p>
                </div>
              </div>

              <form onSubmit={sendNotif} className="p-5 space-y-4">

                {/* المستلم */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">المستلم</label>

                  {/* أزرار الاختيار السريع */}
                  <div className="flex gap-2 mb-3">
                    {([
                      { value: 'me',       label: 'أنا فقط'           },
                      { value: 'all',      label: 'جميع المستخدمين'   },
                      { value: 'selected', label: 'مستخدمون محددون'   },
                    ] as const).map(opt => (
                      <button key={opt.value} type="button"
                        onClick={() => { setNotifRecipient(opt.value); setNotifSelectedUsers([]) }}
                        className={`flex-1 px-3 py-2 rounded-xl border text-xs font-medium transition-colors
                          ${notifRecipient === opt.value
                            ? 'bg-violet-600 text-white border-violet-600'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-violet-300'}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* قائمة اختيار مستخدمين محددين */}
                  {notifRecipient === 'selected' && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      {/* أدوات سريعة */}
                      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-100">
                        <span className="text-xs text-slate-500">
                          {notifSelectedUsers.length > 0
                            ? `✅ تم اختيار ${notifSelectedUsers.length} مستخدم`
                            : 'اختر المستخدمين المستهدفين'}
                        </span>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setNotifSelectedUsers(notifUsers.map(u => u.id))}
                            className="text-xs text-violet-600 hover:text-violet-800 font-medium">تحديد الكل</button>
                          <span className="text-slate-300">|</span>
                          <button type="button" onClick={() => setNotifSelectedUsers([])}
                            className="text-xs text-slate-500 hover:text-slate-700">إلغاء الكل</button>
                        </div>
                      </div>

                      {/* قائمة المستخدمين */}
                      <div className="max-h-52 overflow-y-auto divide-y divide-slate-50">
                        {notifUsers.map(u => {
                          const checked = notifSelectedUsers.includes(u.id)
                          return (
                            <label key={u.id}
                              className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors
                                ${checked ? 'bg-violet-50' : 'hover:bg-slate-50'}`}>
                              <input type="checkbox" checked={checked}
                                onChange={() => setNotifSelectedUsers(prev =>
                                  prev.includes(u.id) ? prev.filter(x => x !== u.id) : [...prev, u.id]
                                )}
                                className="w-4 h-4 accent-violet-600 flex-shrink-0" />
                              <span className={`text-sm ${checked ? 'text-violet-800 font-medium' : 'text-slate-700'}`}>
                                {u.name_ar}
                              </span>
                            </label>
                          )
                        })}
                        {notifUsers.length === 0 && (
                          <p className="text-center text-sm text-slate-400 py-4">لا يوجد مستخدمون</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* نوع الإشعار */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">النوع</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'system',        label: 'نظام'    },
                      { value: 'task_assigned', label: 'مهمة'    },
                      { value: 'badge_earned',  label: 'وسام'    },
                      { value: 'plan_updated',  label: 'خطة'     },
                      { value: 'task_overdue',  label: 'تأخير'   },
                      { value: 'task_comment',  label: 'تعليق'   },
                    ].map(t => (
                      <button key={t.value} type="button"
                        onClick={() => setNotifType(t.value)}
                        className={`px-3 py-2 rounded-xl border text-xs font-medium transition-colors
                          ${notifType === t.value
                            ? 'bg-violet-600 text-white border-violet-600'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-violet-300'}`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* العنوان */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    عنوان الإشعار <span className="text-red-400">*</span>
                  </label>
                  <input type="text" value={notifTitle} onChange={e => setNotifTitle(e.target.value)}
                    placeholder="مثال: تذكير باجتماع الفريق غداً"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
                </div>

                {/* التفاصيل */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">التفاصيل (اختياري)</label>
                  <textarea value={notifBody} onChange={e => setNotifBody(e.target.value)} rows={3}
                    placeholder="تفاصيل إضافية تظهر تحت عنوان الإشعار..."
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none" />
                </div>

                {/* الرابط */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">الرابط عند الضغط (اختياري)</label>
                  <input type="text" value={notifLink} onChange={e => setNotifLink(e.target.value)}
                    placeholder="مثال: /dashboard/plans"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    dir="ltr" />
                </div>

                {/* رسالة النتيجة */}
                {notifMsg && (
                  <div className={`px-4 py-3 rounded-xl text-sm font-medium border
                    ${notifMsg.ok
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-red-50 text-red-700 border-red-200'}`}>
                    {notifMsg.text}
                  </div>
                )}

                {/* زر الإرسال */}
                <button type="submit" disabled={sendingNotif || !notifTitle.trim()}
                  className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl
                             transition-colors disabled:opacity-50 shadow-lg shadow-violet-200">
                  {sendingNotif ? '⏳ جارٍ الإرسال...' : '📤 إرسال الإشعار'}
                </button>
              </form>
            </div>
          ) : isRoles ? (
            /* ════ قسم الأدوار ════ */
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

                {/* رأس */}
                <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-gradient-to-l from-amber-50 to-white">
                  <div className="flex items-center gap-3">
                    <Crown size={28} style={{ color: 'var(--maroon-600)', flexShrink: 0 }} />
                    <div>
                      <h3 className="font-bold text-slate-800">الأدوار والصلاحيات</h3>
                      <p className="text-xs text-slate-400">تحديد ما يستطيع كل دور فعله في النظام · {roles.length} دور</p>
                    </div>
                  </div>
                  <button onClick={openCreateRole}
                    className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                    ➕ دور جديد
                  </button>
                </div>

                {/* قائمة الأدوار */}
                <div className="divide-y divide-slate-100">
                  {roles.map(role => (
                    <div key={role.id} className="group">
                      {confirmDelRole === role.id ? (
                        <div className="flex items-center gap-3 p-4 bg-red-50">
                          <span className="text-sm text-red-700 flex-1">حذف دور "{role.name_ar}"؟ لا يمكن التراجع.</span>
                          <button onClick={() => deleteRole(role.id)} className="px-4 py-2 bg-red-600 text-white text-sm rounded-xl">نعم</button>
                          <button onClick={() => setConfirmDelRole(null)} className="px-3 py-2 border border-slate-200 text-slate-600 text-sm rounded-xl">لا</button>
                        </div>
                      ) : (
                        <div className="flex items-start gap-4 p-4">
                          {/* أيقونة الدور */}
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
                            style={{ backgroundColor: role.color }}>
                            {role.name_ar[0]}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <span className="font-bold text-slate-800">{role.name_ar}</span>
                              <span className="text-xs font-mono bg-slate-100 text-slate-500 px-2 py-0.5 rounded">{role.code}</span>
                              {role.is_system && (
                                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">🔒 نظامي</span>
                              )}
                            </div>

                            {/* الصلاحيات */}
                            <div className="flex flex-wrap gap-1.5">
                              {role.permissions.includes('all') ? (
                                <span className="text-xs bg-violet-100 text-violet-700 px-2.5 py-1 rounded-full font-medium">كل الصلاحيات</span>
                              ) : role.permissions.length === 0 ? (
                                <span className="text-xs text-slate-400 italic">لا توجد صلاحيات</span>
                              ) : role.permissions.map(p => {
                                const info = ALL_PERMISSIONS.find(x => x.code === p)
                                return info ? (
                                  <span key={p} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                                    {info.label}
                                  </span>
                                ) : null
                              })}
                            </div>
                          </div>

                          {/* الأزرار */}
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <button onClick={() => openEditRole(role)}
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-50 transition-colors">✏️</button>
                            {!role.is_system && (
                              <button onClick={() => setConfirmDelRole(role.id)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">🗑️</button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* بطاقة شرح الصلاحيات */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <h4 className="font-bold text-slate-700 mb-3 text-sm flex items-center gap-2">
                  <ClipboardList size={14} style={{ color: 'var(--maroon-600)' }} /> قائمة الصلاحيات المتاحة في النظام
                </h4>
                <div className="space-y-4">
                  {PERMISSION_GROUPS.map(group => (
                    <div key={group.title}>
                      <p className="text-xs font-bold text-slate-500 mb-2">{group.title}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {group.codes.map(code => {
                          const p = ALL_PERMISSIONS.find(x => x.code === code)
                          if (!p) return null
                          return (
                            <div key={p.code} className="flex items-center gap-3 text-sm bg-slate-50 px-3 py-2.5 rounded-xl">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--maroon-400)' }} />
                              <div>
                                <p className="font-medium text-xs text-slate-700">{p.label}</p>
                                <p className="text-xs text-slate-400 font-mono mt-0.5">{p.code}</p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          ) : activeCatInfo ? (
            /* ════ قسم القوائم المنسدلة ════ */
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

              {/* رأس الفئة */}
              <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-gradient-to-l from-violet-50 to-white">
                <div className="flex items-center gap-3">
                  <activeCatInfo.Icon size={28} style={{ color: 'var(--maroon-600)', flexShrink: 0 }} />
                  <div>
                    <h3 className="font-bold text-slate-800">{activeCatInfo.label}</h3>
                    <p className="text-xs text-slate-400">{activeCatInfo.desc} · {catOptions.length} بند</p>
                  </div>
                </div>
              </div>

              {/* حقل الإضافة */}
              <form onSubmit={addOption} className="flex items-center gap-3 p-4 bg-violet-50 border-b border-violet-100">
                <input
                  value={newValue} onChange={e => setNewValue(e.target.value)}
                  placeholder={`➕ أضف بنداً جديداً إلى "${activeCatInfo.label}"...`}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-sm"
                />
                <button type="submit" disabled={adding || !newValue.trim()}
                  className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
                  {adding ? '...' : 'إضافة'}
                </button>
              </form>

              {/* قائمة البنود */}
              {catOptions.length === 0 ? (
                <div className="p-10 text-center">
                  <p className="text-slate-400 text-sm">لا توجد بنود بعد</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {catOptions.map((opt, idx) => (
                    <div key={opt.id} className={`group transition-colors ${opt.is_active ? '' : 'bg-slate-50'}`}>
                      {editId === opt.id ? (
                        <div className="flex items-center gap-2 p-3 bg-amber-50">
                          <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditId(null) }}
                            className="flex-1 px-3 py-2 rounded-xl border border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white text-sm" />
                          <button onClick={saveEdit} disabled={saving}
                            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm rounded-xl font-medium disabled:opacity-50">
                            {saving ? '...' : '💾 حفظ'}
                          </button>
                          <button onClick={() => setEditId(null)}
                            className="px-3 py-2 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-white">إلغاء</button>
                        </div>
                      ) : confirmDel === opt.id ? (
                        <div className="flex items-center gap-3 p-3 bg-red-50">
                          <span className="text-sm text-red-700 flex-1">حذف "{opt.value}"؟</span>
                          <button onClick={() => deleteOption(opt.id)} className="px-4 py-2 bg-red-600 text-white text-sm rounded-xl">نعم</button>
                          <button onClick={() => setConfirmDel(null)} className="px-3 py-2 border border-slate-200 text-slate-600 text-sm rounded-xl">لا</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 px-4 py-3">
                          <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => move(opt, 'up')} disabled={idx === 0}
                              className="w-5 h-5 flex items-center justify-center text-slate-300 hover:text-slate-600 disabled:opacity-20 text-xs leading-none">▲</button>
                            <button onClick={() => move(opt, 'down')} disabled={idx === catOptions.length - 1}
                              className="w-5 h-5 flex items-center justify-center text-slate-300 hover:text-slate-600 disabled:opacity-20 text-xs leading-none">▼</button>
                          </div>
                          <span className="w-6 text-xs text-slate-300 font-mono text-center flex-shrink-0">{idx + 1}</span>
                          <span className={`flex-1 text-sm ${opt.is_active ? 'text-slate-700' : 'text-slate-400 line-through'}`}>
                            {opt.value}
                          </span>
                          {!opt.is_active && (
                            <span className="text-xs bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full">مخفي</span>
                          )}
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => toggleActive(opt)} title={opt.is_active ? 'إخفاء' : 'إظهار'}
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-sm hover:bg-slate-100 transition-colors">
                              {opt.is_active ? '👁️' : '🚫'}
                            </button>
                            <button onClick={() => { setEditId(opt.id); setEditValue(opt.value) }}
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-50 transition-colors">✏️</button>
                            <button onClick={() => setConfirmDel(opt.id)}
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">🗑️</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* ══ مودال إنشاء / تعديل دور ══ */}
      {showRoleForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setShowRoleForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>

            <h3 className="text-lg font-bold text-slate-800 mb-5">
              {editRole ? '✏️ تعديل الدور' : '➕ دور جديد'}
            </h3>

            <form onSubmit={saveRole} className="space-y-5">
              {/* الاسم */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">اسم الدور *</label>
                <input value={roleFormName} onChange={e => setRoleFormName(e.target.value)} required
                  placeholder="مثال: مشرف أكاديمي"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm" />
              </div>

              {/* الكود — عند الإنشاء فقط */}
              {!editRole && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    كود الدور * <span className="text-xs text-slate-400 font-normal">(أحرف إنجليزية وشرطة سفلية)</span>
                  </label>
                  <input
                    value={roleFormCode}
                    onChange={e => setRoleFormCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    required dir="ltr" placeholder="academic_supervisor"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm font-mono" />
                </div>
              )}

              {/* اللون */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">لون الدور</label>
                <div className="flex gap-2 flex-wrap">
                  {ROLE_COLORS_PALETTE.map(c => (
                    <button key={c} type="button" onClick={() => setRoleFormColor(c)}
                      className={`w-8 h-8 rounded-full transition-all ${roleFormColor === c ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'hover:scale-105'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>

              {/* الصلاحيات */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-slate-700">الصلاحيات</label>
                  {!editRole?.is_system && (
                    <div className="flex items-center gap-2 text-xs">
                      <button type="button" onClick={() => setRoleFormPerms(ALL_PERMISSIONS.map(p => p.code))}
                        className="text-amber-700 hover:text-amber-800 font-semibold">تحديد الكل</button>
                      <span className="text-slate-300">·</span>
                      <button type="button" onClick={() => setRoleFormPerms([])}
                        className="text-slate-500 hover:text-slate-700">مسح الكل</button>
                    </div>
                  )}
                </div>

                {editRole?.is_system ? (
                  <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-3 rounded-xl flex items-center gap-1.5">
                    <span className="inline-flex"><Unlock size={14} /></span>
                    هذا الدور النظامي يملك كل الصلاحيات تلقائياً ولا يمكن تقييدها
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {PERMISSION_GROUPS.map(group => {
                      const items = group.codes
                        .map(code => ALL_PERMISSIONS.find(p => p.code === code))
                        .filter(Boolean) as { code: string; label: string }[]
                      if (items.length === 0) return null
                      const allOn = items.every(p => roleFormPerms.includes(p.code))
                      return (
                        <div key={group.title} className="rounded-xl border border-slate-200 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-bold text-slate-500">{group.title}</p>
                            <button type="button"
                              onClick={() => setRoleFormPerms(prev => allOn
                                ? prev.filter(c => !group.codes.includes(c))
                                : [...new Set([...prev, ...group.codes])])}
                              className="text-[10px] text-amber-600 hover:text-amber-800 font-medium">
                              {allOn ? 'إلغاء' : 'الكل'}
                            </button>
                          </div>
                          <div className="space-y-1">
                            {items.map(p => {
                              const on = roleFormPerms.includes(p.code)
                              return (
                                <label key={p.code}
                                  className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors
                                    ${on ? 'bg-amber-50' : 'hover:bg-slate-50'}`}>
                                  <input type="checkbox" checked={on} onChange={() => togglePerm(p.code)}
                                    className="w-4 h-4 accent-amber-500 flex-shrink-0" />
                                  <div className="min-w-0">
                                    <p className="text-sm text-slate-700 leading-tight">{p.label}</p>
                                    <p className="text-[10px] text-slate-400 font-mono">{p.code}</p>
                                  </div>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {roleFormError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
                  <AlertTriangle size={14} className="inline ml-1" /> {roleFormError}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={roleSaving}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 rounded-xl disabled:opacity-60 transition-colors">
                  {/* أيقونة ونص معزولان في span ثابت لتجنّب خطأ removeChild في React */}
                  <span className="inline-flex">
                    {roleSaving ? <Loader2 size={14} className="animate-spin" /> : editRole ? <Save size={14} /> : <CircleCheckBig size={14} />}
                  </span>
                  <span>{roleSaving ? 'جارٍ الحفظ...' : editRole ? 'حفظ التعديلات' : 'إنشاء الدور'}</span>
                </button>
                <button type="button" onClick={() => setShowRoleForm(false)}
                  className="px-5 py-3 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors">
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

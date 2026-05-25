'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const TEAM_COLORS = [
  '#7c3aed', '#2563eb', '#0891b2', '#059669',
  '#d97706', '#dc2626', '#db2777', '#4f46e5',
]

type Profile = { id: string; name_ar: string; role: string; job_title: string | null; is_active: boolean }
type TeamMember = { team_id: string; profile_id: string; profile?: Profile }
type Team = {
  id: string
  name_ar: string
  description: string | null
  color: string
  leader_id: string | null
  created_at: string
  members?: TeamMember[]
  taskCount?: number
}

export default function TeamsPage() {
  const supabase = createClient()
  const [teams,       setTeams]       = useState<Team[]>([])
  const [profiles,    setProfiles]    = useState<Profile[]>([])
  const [loading,     setLoading]     = useState(true)
  const [expanded,    setExpanded]    = useState<string | null>(null)

  /* ── إنشاء / تعديل فريق ── */
  const [showForm,    setShowForm]    = useState(false)
  const [editTeam,    setEditTeam]    = useState<Team | null>(null)
  const [formName,    setFormName]    = useState('')
  const [formDesc,    setFormDesc]    = useState('')
  const [formColor,   setFormColor]   = useState(TEAM_COLORS[0])
  const [formLeader,  setFormLeader]  = useState('')
  const [saving,      setSaving]      = useState(false)
  const [formError,   setFormError]   = useState('')

  /* ── حذف فريق ── */
  const [confirmDel,  setConfirmDel]  = useState<string | null>(null)

  /* ── إضافة عضو ── */
  const [addingTo,    setAddingTo]    = useState<string | null>(null)
  const [selUser,     setSelUser]     = useState('')

  const load = async () => {
    const [{ data: teamsData }, { data: membersData }, { data: profilesData }] = await Promise.all([
      supabase.from('teams').select('*').order('created_at', { ascending: false }),
      supabase.from('team_members').select('team_id, profile_id'),
      supabase.from('profiles').select('id, name_ar, role, job_title, is_active').order('name_ar'),
    ])

    const profs = (profilesData || []) as Profile[]
    setProfiles(profs)

    const members = (membersData || []) as TeamMember[]

    // عدد المهام لكل فريق (يعمل حتى لو لم يُضَف العمود بعد)
    let taskCounts: any[] = []
    try {
      const { data: tc } = await supabase
        .from('tasks').select('assigned_to_team_id')
        .not('assigned_to_team_id', 'is', null)
      taskCounts = tc || []
    } catch { taskCounts = [] }

    const enriched = ((teamsData || []) as Team[]).map(t => ({
      ...t,
      members: members
        .filter(m => m.team_id === t.id)
        .map(m => ({ ...m, profile: profs.find(p => p.id === m.profile_id) })),
      taskCount: taskCounts.filter(x => x.assigned_to_team_id === t.id).length,
    }))
    setTeams(enriched)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  /* ── فتح نموذج الإنشاء ── */
  const openCreate = () => {
    setEditTeam(null)
    setFormName(''); setFormDesc(''); setFormColor(TEAM_COLORS[0]); setFormLeader(''); setFormError('')
    setShowForm(true)
  }

  /* ── فتح نموذج التعديل ── */
  const openEdit = (t: Team) => {
    setEditTeam(t)
    setFormName(t.name_ar); setFormDesc(t.description || ''); setFormColor(t.color); setFormLeader(t.leader_id || ''); setFormError('')
    setShowForm(true)
  }

  /* ── حفظ الفريق ── */
  const saveTeam = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formName.trim()) return
    setSaving(true)
    setFormError('')
    const payload = {
      name_ar:     formName.trim(),
      description: formDesc.trim() || null,
      color:       formColor,
      leader_id:   formLeader || null,
    }
    let error
    if (editTeam) {
      ;({ error } = await supabase.from('teams').update(payload).eq('id', editTeam.id))
    } else {
      ;({ error } = await supabase.from('teams').insert(payload))
    }
    if (error) {
      setFormError(error.message)
      setSaving(false)
      return
    }
    setSaving(false); setShowForm(false); await load()
  }

  /* ── حذف فريق ── */
  const deleteTeam = async (id: string) => {
    await supabase.from('teams').delete().eq('id', id)
    setConfirmDel(null); await load()
  }

  /* ── إضافة عضو ── */
  const addMember = async (teamId: string) => {
    if (!selUser) return
    const { error } = await supabase
      .from('team_members')
      .upsert({ team_id: teamId, profile_id: selUser }, { onConflict: 'team_id,profile_id' })
    if (error) { alert('خطأ في إضافة العضو: ' + error.message); return }
    setSelUser(''); setAddingTo(null); await load()
  }

  /* ── حذف عضو ── */
  const removeMember = async (teamId: string, userId: string) => {
    const { error } = await supabase
      .from('team_members').delete().eq('team_id', teamId).eq('profile_id', userId)
    if (error) { alert('خطأ في الحذف: ' + error.message); return }
    await load()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="space-y-5">

      {/* ── رأس الصفحة ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">الفرق</h2>
          <p className="text-slate-500 text-sm mt-1">تنظيم المستخدمين في فرق عمل</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-lg shadow-violet-200">
          ➕ فريق جديد
        </button>
      </div>

      {/* ── إحصائية ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'إجمالي الفرق',  value: teams.length,                                    icon: '👥' },
          { label: 'إجمالي الأعضاء',value: teams.reduce((s, t) => s + (t.members?.length || 0), 0), icon: '👤' },
          { label: 'المستخدمون',    value: profiles.length,                                 icon: '📋' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm text-center">
            <div className="text-3xl mb-1">{s.icon}</div>
            <div className="text-2xl font-bold text-slate-800">{s.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── قائمة الفرق ── */}
      {teams.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <p className="text-4xl mb-3">👥</p>
          <p className="text-slate-500 font-medium mb-4">لا توجد فرق بعد</p>
          <button onClick={openCreate}
            className="bg-violet-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-violet-700 transition-colors">
            ➕ أنشئ أول فريق
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {teams.map(team => {
            const leader  = profiles.find(p => p.id === team.leader_id)
            const members = team.members || []
            const isOpen  = expanded === team.id
            const membersNotInTeam = profiles.filter(p => !members.some(m => m.profile_id === p.id))

            return (
              <div key={team.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

                {/* ── رأس الفريق ── */}
                {confirmDel === team.id ? (
                  <div className="p-4 bg-red-50 flex items-center gap-3 flex-wrap">
                    <span className="text-sm text-red-700 flex-1">حذف فريق "{team.name_ar}" وإزالة جميع أعضائه؟</span>
                    <button onClick={() => deleteTeam(team.id)}
                      className="px-4 py-2 bg-red-600 text-white text-sm rounded-xl font-medium">نعم، احذف</button>
                    <button onClick={() => setConfirmDel(null)}
                      className="px-4 py-2 border border-slate-200 text-slate-600 text-sm rounded-xl">إلغاء</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-4 p-4 group">
                    {/* لون الفريق */}
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-xl flex-shrink-0"
                      style={{ backgroundColor: team.color }}>
                      {team.name_ar[0]}
                    </div>

                    {/* المعلومات */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-800">{team.name_ar}</span>
                        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{members.length} عضو</span>
                        {(team.taskCount ?? 0) > 0 && (
                          <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">
                            ✅ {team.taskCount} مهمة
                          </span>
                        )}
                      </div>

                      {/* القائد بارز */}
                      {leader && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                            style={{ backgroundColor: team.color }}>
                            {leader.name_ar[0]}
                          </div>
                          <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            👑 القائد: {leader.name_ar}
                          </span>
                        </div>
                      )}

                      {team.description && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{team.description}</p>
                      )}

                      {/* صور الأعضاء */}
                      {members.length > 0 && (
                        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                          {members.slice(0, 8).map(m => (
                            <div key={m.profile_id}
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold
                                ${m.profile_id === team.leader_id
                                  ? 'ring-2 ring-amber-400 ring-offset-1'
                                  : 'bg-gradient-to-br from-violet-400 to-indigo-500'}`}
                              style={m.profile_id === team.leader_id ? { backgroundColor: team.color } : {}}
                              title={`${m.profile?.name_ar}${m.profile_id === team.leader_id ? ' 👑' : ''}`}>
                              {(m.profile?.name_ar || '؟')[0]}
                            </div>
                          ))}
                          {members.length > 8 && (
                            <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-[10px] font-bold">
                              +{members.length - 8}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* الأزرار */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* زر توسيع */}
                      <button onClick={() => setExpanded(isOpen ? null : team.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors text-lg">
                        {isOpen ? '▲' : '▼'}
                      </button>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <button onClick={() => openEdit(team)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-50 transition-colors">✏️</button>
                        <button onClick={() => setConfirmDel(team.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">🗑️</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── تفاصيل الأعضاء ── */}
                {isOpen && (
                  <div className="border-t border-slate-100 p-4 bg-slate-50 space-y-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">أعضاء الفريق</p>

                    {/* قائمة الأعضاء */}
                    {members.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-2">لا يوجد أعضاء بعد</p>
                    ) : (
                      <div className="space-y-2">
                        {members.map(m => (
                          <div key={m.profile_id} className="flex items-center gap-3 bg-white rounded-xl p-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {(m.profile?.name_ar || '؟')[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-700">{m.profile?.name_ar || 'مستخدم'}</p>
                              <p className="text-xs text-slate-400">{m.profile?.job_title || ''}</p>
                            </div>
                            {m.profile_id === team.leader_id && (
                              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">👑 قائد</span>
                            )}
                            <button
                              onClick={() => removeMember(team.id, m.profile_id)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                              title="إزالة من الفريق">✕</button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* إضافة عضو */}
                    {addingTo === team.id ? (
                      <div className="flex items-center gap-2">
                        <select value={selUser} onChange={e => setSelUser(e.target.value)}
                          className="flex-1 px-3 py-2 rounded-xl border border-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-sm">
                          <option value="">— اختر مستخدماً —</option>
                          {membersNotInTeam.map(p => (
                            <option key={p.id} value={p.id}>{p.name_ar}</option>
                          ))}
                        </select>
                        <button onClick={() => addMember(team.id)} disabled={!selUser}
                          className="px-4 py-2 bg-violet-600 text-white text-sm rounded-xl font-medium disabled:opacity-50 hover:bg-violet-700 transition-colors">
                          إضافة
                        </button>
                        <button onClick={() => { setAddingTo(null); setSelUser('') }}
                          className="px-3 py-2 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-white transition-colors">
                          إلغاء
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => { setAddingTo(team.id); setSelUser('') }}
                        className="flex items-center gap-2 text-sm text-violet-600 hover:text-violet-800 font-medium transition-colors">
                        ➕ إضافة عضو
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ══ مودال إنشاء / تعديل فريق ══ */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800 mb-5">
              {editTeam ? '✏️ تعديل الفريق' : '➕ فريق جديد'}
            </h3>
            <form onSubmit={saveTeam} className="space-y-4">
              {/* اسم الفريق */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">اسم الفريق *</label>
                <input value={formName} onChange={e => setFormName(e.target.value)} required
                  placeholder="مثال: فريق الرياضيات"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 text-sm" />
              </div>

              {/* الوصف */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">الوصف (اختياري)</label>
                <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} rows={2}
                  placeholder="وصف مختصر للفريق..."
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 text-sm resize-none" />
              </div>

              {/* اللون */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">لون الفريق</label>
                <div className="flex gap-2 flex-wrap">
                  {TEAM_COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setFormColor(c)}
                      className={`w-8 h-8 rounded-full transition-all ${formColor === c ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'hover:scale-105'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>

              {/* قائد الفريق */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">قائد الفريق (اختياري)</label>
                <select value={formLeader} onChange={e => setFormLeader(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 text-sm">
                  <option value="">— بدون قائد —</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.name_ar}</option>)}
                </select>
              </div>

              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
                  ⚠️ {formError}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={saving}
                  className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-semibold py-3 rounded-xl disabled:opacity-60 transition-colors">
                  {saving ? 'جارٍ الحفظ...' : (editTeam ? '💾 حفظ التعديلات' : '✅ إنشاء الفريق')}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
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

'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/lib/PermissionsContext'
import { Users, UserRound, ClipboardList, BarChart3, Crown, Pencil, Trash2, X, Plus, AlertTriangle } from 'lucide-react'
import WorkloadView from '@/components/WorkloadView'
import ConfirmDialog from '@/components/ConfirmDialog'

const TEAM_COLORS = [
  '#8a1538', '#a83356', '#c25c74', '#6f1029',
  '#d98ea0', '#0891b2', '#059669', '#d97706',
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
  const { can } = usePermissions()
  /* إدارة الفرق (إنشاء/تعديل/حذف/أعضاء) لمن يملك manage_teams — العرض متاح للجميع */
  const canManage = can('manage_teams')
  const [teams,       setTeams]       = useState<Team[]>([])
  const [profiles,    setProfiles]    = useState<Profile[]>([])
  const [loading,     setLoading]     = useState(true)
  const [expanded,    setExpanded]    = useState<string | null>(null)
  const [view,        setView]        = useState<'teams' | 'workload'>('teams')

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
  const [selUsers,    setSelUsers]    = useState<string[]>([])

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
      /* جلب school_id للمستخدم — مطلوب لسياسة RLS */
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('profiles').select('school_id').eq('id', user?.id).single()
      ;({ error } = await supabase.from('teams').insert({
        ...payload,
        school_id: profile?.school_id ?? null,
      }))
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
    if (selUsers.length === 0) return
    const rows = selUsers.map(uid => ({ team_id: teamId, profile_id: uid }))
    const { error } = await supabase
      .from('team_members')
      .upsert(rows, { onConflict: 'team_id,profile_id' })
    if (error) { alert('خطأ في إضافة الأعضاء: ' + error.message); return }
    setSelUsers([]); setAddingTo(null); await load()
  }

  const toggleSelUser = (uid: string) =>
    setSelUsers(prev => prev.includes(uid) ? prev.filter(x => x !== uid) : [...prev, uid])

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
          <p className="text-slate-500 text-sm mt-1">تنظيم المستخدمين ومتابعة حِمل العمل</p>
        </div>
        {view === 'teams' && canManage && (
          <button onClick={openCreate}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-lg shadow-violet-200">
            <Users size={16} /> فريق جديد
          </button>
        )}
      </div>

      {/* ── تبويبات ── */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl w-fit">
        <button onClick={() => setView('teams')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-1.5
            ${view === 'teams' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <Users size={14} /> الفرق
        </button>
        <button onClick={() => setView('workload')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-1.5
            ${view === 'workload' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <BarChart3 size={14} /> توزيع العمل
        </button>
      </div>

      {/* ── عرض توزيع العمل ── */}
      {view === 'workload' && <WorkloadView />}

      {/* ════ عرض الفرق ════ */}
      {view === 'teams' && (<>

      {/* ── إحصائية ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'إجمالي الفرق',   value: teams.length,                                              Icon: Users,        tone: 'dark'   },
          { label: 'إجمالي الأعضاء', value: teams.reduce((s, t) => s + (t.members?.length || 0), 0), Icon: UserRound,    tone: 'medium' },
          { label: 'المستخدمون',     value: profiles.length,                                          Icon: ClipboardList, tone: 'light'  },
        ].map(s => {
          const tMap: Record<string,{bg:string;fg:string;iconFg:string}> = {
            dark:   { bg:'linear-gradient(135deg,#5a0d22,#8a1538)', fg:'#fff',    iconFg:'rgba(255,255,255,0.8)' },
            medium: { bg:'#f4dde2', fg:'#8a1538', iconFg:'#c25c74' },
            light:  { bg:'#fbf2f4', fg:'#6f1029', iconFg:'#d98ea0' },
          }
          const t = tMap[s.tone]
          return (
            <div key={s.label} className="rounded-2xl p-4 shadow-sm text-center"
              style={{ background: t.bg, color: t.fg }}>
              <s.Icon size={24} style={{ color: t.iconFg, margin: '0 auto 6px' }} />
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-xs mt-0.5 opacity-80">{s.label}</div>
            </div>
          )
        })}
      </div>

      {/* ── قائمة الفرق ── */}
      {teams.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <div className="flex justify-center mb-3" style={{ color: 'var(--maroon-300)' }}><Users size={40} /></div>
          <p className="text-slate-500 font-medium mb-4">لا توجد فرق بعد</p>
          {canManage && (
            <button onClick={openCreate}
              className="inline-flex items-center gap-1.5 bg-violet-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-violet-700 transition-colors">
              <Users size={15} /> أنشئ أول فريق
            </button>
          )}
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
                {(
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
                          <span className="inline-flex items-center gap-1 text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">
                            <ClipboardList size={11} /> {team.taskCount} مهمة
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
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            <Crown size={12} /> القائد: {leader.name_ar}
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
                              title={`${m.profile?.name_ar}${m.profile_id === team.leader_id ? ' (القائد)' : ''}`}>
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
                      {canManage && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                          <button onClick={() => openEdit(team)} title="تعديل"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-50 transition-colors"><Pencil size={15} /></button>
                          <button onClick={() => setConfirmDel(team.id)} title="حذف"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 size={15} /></button>
                        </div>
                      )}
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
                              <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full"><Crown size={11} /> قائد</span>
                            )}
                            {canManage && (
                              <button
                                onClick={() => removeMember(team.id, m.profile_id)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                title="إزالة من الفريق"><X size={14} /></button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* إضافة أعضاء — لمن يملك manage_teams (اختيار متعدد بمربعات) */}
                    {!canManage ? null : addingTo === team.id ? (
                      <div className="space-y-2">
                        {membersNotInTeam.length === 0 ? (
                          <p className="text-xs text-slate-400 py-2">كل المستخدمين أعضاء في هذا الفريق.</p>
                        ) : (
                          <>
                            <div className="flex items-center justify-between px-1">
                              <span className="text-xs text-slate-500">اختر عضواً أو أكثر ({selUsers.length} محدّد)</span>
                              <button
                                onClick={() => setSelUsers(
                                  selUsers.length === membersNotInTeam.length ? [] : membersNotInTeam.map(p => p.id)
                                )}
                                className="text-xs text-violet-600 hover:underline font-medium">
                                {selUsers.length === membersNotInTeam.length ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
                              </button>
                            </div>
                            <div className="max-h-52 overflow-y-auto rounded-xl border border-violet-200 bg-white divide-y divide-slate-50">
                              {membersNotInTeam.map(p => (
                                <label key={p.id}
                                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-violet-50 cursor-pointer">
                                  <input type="checkbox" checked={selUsers.includes(p.id)}
                                    onChange={() => toggleSelUser(p.id)} className="accent-violet-600" />
                                  <span>{p.name_ar}</span>
                                </label>
                              ))}
                            </div>
                          </>
                        )}
                        <div className="flex items-center gap-2">
                          <button onClick={() => addMember(team.id)} disabled={selUsers.length === 0}
                            className="px-4 py-2 bg-violet-600 text-white text-sm rounded-xl font-medium disabled:opacity-50 hover:bg-violet-700 transition-colors">
                            إضافة {selUsers.length > 0 ? `(${selUsers.length})` : ''}
                          </button>
                          <button onClick={() => { setAddingTo(null); setSelUsers([]) }}
                            className="px-3 py-2 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-white transition-colors">
                            إلغاء
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setAddingTo(team.id); setSelUsers([]) }}
                        className="flex items-center gap-2 text-sm text-violet-600 hover:text-violet-800 font-medium transition-colors">
                        <Plus size={15} /> إضافة أعضاء
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      </>)}

      {/* ══ مودال إنشاء / تعديل فريق ══ */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h3 className="inline-flex items-center gap-1.5 text-lg font-bold text-slate-800 mb-5">
              <span className="inline-flex">{editTeam ? <Pencil size={16} /> : <Plus size={16} />}</span>{editTeam ? 'تعديل الفريق' : 'فريق جديد'}
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
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
                  <AlertTriangle size={15} className="flex-shrink-0" /> {formError}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={saving}
                  className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-semibold py-3 rounded-xl disabled:opacity-60 transition-colors">
                  {saving ? 'جارٍ الحفظ...' : (editTeam ? 'حفظ التعديلات' : 'إنشاء الفريق')}
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

      {(() => {
        const t = confirmDel ? teams.find(x => x.id === confirmDel) : null
        return (
          <ConfirmDialog
            open={!!t}
            title="حذف الفريق"
            message={t ? <>سيتم حذف فريق «<strong>{t.name_ar}</strong>» وإزالة جميع أعضائه.</> : null}
            onConfirm={() => confirmDel && deleteTeam(confirmDel)}
            onCancel={() => setConfirmDel(null)}
          />
        )
      })()}
    </div>
  )
}

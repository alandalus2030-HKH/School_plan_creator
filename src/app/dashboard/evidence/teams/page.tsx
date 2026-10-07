'use client'

/* ════════════════════════════════════════════════════════════
   فرق التركيز الخمسة — الوثيقة 3.2 · 3.6

   خمسةُ فرق بُذرت لكل مدرسة في ترحيل 074، واحدٌ لكل معيار رئيس،
   مرتبطةً بـ**رمز المعيار** لا بمعرّف عقدة (العقد تتبدّل بالإصدار).
   وهنا تُشكَّل: من يفرز أدلة كل معيار، ومن يقود الفريق.

   ولماذا تسبق الطابور: «توزيع الحمل على خمسة فرق — 400 دليل للفريق
   لا طابور واحد يختنق» (3.6). وبلا أعضاء يبقى الطابور واحداً.
   ════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Loader2, Users, Crown, UserPlus, X, ShieldCheck } from 'lucide-react'
import NoAccess from '@/components/NoAccess'
import { toast } from '@/components/Toast'

type Team   = { id: string; name_ar: string; standard_code: string; lead_id: string | null; sort_order: number }
type Member = { team_id: string; profile_id: string; role_in_team: string }
type Person = { id: string; name_ar: string; job_title: string | null; department: string | null }

export default function FocusTeamsPage() {
  const [loading, setLoading] = useState(true)
  const [denied,  setDenied]  = useState(false)
  const [teams,   setTeams]   = useState<Team[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [people,  setPeople]  = useState<Person[]>([])
  const [busy,    setBusy]    = useState('')
  const [adding,  setAdding]  = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/focus-teams')
    if (res.status === 403) { setDenied(true); setLoading(false); return }
    const j = await res.json()
    setTeams(j.teams || []); setMembers(j.members || []); setPeople(j.people || [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const act = async (teamId: string, profileId: string, action: 'add' | 'remove' | 'lead') => {
    setBusy(teamId + profileId)
    const res = await fetch('/api/focus-teams', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId, profileId, action }),
    })
    const j = await res.json().catch(() => ({}))
    setBusy('')
    if (!res.ok) { toast(j.error || 'تعذّر التعديل', 'error'); return }
    setAdding(null)
    await load()
  }

  const nameOf  = (id: string) => people.find(p => p.id === id)?.name_ar || '—'
  const titleOf = (id: string) => people.find(p => p.id === id)?.job_title || ''
  const membersOf = (teamId: string) => members.filter(m => m.team_id === teamId)

  if (denied)  return <NoAccess message="فرق التركيز تتطلّب صلاحية «فرز الأدلة»." />
  if (loading) return (
    <div className="p-10 text-center text-slate-500">
      <span className="inline-flex"><Loader2 className="animate-spin" size={22} /></span>
      <p className="mt-2 text-sm">تُحمَّل الفرق…</p>
    </div>
  )

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <span className="inline-flex text-violet-600"><Users size={20} /></span>
            <span>فرق التركيز</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            فريقٌ لكل معيار رئيس — يفرز أدلته ويقبلها. والفريق بلا أعضاء طابورٌ لا يُفتح.
          </p>
        </div>
        <Link href="/dashboard/evidence/triage"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border border-slate-200 bg-white text-slate-600 hover:border-violet-300">
          <span className="inline-flex"><ShieldCheck size={14} /></span>
          <span>طابور الفرز</span>
        </Link>
      </div>

      <div className="space-y-3">
        {teams.map(t => {
          const ms = membersOf(t.id)
          const free = people.filter(p => !ms.some(m => m.profile_id === p.id))
          return (
            <div key={t.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-violet-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
                  {t.standard_code}
                </span>
                <span className="font-bold text-slate-800 text-sm">{t.name_ar}</span>
                <span className="text-xs text-slate-400">({ms.length} عضواً)</span>
              </div>

              <div className="p-3 space-y-2">
                {ms.length === 0 && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                    بلا أعضاء — فأدلة هذا المعيار لا تصل أحداً، ويبقى فرزها على الإدارة وحدها.
                  </p>
                )}

                {ms.map(m => (
                  <div key={m.profile_id} className="flex items-center gap-2 p-2 rounded-xl border border-slate-100 bg-white">
                    <span className="inline-flex shrink-0 text-slate-400">
                      {t.lead_id === m.profile_id ? <Crown size={14} className="text-amber-500" /> : <Users size={14} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-slate-700">{nameOf(m.profile_id)}</span>
                      {!!titleOf(m.profile_id) && <span className="block text-[11px] text-slate-400">{titleOf(m.profile_id)}</span>}
                    </span>
                    {t.lead_id !== m.profile_id && (
                      <button onClick={() => act(t.id, m.profile_id, 'lead')} disabled={!!busy}
                        className="text-[11px] text-amber-600 hover:text-amber-700 px-2 py-1 rounded-lg hover:bg-amber-50">
                        اجعله قائداً
                      </button>
                    )}
                    <button onClick={() => act(t.id, m.profile_id, 'remove')} disabled={!!busy}
                      title="إخراج من الفريق"
                      className="inline-flex text-slate-300 hover:text-red-600 p-1">
                      {busy === t.id + m.profile_id ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                    </button>
                  </div>
                ))}

                {adding === t.id ? (
                  <select autoFocus defaultValue="" onChange={e => e.target.value && act(t.id, e.target.value, 'add')}
                    className="w-full min-w-0 px-3 py-2 rounded-xl border border-violet-300 bg-white text-sm">
                    <option value="">— اختر عضواً —</option>
                    {free.map(p => (
                      <option key={p.id} value={p.id}>{p.name_ar}{p.job_title ? ` — ${p.job_title}` : ''}</option>
                    ))}
                  </select>
                ) : (
                  <button onClick={() => setAdding(t.id)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-lg">
                    <span className="inline-flex"><UserPlus size={13} /></span>
                    <span>إضافة عضو</span>
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

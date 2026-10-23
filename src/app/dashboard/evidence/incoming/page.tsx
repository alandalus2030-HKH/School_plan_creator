'use client'

/* ════════════════════════════════════════════════════════════
   الإسناد الوارد — طابور الفريق المستقبِل (الوثيقة 3.2)

   دليلٌ واحد قد يخدم ثلاثة معايير رئيسة، ومالكه فريقٌ واحد يقبله أو
   يرفضه. فما أسنده ذلك الفريق إلى **معيارك** يصلك هنا للتأكيد —
   «كل فريق يبقى سيّد تغطيته، والدليل لا يُهدر».

   والردّ **يُسقط تلك المرساة وحدها لا الدليل**: الدليل يبقى بحاله في
   المخزن، وتسقط نسبته إلى معيارك. ولذلك لا نحذف الصفّ: يُحفظ بحالة
   «مردود» فتبقى الواقعة في سجلّ الدليل.
   ════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Loader2, Inbox, Check, X, ShieldCheck, Clock, AlertTriangle } from 'lucide-react'
import NoAccess from '@/components/NoAccess'
import { toast } from '@/components/Toast'

type Item = {
  id: string; evidenceId: string; evidenceName: string; evidenceStatus: string
  ownerTeam: string | null
  code: string; name: string; level: number | null; kind: string
  standard: string; standardTeam: string | null
  assignedBy: string; assignedAt: string; note: string | null
}

export default function IncomingAnchorsPage() {
  const [loading, setLoading] = useState(true)
  const [denied,  setDenied]  = useState(false)
  const [items,   setItems]   = useState<Item[]>([])
  const [stds,    setStds]    = useState<string[]>([])
  const [busy,    setBusy]    = useState('')
  const [declining, setDeclining] = useState<string | null>(null)
  const [note,    setNote]    = useState('')

  const load = useCallback(async () => {
    const res = await fetch('/api/evidence/incoming-anchors')
    if (res.status === 403) { setDenied(true); setLoading(false); return }
    const j = await res.json()
    setItems(j.items || []); setStds(j.myStandards || []); setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const act = async (id: string, action: 'confirm' | 'decline', n?: string) => {
    setBusy(id)
    const res = await fetch('/api/evidence/incoming-anchors', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anchorId: id, action, note: n }),
    })
    const j = await res.json().catch(() => ({}))
    setBusy('')
    if (!res.ok) { toast(j.error || 'تعذّر الحكم على الإسناد', 'error'); return }
    toast(action === 'confirm' ? 'أُكِّد الإسناد ودخل تغطيتك' : 'رُدَّ الإسناد — والدليل باقٍ كما هو', 'success')
    setDeclining(null); setNote('')
    setItems(prev => prev.filter(x => x.id !== id))
  }

  if (denied) return <NoAccess message="الإسناد الوارد يتطلّب صلاحية «فرز الأدلة»." />
  if (loading) return (
    <div className="p-10 text-center text-slate-500">
      <span className="inline-flex"><Loader2 className="animate-spin" size={22} /></span>
      <p className="mt-2 text-sm">يُحمَّل الوارد…</p>
    </div>
  )

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <span className="inline-flex text-sky-600"><Inbox size={20} /></span>
            <span>الإسناد الوارد</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            أدلّةٌ يملكها فريقٌ آخر وأُسندت إلى معاييرك — تُؤكَّد فتدخل تغطيتك، أو تُردّ
            <strong> فتسقط المرساة وحدها لا الدليل</strong>.
            {stds.length > 0 && <> · معاييرك: {stds.join(' · ')}</>}
          </p>
        </div>
        <Link href="/dashboard/evidence/triage"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border border-slate-200 bg-white text-slate-600 hover:border-violet-300">
          <span className="inline-flex"><ShieldCheck size={14} /></span>
          <span>طابور الفرز</span>
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <span className="inline-flex text-emerald-500"><Check size={34} /></span>
          <p className="mt-2 font-bold text-slate-700">لا إسنادَ وارداً</p>
          <p className="text-sm text-slate-500 mt-1">
            لا أحد أسند دليلاً إلى معاييرك — أو أنك أكّدتها كلّها.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(it => (
            <div key={it.id} className="bg-white rounded-2xl border border-sky-200 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 bg-sky-50/70 border-b border-sky-100 flex flex-wrap items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded-lg bg-white border border-sky-200 text-sky-800">
                  معيارك {it.standard}{it.standardTeam ? ` — ${it.standardTeam}` : ''}
                </span>
                {it.ownerTeam && (
                  <span className="text-[11px] text-slate-500">المالك: {it.ownerTeam}</span>
                )}
                <span className="text-[11px] text-slate-500 flex items-center gap-1 ms-auto">
                  <span className="inline-flex"><Clock size={11} /></span>
                  <span>{new Date(it.assignedAt).toLocaleDateString('ar-QA')}</span>
                </span>
              </div>

              <div className="p-4 space-y-2.5">
                <p className="text-sm font-bold text-slate-800">{it.evidenceName}</p>

                <div>
                  <p className="text-[11px] font-bold text-slate-500 mb-1">أُسند إلى</p>
                  <span className="inline-block text-xs px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700">
                    <span className="font-mono ms-1">{it.code}</span>
                    <span>{it.name.slice(0, 60)}</span>
                    {it.kind === 'implicit' && <span className="ms-1 text-[10px]">· كامل المعيار</span>}
                  </span>
                </div>

                <p className="text-[11px] text-slate-500">أسنده: <strong>{it.assignedBy}</strong></p>

                {it.evidenceStatus !== 'accepted' && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-start gap-1.5">
                    <span className="inline-flex shrink-0 mt-px"><AlertTriangle size={11} /></span>
                    <span>الدليل لم يُقبل بعدُ من فريقه المالك — وتأكيدك لا يُغني عن قبوله.</span>
                  </p>
                )}

                {declining === it.id ? (
                  <div className="space-y-2">
                    <textarea value={note} onChange={e => setNote(e.target.value.slice(0, 200))} rows={2} autoFocus
                      placeholder="سبب الردّ — يصل من أسنده (اختياريّ)"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm resize-none" />
                    <div className="flex gap-2">
                      <button onClick={() => act(it.id, 'decline', note)} disabled={busy === it.id}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-bold disabled:opacity-50">
                        <span className="inline-flex">{busy === it.id ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}</span>
                        <span>تأكيد الردّ</span>
                      </button>
                      <button onClick={() => { setDeclining(null); setNote('') }}
                        className="px-3 py-2 text-xs text-slate-500">إلغاء</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 pt-0.5">
                    <button onClick={() => act(it.id, 'confirm')} disabled={!!busy}
                      className="flex-1 min-w-[130px] inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50">
                      <span className="inline-flex">{busy === it.id ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}</span>
                      <span>أكِّد — يدخل تغطيتي</span>
                    </button>
                    <button onClick={() => { setDeclining(it.id); setNote('') }} disabled={!!busy}
                      className="flex-1 min-w-[130px] inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white border border-red-200 text-red-700 text-sm font-bold hover:bg-red-50 disabled:opacity-50">
                      <span className="inline-flex"><X size={15} /></span>
                      <span>ردّ — تسقط المرساة وحدها</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

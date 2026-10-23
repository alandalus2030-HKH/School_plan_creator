'use client'

/* ════════════════════════════════════════════════════════════
   طابور الفرز — الوثيقة 3.2 · 3.6

   «شاشة فرز سريعة — بطاقة واحدة، أزرار قبول/رفض/إسناد، اختصارات
    لوحة مفاتيح» (3.6). والعلّة أن ألفي دليلٍ لا تُفرَز بجدولٍ يُفتح
   ويُغلق: بطاقةٌ واحدة أمام العين، ويدٌ على لوحة المفاتيح.

   وحاجزا القبول يُعرضان **قبل** الضغط لا بعده: دليلٌ بلا مرساة
   دليلٌ تائه (3.3)، وبلا عامٍ منسوب تنكسر العدسة الطولية (3.6.1).
   ودليلٌ رفعتَه بنفسك لا تقبله — ثلاث طبقات تمنعه، وهذه أُولاها.
   ════════════════════════════════════════════════════════════ */

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { Loader2, ShieldCheck, AlertTriangle, Check, X, SkipForward, SkipBack, Users, Keyboard,
  FileText, ExternalLink, Clock, Inbox, Plus, Lock } from 'lucide-react'
import { fetchFrameworkLevel, type FrameworkNode } from '@/lib/framework'
import NoAccess from '@/components/NoAccess'
import { toast } from '@/components/Toast'

type Anchor = { id: string; code: string; name: string; level: number | null; kind: string; confirm_status: string }
type Item = {
  id: string; name: string; description: string | null
  file_url: string | null; file_type: string | null; file_size: number | null; video_url: string | null
  evidence_type: string | null; source: string; reason_code: string | null
  academic_year: string | null; document_date: string | null; created_at: string
  uploaded_by: string | null; owner_team_id: string | null; task_id: string | null
  uploader: string; taskName: string | null
  anchors: Anchor[]; blockers: string[]; isMine: boolean
}
type Team = { id: string; name_ar: string; standard_code: string }

const SOURCE_AR: Record<string, string> = {
  plan: 'من خطة', direct: 'رفع مباشر', request: 'طلب موجَّه', recurring: 'مهمّة دورية',
}

export default function TriagePage() {
  const [loading, setLoading] = useState(true)
  const [denied,  setDenied]  = useState(false)
  const [items,   setItems]   = useState<Item[]>([])
  const [teams,   setTeams]   = useState<Team[]>([])
  const [myTeamIds, setMyTeamIds] = useState<string[]>([])
  const [reasons, setReasons] = useState<string[]>([])
  const [canAccept, setCanAccept] = useState(false)

  const [idx,     setIdx]     = useState(0)
  const [mineOnly, setMineOnly] = useState(false)
  const [busy,    setBusy]    = useState(false)
  const [rejecting, setRejecting] = useState(false)
  /* «حدِّد ما يغطّيه» (3.3) ووسم الدوام (3.5) */
  const [anchoring,  setAnchoring]  = useState(false)
  const [subCode,    setSubCode]    = useState('')
  const [subs,       setSubs]       = useState<FrameworkNode[]>([])
  const [inds,       setInds]       = useState<FrameworkNode[]>([])
  const [picked,     setPicked]     = useState<string[]>([])
  const [whole,      setWhole]      = useState(false)
  const [anchorBusy, setAnchorBusy] = useState(false)
  const [permanent,  setPermanent]  = useState(false)
  const [reason,  setReason]  = useState('')
  const [note,    setNote]    = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/evidence/queue')
    if (res.status === 403) { setDenied(true); setLoading(false); return }
    const j = await res.json()
    const list = j.items || []
    setItems(list); setTeams(j.teams || []); setMyTeamIds(j.myTeamIds || [])
    setReasons(j.rejectReasons || []); setCanAccept(!!j.canAccept)

    /* قفزةٌ إلى دليلٍ بعينه: «افرز» في الخزانة يُمرّر ?id=
       (تُقرأ من العنوان لا بـuseSearchParams — فلا يلزمها حدّ Suspense) */
    const wanted = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('id') : null
    if (wanted) {
      const at = list.findIndex((x: Item) => x.id === wanted)
      if (at >= 0) { setMineOnly(false); setIdx(at) }
      else { toast('لم يعد هذا الدليل في الطابور — حُكم عليه', 'info'); setIdx(0) }
    } else setIdx(0)
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  /* طابور فريقي — هو ما يمنع «طابوراً واحداً يختنق» (3.6) */
  const queue = useMemo(
    () => (mineOnly && myTeamIds.length ? items.filter(i => i.owner_team_id && myTeamIds.includes(i.owner_team_id)) : items),
    [items, mineOnly, myTeamIds])

  const cur = queue[idx] || null
  const teamOf = (id: string | null) => teams.find(t => t.id === id) || null

  const next = useCallback(() => {
    setRejecting(false); setReason(''); setNote(''); setPermanent(false); setAnchoring(false)
    setIdx(i => Math.min(i + 1, Math.max(queue.length - 1, 0)))
  }, [queue.length])

  const prev = useCallback(() => {
    setRejecting(false); setReason(''); setNote(''); setPermanent(false); setAnchoring(false)
    setIdx(i => Math.max(i - 1, 0))
  }, [])

  const act = useCallback(async (action: 'accept' | 'reject', reasonCode?: string, noteTxt?: string) => {
    if (!cur || busy) return
    setBusy(true)
    const res = await fetch(`/api/evidence/${cur.id}/review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reasonCode, note: noteTxt, ownerTeamId: cur.owner_team_id,
                             permanence: permanent ? 'permanent' : 'period' }),
    })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { toast(j.error || 'تعذّر الحكم على الدليل', 'error'); return }
    toast(action === 'accept' ? `قُبل الدليل — هويّته ${j.code || '—'}` : 'رُفض الدليل وأُبلغ رافعه', 'success')
    /* يخرج من الطابور فوراً: الفرز تدفّقٌ لا قائمة تُحدَّث */
    setItems(prev => prev.filter(x => x.id !== cur.id))
    setRejecting(false); setReason(''); setNote('')
    setIdx(i => Math.min(i, Math.max(queue.length - 2, 0)))
  }, [cur, busy, queue.length, permanent])

  /* المعايير الفرعية تُجلب مرّةً عند أوّل فتح — 76 بنداً تكفيها رحلة */
  const openAnchor = async () => {
    setAnchoring(true); setPicked([]); setWhole(false)
    if (!subs.length) setSubs(await fetchFrameworkLevel(3, null))
  }
  useEffect(() => {
    if (!subCode) { setInds([]); return }
    fetchFrameworkLevel(4, subCode).then(setInds)
    setPicked([])
  }, [subCode])

  const saveAnchor = async () => {
    if (!cur || !subCode) return
    setAnchorBusy(true)
    const res = await fetch(`/api/evidence/${cur.id}/anchors`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subCode, whole, indicatorIds: picked }),
    })
    const j = await res.json().catch(() => ({}))
    setAnchorBusy(false)
    if (!res.ok) { toast(j.error || 'تعذّر الإسناد', 'error'); return }
    toast(j.incoming ? 'أُسند — وينتظر تأكيد فريقه المالك' : `أُسند (${j.added})`, 'success')
    setAnchoring(false); setSubCode(''); setPicked([]); setWhole(false)
    await load()
  }

  const dropAnchor = async (a: Anchor) => {
    if (!cur) return
    const res = await fetch(`/api/evidence/${cur.id}/anchors`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anchorId: a.id }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { toast(j.error || 'تعذّر الحذف', 'error'); return }
    await load()
  }

  const setTeam = async (teamId: string) => {
    if (!cur) return
    setItems(prev => prev.map(x => x.id === cur.id ? { ...x, owner_team_id: teamId } : x))
  }

  /* ── اختصارات لوحة المفاتيح (3.6) ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el && /INPUT|TEXTAREA|SELECT/.test(el.tagName)) return
      if (e.key === 'ArrowLeft')  { next(); return }                 // التالي (RTL: اليسار يتقدّم)
      if (e.key === 'ArrowRight') { prev(); return }
      if (e.key === 'a' || e.key === 'A') { if (canAccept && cur && !cur.blockers.length && !cur.isMine) act('accept') }
      if (e.key === 'r' || e.key === 'R') setRejecting(true)
      if (e.key === 'Escape') setRejecting(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [act, next, prev, canAccept, cur])

  if (denied) return <NoAccess message="فرز الأدلة يتطلّب صلاحية «فرز الأدلة»." />
  if (loading) return (
    <div className="p-10 text-center text-slate-500">
      <span className="inline-flex"><Loader2 className="animate-spin" size={22} /></span>
      <p className="mt-2 text-sm">يُحمَّل الطابور…</p>
    </div>
  )

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* العنوان */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <span className="inline-flex text-violet-600"><ShieldCheck size={20} /></span>
            <span>طابور الفرز</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            الأقدم أولاً · {queue.length} دليلاً بانتظار الحكم
          </p>
        </div>
        <div className="flex items-center gap-2">
          {myTeamIds.length > 0 && (
            <button onClick={() => { setMineOnly(v => !v); setIdx(0) }}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border transition-colors
                ${mineOnly ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}>
              <span className="inline-flex"><Users size={14} /></span>
              <span>طابور فريقي</span>
            </button>
          )}
          <Link href="/dashboard/evidence"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border border-slate-200 bg-white text-slate-600 hover:border-violet-300">
            <span className="inline-flex"><Inbox size={14} /></span>
            <span>الخزانة</span>
          </Link>
        </div>
      </div>

      {/* الطابور فارغ */}
      {!cur && (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <span className="inline-flex text-emerald-500"><Check size={34} /></span>
          <p className="mt-2 font-bold text-slate-700">لا شيء بانتظار الفرز</p>
          <p className="text-sm text-slate-500 mt-1">
            {mineOnly ? 'طابور فريقك فارغ — جرّب «كل الطوابير».' : 'كل الأدلة المرفوعة حُكم عليها.'}
          </p>
        </div>
      )}

      {cur && (
        <>
          {/* شريط التقدّم */}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{idx + 1} من {queue.length}</span>
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-violet-500 transition-all"
                style={{ width: `${((idx + 1) / Math.max(queue.length, 1)) * 100}%` }} />
            </div>
          </div>

          {/* البطاقة */}
          <div className="bg-white rounded-2xl border-2 border-violet-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-violet-50/70 border-b border-violet-100 flex flex-wrap items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded-lg bg-white border border-violet-200 text-violet-700">
                {SOURCE_AR[cur.source] || cur.source}
              </span>
              {cur.evidence_type && (
                <span className="text-xs px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-600">{cur.evidence_type}</span>
              )}
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <span className="inline-flex"><Clock size={12} /></span>
                <span>{new Date(cur.created_at).toLocaleDateString('ar-QA')}</span>
              </span>
              <span className="text-xs text-slate-500">رفعه: {cur.uploader}</span>
            </div>

            <div className="p-4 space-y-3">
              <h2 className="font-bold text-slate-800 leading-relaxed">{cur.name}</h2>
              {cur.description && <p className="text-sm text-slate-600 leading-relaxed">{cur.description}</p>}

              {/* الملفّ */}
              <div className="flex flex-wrap gap-2">
                {cur.file_url && (
                  <a href={cur.file_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-3 py-1.5 rounded-lg hover:bg-violet-100">
                    <span className="inline-flex"><FileText size={13} /></span>
                    <span>فتح الملفّ</span>
                  </a>
                )}
                {cur.video_url && (
                  <a href={cur.video_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 px-3 py-1.5 rounded-lg hover:bg-sky-100">
                    <span className="inline-flex"><ExternalLink size={13} /></span>
                    <span>الفيديو</span>
                  </a>
                )}
                {cur.taskName && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
                    من مهمّة: {cur.taskName}
                  </span>
                )}
              </div>

              {/* المراسي */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p className="text-xs font-bold text-slate-600">ما يغطّيه</p>
                  <button onClick={() => openAnchor()} disabled={busy}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2.5 py-1 rounded-lg hover:bg-violet-100">
                    <span className="inline-flex"><Plus size={12} /></span>
                    <span>حدِّد ما يغطّيه</span>
                  </button>
                </div>
                {cur.anchors.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {cur.anchors.map(a => {
                      /* المخصوص أخضر · الضمنيّ بلونٍ مختلف كما تنصّ 3.3 ·
                         والوارد بانتظار تأكيد فريقه فلا يُحتسب (3.2) */
                      const pend = a.confirm_status !== 'confirmed'
                      const cls  = pend ? 'bg-slate-50 border-slate-200 text-slate-500'
                                 : a.kind === 'implicit' ? 'bg-sky-50 border-sky-200 text-sky-800'
                                 : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      return (
                        <span key={a.id} className={`group text-xs px-2 py-1 rounded-lg border ${cls}`}>
                          <span className="font-mono ms-1">{a.code}</span>
                          <span>{a.name.slice(0, 44)}</span>
                          {a.kind === 'implicit' && <span className="ms-1 text-[10px]">· كامل المعيار</span>}
                          {pend && <span className="ms-1 text-[10px]">· بانتظار تأكيد فريقه</span>}
                          <button onClick={() => dropAnchor(a)} title="احذف هذه المرساة"
                            className="ms-1 opacity-40 hover:opacity-100 align-middle">
                            <X size={11} />
                          </button>
                        </span>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                    بلا مرساة — ودليلٌ بلا مرساة دليلٌ تائه. اضغط «حدِّد ما يغطّيه» قبل القبول.
                  </p>
                )}

                {anchoring && (
                  <div className="mt-2 rounded-xl border border-violet-200 bg-violet-50/60 p-3 space-y-2">
                    <p className="text-[11px] text-violet-800 leading-relaxed">
                      <strong>حدِّد ما يغطّيه</strong> — مؤشّراتٍ بعينها، أو المعيار الفرعي كاملاً
                      (تُسجَّل <strong>تغطيةً ضمنية</strong>).
                    </p>
                    <select value={subCode} onChange={e => { setSubCode(e.target.value); setWhole(false) }}
                      className="w-full min-w-0 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm">
                      <option value="">— اختر المعيار الفرعي —</option>
                      {subs.map(x => <option key={x.id} value={x.code}>{x.code} — {x.name_ar.slice(0, 60)}</option>)}
                    </select>

                    {!!subCode && (
                      <>
                        <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                          <input type="checkbox" checked={whole} className="mt-0.5"
                            onChange={e => { setWhole(e.target.checked); if (e.target.checked) setPicked([]) }} />
                          <span>يغطّي المعيار الفرعي <strong>كاملاً</strong> — تغطية ضمنية في كل مؤشراته</span>
                        </label>

                        {!whole && inds.map(i => (
                          <label key={i.id} className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                            <input type="checkbox" checked={picked.includes(i.id)} className="mt-0.5"
                              onChange={e => setPicked(p => e.target.checked ? [...p, i.id] : p.filter(x => x !== i.id))} />
                            <span><span className="font-mono text-slate-500 ms-1">{i.code}</span>{i.name_ar}</span>
                          </label>
                        ))}
                      </>
                    )}

                    <div className="flex gap-2 pt-0.5">
                      <button onClick={saveAnchor} disabled={anchorBusy || !subCode || (!whole && !picked.length)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-violet-600 px-3 py-1.5 rounded-lg disabled:opacity-40">
                        <span className="inline-flex">{anchorBusy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}</span>
                        <span>أسنِد</span>
                      </button>
                      <button onClick={() => setAnchoring(false)} className="text-[11px] text-slate-500 px-2">إلغاء</button>
                    </div>
                  </div>
                )}
              </div>

              {/* العام والفريق */}
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-bold text-slate-600 mb-1">العام المنسوب</p>
                  <p className={`text-sm ${cur.academic_year ? 'text-slate-700' : 'text-amber-700'}`}>
                    {cur.academic_year || 'غير محدَّد — يمنع القبول'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-600 mb-1">الفريق المالك</p>
                  <select value={cur.owner_team_id || ''} onChange={e => setTeam(e.target.value)}
                    className="w-full min-w-0 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm">
                    <option value="">— بلا فريق —</option>
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>{t.standard_code} — {t.name_ar}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* وسم الدوام — قرار المقيّم عند القبول لا اختيار الرافع (3.5) */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                <p className="text-xs font-bold text-slate-600 mb-1.5">وسم الدوام</p>
                <div className="flex flex-col gap-1">
                  {([
                    { v: false, ar: 'دليل فترة', ds: 'يشهد لعملٍ وقع في وقته — ينتهي بانتهاء دورته' },
                    { v: true,  ar: 'وثيقة دائمة', ds: 'تشهد بحالٍ قائمة — تعبر الدورات وتسقط يوم تُحدَّث' },
                  ] as const).map(o => (
                    <label key={String(o.v)} className="flex items-start gap-2 text-xs cursor-pointer">
                      <input type="radio" name="perm" checked={permanent === o.v} className="mt-0.5"
                        onChange={() => setPermanent(o.v)} />
                      <span className="min-w-0">
                        <span className="text-slate-700 font-semibold">{o.ar}</span>
                        <span className="block text-[11px] text-slate-400">{o.ds}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {permanent && (
                  <p className="mt-1.5 text-[11px] text-sky-800 bg-sky-50 border border-sky-200 rounded-lg p-2 flex items-start gap-1.5">
                    <span className="inline-flex shrink-0 mt-px"><Lock size={11} /></span>
                    <span>يُسجَّل اليوم تاريخَ آخر مراجعة — فسياسةٌ قديمة «سارية» شكلاً وميّتة فعلاً.</span>
                  </p>
                )}
              </div>

              {/* الموانع */}
              {(cur.blockers.length > 0 || cur.isMine) && (
                <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5 space-y-1">
                  {cur.blockers.map(b => (
                    <p key={b} className="flex items-center gap-1.5">
                      <span className="inline-flex"><AlertTriangle size={12} /></span>
                      <span>{b} — القبول ممنوع حتى يُستكمل</span>
                    </p>
                  ))}
                  {cur.isMine && (
                    <p className="flex items-center gap-1.5">
                      <span className="inline-flex"><AlertTriangle size={12} /></span>
                      <span>أنت رفعتَ هذا الدليل — لا تقبل ما رفعتَه بنفسك</span>
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* الأزرار */}
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200">
              {!rejecting ? (
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => act('accept')} disabled={busy || !canAccept || cur.blockers.length > 0 || cur.isMine}
                    title={!canAccept ? 'تحتاج صلاحية قبول الأدلة' : ''}
                    className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-40">
                    <span className="inline-flex">{busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}</span>
                    <span>قبول</span>
                  </button>
                  <button onClick={() => setRejecting(true)} disabled={busy}
                    className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white border border-red-200 text-red-700 text-sm font-bold hover:bg-red-50 disabled:opacity-40">
                    <span className="inline-flex"><X size={15} /></span>
                    <span>رفض</span>
                  </button>
                  {/* التنقّل في الطابور — كلٌّ يُعطَّل عند حدّه، فلا يبقى زرٌّ
                      يُضغَط بلا أثر. والاختصارات (← →) تبقى عصب السرعة (3.6). */}
                  <button onClick={prev} disabled={busy || idx === 0}
                    title={idx === 0 ? 'أنت عند أوّل الطابور' : 'الدليل السابق (→)'}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-sm hover:border-violet-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-slate-200">
                    <span className="inline-flex"><SkipBack size={15} /></span>
                    <span>السابق</span>
                  </button>
                  <button onClick={next} disabled={busy || idx >= queue.length - 1}
                    title={idx >= queue.length - 1 ? 'أنت عند آخر الطابور' : 'تخطٍّ إلى التالي (←)'}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-sm hover:border-violet-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-slate-200">
                    <span className="inline-flex"><SkipForward size={15} /></span>
                    <span>تخطٍّ</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-600">سبب الرفض — من قائمة مغلقة ليمكن تحليلها</p>
                  <div className="flex flex-wrap gap-1.5">
                    {reasons.map(r => (
                      <button key={r} onClick={() => setReason(r)}
                        className={`px-3 py-1.5 rounded-xl text-xs border transition-colors
                          ${reason === r ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-200 hover:border-red-300'}`}>
                        {r}
                      </button>
                    ))}
                  </div>
                  {reason === 'أخرى' && (
                    <textarea value={note} onChange={e => setNote(e.target.value.slice(0, 300))} rows={2}
                      placeholder="اشرح السبب — يصل رافع الدليل"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm resize-none" />
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => act('reject', reason, note)} disabled={busy || !reason || (reason === 'أخرى' && !note.trim())}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-40">
                      <span className="inline-flex">{busy ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />}</span>
                      <span>تأكيد الرفض</span>
                    </button>
                    <button onClick={() => { setRejecting(false); setReason(''); setNote('') }}
                      className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-sm">إلغاء</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* الاختصارات */}
          <p className="text-[11px] text-slate-400 flex items-center gap-2 justify-center">
            <span className="inline-flex"><Keyboard size={13} /></span>
            <span><b>A</b> قبول · <b>R</b> رفض · <b>←</b> التالي · <b>→</b> السابق · <b>Esc</b> إلغاء</span>
          </p>
        </>
      )}
    </div>
  )
}

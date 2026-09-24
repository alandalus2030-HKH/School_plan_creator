'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Library, Search, ChevronLeft, ChevronDown, Target, Gauge,
  Info, HelpCircle, FolderOpen, FileText, Loader2,
} from 'lucide-react'
import {
  fetchActiveFramework, fetchAllNodes, fetchRubric, fetchNotes, fetchEvidenceSamples,
  type FrameworkMeta, type TreeNode, type RubricRow, type NoteItem,
} from '@/lib/framework'

/* مستويات سلم التقدير — من الأعلى إلى الأدنى كما تعرضها الوثيقة */
const SCALE: { level: number; name: string; tone: string }[] = [
  { level: 5, name: 'ممتاز',   tone: '#15803d' },
  { level: 4, name: 'جيد جداً', tone: '#0891b2' },
  { level: 3, name: 'جيد',      tone: '#7c3aed' },
  { level: 2, name: 'مقبول',   tone: '#d97706' },
  { level: 1, name: 'ضعيف',    tone: '#dc2626' },
]

type Tab = 'indicators' | 'rubric' | 'guidance' | 'reflection'

const TABS: { key: Tab; label: string; Icon: any }[] = [
  { key: 'indicators', label: 'مؤشرات الأداء',      Icon: Target },
  { key: 'rubric',     label: 'سلم التقدير',         Icon: Gauge },
  { key: 'guidance',   label: 'البيانات التوضيحية', Icon: Info },
  { key: 'reflection', label: 'أسئلة التأمل الذاتي', Icon: HelpCircle },
]

export default function FrameworkPage() {
  const [meta,    setMeta]    = useState<FrameworkMeta | null>(null)
  const [nodes,   setNodes]   = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const [q,        setQ]        = useState('')
  const [openStd,  setOpenStd]  = useState<string | null>(null)
  const [openAsp,  setOpenAsp]  = useState<string | null>(null)
  const [subId,    setSubId]    = useState<string | null>(null)
  const [tab,      setTab]      = useState<Tab>('indicators')

  /* ذاكرة التفاصيل المحمّلة عند الطلب */
  const [rubricBy,   setRubricBy]   = useState<Record<string, RubricRow[]>>({})
  const [notesBy,    setNotesBy]    = useState<Record<string, { guidance: NoteItem[]; reflection: NoteItem[] }>>({})
  const [evidenceBy, setEvidenceBy] = useState<Record<string, NoteItem[]>>({})
  const [busy,       setBusy]       = useState(false)

  /* ── التحميل الأوّل: الإصدار النشط + كل العقد ── */
  useEffect(() => {
    ;(async () => {
      const fw = await fetchActiveFramework()
      if (!fw) { setError('لا يوجد إطار اعتماد نشط في القاعدة.'); setLoading(false); return }
      setMeta(fw)
      setNodes(await fetchAllNodes(fw.id))
      setLoading(false)
    })()
  }, [])

  const byLevel  = (lvl: number) => nodes.filter(n => n.level === lvl)
  const children = (parentId: string, lvl: number) => nodes.filter(n => n.parent_id === parentId && n.level === lvl)
  const byId     = (id: string | null) => nodes.find(n => n.id === id) || null

  const sub    = byId(subId)
  const aspect = byId(sub?.parent_id ?? null)
  const std    = byId(aspect?.parent_id ?? null)

  /* ── تحميل تفاصيل المعيار الفرعي عند اختياره ── */
  useEffect(() => {
    if (!subId) return
    if (rubricBy[subId] && notesBy[subId]) return
    setBusy(true)
    ;(async () => {
      const [r, n] = await Promise.all([fetchRubric(subId), fetchNotes(subId)])
      setRubricBy(p => ({ ...p, [subId]: r }))
      setNotesBy(p => ({ ...p, [subId]: n }))
      setBusy(false)
    })()
  }, [subId]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── تحميل أدلة الجانب عند فتحه ── */
  useEffect(() => {
    if (!openAsp || evidenceBy[openAsp]) return
    ;(async () => {
      const e = await fetchEvidenceSamples(openAsp)
      setEvidenceBy(p => ({ ...p, [openAsp]: e }))
    })()
  }, [openAsp]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── البحث: يشمل المعايير الفرعية والمؤشرات ── */
  const results = useMemo(() => {
    const t = q.trim()
    if (t.length < 2) return null
    const hit = (s: string) => s.includes(t)
    return nodes
      .filter(n => n.level >= 3 && (hit(n.name_ar) || n.code.startsWith(t)))
      .slice(0, 40)
  }, [q, nodes])

  const openSub = (n: TreeNode) => {
    const target = n.level === 4 ? byId(n.parent_id) : n
    if (!target) return
    const asp = byId(target.parent_id)
    setOpenStd(asp?.parent_id ?? null)
    setOpenAsp(asp?.id ?? null)
    setSubId(target.id)
    setTab(n.level === 4 ? 'indicators' : tab)
    setQ('')
  }

  const counts = {
    std: byLevel(1).length, asp: byLevel(2).length,
    sub: byLevel(3).length, ind: byLevel(4).length,
  }

  if (loading) return (
    <div className="p-6 flex items-center gap-3 text-slate-500">
      <Loader2 size={18} className="animate-spin" /> جارٍ تحميل الإطار…
    </div>
  )

  if (error) return (
    <div className="p-6">
      <div className="rounded-2xl border border-red-200 bg-red-50 text-red-700 p-4 text-sm">{error}</div>
    </div>
  )

  const rubric = subId ? (rubricBy[subId] || []) : []
  const notes  = subId ? (notesBy[subId] || { guidance: [], reflection: [] }) : { guidance: [], reflection: [] }
  const evid   = openAsp ? (evidenceBy[openAsp] || []) : []

  return (
    <div className="p-4 sm:p-6 space-y-5">

      {/* ════ الترويسة ════ */}
      <header className="rounded-2xl p-5 text-white" style={{ background: 'var(--gradient-button, #8a1538)' }}>
        <div className="flex items-start gap-3 flex-wrap">
          <span className="inline-flex"><Library size={22} /></span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-xl font-bold leading-relaxed">{meta?.name_ar}</h1>
            <p className="text-white/70 text-xs mt-1 font-latin">{meta?.code} · {meta?.version}</p>
            {meta?.source_note && <p className="text-white/60 text-xs mt-1">{meta.source_note}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-4 text-xs">
          {[
            [counts.std, 'معيار رئيس'], [counts.asp, 'جانب'],
            [counts.sub, 'معيار فرعي'], [counts.ind, 'مؤشر أداء'],
          ].map(([n, label]) => (
            <span key={String(label)} className="bg-white/15 rounded-full px-3 py-1">
              <b className="font-latin">{n}</b> {label}
            </span>
          ))}
        </div>
      </header>

      {/* ════ البحث ════ */}
      <div className="relative">
        <span className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400 inline-flex"><Search size={16} /></span>
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="ابحث في المعايير والمؤشرات — بالنصّ أو بالكود…"
          className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
        />
      </div>

      {results && (
        <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
          {results.length === 0 && <p className="p-4 text-sm text-slate-500">لا نتائج.</p>}
          {results.map(n => (
            <button key={n.id} onClick={() => openSub(n)}
              className="w-full text-right p-3 hover:bg-slate-50 flex items-start gap-3">
              <span className="font-latin text-xs text-violet-700 mt-0.5 shrink-0">{n.code}</span>
              <span className="text-sm text-slate-700 leading-relaxed">{n.name_ar}</span>
              <span className="text-[11px] text-slate-400 mr-auto shrink-0">
                {n.level === 3 ? 'معيار فرعي' : 'مؤشر'}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-5 items-start">

        {/* ════ الشجرة ════ */}
        <nav className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          {byLevel(1).map(s => {
            const open = openStd === s.id
            return (
              <div key={s.id} className="border-b border-slate-100 last:border-0">
                <button
                  onClick={() => setOpenStd(open ? null : s.id)}
                  className="w-full flex items-center gap-2 p-3.5 text-right hover:bg-slate-50">
                  <span className="inline-flex text-violet-700">
                    {open ? <ChevronDown size={16} /> : <ChevronLeft size={16} />}
                  </span>
                  <span className="font-latin text-xs text-violet-700">{s.code}</span>
                  <span className="text-sm font-semibold text-slate-800">{s.name_ar}</span>
                </button>

                {open && children(s.id, 2).map(a => {
                  const aOpen = openAsp === a.id
                  return (
                    <div key={a.id} className="bg-slate-50/60">
                      <button
                        onClick={() => setOpenAsp(aOpen ? null : a.id)}
                        className="w-full flex items-center gap-2 py-2.5 px-3.5 pr-8 text-right hover:bg-slate-100">
                        <span className="inline-flex text-cyan-700">
                          {aOpen ? <ChevronDown size={14} /> : <ChevronLeft size={14} />}
                        </span>
                        <span className="font-latin text-[11px] text-cyan-700">{a.code}</span>
                        <span className="text-[13px] text-slate-700">{a.name_ar}</span>
                      </button>

                      {aOpen && (
                        <div className="pb-2">
                          {children(a.id, 3).map(sb => (
                            <button key={sb.id} onClick={() => setSubId(sb.id)}
                              className={`w-full text-right py-2 px-3.5 pr-14 flex items-start gap-2 hover:bg-white
                                ${subId === sb.id ? 'bg-white border-r-2 border-violet-600' : ''}`}>
                              <span className="font-latin text-[11px] text-slate-400 mt-0.5 shrink-0">{sb.code}</span>
                              <span className="text-[13px] text-slate-600 leading-relaxed">{sb.name_ar}</span>
                            </button>
                          ))}

                          {/* نماذج أدلة الجانب */}
                          <div className="mx-3.5 mt-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                            <div className="flex items-center gap-2 text-[12px] font-semibold text-emerald-800">
                              <span className="inline-flex"><FolderOpen size={14} /></span>
                              نماذج الأدلة والوثائق — {evid.length}
                            </div>
                            <ol className="mt-2 space-y-1.5 pr-4 list-decimal marker:text-emerald-600/60">
                              {evid.map(e => (
                                <li key={e.sort_order} className="text-[12px] text-slate-700 leading-relaxed">
                                  {e.text_ar}
                                  {e.source_page && <span className="font-latin text-[10px] text-slate-400"> · ص{e.source_page}</span>}
                                </li>
                              ))}
                            </ol>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* ════ التفاصيل ════ */}
        <section className="rounded-2xl border border-slate-200 bg-white min-h-[300px]">
          {!sub && (
            <div className="p-8 text-center text-slate-400 text-sm flex flex-col items-center gap-3">
              <span className="inline-flex"><FileText size={28} /></span>
              اختر معياراً فرعياً من الشجرة لعرض مؤشراته وسلم تقديره.
            </div>
          )}

          {sub && (
            <>
              <div className="p-4 border-b border-slate-100">
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  <span className="font-latin">{std?.code}</span> {std?.name_ar}
                  <span className="mx-1.5">←</span>
                  <span className="font-latin">{aspect?.code}</span> {aspect?.name_ar}
                </p>
                <h2 className="mt-1.5 text-[15px] font-bold text-slate-800 leading-relaxed">
                  <span className="font-latin text-violet-700 ml-2">{sub.code}</span>{sub.name_ar}
                </h2>
                {sub.source_page && (
                  <p className="text-[11px] text-slate-400 mt-1 font-latin">الدليل — ص {sub.source_page}</p>
                )}
              </div>

              <div className="flex gap-1 p-2 border-b border-slate-100 overflow-x-auto">
                {TABS.map(t => {
                  const n = t.key === 'indicators' ? children(sub.id, 4).length
                          : t.key === 'rubric'     ? rubric.length
                          : t.key === 'guidance'   ? notes.guidance.length
                          : notes.reflection.length
                  return (
                    <button key={t.key} onClick={() => setTab(t.key)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap flex items-center gap-1.5
                        ${tab === t.key ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                      <span className="inline-flex"><t.Icon size={14} /></span>
                      <span>{t.label}</span>
                      <span className={`font-latin ${tab === t.key ? 'text-white/70' : 'text-slate-400'}`}>{n}</span>
                    </button>
                  )
                })}
              </div>

              <div className="p-4">
                {busy && <p className="text-xs text-slate-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> جارٍ التحميل…</p>}

                {tab === 'indicators' && (
                  <ol className="space-y-2.5">
                    {children(sub.id, 4).map(i => (
                      <li key={i.id} className="flex items-start gap-3 rounded-xl border border-slate-100 p-3">
                        <span className="font-latin text-[11px] text-violet-700 mt-0.5 shrink-0">{i.code}</span>
                        <span className="text-sm text-slate-700 leading-relaxed">{i.name_ar}</span>
                      </li>
                    ))}
                  </ol>
                )}

                {tab === 'rubric' && (
                  <div className="space-y-4">
                    {rubric.map(r => (
                      <div key={r.row_index} className="rounded-xl border border-slate-200 overflow-hidden">
                        <div className="bg-slate-50 px-3 py-2 text-[11px] text-slate-500 flex items-center gap-2">
                          <span className="font-latin">وصف {r.row_index}</span>
                          {r.group_ar && <span className="font-semibold text-slate-700">— {r.group_ar}</span>}
                        </div>
                        <dl className="divide-y divide-slate-100">
                          {SCALE.map(s => (
                            <div key={s.level} className="grid grid-cols-[84px_1fr] gap-3 p-3">
                              <dt className="text-[12px] font-semibold" style={{ color: s.tone }}>{s.name}</dt>
                              <dd className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-line m-0">
                                {r.levels[s.level] || '—'}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ))}
                  </div>
                )}

                {tab === 'guidance' && (
                  <ul className="space-y-2">
                    {notes.guidance.map(g => (
                      <li key={g.sort_order} className="rounded-xl bg-slate-50 p-3 text-[13px] text-slate-700 leading-relaxed">
                        {g.text_ar}
                        {g.source_page && <span className="font-latin text-[10px] text-slate-400"> · ص{g.source_page}</span>}
                      </li>
                    ))}
                  </ul>
                )}

                {tab === 'reflection' && (
                  <ul className="space-y-2">
                    {notes.reflection.map(r => (
                      <li key={r.sort_order} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-[13px] text-slate-700 leading-relaxed">
                        {r.text_ar}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

'use client'

/* ════════════════════════════════════════════════════════════
   طلب الدليل الموجَّه — لوحة الطالب (الوثيقة 3.1)

   «منسّق الجودة — وهو من يعرف الإطار — يحدّد المؤشّر عند الطلب،
    فينتقل عبء الدقّة إلى من يملكها، **ويُرفع عن المعلّم تماماً**.»

   فهذه الشاشة موضع الدقّة: المرساة تُختار هنا، والموظّف يرفع الملفّ فقط.
   وثلاث حالات لا أربع، **والمغلق سدّ فجوة**: فطلبٌ أُرسل خطأً يُحذف
   ولا يُغلق، وإلّا اختلط الملغى بالمسدود فكذب كل عدٍّ للفجوات.
   ════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Loader2, Plus, Send, Trash2, Clock, CheckCircle2, AlertTriangle,
         FileQuestion, X, Inbox, CornerUpLeft } from 'lucide-react'
import NoAccess from '@/components/NoAccess'
import { toast } from '@/components/Toast'
import { usePermissions } from '@/lib/PermissionsContext'
import { createClient } from '@/lib/supabase/client'
import { fetchSubStandards, fetchFrameworkLevel, type AspectLabels, type FrameworkNode } from '@/lib/framework'
import SubStandardOptions, { ChosenSubStandard } from '@/components/SubStandardOptions'
import { academicYearOptions, currentAcademicYear } from '@/lib/dates'

type Req = {
  id: string; status: 'open' | 'in_review' | 'closed'
  what_is_asked: string; expected_type: string | null
  academic_year: string | null; due_date: string | null
  attempts: number; last_reject: string | null; diverted_note: string | null
  created_at: string; overdue: boolean; whole: boolean
  sub: FrameworkNode | null; indicators: FrameworkNode[]
  requester: { id: string; name_ar: string } | null
  assignee:  { id: string; name_ar: string } | null
  evidence:  { id: string; name: string; code: string | null; status: string } | null
}

const STATUS = {
  open:      { label: 'مفتوح',        cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  in_review: { label: 'قيد التقييم',  cls: 'bg-sky-50 text-sky-800 border-sky-200' },
  closed:    { label: 'مغلق',         cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
} as const

export default function RequestsPage() {
  const { can, isSuperAdmin, loading: permsLoading } = usePermissions()
  const [rows,   setRows]   = useState<Req[]>([])
  const [counts, setCounts] = useState<any>({})
  const [lens,   setLens]   = useState<'open' | 'in_review' | 'closed' | 'all'>('open')
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  const allowed = isSuperAdmin || can('triage_evidence')

  const load = useCallback(async () => {
    const r = await fetch('/api/evidence/requests')
    if (r.ok) { const j = await r.json(); setRows(j.requests || []); setCounts(j.counts || {}) }
    setLoading(false)
  }, [])

  useEffect(() => { if (allowed) load() }, [allowed, load])

  const drop = async (id: string) => {
    const res = await fetch('/api/evidence/requests', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'delete' }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { toast(j.error || 'تعذّر الحذف', 'error'); return }
    toast('حُذف الطلب', 'success'); await load()
  }

  const shown = useMemo(
    () => lens === 'all' ? rows : rows.filter(r => r.status === lens), [rows, lens])

  if (permsLoading) return <div className="p-10 text-center text-slate-400"><Loader2 className="animate-spin inline" /></div>
  if (!allowed) return <NoAccess message="طلب الأدلة لمنسّق الجودة وفرق التركيز (القسم 10)." />

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <span className="inline-flex text-sky-600"><FileQuestion size={20} /></span>
            <span>طلبات الأدلة</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            المرساة تُحدَّد هنا — <strong>وعبء الدقّة على من يعرف الإطار</strong>، فالموظّف يرفع الملفّ فقط.
            ولا يُغلق الطلب إلا بقبول دليله.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/evidence"
            className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm border border-slate-200 bg-white text-slate-600 hover:border-sky-300">
            <span className="inline-flex"><Inbox size={14} /></span><span>الخزانة</span>
          </Link>
          <button onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:brightness-95">
            <span className="inline-flex"><Plus size={16} /></span><span>اطلب دليلاً</span>
          </button>
        </div>
      </div>

      {/* العدسات — والفجوات المفتوحة أوّلاً لأنها ما يُعمل عليه */}
      <div className="flex flex-wrap gap-2 text-xs">
        {([
          ['open', `مفتوح (${counts.open ?? 0})`],
          ['in_review', `قيد التقييم (${counts.in_review ?? 0})`],
          ['closed', `مغلق (${counts.closed ?? 0})`],
          ['all', 'الكلّ'],
        ] as const).map(([k, label]) => (
          <button key={k} onClick={() => setLens(k as any)}
            className={`px-3 py-1.5 rounded-full border transition ${
              lens === k ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-slate-600 border-slate-200 hover:border-sky-300'}`}>
            {label}
          </button>
        ))}
        {!!counts.overdue && (
          <span className="px-3 py-1.5 rounded-full border border-red-200 bg-red-50 text-red-700 inline-flex items-center gap-1">
            <span className="inline-flex"><AlertTriangle size={12} /></span>
            <span>{counts.overdue} تجاوز مهلته</span>
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-center text-slate-400 py-10"><Loader2 className="animate-spin inline" /></p>
      ) : !shown.length ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-sm text-slate-400">
          لا طلبات في هذه العدسة
        </div>
      ) : (
        <div className="space-y-2.5">
          {shown.map(r => (
            <div key={r.id} className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
                <span className={`text-[11px] px-2 py-0.5 rounded-full border ${STATUS[r.status].cls}`}>
                  {STATUS[r.status].label}
                </span>
                {r.overdue && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full border border-red-200 bg-red-50 text-red-700">
                    تجاوز المهلة
                  </span>
                )}
                <span className="text-sm font-bold text-slate-800">{r.what_is_asked}</span>
                {r.status === 'open' && (
                  <button onClick={() => drop(r.id)} title="حذف الطلب — ولا يُغلق، فالإغلاق سدُّ فجوة"
                    className="ms-auto text-slate-300 hover:text-red-600">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                <span className="font-mono text-sky-700">{r.sub?.code}</span>
                <span className="text-slate-600">{r.sub?.name_ar}</span>
                <span>
                  {r.whole
                    ? 'المعيار الفرعي كاملاً (تغطيةٌ ضمنية)'
                    : `${r.indicators.length} مؤشّراً: ${r.indicators.map(i => i.code).join(' · ')}`}
                </span>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
                <span>المكلَّف: <strong className="text-slate-600">{r.assignee?.name_ar || '—'}</strong></span>
                {r.due_date && <span className="inline-flex items-center gap-1">
                  <span className="inline-flex"><Clock size={11} /></span><span>{r.due_date}</span>
                </span>}
                {r.academic_year && <span>العام {r.academic_year}</span>}
                {r.expected_type && <span>المتوقَّع: {r.expected_type}</span>}
                {r.attempts > 0 && <span>{r.attempts} محاولة رفع</span>}
              </div>

              {/* المصائر الثلاثة التي تُقال للطالب نصّاً */}
              {r.status === 'in_review' && r.evidence && (
                <p className="mt-2 text-[11px] text-sky-800 bg-sky-50 border border-sky-100 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5">
                  <span className="inline-flex"><Clock size={12} /></span>
                  <span>
                    رُفع «{r.evidence.name}» وينتظر الحكم — <strong>ولا يُحتسب مسدوداً حتى يُقبل</strong>.
                    <Link href={`/dashboard/evidence/triage?id=${r.evidence.id}`} className="underline ms-1">افرزه</Link>
                  </span>
                </p>
              )}
              {r.status === 'closed' && r.evidence && (
                <p className="mt-2 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5">
                  <span className="inline-flex"><CheckCircle2 size={12} /></span>
                  <span>سُدّت بـ«{r.evidence.name}» — الهويّة {r.evidence.code || '—'}</span>
                </p>
              )}
              {r.status === 'open' && r.last_reject && (
                <p className="mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5">
                  <span className="inline-flex"><CornerUpLeft size={12} /></span>
                  <span>عاد مفتوحاً — رُفض الدليل بسبب «{r.last_reject}»</span>
                </p>
              )}
              {r.status === 'open' && r.diverted_note && (
                <p className="mt-2 text-[11px] text-violet-800 bg-violet-50 border border-violet-100 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5">
                  <span className="inline-flex"><AlertTriangle size={12} /></span>
                  <span>{r.diverted_note}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {showNew && <NewRequest onClose={() => setShowNew(false)} onDone={async () => { setShowNew(false); await load() }} />}
    </div>
  )
}

/* ════════════════ نافذة الطلب ════════════════ */

function NewRequest({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [staff, setStaff] = useState<{ id: string; name_ar: string }[]>([])
  const [subs,  setSubs]  = useState<FrameworkNode[]>([])
  const [aspects, setAspects] = useState<AspectLabels>(new Map())
  const [inds,  setInds]  = useState<FrameworkNode[]>([])
  const [types, setTypes] = useState<string[]>([])

  const [assignedTo,  setAssignedTo]  = useState('')
  const [subId,       setSubId]       = useState('')
  const [picked,      setPicked]      = useState<string[]>([])
  const [whole,       setWhole]       = useState(false)
  const [what,        setWhat]        = useState('')
  const [expected,    setExpected]    = useState('')
  const [year,        setYear]        = useState(currentAcademicYear())
  const [due,         setDue]         = useState('')
  const [busy,        setBusy]        = useState(false)

  const sub = subs.find(s => s.id === subId)

  useEffect(() => {
    (async () => {
      const sb = createClient()
      const [{ data: people }, fw, { data: opts }] = await Promise.all([
        sb.from('profiles').select('id, name_ar').eq('is_active', true).order('name_ar'),
        fetchSubStandards(),
        sb.from('dropdown_options').select('value')
          .eq('category', 'evidence_type').eq('is_active', true).order('sort_order'),
      ])
      setStaff(people || []); setSubs(fw.subs); setAspects(fw.aspects)
      setTypes((opts || []).map((o: any) => o.value))
    })()
  }, [])

  useEffect(() => {
    if (!sub) { setInds([]); setPicked([]); return }
    fetchFrameworkLevel(4, sub.code).then(setInds)
    setPicked([])
  }, [subId, sub?.code])

  const submit = async () => {
    setBusy(true)
    const res = await fetch('/api/evidence/requests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assignedTo, subNodeId: subId,
        indicatorIds: whole ? [] : picked,
        whatIsAsked: what, expectedType: expected, academicYear: year, dueDate: due,
      }),
    })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { toast(j.error || 'تعذّر إنشاء الطلب', 'error'); return }
    toast('أُرسل الطلب — وظهر في «أدلة مطلوبة» عند مكلَّفه', 'success')
    onDone()
  }

  const ready = !!assignedTo && !!subId && !!what.trim() && (whole || picked.length > 0)

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-lg my-8">
        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
          <span className="inline-flex text-sky-600"><FileQuestion size={18} /></span>
          <h2 className="font-bold text-slate-800 text-sm">اطلب دليلاً</h2>
          <button onClick={onClose} className="ms-auto text-slate-400 hover:text-slate-700"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-3.5 text-sm">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">المكلَّف *</span>
            <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200">
              <option value="">اختر موظفاً…</option>
              {staff.map(p => <option key={p.id} value={p.id}>{p.name_ar}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">المعيار الفرعي *</span>
            <select value={subId} onChange={e => setSubId(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200">
              <option value="">اختر معياراً فرعياً…</option>
              <SubStandardOptions subs={subs} aspects={aspects} />
            </select>
            <ChosenSubStandard sub={sub} />
          </label>

          {/* «حدِّد ما يغطّيه» لا «اختر مؤشّراً بعينه» (3.3) */}
          {!!sub && (
            <div className="rounded-xl border border-slate-200 p-3 space-y-2">
              <label className="flex items-start gap-2 text-xs">
                <input type="checkbox" checked={whole} onChange={e => setWhole(e.target.checked)} className="mt-0.5" />
                <span>
                  <strong>يغطّي المعيار الفرعي كاملاً</strong>
                  <span className="block text-slate-400">تُسجَّل تغطيةً ضمنية في كل مؤشراته (3.3)</span>
                </span>
              </label>
              {!whole && (
                <div className="max-h-44 overflow-y-auto space-y-1 border-t border-slate-100 pt-2">
                  {!inds.length && <p className="text-xs text-slate-400">…</p>}
                  {inds.map(i => (
                    <label key={i.id} className="flex items-start gap-2 text-xs hover:bg-slate-50 rounded-lg p-1">
                      <input type="checkbox" checked={picked.includes(i.id)} className="mt-0.5"
                        onChange={e => setPicked(p => e.target.checked ? [...p, i.id] : p.filter(x => x !== i.id))} />
                      <span><span className="font-mono text-sky-700">{i.code}</span> {i.name_ar}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">ما المطلوب بالضبط *</span>
            <textarea value={what} onChange={e => setWhat(e.target.value)} rows={2}
              placeholder="مثال: محضر اجتماع أولياء الأمور للفصل الأول مع قائمة الحضور"
              className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200" />
            <span className="text-[11px] text-slate-400">
              هذا ما يقرأه الموظّف — فكلّما دقّ قلّ الرفض.
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">النوع المتوقَّع</span>
              <select value={expected} onChange={e => setExpected(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200">
                <option value="">—</option>
                {types.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">العام المنسوب</span>
              <select value={year} onChange={e => setYear(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200">
                {academicYearOptions().map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">المهلة</span>
            <input type="date" value={due} onChange={e => setDue(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200" />
            <span className="text-[11px] text-slate-400">يظهر في «أدلة مطلوبة» حتى المهلة ثم يُوسَم متجاوزاً.</span>
          </label>
        </div>

        <div className="p-4 border-t border-slate-100 flex items-center gap-2">
          <button onClick={submit} disabled={!ready || busy}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-bold disabled:opacity-40">
            <span className="inline-flex">{busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}</span>
            <span>أرسِل الطلب</span>
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}

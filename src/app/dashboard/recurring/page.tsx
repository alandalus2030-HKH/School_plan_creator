'use client'

/* ════════════════════════════════════════════════════════════
   المهامّ الدورية — شاشة التعريف (الوثيقة 5)

   «أكثر ما يشهد لمؤشرات الإطار ليس مشاريع تبدأ وتنتهي، بل **ممارسات
    مؤسسية مستمرّة**… تُسنَد مرّةً وتُثمر سنوات.»

   وموضعها هنا لا في الخطة: «والتعقيد ينتقل إلى الإعدادات — شاشة
   التعريف يواجهها **منسّق الجودة مرّةً، لا المعلّم كل يوم**. وهذا
   تعقيدٌ في محلّه» (5.4).

   وثلاثة أحكامٍ تُرى في هذه الشاشة عياناً:
   ١ **لا إسناد لشخص** — قسمٌ أو منصب، «فإسنادها لشخصٍ بعينه يقتلها
     عند رحيله» (5.2). ولا حقلَ لشخصٍ هنا أصلاً.
   ٢ **لا نسبة إنجاز** — بل «12 دورة من 12 وُثّقت»، فالدورية لا تنتهي
     ولا تُحتسب في إنجاز الخطة.
   ٣ **ثلاث حالات لا اثنتان** — والمهملة وحدها فجوة (5.3).
   ════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Loader2, Repeat, Plus, X, Save, Trash2, Target, CheckCircle2,
         MinusCircle, AlertTriangle, Clock, Power, Inbox } from 'lucide-react'
import NoAccess from '@/components/NoAccess'
import { toast } from '@/components/Toast'
import { usePermissions } from '@/lib/PermissionsContext'
import { createClient } from '@/lib/supabase/client'
import { fetchSubStandards, fetchFrameworkLevel, type AspectLabels, type FrameworkNode } from '@/lib/framework'
import SubStandardOptions, { ChosenSubStandard } from '@/components/SubStandardOptions'

type Anchor = { nodeId: string; code: string; name_ar: string; level: number; kind: string }
type Cycle  = {
  id: string; period_label: string; due_date: string; academic_year: string
  status: 'open' | 'documented' | 'skipped' | 'neglected'
  justification: string | null; evidence_id: string | null
}
type Task = {
  id: string; name_ar: string; description: string | null
  frequency: 'weekly' | 'monthly' | 'termly' | 'annual'
  assigned_department: string | null; assigned_job_title: string | null
  expected_evidence_type: string | null
  year_policy: 'previous' | 'next' | 'by_date'
  lead_days: number; is_active: boolean
  anchors: Anchor[]; linkedNodes: number; cycles: Cycle[]
  tally: { documented: number; skipped: number; neglected: number; open: number; total: number }
}

const FREQ_AR: Record<string, string> = {
  weekly: 'أسبوعية', monthly: 'شهرية', termly: 'فصلية', annual: 'سنوية',
}
const POLICY_AR: Record<string, string> = {
  previous: 'العام المنصرم', next: 'العام القادم', by_date: 'بتاريخ الاستحقاق',
}
const CYCLE_AR: Record<string, { ar: string; cls: string }> = {
  open:       { ar: 'مفتوحة',            cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  documented: { ar: 'وُثّقت',             cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  skipped:    { ar: 'لم تُنفَّذ بمبرّر',  cls: 'bg-slate-50 text-slate-600 border-slate-200' },
  neglected:  { ar: 'أُهملت',             cls: 'bg-red-50 text-red-700 border-red-200' },
}

export default function RecurringPage() {
  const { can, isSuperAdmin, loading: permsLoading } = usePermissions()
  const [items,   setItems]   = useState<Task[]>([])
  const [manage,  setManage]  = useState(false)
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState('')
  const [editing, setEditing] = useState<Task | 'new' | null>(null)

  const allowed = isSuperAdmin || can('view_plans') || can('view_evidence') || can('triage_evidence') || can('manage_settings')

  const load = useCallback(async () => {
    const r = await fetch('/api/recurring-tasks')
    const j = await r.json().catch(() => ({}))
    if (!r.ok) setErr(j.error || 'تعذّر التحميل')
    else { setItems(j.items || []); setManage(!!j.canManage); setErr('') }
    setLoading(false)
  }, [])

  useEffect(() => { if (allowed) load() }, [allowed, load])

  const toggle = async (t: Task) => {
    const r = await fetch('/api/recurring-tasks', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, isActive: !t.is_active }),
    })
    if (!r.ok) { toast('تعذّر التغيير', 'error'); return }
    toast(t.is_active ? 'أُوقفت المهمّة' : 'استُؤنفت المهمّة', 'success'); await load()
  }

  const remove = async (t: Task) => {
    const r = await fetch('/api/recurring-tasks', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id }),
    })
    if (!r.ok) { toast('تعذّر الحذف', 'error'); return }
    toast('حُذفت — ودوراتها الموثّقة تبقى في السجلّ', 'success'); await load()
  }

  if (permsLoading) return <div className="p-10 text-center text-slate-400"><Loader2 className="animate-spin inline" /></div>
  if (!allowed) return <NoAccess message="المهامّ الدورية تتطلّب صلاحية الخطط أو الأدلة." />

  const active = items.filter(t => t.is_active)

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <span className="inline-flex text-[#8a1538]"><Repeat size={20} /></span>
            <span>المهامّ الدورية</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            ممارساتٌ مؤسسية مستمرّة — <strong>تُسنَد مرّةً وتُثمر سنوات</strong>.
            وتُعرَّف هنا مرّةً، فلا يُسأل الرافع عن مرساةٍ ولا نوعِ دليل.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/evidence"
            className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm border border-slate-200 bg-white text-slate-600 hover:border-violet-300">
            <span className="inline-flex"><Inbox size={14} /></span><span>الخزانة</span>
          </Link>
          {manage && (
            <button onClick={() => setEditing('new')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#8a1538] text-white text-sm font-semibold hover:brightness-110">
              <span className="inline-flex"><Plus size={16} /></span><span>مهمّة دورية</span>
            </button>
          )}
        </div>
      </div>

      {/* «ابدأ بستّ لا بستّين» (5.4) — نصيحةٌ تُقال حيث تُفعل */}
      {manage && active.length >= 6 && (
        <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-start gap-1.5">
          <span className="inline-flex mt-0.5"><AlertTriangle size={12} /></span>
          <span>
            عندك <strong>{active.length}</strong> مهمّةً نشطة. والوثيقة توصي:
            <strong> «ابدأ بستّ لا بستّين»</strong> — تُجرَّب فصلاً كاملاً: هل تُرفع أدلّتها فعلاً؟
            هل التنبيهات محتملة؟ ثمّ يُوسَّع (5.4).
          </span>
        </p>
      )}

      {loading ? (
        <p className="text-center text-slate-400 py-10"><Loader2 className="animate-spin inline" /></p>
      ) : err ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">{err}</div>
      ) : !items.length ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <span className="inline-flex text-slate-300 mb-2"><Repeat size={28} /></span>
          <p className="text-sm text-slate-500">لا مهامّ دورية بعد</p>
          <p className="text-[11px] text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
            اجتماع مجلس الأمناء الفصلي · تحليل نتائج التقييمات بعد كل فصل · مراجعة خطط الدروس
            أسبوعياً · تدريب السلامة السنوي — هذه أمثلة الوثيقة، وهي ما يشهد لمؤشرات الإطار أكثر من المشاريع.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map(t => (
            <div key={t.id} className={`bg-white rounded-2xl border p-4 ${t.is_active ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}>
              <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
                <span className="text-sm font-bold text-slate-800">{t.name_ar}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#8a1538]/10 text-[#8a1538] border border-[#8a1538]/20">
                  {FREQ_AR[t.frequency]}
                </span>
                {!t.is_active && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">موقوفة</span>
                )}
                {manage && (
                  <span className="ms-auto flex items-center gap-1">
                    <button onClick={() => setEditing(t)} title="تعديل"
                      className="text-[11px] text-slate-400 hover:text-slate-700 px-1.5">تعديل</button>
                    <button onClick={() => toggle(t)} title={t.is_active ? 'إيقاف' : 'استئناف'}
                      className="text-slate-300 hover:text-amber-600"><Power size={13} /></button>
                    <button onClick={() => remove(t)} title="حذفٌ ناعم — ودوراتها تبقى"
                      className="text-slate-300 hover:text-red-600"><Trash2 size={13} /></button>
                  </span>
                )}
              </div>

              {t.description && <p className="mt-1 text-[11px] text-slate-500">{t.description}</p>}

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                {/* منصبٌ أو قسم — لا شخص (5.2) */}
                <span>
                  المُسنَد إليه:{' '}
                  <strong className="text-slate-700">{t.assigned_job_title || t.assigned_department}</strong>
                  <span className="text-slate-400"> ({t.assigned_job_title ? 'منصب' : 'قسم'})</span>
                </span>
                <span>نسبة العام: {POLICY_AR[t.year_policy]}</span>
                {t.expected_evidence_type && <span>الدليل المتوقَّع: {t.expected_evidence_type}</span>}
                <span>يُطلب قبل {t.lead_days} يوماً</span>
                {t.linkedNodes > 0 && (
                  <span title="عقد خطط تشير إليها — إشارة لا احتواء، ولا تدخل نسبة إنجازها">
                    {t.linkedNodes} عقدة خطّة تشير إليها
                  </span>
                )}
              </div>

              {/* المراسي — تُكتب مرّةً وترثها كل أدلّتها */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {t.anchors.map(a => (
                  <span key={a.nodeId} title={a.name_ar}
                    className={`text-[11px] px-2 py-0.5 rounded-full border ${
                      a.kind === 'implicit'
                        ? 'bg-violet-50 text-violet-700 border-violet-200'
                        : 'bg-sky-50 text-sky-700 border-sky-200'}`}>
                    <span className="font-latin">{a.code}</span>
                    {a.kind === 'implicit' ? ' · كامل المعيار' : ''}
                  </span>
                ))}
              </div>

              {/* «ولها مؤشّرها الخاص: 12 دورة من 12 وُثّقت» — لا نسبة إنجاز خطة */}
              {t.tally.total > 0 && (
                <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                  <span className="text-slate-700 font-semibold">
                    {t.tally.documented} دورة من {t.tally.total} وُثّقت
                  </span>
                  {t.tally.skipped > 0 && (
                    <span className="text-slate-500 inline-flex items-center gap-1">
                      <span className="inline-flex"><MinusCircle size={11} /></span>
                      <span>{t.tally.skipped} لم تُنفَّذ بمبرّر — مقبولة</span>
                    </span>
                  )}
                  {t.tally.neglected > 0 && (
                    <span className="text-red-700 inline-flex items-center gap-1 font-semibold">
                      <span className="inline-flex"><AlertTriangle size={11} /></span>
                      <span>{t.tally.neglected} أُهملت — وهذه وحدها فجوة</span>
                    </span>
                  )}
                  {t.tally.open > 0 && (
                    <span className="text-sky-700 inline-flex items-center gap-1">
                      <span className="inline-flex"><Clock size={11} /></span>
                      <span>{t.tally.open} مفتوحة</span>
                    </span>
                  )}
                </div>
              )}

              {/* آخر الدورات */}
              {t.cycles.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {t.cycles.map(c => (
                    <span key={c.id} title={c.justification || `${c.academic_year} · تستحقّ ${c.due_date}`}
                      className={`text-[10px] px-1.5 py-0.5 rounded-md border ${CYCLE_AR[c.status].cls}`}>
                      {c.period_label} · {CYCLE_AR[c.status].ar}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-slate-400 leading-relaxed">
        <strong>ولا تُحتسب في نسبة إنجاز الخطة</strong> — «المهمة الدورية لا تنتهي أبداً، فتبقى الخطة
        دون 100٪ إلى الأبد، أو «تكتمل» بإغلاق دورة واحدة». فدوراتها في جدولٍ مستقلّ
        <strong> تملكه المهمّة لا الخطة</strong>، ولذلك أيضاً <strong>لا يوقفها تجميد الخطة</strong> —
        فالممارسة مستمرّة في الواقع (5.2).
      </p>

      {editing && (
        <TaskForm task={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDone={async () => { setEditing(null); await load() }} />
      )}
    </div>
  )
}

/* ════════════════ نافذة التعريف ════════════════ */

function TaskForm({ task, onClose, onDone }:
  { task: Task | null; onClose: () => void; onDone: () => void }) {
  const [subs,  setSubs]  = useState<FrameworkNode[]>([])
  const [aspects, setAspects] = useState<AspectLabels>(new Map())
  const [inds,  setInds]  = useState<FrameworkNode[]>([])
  const [subSel, setSubSel] = useState('')
  const [depts, setDepts] = useState<string[]>([])
  const [jobs,  setJobs]  = useState<string[]>([])
  const [types, setTypes] = useState<string[]>([])

  const [name,   setName]   = useState(task?.name_ar || '')
  const [desc,   setDesc]   = useState(task?.description || '')
  const [freq,   setFreq]   = useState(task?.frequency || 'termly')
  const [mode,   setMode]   = useState<'dept' | 'job'>(task?.assigned_job_title ? 'job' : 'dept')
  const [dept,   setDept]   = useState(task?.assigned_department || '')
  const [job,    setJob]    = useState(task?.assigned_job_title || '')
  const [policy, setPolicy] = useState(task?.year_policy || 'by_date')
  const [evType, setEvType] = useState(task?.expected_evidence_type || '')
  const [lead,   setLead]   = useState(String(task?.lead_days ?? 7))
  const [picked, setPicked] = useState<string[]>(task?.anchors.map(a => a.nodeId) || [])
  const [busy,   setBusy]   = useState(false)

  useEffect(() => {
    ;(async () => {
      const sb = createClient()
      const [fw, { data: opts }] = await Promise.all([
        fetchSubStandards(),
        sb.from('dropdown_options').select('category, value')
          .in('category', ['department', 'job_title', 'evidence_type'])
          .eq('is_active', true).order('sort_order'),
      ])
      setSubs(fw.subs); setAspects(fw.aspects)
      setDepts((opts || []).filter((o: any) => o.category === 'department').map((o: any) => o.value))
      setJobs((opts || []).filter((o: any) => o.category === 'job_title').map((o: any) => o.value))
      setTypes((opts || []).filter((o: any) => o.category === 'evidence_type').map((o: any) => o.value))
    })()
  }, [])

  useEffect(() => {
    const sub = subs.find(s => s.id === subSel)
    if (!sub) { setInds([]); return }
    fetchFrameworkLevel(4, sub.code).then(setInds)
  }, [subSel, subs])

  const toggleAnchor = (id: string) =>
    setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

  const submit = async () => {
    setBusy(true)
    const body: any = {
      nameAr: name, description: desc, frequency: freq,
      assignedDepartment: mode === 'dept' ? dept : '',
      assignedJobTitle:   mode === 'job'  ? job  : '',
      yearPolicy: policy, expectedEvidenceType: evType,
      leadDays: Number(lead), anchors: picked,
    }
    if (task) body.id = task.id
    const r = await fetch('/api/recurring-tasks', {
      method: task ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { toast(j.error || 'تعذّر الحفظ', 'error'); return }
    toast(task ? 'حُدِّثت المهمّة' : 'عُرِّفت المهمّة الدورية', 'success')
    onDone()
  }

  const chosenSub = subs.find(s => s.id === subSel) || null
  const ready = !!name.trim() && picked.length > 0 && (mode === 'dept' ? !!dept : !!job)

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-lg my-8">
        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
          <span className="inline-flex text-[#8a1538]"><Repeat size={18} /></span>
          <h2 className="font-bold text-slate-800 text-sm">
            {task ? 'تعديل مهمّة دورية' : 'تعريف مهمّة دورية'}
          </h2>
          <button onClick={onClose} className="ms-auto text-slate-400 hover:text-slate-700"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-3.5 text-sm">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">اسم الممارسة *</span>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="مثال: تحليل نتائج التقييمات بعد كل فصل"
              className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200" />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">وصفٌ موجز</span>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
              className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">الدورية *</span>
              <select value={freq} onChange={e => setFreq(e.target.value as any)}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200">
                {Object.entries(FREQ_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">يُطلب قبل (أيام)</span>
              <input value={lead} onChange={e => setLead(e.target.value)} inputMode="numeric"
                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 font-latin" />
            </label>
          </div>

          {/* الإسناد: منصبٌ أو قسم — ولا شخص (5.2) */}
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-xs font-semibold text-slate-600 mb-1.5">المُسنَد إليه *</p>
            <div className="flex gap-2 mb-2 text-xs">
              {([['dept', 'قسم'], ['job', 'منصب']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setMode(k)}
                  className={`px-3 py-1.5 rounded-lg border ${
                    mode === k ? 'bg-slate-800 text-white border-slate-800'
                               : 'bg-white text-slate-600 border-slate-200'}`}>{l}</button>
              ))}
            </div>
            {mode === 'dept' ? (
              <select value={dept} onChange={e => setDept(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200">
                <option value="">اختر قسماً…</option>
                {depts.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            ) : (
              <select value={job} onChange={e => setJob(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200">
                <option value="">اختر منصباً…</option>
                {jobs.map(j => <option key={j} value={j}>{j}</option>)}
              </select>
            )}
            <p className="text-[11px] text-slate-400 mt-1.5">
              <strong>ولا تُسنَد لشخص</strong> — «الممارسة مؤسسية، وإسنادها لشخصٍ بعينه يقتلها عند رحيله» (5.2).
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">نسبة العام</span>
              <select value={policy} onChange={e => setPolicy(e.target.value as any)}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200">
                {Object.entries(POLICY_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">الدليل المتوقَّع</span>
              <select value={evType} onChange={e => setEvType(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200">
                <option value="">—</option>
                {types.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>
          <p className="text-[11px] text-slate-400 -mt-2">
            تقريرٌ يُكتب في سبتمبر عن عمل العام الماضي يُنسب إلى <strong>المنصرم</strong>،
            وخطّةٌ تُعدّ في يونيو لعامٍ قادم تُنسب إلى <strong>القادم</strong> — «فالعام المنسوب حكمٌ لا تاريخ» (3.8).
          </p>

          {/* المراسي: تُكتب مرّةً فترثها كل الأدلة */}
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-xs font-semibold text-slate-600 mb-1.5">
              المراسي في الإطار * <span className="text-slate-400 font-normal">({picked.length} مختارة)</span>
            </p>
            <select value={subSel} onChange={e => setSubSel(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs mb-2">
              <option value="">اختر معياراً فرعياً لترى مؤشراته…</option>
              <SubStandardOptions subs={subs} aspects={aspects} />
            </select>
            <ChosenSubStandard sub={chosenSub} />

            {!!subSel && (
              <>
                <label className="flex items-start gap-2 text-xs hover:bg-slate-50 rounded-lg p-1 mb-1">
                  <input type="checkbox" className="mt-0.5"
                    checked={picked.includes(subSel)} onChange={() => toggleAnchor(subSel)} />
                  <span>
                    <strong>يغطّي المعيار الفرعي كاملاً</strong>
                    <span className="block text-slate-400">تغطيةٌ ضمنية في كل مؤشراته (3.3)</span>
                  </span>
                </label>
                <div className="max-h-36 overflow-y-auto border-t border-slate-100 pt-1.5 space-y-0.5">
                  {inds.map(i => (
                    <label key={i.id} className="flex items-start gap-2 text-xs hover:bg-slate-50 rounded-lg p-1">
                      <input type="checkbox" className="mt-0.5"
                        checked={picked.includes(i.id)} onChange={() => toggleAnchor(i.id)} />
                      <span><span className="font-latin text-sky-700">{i.code}</span> {i.name_ar}</span>
                    </label>
                  ))}
                </div>
              </>
            )}

            {picked.length > 0 && (
              <p className="text-[11px] text-emerald-700 mt-2 inline-flex items-start gap-1">
                <span className="inline-flex mt-0.5"><Target size={11} /></span>
                <span>
                  تُسنَد مرّةً وتُثمر سنوات — كل دليلٍ يُرفع لأيّ دورةٍ من هذه المهمّة يرث هذه المراسي.
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 flex items-center gap-2">
          <button onClick={submit} disabled={!ready || busy}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#8a1538] text-white text-sm font-bold disabled:opacity-40">
            <span className="inline-flex">{busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}</span>
            <span>{task ? 'حفظ' : 'عرِّف المهمّة'}</span>
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600">
            إلغاء
          </button>
          {!ready && (
            <span className="text-[11px] text-slate-400 ms-auto">
              الاسم · المُسنَد إليه · مرساةٌ واحدة على الأقل
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

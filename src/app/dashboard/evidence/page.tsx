'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { FolderOpen, Loader2, Paperclip, BadgeCheck, AlertTriangle, Search, ListChecks, ShieldCheck,
  Printer, Link2, FileDown, FilterX, Image, FileText, FileSpreadsheet, Video, File, ClipboardList, Plus, Users, RefreshCw, Inbox, FileStack, FileQuestion, History, X,
  Upload, CheckCircle2, XCircle, RotateCcw, PencilLine, Target, Fingerprint, Undo2, EyeOff } from 'lucide-react'
import NoAccess from '@/components/NoAccess'
import { EVIDENCE_EVENTS, FIELD_LABELS, type EvidenceEvent } from '@/lib/evidenceLog'
import { usePermissions } from '@/lib/PermissionsContext'
import { toast } from '@/components/Toast'

type Anchor = { code: string; name: string; kind: string; confirmStatus: string }
type Ev = {
  id: string; name: string; number: string; code: string | null
  file_type: string | null; status: string
  created_at: string; filesCount: number; size: number; linkedCount: number
  /* القناة التي دخل منها الدليل — تُسجَّل مرّةً ولا تتبدّل (الوثيقة 3.4) */
  source: string
  academicYear: string | null; documentDate: string | null
  type: string | null; reason: string | null
  task: { id: string; name_ar: string; status: string } | null
  plan: { name_ar: string; department: string | null; category: string | null } | null
  standard: { code: string; name: string } | null
  standardMain: { code: string; name: string } | null
  standardAspect: { code: string; name: string } | null
  anchors: Anchor[]
  /* بلا مرساة = خارج تغطية الإطار (أدلة الخطط كلّها كذلك حتى م1‑3ج) */
  hasAnchor: boolean
  team: { name: string; standard: string } | null
}
type Std = { code: string | null; name: string; plan: string; department: string | null; total: number; covered: number; without: { id: string; name_ar: string }[] }

const SOURCE_META: Record<string, { ar: string; cls: string }> = {
  plan:      { ar: 'من خطة',       cls: 'bg-slate-100 text-slate-600' },
  direct:    { ar: 'رفع مباشر',    cls: 'bg-violet-50 text-violet-700 border border-violet-100' },
  request:   { ar: 'طلب موجَّه',   cls: 'bg-sky-50 text-sky-700 border border-sky-100' },
  recurring: { ar: 'مهمّة دورية',  cls: 'bg-teal-50 text-teal-700 border border-teal-100' },
}

const STATUS_META: Record<string, { ar: string; cls: string }> = {
  pending:  { ar: 'قيد المراجعة', cls: 'bg-slate-100 text-slate-600' },
  accepted: { ar: 'معتمد',        cls: 'bg-emerald-50 text-emerald-700' },
  rejected: { ar: 'مرفوض',        cls: 'bg-red-50 text-red-600' },
}
const typeOf = (ft: string | null) =>
  ft === 'video/youtube' ? 'video' : ft?.startsWith('image') ? 'image'
  : ft === 'application/pdf' ? 'pdf' : ft?.includes('word') ? 'word'
  : ft?.includes('sheet') ? 'excel' : 'other'
const TYPE_LABEL: Record<string, string> = { video: 'فيديو', image: 'صورة', pdf: 'PDF', word: 'Word', excel: 'Excel', other: 'أخرى' }
const TYPE_ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> =
  { video: Video, image: Image, pdf: FileText, word: FileText, excel: FileSpreadsheet, other: File }
const fmtSize = (b: number) => b === 0 ? '—' : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`

/* أدوار مراجعة الأدلة المحصورة بالقسم (الباقي على نطاق المدرسة) */
const DEPT_SCOPED_REVIEW_ROLES = ['department_head']

export default function EvidenceLockerPage() {
  const { can, isSuperAdmin, role } = usePermissions()
  const canReview = isSuperAdmin || can('review_evidence')
  const deptScopedReview = !isSuperAdmin && DEPT_SCOPED_REVIEW_ROLES.includes(role)

  const [evidence, setEvidence] = useState<Ev[]>([])
  const [standards, setStandards] = useState<Std[]>([])
  const [myDept, setMyDept] = useState<string | null>(null)
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [tab, setTab] = useState<'list' | 'coverage'>('list')

  /* فلاتر */
  const [search, setSearch] = useState('')
  const [fType, setFType] = useState('')
  const [fDept, setFDept] = useState('')
  const [fMain, setFMain] = useState('')
  const [fAspect, setFAspect] = useState('')
  const [fStd, setFStd] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [sharedOnly, setSharedOnly] = useState(false)
  const [fSource, setFSource] = useState('')
  const [noAnchorOnly, setNoAnchorOnly] = useState(false)
  const [fFrom, setFFrom] = useState('')
  const [fTo, setFTo] = useState('')
  const [exporting, setExporting] = useState(false)

  const load = async () => {
    const res = await fetch('/api/evidence-locker')
    if (res.status === 403) { setDenied(true); setLoading(false); return }
    const j = await res.json().catch(() => ({}))
    setEvidence(j.evidence || []); setStandards(j.standards || []); setStats(j.stats || null)
    setMyDept(j.myDepartment ?? null)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const departments = useMemo(() => [...new Set(evidence.map(e => e.plan?.department).filter(Boolean))].sort() as string[], [evidence])

  /* خيارات المعيار الثلاثة (متدرّجة: الجانب يتبع الرئيس، والفرعي يتبع الجانب) */
  const uniq = (arr: ({ code: string; name: string } | null)[]) =>
    [...new Map(arr.filter(Boolean).map(s => [s!.code, s!])).values()].sort((a, b) => a.code.localeCompare(b.code, 'ar'))
  const mainOptions   = useMemo(() => uniq(evidence.map(e => e.standardMain)), [evidence])
  const aspectOptions = useMemo(() => uniq(evidence.filter(e => !fMain || e.standardMain?.code === fMain).map(e => e.standardAspect)), [evidence, fMain])
  const subOptions    = useMemo(() => uniq(evidence
    .filter(e => (!fMain || e.standardMain?.code === fMain) && (!fAspect || e.standardAspect?.code === fAspect))
    .map(e => e.standard)), [evidence, fMain, fAspect])

  const shown = useMemo(() => evidence.filter(e => {
    if (search && !(`${e.name} ${e.number}`.toLowerCase().includes(search.toLowerCase()))) return false
    if (fType && typeOf(e.file_type) !== fType) return false
    if (fDept && e.plan?.department !== fDept) return false
    if (fMain && e.standardMain?.code !== fMain) return false
    if (fAspect && e.standardAspect?.code !== fAspect) return false
    if (fStd && e.standard?.code !== fStd) return false
    if (fStatus && e.status !== fStatus) return false
    if (fSource && e.source !== fSource) return false
    if (noAnchorOnly && e.hasAnchor) return false
    if (sharedOnly && e.linkedCount === 0) return false
    const day = (e.created_at || '').slice(0, 10)
    if (fFrom && day < fFrom) return false
    if (fTo && day > fTo) return false
    return true
  }), [evidence, search, fType, fDept, fMain, fAspect, fStd, fStatus, fSource, noAnchorOnly, sharedOnly, fFrom, fTo])

  const anyFilter = !!(search || fType || fDept || fMain || fAspect || fStd || fStatus || fSource || noAnchorOnly || sharedOnly || fFrom || fTo)
  const clearFilters = () => {
    setSearch(''); setFType(''); setFDept(''); setFMain(''); setFAspect('')
    setFStd(''); setFStatus(''); setFSource(''); setNoAnchorOnly(false)
    setSharedOnly(false); setFFrom(''); setFTo('')
  }

  const exportXlsx = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const rows = shown.map(e => ({
        'الرقم': e.number || '',
        'اسم الدليل': e.name || '',
        'النوع': TYPE_LABEL[typeOf(e.file_type)],
        'الحالة': (STATUS_META[e.status] || STATUS_META.pending).ar,
        'المعيار': e.standard?.code || '',
        'اسم المعيار': e.standard?.name || '',
        'القسم': e.plan?.department || '',
        'المهمة': e.task?.name_ar || '',
        'عدد الملفات': e.filesCount,
        'الحجم': fmtSize(e.size),
        'مشترك مع معايير': e.linkedCount,
        'تاريخ الرفع': (e.created_at || '').slice(0, 10),
      }))
      const fileBase = `خزانة-الأدلة-${new Date().toISOString().slice(0, 10)}`
      const res = await fetch('/api/export/xlsx', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, fileName: fileBase, sheetName: 'الأدلة' }),
      })
      if (!res.ok) { toast('تعذّر تصدير الملف', 'error'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `${fileBase}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch { toast('تعذّر تصدير الملف', 'error') }
    finally { setExporting(false) }
  }

  /* ── إعادة الفتح: نقضُ حكمٍ قائم، فله شروط الحكم ──
     سببٌ مكتوب (3.3) · وإن كان الدليل سنداً لمهمّة منجزة فقرارٌ صريح
     في مصيرها. والقبول والرفض في الطابور وحده. */
  const [reopen,     setReopen]     = useState<Ev | null>(null)
  const [logOf,      setLogOf]      = useState<{ id: string; name: string; code: string | null } | null>(null)
  const [reason,     setReason]     = useState('')
  const [taskAction, setTaskAction] = useState<'' | 'return' | 'keep'>('')
  const [reopening,  setReopening]  = useState(false)
  /* ── سلامة الأرشيف: البصمة والفحص الدوريّ (الوثيقة 11) ──
     «أرشيفٌ من ألفي ملفّ يعيش ستّ سنوات يتلف بعضه بلا أن يمسّه أحد».
     والقيمة أن يُكتشف التلف **قبل أن تُطلب الأدلة، لا يوم الزيارة». */
  const [fix,     setFix]     = useState<any>(null)
  const [sweeping, setSweeping] = useState(false)
  const [needsTask,  setNeedsTask]  = useState(false)

  useEffect(() => {
    fetch('/api/evidence/fixity').then(r => r.ok ? r.json() : null).then(j => j && setFix(j)).catch(() => {})
  }, [])

  const runSweep = async () => {
    setSweeping(true)
    const res = await fetch('/api/evidence/fixity', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'school', limit: 200 }),
    })
    const j = await res.json().catch(() => ({}))
    setSweeping(false)
    if (!res.ok) { toast(j.error || 'تعذّر الفحص', 'error'); return }
    toast(j.mismatch || j.missing
      ? `فُحص ${j.checked} ملفّاً — ${j.mismatch} تبدّل و${j.missing} مفقود`
      : `فُحص ${j.checked} ملفّاً · خُتم ${j.stamped} · لا تبدّل`,
      j.mismatch || j.missing ? 'error' : 'success')
    fetch('/api/evidence/fixity').then(r => r.json()).then(setFix).catch(() => {})
  }

  const doReopen = async () => {
    if (!reopen || !reason.trim()) return
    setReopening(true)
    const res = await fetch(`/api/evidence/${reopen.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'pending', reason: reason.trim(), taskAction: taskAction || undefined }),
    })
    const j = await res.json().catch(() => ({}))
    setReopening(false)
    /* المهمّة المنجزة: تحذيرٌ وقرار — لا منع */
    if (res.status === 409 && j.needsTaskDecision) { setNeedsTask(true); return }
    if (!res.ok) { toast(j.error || 'تعذّر إعادة الفتح', 'error'); return }
    setEvidence(prev => prev.map(e => e.id === reopen.id ? { ...e, status: 'pending' } : e))
    toast('أُعيد الدليل إلى طابور الفرز وأُبلغ رافعه', 'success')
    setReopen(null); setNeedsTask(false); setReason(''); setTaskAction('')
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 size={28} className="animate-spin text-violet-500" /></div>
  if (denied) return <NoAccess />

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* الترويسة */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white flex-shrink-0" style={{ background: 'var(--gradient-button, #8a1538)' }}>
          <FolderOpen size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">خزانة الأدلة</h1>
          <p className="text-sm text-slate-500">كل أدلة المدرسة منظّمةً بالمعيار مع تحليل التغطية</p>
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          {/* الفرز وفرقه — من يملك triage_evidence (الوثيقة 3.2 · 3.6) */}
          {(isSuperAdmin || can('triage_evidence')) && (
            <>
              <Link href="/dashboard/evidence/triage"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-violet-200 bg-white text-violet-700 text-sm font-semibold hover:bg-violet-50 transition">
                <span className="inline-flex"><ShieldCheck size={16} /></span>
                <span>طابور الفرز{stats?.pending ? ` (${stats.pending})` : ''}</span>
              </Link>
              <Link href="/dashboard/evidence/incoming"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-sky-200 bg-sky-50 text-sky-800 text-sm font-semibold hover:bg-sky-100 transition">
                <span className="inline-flex"><Inbox size={16} /></span>
                <span>إسنادٌ وارد</span>
              </Link>
              {/* طلب الدليل الموجَّه — «طلبات الأدلة» من أدوار المنسّق (10) */}
              <Link href="/dashboard/evidence/requests"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-sky-200 bg-white text-sky-700 text-sm font-semibold hover:bg-sky-50 transition">
                <span className="inline-flex"><FileQuestion size={16} /></span>
                <span>طلبات الأدلة</span>
              </Link>
              <Link href="/dashboard/evidence/teams"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-semibold hover:border-violet-300 transition">
                <span className="inline-flex"><Users size={16} /></span>
                <span>فرق التركيز</span>
              </Link>
            </>
          )}
          {/* الرفع الجماعي — أسلوب إدخالٍ يخدم القناة المباشرة لا قناةٌ خامسة (3.6.1) */}
          {(isSuperAdmin || can('manage_evidence')) && (
            <Link href="/dashboard/evidence/batch"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-violet-200 bg-white text-violet-700 text-sm font-semibold hover:bg-violet-50 transition">
              <span className="inline-flex"><FileStack size={16} /></span>
              <span>رفعٌ جماعي</span>
            </Link>
          )}
          {/* القناة المباشرة — دليل بلا مهمّة ولا خطة */}
          {(isSuperAdmin || can('manage_evidence')) && (
            <Link href="/dashboard/evidence/new"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:brightness-95 transition">
              <span className="inline-flex"><Plus size={16} /></span>
              <span>رفع دليل</span>
            </Link>
          )}
        </div>
      </div>

      {/* إحصاءات */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="الأدلة" value={stats.total} />
          <Stat label="تغطية المعايير" value={`${stats.coverage}%`} tone="text-violet-700" />
          <Stat label="معتمدة" value={stats.accepted} tone="text-emerald-700" />
          <Stat label="مشتركة" value={stats.shared} />
          <Stat label="الحجم" value={fmtSize(stats.totalSize)} />
        </div>
      )}

      {/* ── سلامة الأرشيف (11) — شريطٌ لا شاشة، فهو حالٌ لا وظيفة ── */}
      {fix && fix.total > 0 && (isSuperAdmin || can('triage_evidence')) && (
        <div className={`rounded-2xl border p-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs
          ${fix.mismatch || fix.missing ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
          <span className="inline-flex items-center gap-1.5 font-bold text-slate-700">
            <span className="inline-flex"><ShieldCheck size={14} /></span>
            <span>سلامة الأرشيف</span>
          </span>
          <span className="text-slate-500">مبصوم <strong className="text-slate-700">{fix.stamped}</strong> من {fix.total}</span>
          {fix.unstamped > 0 && <span className="text-amber-700">بلا بصمة {fix.unstamped}</span>}
          {fix.mismatch > 0 && <span className="text-red-700 font-bold">تبدّلت بصمته {fix.mismatch}</span>}
          {fix.missing  > 0 && <span className="text-red-700 font-bold">مفقود {fix.missing}</span>}
          {fix.lastCheck && <span className="text-slate-400">آخر فحص {fix.lastCheck}</span>}
          <button onClick={runSweep} disabled={sweeping}
            title="يُعيد حساب بصمة كل ملفّ ويقارنها بالمخزَّنة — والمخزَّنة لا تُستبدَل"
            className="ms-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-violet-300 disabled:opacity-50">
            <span className="inline-flex">{sweeping ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}</span>
            <span>{sweeping ? 'يُفحص…' : 'افحص الآن'}</span>
          </button>
        </div>
      )}

      {/* تبويبات */}
      <div className="flex gap-2 border-b border-slate-200">
        <TabBtn active={tab === 'list'} onClick={() => setTab('list')} icon={<ListChecks size={16} />} label="الأدلة" />
        <TabBtn active={tab === 'coverage'} onClick={() => setTab('coverage')} icon={<ShieldCheck size={16} />} label="التغطية" />
      </div>

      {tab === 'list' ? (
        <>
          {/* الفلاتر */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={15} className="absolute right-3 top-2.5 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم أو الرقم..."
                className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-slate-50 text-sm" />
            </div>
            <Select value={fType} onChange={setFType} placeholder="كل الأنواع" options={Object.keys(TYPE_LABEL).map(k => ({ v: k, l: TYPE_LABEL[k] }))} />
            {departments.length > 0 && <Select value={fDept} onChange={setFDept} placeholder="كل الأقسام" options={departments.map(d => ({ v: d, l: d }))} />}
            {mainOptions.length > 0 && <Select value={fMain} onChange={v => { setFMain(v); setFAspect(''); setFStd('') }} placeholder="المعيار الرئيس" options={mainOptions.map(s => ({ v: s.code, l: `${s.code} ${s.name}` }))} />}
            {aspectOptions.length > 0 && <Select value={fAspect} onChange={v => { setFAspect(v); setFStd('') }} placeholder="الجانب" options={aspectOptions.map(s => ({ v: s.code, l: `${s.code} ${s.name}` }))} />}
            {subOptions.length > 0 && <Select value={fStd} onChange={setFStd} placeholder="المعيار الفرعي" options={subOptions.map(s => ({ v: s.code, l: `${s.code} ${s.name}` }))} />}
            <Select value={fStatus} onChange={setFStatus} placeholder="كل الحالات" options={[{ v: 'pending', l: 'قيد المراجعة' }, { v: 'accepted', l: 'معتمد' }, { v: 'rejected', l: 'مرفوض' }]} />
            <Select value={fSource} onChange={setFSource} placeholder="كل المصادر" options={Object.keys(SOURCE_META).map(k => ({ v: k, l: SOURCE_META[k].ar }))} />
            {/* فترة الرفع: من / إلى */}
            <div className="flex items-center gap-1.5 text-xs text-slate-500 w-full sm:w-auto">
              <span className="text-slate-400">من</span>
              <input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} max={fTo || undefined}
                className="flex-1 min-w-0 sm:flex-none px-2.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-400" />
              <span className="text-slate-400">إلى</span>
              <input type="date" value={fTo} onChange={e => setFTo(e.target.value)} min={fFrom || undefined}
                className="flex-1 min-w-0 sm:flex-none px-2.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-400" />
            </div>
            {(stats?.unanchored ?? 0) > 0 && (
              <button onClick={() => setNoAnchorOnly(v => !v)}
                title="أدلة لم تُسنَد بعدُ إلى بند في الإطار — لا تدخل تغطية الاعتماد"
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border transition-colors ${noAnchorOnly ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-amber-700 border-amber-200 hover:border-amber-400'}`}>
                <span className="inline-flex"><AlertTriangle size={14} /></span>
                <span>بلا مرساة ({stats.unanchored})</span>
              </button>
            )}
            <button onClick={() => setSharedOnly(v => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border transition-colors ${sharedOnly ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}>
              <Link2 size={14} /> المشتركة فقط
            </button>
            {anyFilter && (
              <button onClick={clearFilters} title="إزالة جميع الفلاتر"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border border-slate-200 bg-white text-slate-500 hover:text-red-600 hover:border-red-200 transition-colors">
                <FilterX size={14} /> إزالة الفلاتر
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-slate-400">{shown.length} من {evidence.length} دليل</p>
            <button onClick={exportXlsx} disabled={exporting || shown.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <span className="inline-flex">{exporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}</span>
              <span>تصدير Excel</span>
            </button>
          </div>

          {/* القائمة */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
            {shown.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-400">لا أدلة مطابقة</p>
            ) : shown.map(e => {
              const sm = STATUS_META[e.status] || STATUS_META.pending
              const TI = TYPE_ICON[typeOf(e.file_type)]
              return (
                <div key={e.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3.5 hover:bg-slate-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* الهويّة الثابتة أوّلاً — «تُذكر في التقرير ومراسلات المقيّم» (3.4).
                          و`number` رقمُ الدليل **داخل مهمّته** لا هويّته، فيبقى ثانوياً. */}
                      {e.code && (
                        <span className="text-xs font-mono bg-[#8a1538] text-white px-2 py-0.5 rounded-full"
                          title="الهويّة الثابتة — تُمنح عند القبول ولا تتغيّر (3.4)">{e.code}</span>
                      )}
                      {e.number && (
                        <span className="text-[11px] font-mono bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full"
                          title="رقم الدليل داخل مهمّته">{e.number}</span>
                      )}
                      <a href={`/dashboard/evidence/${e.id}/print`} target="_blank" rel="noopener noreferrer"
                        className="text-sm font-semibold text-slate-800 truncate hover:text-violet-700 hover:underline">{e.name}</a>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${sm.cls}`}>{sm.ar}</span>
                      {e.standard
                        ? <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100"
                            title={e.hasAnchor ? `مرساة في الإطار: ${e.standard.name}` : `من سياق الخطة: ${e.standard.name}`}>
                            <span className="inline-flex"><ClipboardList size={11} /></span>
                            <span>معيار {e.standard.code}</span>
                          </span>
                        : <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-400" title="غير مرتبط بمعيار">بلا معيار</span>}
                      {!e.hasAnchor && (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100"
                          title="لم يُسنَد إلى بند في الإطار بمعرّفه الثابت — فلا يدخل تغطية الاعتماد">
                          <span className="inline-flex"><AlertTriangle size={11} /></span>
                          <span>بلا مرساة</span>
                        </span>
                      )}
                      {e.anchors.length > 1 && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100"
                          title={e.anchors.map(a => `${a.code} — ${a.name}`).join(' · ')}>
                          +{e.anchors.length - 1} مرساة
                        </span>
                      )}
                      {e.linkedCount > 0 && <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700"><Link2 size={11} /> {e.linkedCount}</span>}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mt-1 text-xs text-slate-400">
                      <span className="inline-flex items-center gap-1"><TI size={13} /> {TYPE_LABEL[typeOf(e.file_type)]}</span>
                      <span className="inline-flex items-center gap-1">· <Paperclip size={12} /> {e.filesCount}</span>
                      <span className={`px-1.5 py-0.5 rounded-md ${(SOURCE_META[e.source] || SOURCE_META.plan).cls}`}>
                        {(SOURCE_META[e.source] || SOURCE_META.plan).ar}
                      </span>
                      {e.academicYear && <span className="font-latin">· {e.academicYear}</span>}
                      {e.team && <span>· {e.team.name}</span>}
                      {e.plan?.department && <span>· {e.plan.department}</span>}
                      {e.task && <Link href={`/dashboard/tasks/${e.task.id}`} className="text-violet-500 hover:underline">· {e.task.name_ar}</Link>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 w-full sm:w-auto justify-end border-t border-slate-100 pt-2 sm:pt-0 sm:border-0">
                    {/* ── بابٌ واحد للحكم (3.2) ──
                        القبول والرفض في طابور الفرز وحده: هناك تُعرض المرساة
                        والعام والفريق المالك، ويُطلب سبب الرفض من قائمة مغلقة.
                        وهنا يبقى **إعادة الفتح** فقط — وهو ردٌّ إلى الطابور لا حكم. */}
                    {canReview && (!deptScopedReview || (!!e.plan?.department && e.plan.department === myDept)) && (
                      e.status === 'pending' ? (
                        <Link href={`/dashboard/evidence/triage?id=${e.id}`}
                          title="القبول والرفض من طابور الفرز — يفتح على هذا الدليل"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-3 py-1.5 rounded-lg hover:bg-violet-100">
                          <span className="inline-flex"><ShieldCheck size={13} /></span>
                          <span>افرز</span>
                        </Link>
                      ) : (
                        <button onClick={() => { setReopen(e); setReason(''); setTaskAction('') }}
                          title="نقضُ الحكم — يلزمه سبب مكتوب"
                          className="inline-flex items-center gap-1.5 text-xs text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg hover:border-violet-300 hover:text-violet-700 disabled:opacity-50 disabled:cursor-not-allowed">
                          <span className="inline-flex"><RefreshCw size={13} /></span>
                          <span>إعادة فتح</span>
                        </button>
                      )
                    )}
                    {/* سجلّ الدليل — «كيف صار إلى هنا» (9.3) */}
                    <button onClick={() => setLogOf({ id: e.id, name: e.name, code: e.code })}
                      title="سجلّ الدليل — من رفعه ومتى، ومن قبله، وما تغيّر بعد القبول"
                      className="inline-flex items-center justify-center w-8 h-8 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors">
                      <History size={15} />
                    </button>
                    <a href={`/dashboard/evidence/${e.id}/print`} target="_blank" title="طباعة"
                      className="inline-flex items-center justify-center w-8 h-8 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"><Printer size={15} /></a>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        /* ══ تبويب التغطية ══ */
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-4 flex-wrap">
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-700 mb-1">تغطية معايير الاعتماد</p>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden max-w-md">
                <div className="h-full rounded-full" style={{ width: `${stats?.coverage || 0}%`, background: 'var(--gradient-button, #8a1538)' }} />
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">
                النسبة تُحسب على المهام المرتبطة بمعيار فقط.
                {stats?.unmappedTasks > 0 && ` (+${stats.unmappedTasks} مهمة بلا معيار خارج الحساب — تشغيلية/مخصّصة)`}
              </p>
            </div>
            <div className="text-left">
              <p className="text-2xl font-bold text-violet-700">{stats?.coverage || 0}%</p>
              <p className="text-xs text-slate-400">{stats?.coveredTasks || 0} / {stats?.accreditationTasks || 0} مهمة مرتبطة بمعيار لها دليل معتمد</p>
            </div>
          </div>

          {standards.map((s, i) => {
            const pct = s.total > 0 ? Math.round((s.covered / s.total) * 100) : 0
            return (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 p-4 border-b border-slate-100 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {s.code && <span className="text-xs font-mono bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">{s.code}</span>}
                      <span className="text-sm font-semibold text-slate-800">{s.name}</span>
                      {s.department && <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{s.department}</span>}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{s.plan}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden w-28">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct === 100 ? '#10b981' : 'var(--gradient-button, #8a1538)' }} />
                    </div>
                    <span className={`text-sm font-bold ${pct === 100 ? 'text-emerald-600' : 'text-slate-700'}`}>{pct}%</span>
                  </div>
                </div>
                {s.without.length > 0 ? (
                  <div className="p-4">
                    <p className="text-xs font-semibold text-red-600 mb-2 flex items-center gap-1"><AlertTriangle size={13} /> مهام بلا دليل معتمد ({s.without.length}):</p>
                    <div className="flex flex-wrap gap-2">
                      {s.without.map(t => (
                        <Link key={t.id} href={`/dashboard/tasks/${t.id}`}
                          className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-100 hover:bg-red-100 transition-colors">
                          {t.name_ar}
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="p-4 text-xs text-emerald-600 flex items-center gap-1"><BadgeCheck size={14} /> كل المهام لها دليل معتمد</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ══ نافذة إعادة الفتح — نقضُ حكمٍ بسببٍ مكتوب (3.3) ══ */}
      {logOf && <EvidenceLog ev={logOf} onClose={() => setLogOf(null)} />}

      {reopen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
             onClick={() => !reopening && setReopen(null)}>
          <div onClick={ev => ev.stopPropagation()}
               className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3">
            <div className="flex items-start gap-2">
              <span className="inline-flex text-amber-500 mt-0.5"><AlertTriangle size={18} /></span>
              <div className="min-w-0">
                <p className="font-bold text-slate-800 text-sm">إعادة فتح الدليل</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  «{reopen.name}» — حُكم عليه بـ<strong>{STATUS_META[reopen.status]?.ar || reopen.status}</strong>
                  {reopen.code ? <> وهويّته <span className="font-mono">{reopen.code}</span> (وتبقى له)</> : null}.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">سبب إعادة الفتح — إلزاميّ ويُسجَّل</label>
              <textarea value={reason} onChange={e => setReason(e.target.value.slice(0, 300))} rows={2} autoFocus
                placeholder="مثال: قُبل بالخطأ · تبيّن أنه مكرّر · الملفّ غير مقروء"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-400" />
              <p className="text-[10px] text-slate-400 mt-0.5">يصل رافع الدليل ويُحفظ في سجلّ التدقيق.</p>
            </div>

            {/* تبعية الحكم: المهمّة المنجزة سندها هذا الدليل */}
            {needsTask && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                <p className="text-xs text-amber-900 leading-relaxed">
                  <strong>هذه المهمّة منجزة وسندها هذا الدليل</strong> — ونقضُ القبول يُفرغ سندها.
                </p>
                <div className="flex flex-col gap-1.5">
                  {([
                    { v: 'return', ar: 'أعد المهمّة إلى التقييم معه' },
                    { v: 'keep',   ar: 'أبقِ المهمّة منجزة واقبل الأثر' },
                  ] as const).map(o => (
                    <label key={o.v} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input type="radio" name="ta" checked={taskAction === o.v}
                        onChange={() => setTaskAction(o.v)} className="accent-amber-600" />
                      <span>{o.ar}</span>
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-amber-700">والقرار يُسجَّل في سجلّ التدقيق.</p>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={doReopen}
                disabled={reopening || !reason.trim() || (needsTask && !taskAction)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#8a1538] text-white text-sm font-bold disabled:opacity-40">
                <span className="inline-flex">{reopening ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}</span>
                <span>إعادة الفتح</span>
              </button>
              <button onClick={() => { setReopen(null); setNeedsTask(false) }} disabled={reopening}
                className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-sm">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${tone || 'text-slate-800'}`}>{value}</p>
    </div>
  )
}
function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
        active ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
      {icon} {label}
    </button>
  )
}
function Select({ value, onChange, placeholder, options }: { value: string; onChange: (v: string) => void; placeholder: string; options: { v: string; l: string }[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-400 max-w-[200px]">
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  )
}

/* ════════════════════════════════════════════════════════════
   سجلّ الدليل (الوثيقة 9.3)

   «والفهرس يقول ماذا عندك، ومصفوفة التغطية تقول أين يقع، **وهذا يقول
    كيف صار إلى هنا**… فالمقيّم لا يسأل «هل عندكم دليل؟» بل «أهذا
    معاصرٌ للعمل أم صُنع قبل الزيارة؟».»

   فالعرض يُبرز ما يجيب ذلك السؤال: تاريخُ الواقعة وفاعلها، **والرافع
   غير القابل فيُرى منع التقييم الذاتي ولا يُدَّعى**. ووسمُ «داخليّ»
   يقول صريحاً ما لا يخرج للمقيّم، فلا يُفاجأ أحدٌ بما حُجب.
   ════════════════════════════════════════════════════════════ */

const LOG_ICONS: Record<string, React.ElementType> = {
  Upload, CheckCircle2, XCircle, RotateCcw, PencilLine, Target, BadgeCheck, Undo2, Fingerprint,
}
const TONE_CLS: Record<string, string> = {
  slate:   'bg-slate-50 text-slate-600 border-slate-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rose:    'bg-rose-50 text-rose-700 border-rose-200',
  amber:   'bg-amber-50 text-amber-800 border-amber-200',
  sky:     'bg-sky-50 text-sky-700 border-sky-200',
  violet:  'bg-violet-50 text-violet-700 border-violet-200',
}

function EvidenceLog({ ev, onClose }: { ev: { id: string; name: string; code: string | null }; onClose: () => void }) {
  const [entries, setEntries] = useState<any[]>([])
  const [hidden,  setHidden]  = useState(0)
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState('')

  useEffect(() => {
    ;(async () => {
      const r = await fetch(`/api/evidence/${ev.id}/log`)
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setErr(j.error || 'تعذّر قراءة السجلّ')
      else { setEntries(j.entries || []); setHidden(j.hidden || 0) }
      setLoading(false)
    })()
  }, [ev.id])

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}>
      <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-xl my-8" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-100 flex items-start gap-2">
          <span className="inline-flex text-sky-600 mt-0.5"><History size={18} /></span>
          <div className="min-w-0">
            <h2 className="font-bold text-slate-800 text-sm truncate">سجلّ الدليل — {ev.name}</h2>
            <p className="text-[11px] text-slate-400">
              {ev.code ? <span className="font-latin">{ev.code} · </span> : null}
              سجلٌّ لا يُحرَّر: كيف صار هذا الدليل إلى هنا
            </p>
          </div>
          <button onClick={onClose} className="ms-auto text-slate-400 hover:text-slate-700 flex-shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="p-4">
          {loading ? (
            <p className="text-center text-slate-400 py-6"><Loader2 className="animate-spin inline" /></p>
          ) : err ? (
            <p className="text-sm text-rose-600">{err}</p>
          ) : !entries.length ? (
            <p className="text-sm text-slate-400 text-center py-6">لا وقائع — السجلّ يبدأ من تشغيل الترحيل 091</p>
          ) : (
            <ol className="space-y-2.5">
              {entries.map(en => {
                const spec = EVIDENCE_EVENTS[en.event as EvidenceEvent]
                const Icon = LOG_ICONS[spec?.icon || 'Upload'] || Upload
                return (
                  <li key={en.id} className={`rounded-xl border px-3 py-2.5 ${TONE_CLS[spec?.tone || 'slate']}`}>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span className="inline-flex"><Icon size={14} /></span>
                      <span className="font-bold">{spec?.label || en.event}</span>
                      {en.actor
                        ? <span>· {en.actor}</span>
                        : <span className="opacity-60">· مجهول الفاعل</span>}
                      <span className="font-latin opacity-70 ms-auto">
                        {new Date(en.at).toLocaleString('ar-QA', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>

                    {/* ما يخصّ الواقعة وحدها */}
                    <div className="mt-1 text-[11px] opacity-90 space-y-0.5">
                      {en.node && <p><span className="font-latin">{en.node.code}</span> — {en.node.name_ar}</p>}
                      {en.reasonCode && <p>السبب المصنَّف: {en.reasonCode}</p>}
                      {en.reasonText && <p>{en.reasonText}</p>}
                      {en.event === 'uploaded' && en.detail?.source && (
                        <p>القناة: {(SOURCE_META[en.detail.source] || SOURCE_META.plan).ar}</p>
                      )}
                      {en.event === 'accepted' && en.detail?.code && (
                        <p>الهويّة الثابتة <span className="font-latin">{en.detail.code}</span></p>
                      )}
                      {en.event === 'edited_after_accept' && Array.isArray(en.detail?.fields) && (
                        <p>تغيّر: {en.detail.fields.map((f: string) => FIELD_LABELS[f] || f).join(' · ')}</p>
                      )}
                      {en.event === 'fixity_alert' && (
                        <p>{en.detail?.file} — {en.detail?.state === 'missing' ? 'الملفّ مفقود' : 'البصمة تبدّلت'}</p>
                      )}
                      {en.backfilled && (
                        <p className="opacity-60">واقعةٌ بُذرت من بيانات الدليل عند تشغيل السجلّ</p>
                      )}
                      {spec && !spec.external && (
                        <p className="inline-flex items-center gap-1 opacity-70">
                          <span className="inline-flex"><EyeOff size={10} /></span>
                          <span>داخليّ — لا يخرج في حزمة المقيّم (9.3)</span>
                        </p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}

          {hidden > 0 && (
            <p className="mt-3 text-[11px] text-slate-400 border-t border-slate-100 pt-2.5">
              منها <strong>{hidden}</strong> واقعةٌ لا تخرج للمقيّم الخارجي — «يخرج ما يخصّ الدليل
              المقبول، ولا يخرج ما يخصّ المداولة». والسبب أن المداولة شرطُ جودةِ الحكم لا موضوعُه.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

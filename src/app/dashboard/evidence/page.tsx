'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { FolderOpen, Loader2, Paperclip, BadgeCheck, AlertTriangle, Search, ListChecks, ShieldCheck,
  Printer, Link2, FileDown, FilterX, Image, FileText, FileSpreadsheet, Video, File, ClipboardList } from 'lucide-react'
import NoAccess from '@/components/NoAccess'
import { usePermissions } from '@/lib/PermissionsContext'
import { toast } from '@/components/Toast'

type Ev = {
  id: string; name: string; number: string; file_type: string | null; status: string
  created_at: string; filesCount: number; size: number; linkedCount: number
  task: { id: string; name_ar: string; status: string } | null
  plan: { name_ar: string; department: string | null; category: string | null } | null
  standard: { code: string; name: string } | null
  standardMain: { code: string; name: string } | null
  standardAspect: { code: string; name: string } | null
}
type Std = { code: string | null; name: string; plan: string; department: string | null; total: number; covered: number; without: { id: string; name_ar: string }[] }

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
    if (sharedOnly && e.linkedCount === 0) return false
    const day = (e.created_at || '').slice(0, 10)
    if (fFrom && day < fFrom) return false
    if (fTo && day > fTo) return false
    return true
  }), [evidence, search, fType, fDept, fMain, fAspect, fStd, fStatus, sharedOnly, fFrom, fTo])

  const anyFilter = !!(search || fType || fDept || fMain || fAspect || fStd || fStatus || sharedOnly || fFrom || fTo)
  const clearFilters = () => {
    setSearch(''); setFType(''); setFDept(''); setFMain(''); setFAspect('')
    setFStd(''); setFStatus(''); setSharedOnly(false); setFFrom(''); setFTo('')
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

  const changeStatus = async (id: string, status: string) => {
    const res = await fetch(`/api/evidence/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    })
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast(j.error || 'تعذّر تغيير الحالة', 'error'); return }
    setEvidence(prev => prev.map(e => e.id === id ? { ...e, status } : e))
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
            {/* فترة الرفع: من / إلى */}
            <div className="flex items-center gap-1.5 text-xs text-slate-500 w-full sm:w-auto">
              <span className="text-slate-400">من</span>
              <input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} max={fTo || undefined}
                className="flex-1 min-w-0 sm:flex-none px-2.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-400" />
              <span className="text-slate-400">إلى</span>
              <input type="date" value={fTo} onChange={e => setFTo(e.target.value)} min={fFrom || undefined}
                className="flex-1 min-w-0 sm:flex-none px-2.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-400" />
            </div>
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
                      {e.number && <span className="text-xs font-mono bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full" title="رقم الدليل">{e.number}</span>}
                      <a href={`/dashboard/evidence/${e.id}/print`} target="_blank" rel="noopener noreferrer"
                        className="text-sm font-semibold text-slate-800 truncate hover:text-violet-700 hover:underline">{e.name}</a>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${sm.cls}`}>{sm.ar}</span>
                      {e.standard
                        ? <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100" title="المعيار"><ClipboardList size={11} /> معيار {e.standard.code}</span>
                        : <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-400" title="غير مرتبط بمعيار">بلا معيار</span>}
                      {e.linkedCount > 0 && <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700"><Link2 size={11} /> {e.linkedCount}</span>}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mt-1 text-xs text-slate-400">
                      <span className="inline-flex items-center gap-1"><TI size={13} /> {TYPE_LABEL[typeOf(e.file_type)]}</span>
                      <span className="inline-flex items-center gap-1">· <Paperclip size={12} /> {e.filesCount}</span>
                      {e.plan?.department && <span>· {e.plan.department}</span>}
                      {e.task && <Link href={`/dashboard/tasks/${e.task.id}`} className="text-violet-500 hover:underline">· {e.task.name_ar}</Link>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 w-full sm:w-auto justify-end border-t border-slate-100 pt-2 sm:pt-0 sm:border-0">
                    {canReview && (!deptScopedReview || (!!e.plan?.department && e.plan.department === myDept)) && (
                      <select value={e.status} onChange={ev => changeStatus(e.id, ev.target.value)}
                        disabled={e.task?.status === 'completed'}
                        title={e.task?.status === 'completed' ? 'المهمة منجزة — أعد فتحها لتغيير الحالة' : ''}
                        className="text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-50 disabled:cursor-not-allowed">
                        <option value="pending">قيد المراجعة</option>
                        <option value="accepted">معتمد</option>
                        <option value="rejected">مرفوض</option>
                      </select>
                    )}
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

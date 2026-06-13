'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { FolderOpen, Loader2, Paperclip, BadgeCheck, AlertTriangle, Search, ListChecks, ShieldCheck } from 'lucide-react'
import NoAccess from '@/components/NoAccess'
import { usePermissions } from '@/lib/PermissionsContext'
import { toast } from '@/components/Toast'

type Ev = {
  id: string; name: string; number: string; file_type: string | null; status: string
  created_at: string; filesCount: number; size: number; linkedCount: number
  task: { id: string; name_ar: string; status: string } | null
  plan: { name_ar: string; department: string | null; category: string | null } | null
  standard: { code: string; name: string } | null
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
const TYPE_LABEL: Record<string, string> = { video: '🎬 فيديو', image: '🖼️ صورة', pdf: '📄 PDF', word: '📝 Word', excel: '📊 Excel', other: '📎 أخرى' }
const fmtSize = (b: number) => b === 0 ? '—' : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`

export default function EvidenceLockerPage() {
  const { can, isSuperAdmin } = usePermissions()
  const canReview = isSuperAdmin || can('manage_tasks') || can('rate_tasks')

  const [evidence, setEvidence] = useState<Ev[]>([])
  const [standards, setStandards] = useState<Std[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [tab, setTab] = useState<'list' | 'coverage'>('list')

  /* فلاتر */
  const [search, setSearch] = useState('')
  const [fType, setFType] = useState('')
  const [fDept, setFDept] = useState('')
  const [fStd, setFStd] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [sharedOnly, setSharedOnly] = useState(false)

  const load = async () => {
    const res = await fetch('/api/evidence-locker')
    if (res.status === 403) { setDenied(true); setLoading(false); return }
    const j = await res.json().catch(() => ({}))
    setEvidence(j.evidence || []); setStandards(j.standards || []); setStats(j.stats || null)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const departments = useMemo(() => [...new Set(evidence.map(e => e.plan?.department).filter(Boolean))].sort() as string[], [evidence])
  const stdOptions  = useMemo(() => [...new Map(evidence.filter(e => e.standard).map(e => [e.standard!.code, e.standard!])).values()], [evidence])

  const shown = useMemo(() => evidence.filter(e => {
    if (search && !(`${e.name} ${e.number}`.toLowerCase().includes(search.toLowerCase()))) return false
    if (fType && typeOf(e.file_type) !== fType) return false
    if (fDept && e.plan?.department !== fDept) return false
    if (fStd && e.standard?.code !== fStd) return false
    if (fStatus && e.status !== fStatus) return false
    if (sharedOnly && e.linkedCount === 0) return false
    return true
  }), [evidence, search, fType, fDept, fStd, fStatus, sharedOnly])

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
          <Stat label="التغطية" value={`${stats.coverage}%`} tone="text-violet-700" />
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
            {stdOptions.length > 0 && <Select value={fStd} onChange={setFStd} placeholder="كل المعايير" options={stdOptions.map(s => ({ v: s.code, l: `${s.code} ${s.name}` }))} />}
            <Select value={fStatus} onChange={setFStatus} placeholder="كل الحالات" options={[{ v: 'pending', l: 'قيد المراجعة' }, { v: 'accepted', l: 'معتمد' }, { v: 'rejected', l: 'مرفوض' }]} />
            <button onClick={() => setSharedOnly(v => !v)}
              className={`px-3 py-2 rounded-xl text-sm border transition-colors ${sharedOnly ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}>
              🔗 المشتركة فقط
            </button>
          </div>

          <p className="text-xs text-slate-400">{shown.length} من {evidence.length} دليل</p>

          {/* القائمة */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
            {shown.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-400">لا أدلة مطابقة</p>
            ) : shown.map(e => {
              const sm = STATUS_META[e.status] || STATUS_META.uploaded
              return (
                <div key={e.id} className="flex items-center gap-3 p-3.5 hover:bg-slate-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {e.number && <span className="text-xs font-mono bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">{e.number}</span>}
                      <span className="text-sm font-semibold text-slate-800 truncate">{e.name}</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${sm.cls}`}>{sm.ar}</span>
                      {e.linkedCount > 0 && <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">🔗 {e.linkedCount}</span>}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mt-1 text-xs text-slate-400">
                      <span>{TYPE_LABEL[typeOf(e.file_type)]}</span>
                      <span>· 📎 {e.filesCount}</span>
                      {e.standard && <span>· 📋 {e.standard.code}</span>}
                      {e.plan?.department && <span>· {e.plan.department}</span>}
                      {e.task && <Link href={`/dashboard/tasks/${e.task.id}`} className="text-violet-500 hover:underline">· {e.task.name_ar}</Link>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {canReview && (
                      <select value={e.status} onChange={ev => changeStatus(e.id, ev.target.value)}
                        className="text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-400">
                        <option value="pending">قيد المراجعة</option>
                        <option value="accepted">معتمد</option>
                        <option value="rejected">مرفوض</option>
                      </select>
                    )}
                    <a href={`/dashboard/evidence/${e.id}/print`} target="_blank"
                      className="px-2.5 py-1.5 text-xs bg-violet-50 hover:bg-violet-100 text-violet-600 rounded-lg transition-colors">🖨️</a>
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
              <p className="text-sm font-semibold text-slate-700 mb-1">التغطية الإجمالية</p>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden max-w-md">
                <div className="h-full rounded-full" style={{ width: `${stats?.coverage || 0}%`, background: 'var(--gradient-button, #8a1538)' }} />
              </div>
            </div>
            <div className="text-left">
              <p className="text-2xl font-bold text-violet-700">{stats?.coverage || 0}%</p>
              <p className="text-xs text-slate-400">{stats?.coveredTasks || 0} / {stats?.totalTasks || 0} مهمة لها دليل</p>
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
                    <p className="text-xs font-semibold text-red-600 mb-2 flex items-center gap-1"><AlertTriangle size={13} /> مهام بلا دليل ({s.without.length}):</p>
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
                  <p className="p-4 text-xs text-emerald-600 flex items-center gap-1"><BadgeCheck size={14} /> كل المهام مغطّاة بأدلة</p>
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

'use client'

/* ════════════════════════════════════════════════════════════
   مخزن الاعتماد — قائمة للقراءة فقط.
   المرجع: docs/QNSA_ACCREDITATION_ARCHITECTURE.html §3

   موضعها: خزانة الأدلة مبنيّة على الخطط (تبدأ من plans ثم العقد ثم
   المهام)، ودليل القناة المباشرة بلا مهمّة — فلا تراه. وهذه تعرضه
   ريثما تُبنى شاشة الفرز (م1‑4) فتحلّ محلّها بالقرار لا بالعرض وحده.
   ════════════════════════════════════════════════════════════ */

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  Archive, Plus, Loader2, Paperclip, TriangleAlert, Users, Hash, Calendar,
} from 'lucide-react'
import NoAccess from '@/components/NoAccess'
import { currentAcademicYear } from '@/lib/dates'

type Anchor = { code: string; name: string; kind: string; confirmStatus: string }
type Row = {
  id: string; name: string; description: string | null
  status: string; source: string
  academicYear: string | null; documentDate: string | null
  type: string | null; reason: string | null; code: string | null
  team: { name: string; standard: string } | null
  uploader: string; createdAt: string
  files: number; size: number; hash: string | null
  anchors: Anchor[]
}

const STATUS: Record<string, { label: string; cls: string }> = {
  pending:  { label: 'قيد الفرز', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  accepted: { label: 'مقبول',     cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'مرفوض',     cls: 'bg-rose-50 text-rose-700 border-rose-200' },
}

const SOURCE: Record<string, string> = {
  direct:    'رفع مباشر',
  request:   'طلب موجَّه',
  recurring: 'مهمّة دورية',
  plan:      'من خطة',
}

const fmtSize = (b: number) =>
  b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} م.ب` : `${Math.round(b / 1024)} ك.ب`

export default function EvidenceStorePage() {
  const [rows,    setRows]    = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [denied,  setDenied]  = useState(false)
  const [filter,  setFilter]  = useState<'all' | 'pending' | 'accepted' | 'rejected'>('all')

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/evidence/store')
      if (res.status === 403) { setDenied(true); setLoading(false); return }
      if (res.ok) setRows((await res.json()).evidence || [])
      setLoading(false)
    })()
  }, [])

  const shown = useMemo(
    () => filter === 'all' ? rows : rows.filter(r => r.status === filter),
    [rows, filter],
  )
  const counts = useMemo(() => ({
    all:      rows.length,
    pending:  rows.filter(r => r.status === 'pending').length,
    accepted: rows.filter(r => r.status === 'accepted').length,
    rejected: rows.filter(r => r.status === 'rejected').length,
  }), [rows])

  if (denied) return <NoAccess />

  const cur = currentAcademicYear()

  return (
    <div className="max-w-6xl mx-auto space-y-5">

      {/* الترويسة */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white flex-shrink-0"
          style={{ background: 'var(--gradient-button, #8a1538)' }}>
          <Archive size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">مخزن الاعتماد</h1>
          <p className="text-sm text-slate-500">الأدلة غير المرتبطة بمهمّة — مصنّفةً على الإطار</p>
        </div>
        <Link href="/dashboard/evidence/new"
          className="ms-auto inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:brightness-95 transition">
          <span className="inline-flex"><Plus size={16} /></span>
          <span>رفع دليل</span>
        </Link>
      </div>

      {/* المرشّحات */}
      <div className="flex gap-2 flex-wrap">
        {([
          ['all', 'الكل'], ['pending', 'قيد الفرز'], ['accepted', 'مقبولة'], ['rejected', 'مرفوضة'],
        ] as const).map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${
              filter === k ? 'bg-violet-600 text-white border-violet-600'
                           : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
            {label} <span className="font-latin opacity-70">({counts[k]})</span>
          </button>
        ))}
      </div>

      {loading && (
        <p className="text-sm text-slate-500 flex items-center gap-2 p-8 justify-center">
          <span className="inline-flex"><Loader2 size={16} className="animate-spin" /></span>
          <span>جارٍ التحميل…</span>
        </p>
      )}

      {!loading && shown.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-sm">
          <span className="inline-flex text-slate-300"><Archive size={40} /></span>
          <p className="mt-3 text-sm text-slate-500">
            {rows.length === 0 ? 'لا أدلة في المخزن بعد.' : 'لا أدلة بهذا المرشّح.'}
          </p>
          {rows.length === 0 && (
            <Link href="/dashboard/evidence/new"
              className="inline-block mt-4 text-sm text-violet-600 font-semibold hover:underline">
              ارفع أول دليل
            </Link>
          )}
        </div>
      )}

      {/* القائمة */}
      <div className="space-y-2.5">
        {shown.map(r => {
          const st  = STATUS[r.status] || { label: r.status, cls: 'bg-slate-50 text-slate-600 border-slate-200' }
          const old = !!r.academicYear && r.academicYear < cur
          return (
            <article key={r.id}
              className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition">

              <div className="flex items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-[220px]">
                  <h2 className="text-sm font-bold text-slate-800">{r.name}</h2>
                  {r.description && (
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{r.description}</p>
                  )}
                </div>
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${st.cls}`}>
                  {st.label}
                </span>
              </div>

              {/* المراسي */}
              {r.anchors.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {r.anchors.map((a, i) => (
                    <span key={i}
                      className="text-[11px] px-2 py-1 rounded-lg bg-violet-50 text-violet-700 border border-violet-100">
                      <span className="font-latin">{a.code}</span> — {a.name}
                      {a.kind === 'implicit' && <span className="opacity-60"> · ضمنيّ</span>}
                      {a.confirmStatus === 'pending' && <span className="opacity-60"> · بانتظار التأكيد</span>}
                    </span>
                  ))}
                </div>
              )}

              {/* البيانات */}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-flex"><Calendar size={12} /></span>
                  <span className="font-latin">{r.academicYear || '—'}</span>
                  {old && (
                    <span className="inline-flex items-center gap-0.5 text-amber-600 font-semibold">
                      <span className="inline-flex"><TriangleAlert size={11} /></span>
                      <span>بأثر رجعيّ</span>
                    </span>
                  )}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-flex"><Paperclip size={12} /></span>
                  <span>{r.files} ملفّ · {fmtSize(r.size)}</span>
                </span>
                {r.team && (
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-flex"><Users size={12} /></span>
                    <span>{r.team.name}</span>
                  </span>
                )}
                {r.hash && (
                  <span className="inline-flex items-center gap-1" title="بصمة أول ملفّ (SHA-256)">
                    <span className="inline-flex"><Hash size={12} /></span>
                    <span className="font-latin">{r.hash.slice(0, 12)}</span>
                  </span>
                )}
                {r.type   && <span className="px-2 py-0.5 rounded-md bg-slate-100">{r.type}</span>}
                {r.reason && <span className="px-2 py-0.5 rounded-md bg-slate-100">{r.reason}</span>}
                <span className="opacity-70">{SOURCE[r.source] || r.source}</span>
                {r.uploader && <span className="opacity-70">رفعه {r.uploader}</span>}
              </div>
            </article>
          )
        })}
      </div>

      <p className="text-[11px] text-slate-400 text-center pt-2">
        قائمة للقراءة. الفرز والقبول وإكمال المؤشرات في شاشة الفرز — المهمّة التالية.
      </p>
    </div>
  )
}

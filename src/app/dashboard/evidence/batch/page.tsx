'use client'

/* ════════════════════════════════════════════════════════════
   الرفع الجماعي — الابتلاع وورقة التهيئة (الوثيقة 3.6.1)

   «الرفع لا يسأل شيئاً — والتهيئة تلي»: تُرفع الملفّات أوّلاً وتُحسب
   بصماتها ويُعلَّم المكرّر، ثمّ تُملأ ورقةٌ صفُّها ملفّ وأعمدتها
   العام وتاريخ الوثيقة والنوع والمعيار الفرعي — **بالتحديد الجماعي
   وبالصفّ الواحد معاً**.

   والحقلان المانعان: **المعيار الفرعي والعام**. وما عداهما يُصحَّح
   متى شئت — «فالتهيئة تطالب باثنين وتتسامح في الباقي».
   ════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Loader2, Upload, Inbox, Send, Trash2, Check, AlertTriangle, Merge, X, FileStack, HardDrive } from 'lucide-react'
import NoAccess from '@/components/NoAccess'
import { toast } from '@/components/Toast'
import { usePermissions } from '@/lib/PermissionsContext'
import { fetchFrameworkAllAtLevel, type FrameworkNode } from '@/lib/framework'
import { academicYearOptions } from '@/lib/dates'

type Item = {
  id: string; order_num: number; file_name: string; file_url: string
  file_type: string | null; file_size: number | null; content_hash: string
  academic_year: string | null; document_date: string | null; evidence_type: string | null
  sub_node_id: string | null; name_override: string | null; merge_group: number | null
  dup_of: string | null; dropped: boolean
  sub: { code: string; name_ar: string } | null
  transitional: boolean; blockers: string[]
}
type Batch = { id: string; status: string; year_default: string | null; reason_code: string | null; created_at: string }

const YEARS = academicYearOptions()

export default function BatchPage() {
  const { can, isSuperAdmin, loading: permsLoading } = usePermissions()
  const [batches, setBatches] = useState<any[]>([])
  const [batch,   setBatch]   = useState<Batch | null>(null)
  const [items,   setItems]   = useState<Item[]>([])
  const [sel,     setSel]     = useState<string[]>([])
  const [subs,    setSubs]    = useState<FrameworkNode[]>([])
  const [loading, setLoading] = useState(true)
  const [busy,    setBusy]    = useState(false)
  /* ضيقُ المساحة — حكمٌ لا رقم (16): الباقة حدُّ النظام كلّه لا حدُّ مدرسة */
  const [tight,   setTight]   = useState<{ tight: boolean; critical: boolean } | null>(null)
  const [upPct,   setUpPct]   = useState<number | null>(null)

  const allowed = isSuperAdmin || can('manage_evidence')

  const loadList = useCallback(async () => {
    const r = await fetch('/api/evidence/batches')
    if (r.ok) setBatches((await r.json()).batches || [])
    setLoading(false)
  }, [])

  const openBatch = useCallback(async (id: string) => {
    const r = await fetch(`/api/evidence/batches?id=${id}`)
    if (!r.ok) { toast('تعذّر فتح الدفعة', 'error'); return }
    const j = await r.json()
    setBatch(j.batch); setItems(j.items || []); setSel([])
    if (!subs.length) setSubs(await fetchFrameworkAllAtLevel(3))
  }, [subs.length])

  useEffect(() => { if (allowed) loadList() }, [allowed, loadList])

  /* ── الإنذار **قبل أن يَجمع** لا بعد أن يَضغط ──
     حاجزُ الباقة في الخادم يردّ الدفعة كلّها، ولو كان هو وحده لانتقلت
     المفاجأة من مشرف النظام إلى الموظّف: يجمع مئتي ملفّ ثم يُرَدّ.
     فهذا يُنذره أوّلاً، ويدلّه على من يملك العلاج — لا على رقمٍ لا
     يعنيه ولا يستطيع تغييره. */
  useEffect(() => {
    if (!allowed) return
    ;(async () => {
      try {
        const r = await fetch('/api/storage/headroom')
        if (r.ok) setTight(await r.json())
      } catch { /* الإنذار تحسينٌ لا شرط — والحاجز في الخادم على أيّ حال */ }
    })()
  }, [allowed])

  const ingest = async (files: FileList | null, intoId?: string) => {
    if (!files || !files.length) return
    setBusy(true); setUpPct(0)
    const fd = new FormData()
    for (const f of Array.from(files)) fd.append('files', f)
    if (intoId) fd.append('batchId', intoId)
    const res = await fetch('/api/evidence/batches', { method: 'POST', body: fd })
    const j = await res.json().catch(() => ({}))
    setBusy(false); setUpPct(null)
    if (!res.ok) { toast(j.error || 'تعذّر الابتلاع', 'error'); return }
    toast(j.duplicates
      ? `ابتُلع ${j.ingested} ملفّاً · ${j.duplicates} مكرّرٌ أُسقط`
      : `ابتُلع ${j.ingested} ملفّاً`, 'success')
    await loadList(); await openBatch(j.batchId)
  }

  const patch = async (ids: string[], p: any) => {
    if (!batch || !ids.length) return
    setBusy(true)
    const res = await fetch('/api/evidence/batches', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId: batch.id, ids, patch: p }),
    })
    setBusy(false)
    if (!res.ok) { toast('تعذّر الحفظ', 'error'); return }
    await openBatch(batch.id)
  }

  const mergeSelected = async () => {
    if (sel.length < 2) return
    /* مجموعةٌ جديدة برقمٍ لم يُستعمل — والدمج قبل القبول حتماً (3.4) */
    const used = items.map(i => i.merge_group ?? 0)
    await patch(sel, { merge_group: Math.max(0, ...used) + 1 })
    toast(`دُمج ${sel.length} ملفّات في دليلٍ واحد`, 'success')
  }

  const send = async () => {
    if (!batch) return
    setBusy(true)
    const res = await fetch('/api/evidence/batches/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId: batch.id }),
    })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { toast(j.error || 'تعذّر الإرسال', 'error'); return }
    toast(`أُرسلت — ${j.created} دليلاً دخل طوابير الفرق`, 'success')
    setBatch(null); setItems([]); await loadList()
  }

  const live     = useMemo(() => items.filter(i => !i.dropped), [items])
  const blocked  = useMemo(() => live.filter(i => i.blockers.length), [live])
  const groups   = useMemo(() => new Set(live.map(i => i.merge_group).filter(Boolean)).size, [live])
  const evidences = live.length - live.filter(i => i.merge_group).length + groups

  if (permsLoading) return <div className="p-10 text-center text-slate-400"><Loader2 className="animate-spin inline" /></div>
  if (!allowed) return <NoAccess message="الرفع الجماعي يتطلّب صلاحية «رفع الأدلة»." />

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <span className="inline-flex text-violet-600"><FileStack size={20} /></span>
            <span>الرفع الجماعي</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            مجلّداتُ العمل الجارية (لجنة · قسم · فصل دراسيّ). <strong>الرفع لا يسأل شيئاً</strong> —
            تُرفع الملفّات وتُحسب بصماتها ويُعلَّم المكرّر، ثمّ تُملأ ورقة التهيئة.
          </p>
        </div>
        <Link href="/dashboard/evidence"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border border-slate-200 bg-white text-slate-600 hover:border-violet-300">
          <span className="inline-flex"><Inbox size={14} /></span><span>الخزانة</span>
        </Link>
      </div>

      {/* شريطُ ضيق المساحة — بلا نسبةٍ ولا بايت (16) */}
      {tight?.tight && (
        <div className={`rounded-2xl border p-3.5 flex items-start gap-2 text-xs ${
          tight.critical ? 'bg-red-50 border-red-200 text-red-900'
                         : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
          <span className="inline-flex mt-0.5"><HardDrive size={15} /></span>
          <span>
            <strong>
              {tight.critical
                ? 'مساحة النظام على وشك الامتلاء'
                : 'مساحة النظام تضيق'}
            </strong>
            <span className="block mt-0.5 leading-relaxed">
              أبلِغ مشرف النظام قبل رفع دفعةٍ كبيرة. والدفعة التي لا تسعها المساحة
              <strong> تُرَدّ كلّها</strong> ولا يُرفع منها شيء — فلا تبقى ملفّات في المخزن وأخرى خارجه.
            </span>
          </span>
        </div>
      )}

      {!batch && (
        <>
          <label className="block">
            <input type="file" multiple className="hidden" disabled={busy}
              onChange={e => ingest(e.target.files)} />
            <span className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-2xl py-10 cursor-pointer transition-colors
              ${busy ? 'border-slate-200 text-slate-400' : 'border-violet-300 text-violet-700 hover:bg-violet-50'}`}>
              <span className="inline-flex">{busy ? <Loader2 size={26} className="animate-spin" /> : <Upload size={26} />}</span>
              <span className="text-sm font-semibold">{busy ? 'يُبتلَع…' : 'اختر الملفّات — حتى 200 ملفّ'}</span>
              <span className="text-[11px] text-slate-400">صور · PDF · Word · Excel · PowerPoint</span>
            </span>
          </label>

          {loading ? (
            <p className="text-center text-slate-400 text-sm py-6">…</p>
          ) : batches.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
              {batches.map(b => (
                <button key={b.id} onClick={() => openBatch(b.id)}
                  className="w-full text-right p-3.5 hover:bg-slate-50 flex items-center gap-3">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                    b.status === 'staging' ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : b.status === 'sent'  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-500'}`}>
                    {b.status === 'staging' ? 'قيد التهيئة' : b.status === 'sent' ? 'أُرسلت' : 'مُهملة'}
                  </span>
                  <span className="text-sm text-slate-700">{b.items} ملفّاً</span>
                  <span className="text-[11px] text-slate-400 ms-auto">
                    {new Date(b.created_at).toLocaleDateString('ar-QA')}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {batch && (
        <>
          {/* شريط الحال */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <button onClick={() => { setBatch(null); loadList() }} className="text-slate-400 hover:text-slate-700">
              <X size={15} />
            </button>
            <span className="font-bold text-slate-700">{live.length} ملفّاً · {evidences} دليلاً</span>
            {blocked.length > 0
              ? <span className="text-amber-700 font-semibold">{blocked.length} ناقصٌ حقلاً مانعاً</span>
              : <span className="text-emerald-700 font-semibold">الحقول المانعة مكتملة</span>}
            {items.some(i => i.dropped) && (
              <span className="text-slate-400">{items.filter(i => i.dropped).length} مكرّرٌ أُسقط</span>
            )}
            {batch.status === 'staging' && (
              <>
                <label className="ms-auto inline-flex items-center gap-1.5 text-violet-700 cursor-pointer">
                  <input type="file" multiple className="hidden" onChange={e => ingest(e.target.files, batch.id)} />
                  <span className="inline-flex"><Upload size={13} /></span><span>أضِف ملفّات</span>
                </label>
                <button onClick={send} disabled={busy || blocked.length > 0 || !live.length}
                  title={blocked.length ? 'أكمِل الحقول المانعة أوّلاً' : 'تدخل الدفعة طوابير الفرق'}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#8a1538] text-white font-bold disabled:opacity-40">
                  <span className="inline-flex">{busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}</span>
                  <span>أرسِل الدفعة</span>
                </button>
              </>
            )}
          </div>

          {/* التحرير الجماعي */}
          {batch.status === 'staging' && sel.length > 0 && (
            <div className="bg-violet-50 border border-violet-200 rounded-2xl p-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-violet-800">المحدَّد: {sel.length}</span>
              <select defaultValue="" onChange={e => e.target.value && patch(sel, { academic_year: e.target.value })}
                className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white">
                <option value="">العام لكلّها…</option>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select defaultValue="" onChange={e => e.target.value && patch(sel, { sub_node_id: e.target.value })}
                className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white max-w-[240px]">
                <option value="">المعيار الفرعي لكلّها…</option>
                {subs.map(s => <option key={s.id} value={s.id}>{s.code} — {s.name_ar.slice(0, 46)}</option>)}
              </select>
              <button onClick={mergeSelected} disabled={sel.length < 2}
                title="التقرير وملاحقه · والمستند المصوَّر صفحةً صفحة"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-violet-300 bg-white text-violet-700 disabled:opacity-40">
                <span className="inline-flex"><Merge size={12} /></span><span>ادمج في دليل واحد</span>
              </button>
              <button onClick={() => patch(sel, { dropped: true })}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 bg-white text-red-700">
                <span className="inline-flex"><Trash2 size={12} /></span><span>أسقِط</span>
              </button>
              <button onClick={() => setSel([])} className="text-slate-400 ms-auto">إلغاء التحديد</button>
            </div>
          )}

          {/* ورقة التهيئة */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-xs min-w-[720px]">
              <thead>
                <tr className="bg-slate-50 text-slate-500">
                  <th className="p-2 w-8">
                    <input type="checkbox" checked={sel.length === live.length && live.length > 0}
                      onChange={e => setSel(e.target.checked ? live.map(i => i.id) : [])} />
                  </th>
                  <th className="p-2 text-right">الملفّ</th>
                  <th className="p-2 text-right">العام *</th>
                  <th className="p-2 text-right">تاريخ الوثيقة</th>
                  <th className="p-2 text-right">المعيار الفرعي *</th>
                </tr>
              </thead>
              <tbody>
                {items.map(it => (
                  <tr key={it.id} className={`border-t border-slate-100 ${it.dropped ? 'opacity-45' : ''}`}>
                    <td className="p-2 align-top">
                      {!it.dropped && (
                        <input type="checkbox" checked={sel.includes(it.id)}
                          onChange={e => setSel(p => e.target.checked ? [...p, it.id] : p.filter(x => x !== it.id))} />
                      )}
                    </td>
                    <td className="p-2 align-top">
                      <a href={it.file_url} target="_blank" rel="noopener noreferrer"
                        className="text-slate-700 hover:text-violet-700 hover:underline">{it.file_name}</a>
                      <span className="block text-[10px] text-slate-400 font-mono">#{it.content_hash.slice(0, 10)}</span>
                      {it.dup_of && <span className="text-[10px] text-amber-700">مكرّر — موجودٌ في المخزن</span>}
                      {it.merge_group && (
                        <span className="text-[10px] text-violet-700">مجموعة دمج {it.merge_group}</span>
                      )}
                    </td>
                    <td className="p-2 align-top">
                      <select value={it.academic_year || ''} disabled={batch.status !== 'staging'}
                        onChange={e => patch([it.id], { academic_year: e.target.value })}
                        className={`px-2 py-1 rounded-lg border bg-white ${it.academic_year ? 'border-slate-200' : 'border-amber-300'}`}>
                        <option value="">—</option>
                        {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                      {it.transitional && (
                        <span className="block text-[10px] text-sky-700 mt-0.5">
                          في النافذة الانتقالية — لأيّ عام؟
                        </span>
                      )}
                    </td>
                    <td className="p-2 align-top">
                      <input type="date" value={it.document_date || ''} disabled={batch.status !== 'staging'}
                        onChange={e => patch([it.id], { document_date: e.target.value })}
                        className="px-2 py-1 rounded-lg border border-slate-200 bg-white" />
                    </td>
                    <td className="p-2 align-top">
                      <select value={it.sub_node_id || ''} disabled={batch.status !== 'staging'}
                        onChange={e => patch([it.id], { sub_node_id: e.target.value })}
                        className={`px-2 py-1 rounded-lg border bg-white max-w-[230px] ${it.sub_node_id ? 'border-slate-200' : 'border-amber-300'}`}>
                        <option value="">—</option>
                        {subs.map(s => <option key={s.id} value={s.id}>{s.code} — {s.name_ar.slice(0, 40)}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <span className="inline-flex"><AlertTriangle size={12} /></span>
            <span>
              <strong>*</strong> حقلان مانعان: بغيرهما لا تُرسَل الدفعة. والنوع وتاريخ الوثيقة
              يُصحَّحان متى شئت. وكلّ ملفّ <strong>دليلٌ مستقلّ</strong> ما لم تدمجه.
            </span>
          </p>
        </>
      )}
    </div>
  )
}

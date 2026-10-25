'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Repeat, Link2, Unlink, Loader2, Settings } from 'lucide-react'
import { toast } from '@/components/Toast'
import { FREQ_AR, tallyText, type CycleTally } from '@/lib/recurring'

/**
 * ممارساتٌ دورية مرتبطة بعقدة الخطة (الوثيقة 5.1‑2).
 *
 * ── اختيارٌ لا إنشاء ──
 * «الخطة **تشير إليها ولا تنشئها**» — فليس هنا نموذج تعريف، بل قائمةٌ
 * جاهزة ورابطٌ إلى الإعدادات لمن يريد تعريف ممارسةٍ جديدة. وهو شرطُ
 * 5.4 نصّاً: «**قائمة جاهزة، لا نموذج إنشاء جديداً داخل الخطة**».
 *
 * ── ويظهر بوضوح أنها قائمةٌ لا عملٌ جديد ──
 * الشرط الثاني في 5.4: «**وأن يظهر بوضوح أنها ممارسة قائمة لا عملٌ
 * جديد يُحتسب**». فهي في صندوقٍ مستقلّ بلونٍ مستقلّ، ولا تُعدّ في
 * «مهام العقدة»، ومكتوبٌ عليها أنها خارج حساب الإنجاز — لأن الخلط
 * هو الخطر: «المهمة الدورية لا تنتهي أبداً، فتبقى الخطة دون 100٪ إلى
 * الأبد — أو «تكتمل» بإغلاق دورة واحدة» (5.2).
 *
 * ── ومؤشّرها دوراتُها لا نسبةٌ ──
 * «12 دورة من 12 وُثّقت» (5.2) — والمهمَل يُذكر صريحاً، فهو وحده فجوة.
 */

type LinkRow = {
  nodeId: string; taskId: string; name: string; frequency: string
  assignee: string | null; isActive: boolean; tally: CycleTally
}

type Option = { id: string; name_ar: string; frequency: string; is_active: boolean }

export default function NodeRecurringLink({ nodeId, canManage }:
  { nodeId: string; canManage: boolean }) {
  const [links,   setLinks]   = useState<LinkRow[]>([])
  const [options, setOptions] = useState<Option[]>([])
  const [sel,     setSel]     = useState('')
  const [busy,    setBusy]    = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const r = await fetch(`/api/plan-nodes/recurring?nodeId=${encodeURIComponent(nodeId)}`)
    const j = await r.json().catch(() => ({}))
    setLinks(j.links || [])
    setLoading(false)
  }, [nodeId])

  useEffect(() => { setLoading(true); setSel(''); load() }, [load])

  useEffect(() => {
    if (!canManage) return
    fetch('/api/recurring-tasks').then(r => r.json())
      .then(j => setOptions((j.items || []).filter((t: any) => t.is_active)))
      .catch(() => setOptions([]))
  }, [canManage])

  const link = async () => {
    if (!sel) return
    setBusy(true)
    const r = await fetch('/api/plan-nodes/recurring', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId, taskId: sel }),
    })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { toast(j.error || 'تعذّر الربط', 'error'); return }
    setSel(''); await load()
    toast('رُبطت الممارسة — ولا تدخل حساب إنجاز الخطة', 'success')
  }

  const unlink = async (taskId: string) => {
    setBusy(true)
    const r = await fetch('/api/plan-nodes/recurring', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId, taskId }),
    })
    setBusy(false)
    if (!r.ok) { toast('تعذّر فكّ الإشارة', 'error'); return }
    await load()
    toast('فُكّت الإشارة — ودوراتها باقية، فهي تملك نفسها', 'success')
  }

  const linkedIds = new Set(links.map(l => l.taskId))
  const free = options.filter(o => !linkedIds.has(o.id))

  if (loading) return null
  if (!links.length && !canManage) return null

  return (
    <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/60 p-3">
      <p className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-900 mb-1">
        <span className="inline-flex"><Repeat size={13} /></span>
        <span>ممارسات دورية مرتبطة ({links.length})</span>
      </p>
      <p className="text-[11px] text-sky-800/80 mb-2.5 leading-relaxed">
        ممارسةٌ <strong>قائمة</strong> لا عملٌ جديد — <strong>ولا تدخل حساب إنجاز الخطة</strong>،
        ولها مؤشّرها: الدوراتُ الموثّقة (5.2).
      </p>

      {links.length > 0 && (
        <div className="space-y-1.5 mb-2.5">
          {links.map(l => (
            <div key={l.taskId}
              className="flex items-center gap-2 p-2 rounded-lg bg-white border border-sky-100">
              <span className="inline-flex text-sky-600"><Repeat size={13} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-700 truncate">{l.name}</p>
                <p className="text-[11px] text-slate-500">
                  <span>{FREQ_AR[l.frequency] || l.frequency}</span>
                  {l.assignee && <span> · {l.assignee}</span>}
                  <span> · {tallyText(l.tally)}</span>
                </p>
              </div>
              {!l.isActive && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 flex-shrink-0">
                  موقوفة
                </span>
              )}
              {canManage && (
                <button onClick={() => unlink(l.taskId)} disabled={busy}
                  title="فكّ الإشارة — ودوراتها تبقى"
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 flex-shrink-0">
                  <span className="inline-flex"><Unlink size={13} /></span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <>
          <div className="flex items-center gap-2">
            <select value={sel} onChange={e => setSel(e.target.value)}
              className="flex-1 min-w-0 px-2.5 py-2 rounded-lg border border-sky-200 bg-white text-xs">
              <option value="">اختر ممارسةً قائمة…</option>
              {free.map(o => (
                <option key={o.id} value={o.id}>{o.name_ar} — {FREQ_AR[o.frequency] || o.frequency}</option>
              ))}
            </select>
            <button onClick={link} disabled={!sel || busy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-700 text-white text-xs font-bold disabled:opacity-40 flex-shrink-0">
              <span className="inline-flex">{busy ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}</span>
              <span>اربط</span>
            </button>
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5 inline-flex items-start gap-1">
            <span className="inline-flex mt-0.5"><Settings size={11} /></span>
            <span>
              {free.length || links.length
                ? 'الاختيار من القائمة وحدها — والتعريف محلُّه '
                : 'لا ممارساتٍ معرّفة بعد — عرِّفها في '}
              <Link href="/dashboard/recurring" className="text-violet-600 hover:underline font-medium">
                المهامّ الدورية
              </Link>
              {free.length || links.length ? '، فالخطة تشير ولا تُنشئ (5.1).' : '.'}
            </span>
          </p>
        </>
      )}
    </div>
  )
}

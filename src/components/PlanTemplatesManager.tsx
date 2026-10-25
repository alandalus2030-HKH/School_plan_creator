'use client'

import { useState, useEffect, useCallback } from 'react'
import { LayoutTemplate, Plus, Trash2, Save, Loader2, Power, X } from 'lucide-react'
import { toast } from '@/components/Toast'
import ConfirmDialog from '@/components/ConfirmDialog'
import { FRAMEWORK_LEVEL_LABELS, MAX_PLAN_LEVELS, ANCHOR_POLICY_AR } from '@/lib/planLevels'

/**
 * قوالب الخطط (الوثيقة 4.1).
 *
 * «مسمّيات المستويات تختلف بين المدارس، **والمرونة مطلب**. فالقالب
 *  يحمل ثلاثة أشياء: مسمّيات مستوياته · سياسة عمقه · سياسة إسناده».
 *
 * ── وتقابلُ الإطار يُعلَن ولا يُستنتج ──
 * كان النظام يستنتج مستوى الإطار **بمطابقة اسم المستوى** حرفياً، فمن
 * سمّى مستواه «مجالات التحسين» أُطفئ عنده منتقي الإطار **صامتاً**.
 * فصار لكل مستوىً خانةٌ يُقال فيها: أهو بندٌ من الإطار أم مستوىً حرّ.
 *
 * ── والعمق سقفٌ لا قفل ──
 * أربعةٌ حدّاً أعلى (قرار 2026-10-07): «المهمّة لا تُعلَّق إلا على
 * العقدة الأعمق، فكلّ مستوىً زائد يُجبر كلّ فرعٍ على عمقه».
 *
 * ── والقالب يُنسَخ عند ميلاد الخطة ──
 * فتعديلُه هنا **لا يمسّ خطّةً قائمة** — ولا يتبدّل هيكلُ خطّةٍ قيد
 * البناء تحت صاحبها.
 */

type Tpl = {
  id: string; code: string | null; name_ar: string
  level_names: string[]; framework_levels: number[]
  anchor_policy: string; anchor_level: number | null
  is_active: boolean; sort_order: number
}

type Draft = {
  id: string | null; nameAr: string; levelNames: string[]
  frameworkLevels: number[]; anchorPolicy: string; anchorLevel: number
}

const EMPTY: Draft = {
  id: null, nameAr: '', levelNames: ['هدف عام', 'هدف تشغيلي'],
  frameworkLevels: [0, 0], anchorPolicy: 'optional', anchorLevel: 1,
}

export default function PlanTemplatesManager() {
  const [items,   setItems]   = useState<Tpl[]>([])
  const [loading, setLoading] = useState(true)
  const [draft,   setDraft]   = useState<Draft | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [confirmDel, setConfirmDel] = useState<Tpl | null>(null)

  const load = useCallback(async () => {
    const r = await fetch('/api/plan-templates')
    const j = await r.json().catch(() => ({}))
    setItems(j.templates || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const edit = (t: Tpl) => setDraft({
    id: t.id, nameAr: t.name_ar,
    levelNames: [...t.level_names],
    frameworkLevels: t.level_names.map((_, i) => Number(t.framework_levels?.[i] ?? 0)),
    anchorPolicy: t.anchor_policy,
    anchorLevel: t.anchor_level ?? t.level_names.length,
  })

  const setLevel = (i: number, v: string) =>
    setDraft(d => d && ({ ...d, levelNames: d.levelNames.map((n, j) => j === i ? v : n) }))
  const setFw = (i: number, v: number) =>
    setDraft(d => d && ({ ...d, frameworkLevels: d.frameworkLevels.map((n, j) => j === i ? v : n) }))

  const addLevel = () => setDraft(d => d && d.levelNames.length < MAX_PLAN_LEVELS
    ? { ...d, levelNames: [...d.levelNames, ''], frameworkLevels: [...d.frameworkLevels, 0] } : d)

  const removeLevel = (i: number) => setDraft(d => {
    if (!d || d.levelNames.length <= 2) return d
    const levelNames = d.levelNames.filter((_, j) => j !== i)
    return {
      ...d, levelNames,
      frameworkLevels: d.frameworkLevels.filter((_, j) => j !== i),
      anchorLevel: Math.min(d.anchorLevel, levelNames.length),
    }
  })

  const save = async () => {
    if (!draft) return
    setSaving(true)
    const r = await fetch('/api/plan-templates', {
      method: draft.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    const j = await r.json().catch(() => ({}))
    setSaving(false)
    if (!r.ok) { toast(j.error || 'تعذّر الحفظ', 'error'); return }
    toast(draft.id ? 'حُدِّث القالب' : 'أُضيف القالب', 'success')
    setDraft(null); load()
  }

  const toggle = async (t: Tpl) => {
    const r = await fetch('/api/plan-templates', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, isActive: !t.is_active }),
    })
    if (!r.ok) { toast('تعذّر التغيير', 'error'); return }
    load()
  }

  const remove = async (t: Tpl) => {
    const r = await fetch('/api/plan-templates', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id }),
    })
    setConfirmDel(null)
    if (!r.ok) { toast('تعذّر الحذف', 'error'); return }
    toast('حُذف القالب — والخطط المولودة منه لم تتبدّل', 'success'); load()
  }

  const fwLabel = (n: number) => FRAMEWORK_LEVEL_LABELS[n] || 'مستوىً حرّ'

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-5">
      <div className="flex items-center gap-3 p-5 border-b border-slate-100 bg-gradient-to-l from-violet-50 to-white">
        <span className="inline-flex" style={{ color: 'var(--maroon-600)' }}><LayoutTemplate size={26} /></span>
        <div className="min-w-0">
          <h3 className="font-bold text-slate-800">قوالب الخطط</h3>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            مسمّيات المستويات تختلف بين المدارس — والقالب يحمل مسمّياته وتقابلَها مع الإطار وسياسةَ إسناده.
          </p>
        </div>
        <button onClick={() => setDraft({ ...EMPTY })}
          className="ms-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-sm font-semibold flex-shrink-0"
          style={{ background: 'var(--maroon-600)' }}>
          <span className="inline-flex"><Plus size={15} /></span><span>قالب</span>
        </button>
      </div>

      <div className="p-4 space-y-2">
        {loading ? (
          <p className="text-sm text-slate-400 text-center py-6">…</p>
        ) : !items.length ? (
          <p className="text-sm text-slate-500 text-center py-6">لا قوالب بعد</p>
        ) : items.map(t => (
          <div key={t.id} className={`rounded-xl border p-3 ${
            t.is_active ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-70'}`}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-800">{t.name_ar}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {t.level_names.map((n, i) => (
                    <span key={i}>
                      {i > 0 && <span className="text-slate-300"> › </span>}
                      <span>{n}</span>
                      {Number(t.framework_levels?.[i] ?? 0) > 0 && (
                        <span className="text-violet-600"> ({fwLabel(Number(t.framework_levels[i]))})</span>
                      )}
                    </span>
                  ))}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  <span>الإسناد: <strong>{ANCHOR_POLICY_AR[t.anchor_policy]}</strong></span>
                  {t.anchor_level && <span> عند «{t.level_names[t.anchor_level - 1]}»</span>}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => edit(t)} title="تعديل"
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600">تعديل</button>
                <button onClick={() => toggle(t)} title={t.is_active ? 'إيقاف' : 'استئناف'}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50">
                  <span className="inline-flex"><Power size={14} /></span>
                </button>
                <button onClick={() => setConfirmDel(t)} title="حذف"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50">
                  <span className="inline-flex"><Trash2 size={14} /></span>
                </button>
              </div>
            </div>
          </div>
        ))}

        <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
          القالب يُنسَخ إلى الخطة <strong>عند إنشائها</strong> — فتعديلُه هنا لا يُبدّل خطّةً قائمة،
          ولا يتبدّل هيكلُ خطّةٍ قيد البناء تحت صاحبها.
        </p>
      </div>

      {draft && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-lg my-8">
            <div className="p-4 border-b border-slate-100 flex items-center gap-2">
              <span className="inline-flex text-[#8a1538]"><LayoutTemplate size={18} /></span>
              <h2 className="font-bold text-slate-800 text-sm">{draft.id ? 'تعديل قالب' : 'قالب جديد'}</h2>
              <button onClick={() => setDraft(null)} className="ms-auto text-slate-400 hover:text-slate-700">
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-3.5 text-sm">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">اسم القالب *</span>
                <input value={draft.nameAr} onChange={e => setDraft({ ...draft, nameAr: e.target.value })}
                  placeholder="مثال: خطة تشغيلية سنوية"
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200" />
              </label>

              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-semibold text-slate-600 mb-2">
                  المستويات ({draft.levelNames.length}) <span className="text-slate-400 font-normal">— اثنان إلى {MAX_PLAN_LEVELS}</span>
                </p>
                <div className="space-y-2">
                  {draft.levelNames.map((n, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400 w-4 flex-shrink-0">{i + 1}</span>
                      <input value={n} onChange={e => setLevel(i, e.target.value)}
                        placeholder={`اسم المستوى ${i + 1}`}
                        className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs" />
                      <select value={draft.frameworkLevels[i] || 0}
                        onChange={e => setFw(i, Number(e.target.value))}
                        className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs bg-white flex-shrink-0">
                        <option value={0}>مستوىً حرّ</option>
                        {[1, 2, 3, 4].map(k => <option key={k} value={k}>{FRAMEWORK_LEVEL_LABELS[k]}</option>)}
                      </select>
                      <button onClick={() => removeLevel(i)} disabled={draft.levelNames.length <= 2}
                        className="text-slate-300 hover:text-rose-500 disabled:opacity-30 flex-shrink-0">
                        <span className="inline-flex"><Trash2 size={14} /></span>
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={addLevel} disabled={draft.levelNames.length >= MAX_PLAN_LEVELS}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-violet-600 disabled:opacity-40">
                  <span className="inline-flex"><Plus size={12} /></span><span>أضف مستوى</span>
                </button>
                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                  <strong>سقفٌ لا قفل:</strong> المهمّة لا تُعلَّق إلا على العقدة الأعمق،
                  فكلّ مستوىً زائد يُجبر كلّ فرعٍ على عمقه (4.1).
                  <strong> وتقابلُ الإطار يُعلَن هنا</strong> فلا يُستنتج من الاسم.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-semibold text-slate-600 mb-2">سياسة الإسناد</p>
                <div className="flex gap-2 mb-2 text-xs flex-wrap">
                  {Object.entries(ANCHOR_POLICY_AR).map(([k, v]) => (
                    <button key={k} onClick={() => setDraft({ ...draft, anchorPolicy: k })}
                      className={`px-3 py-1.5 rounded-lg border ${
                        draft.anchorPolicy === k ? 'bg-slate-800 text-white border-slate-800'
                                                 : 'bg-white text-slate-600 border-slate-200'}`}>{v}</button>
                  ))}
                </div>
                {draft.anchorPolicy !== 'none' && (
                  <select value={draft.anchorLevel}
                    onChange={e => setDraft({ ...draft, anchorLevel: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs">
                    {draft.levelNames.map((n, i) => (
                      <option key={i} value={i + 1}>يُسنَد عند «{n || `المستوى ${i + 1}`}»</option>
                    ))}
                  </select>
                )}
                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                  والإسناد <strong>يُورَث لأسفل</strong>: «كل مهمّة تحته ترث الإسناد، وكل دليل
                  يُرفع عليها يرث بدوره» (4.2).
                </p>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex items-center gap-2">
              <button onClick={save} disabled={saving || !draft.nameAr.trim() || draft.levelNames.some(n => !n.trim())}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-40"
                style={{ background: 'var(--maroon-600)' }}>
                <span className="inline-flex">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}</span>
                <span>احفظ</span>
              </button>
              <button onClick={() => setDraft(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDel}
        title="حذف القالب"
        message={<>يُحذف «<strong>{confirmDel?.name_ar}</strong>» حذفاً ناعماً. والخطط المولودة منه <strong>لا تتبدّل</strong> — فالقالب نُسخ إليها عند إنشائها.</>}
        onConfirm={() => confirmDel && remove(confirmDel)} onCancel={() => setConfirmDel(null)} />
    </div>
  )
}

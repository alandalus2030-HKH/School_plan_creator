'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Search, X, CircleCheckBig, Map, UserRound, FileText, CornerDownLeft,
} from 'lucide-react'

type Result = {
  id:      string
  label:   string
  sub?:    string
  href:    string
  kind:    'task' | 'plan' | 'node' | 'user'
}

const KIND_META = {
  task: { Icon: CircleCheckBig, ar: 'مهمة',     color: 'var(--maroon-600)' },
  plan: { Icon: Map,            ar: 'خطة',      color: 'var(--maroon-500)' },
  node: { Icon: FileText,       ar: 'عنصر خطة', color: 'var(--maroon-400)' },
  user: { Icon: UserRound,      ar: 'مستخدم',   color: 'var(--maroon-700)' },
}

export default function GlobalSearch() {
  const supabase = createClient()
  const router   = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [open,    setOpen]    = useState(false)
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)
  const [active,  setActive]  = useState(0)

  /* ── فتح بـ Ctrl+K أو K ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  /* ── تركيز عند الفتح ── */
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
    else { setQuery(''); setResults([]); setActive(0) }
  }, [open])

  /* ── البحث (debounced) ── */
  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return }
    setLoading(true)
    const term = `%${q.trim()}%`

    const [tasks, plans, nodes, users] = await Promise.all([
      supabase.from('tasks').select('id, name_ar, node_id').ilike('name_ar', term).is('deleted_at', null).limit(6),
      supabase.from('plans').select('id, name_ar, academic_year').ilike('name_ar', term).eq('is_archived', false).limit(4),
      supabase.from('plan_nodes').select('id, name_ar, plan_id').ilike('name_ar', term).limit(5),
      supabase.from('profiles').select('id, name_ar, job_title').ilike('name_ar', term).eq('is_active', true).limit(4),
    ])

    const merged: Result[] = [
      ...(tasks.data || []).map(t => ({
        id: t.id, label: t.name_ar, href: `/dashboard/tasks/${t.id}`, kind: 'task' as const,
      })),
      ...(plans.data || []).map(p => ({
        id: p.id, label: p.name_ar, sub: p.academic_year, href: `/dashboard/plans/${p.id}`, kind: 'plan' as const,
      })),
      ...(nodes.data || []).map(n => ({
        id: n.id, label: n.name_ar, href: `/dashboard/plans/${n.plan_id}/nodes/${n.id}`, kind: 'node' as const,
      })),
      ...(users.data || []).map(u => ({
        id: u.id, label: u.name_ar, sub: u.job_title || undefined, href: `/dashboard/users`, kind: 'user' as const,
      })),
    ]
    setResults(merged)
    setActive(0)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 300)
    return () => clearTimeout(t)
  }, [query, runSearch])

  /* ── التنقل بالأسهم ── */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    if (e.key === 'Enter' && results[active]) {
      router.push(results[active].href)
      setOpen(false)
    }
  }

  const go = (href: string) => { router.push(href); setOpen(false) }

  return (
    <>
      {/* ── زر البحث في TopBar ── */}
      <button
        onClick={() => setOpen(true)}
        aria-label="بحث شامل (Ctrl+K)"
        className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200
                   text-slate-400 hover:border-violet-300 hover:text-violet-600 transition-colors text-xs">
        <Search size={14} />
        <span className="hidden sm:inline">بحث...</span>
        <kbd className="hidden md:inline text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-sans">Ctrl K</kbd>
      </button>

      {/* ── نافذة البحث ── */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
          onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden"
            dir="rtl" onClick={e => e.stopPropagation()}>

            {/* حقل البحث */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
              <Search size={18} className="text-slate-400 flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="ابحث في المهام والخطط والمستخدمين..."
                className="flex-1 text-sm outline-none bg-transparent"
              />
              <button onClick={() => setOpen(false)} aria-label="إغلاق"
                className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            {/* النتائج */}
            <div className="max-h-[60vh] overflow-y-auto">
              {loading ? (
                <div className="py-10 text-center text-slate-400 text-sm">جارٍ البحث...</div>
              ) : query.trim().length < 2 ? (
                <div className="py-10 text-center text-slate-400 text-sm">
                  اكتب حرفين على الأقل للبحث
                </div>
              ) : results.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-sm">
                  لا توجد نتائج لـ &quot;{query}&quot;
                </div>
              ) : (
                <div className="py-2">
                  {results.map((r, i) => {
                    const meta = KIND_META[r.kind]
                    return (
                      <button key={`${r.kind}-${r.id}`}
                        onClick={() => go(r.href)}
                        onMouseEnter={() => setActive(i)}
                        className={`w-full text-right px-4 py-2.5 flex items-center gap-3 transition-colors
                          ${active === i ? 'bg-violet-50' : 'hover:bg-slate-50'}`}>
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                          <meta.Icon size={15} style={{ color: meta.color }} />
                        </div>
                        <div className="flex-1 min-w-0 text-right">
                          <p className="text-sm text-slate-800 truncate">{r.label}</p>
                          {r.sub && <p className="text-[11px] text-slate-400">{r.sub}</p>}
                        </div>
                        <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full flex-shrink-0">
                          {meta.ar}
                        </span>
                        {active === i && (
                          <CornerDownLeft size={13} className="text-violet-400 flex-shrink-0" />
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* تذييل */}
            <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-[10px] text-slate-400">
              <span>↑↓ للتنقل · Enter للفتح · Esc للإغلاق</span>
              <span>{results.length > 0 && `${results.length} نتيجة`}</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

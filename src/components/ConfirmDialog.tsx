'use client'

/* ════════════════════════════════════════════════════════════
   نافذة تأكيد منبثقة موحَّدة لكل أوامر الحذف (وغيرها).
   تُعرض عبر Portal فوق كل شيء. الاستخدام:
     <ConfirmDialog open={!!target} title="حذف العنصر"
        message={<>سيُحذف «<strong>{name}</strong>» نهائياً.</>}
        loading={deleting} onConfirm={doDelete} onCancel={() => setTarget(null)} />
   ════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export default function ConfirmDialog({
  open, title, message,
  confirmLabel = 'نعم، احذف', cancelLabel = 'إلغاء',
  onConfirm, onCancel, loading = false, danger = true, icon = '🗑️',
}: {
  open: boolean
  title: string
  message?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
  danger?: boolean
  icon?: React.ReactNode
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, loading, onCancel])

  if (!open || !mounted) return null

  return createPortal(
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4"
      onClick={() => !loading && onCancel()}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()} dir="rtl">
        <div className="flex justify-center mb-3">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl ${danger ? 'bg-red-50' : 'bg-violet-50'}`}>
            {icon}
          </div>
        </div>
        <h3 className="text-lg font-bold text-slate-800 text-center mb-2">{title}</h3>
        {message && <div className="text-slate-600 text-sm text-center mb-2 leading-relaxed">{message}</div>}
        <div className="flex gap-3 mt-4">
          <button onClick={onConfirm} disabled={loading}
            className={`flex-1 text-white font-semibold py-2.5 rounded-xl disabled:opacity-60 transition-colors
              ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-violet-600 hover:bg-violet-700'}`}>
            {loading ? 'جارٍ التنفيذ...' : confirmLabel}
          </button>
          <button onClick={onCancel} disabled={loading}
            className="flex-1 border border-slate-200 text-slate-600 font-semibold py-2.5 rounded-xl hover:bg-slate-50 transition-colors">
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

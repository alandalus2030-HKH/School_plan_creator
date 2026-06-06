'use client'

import { useState, useEffect } from 'react'
import { CircleCheckBig, AlertTriangle, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

type ToastItem = {
  id:      number
  message: string
  type:    ToastType
}

let _addToast: ((msg: string, type?: ToastType) => void) | null = null

/** استخدم هذه الدالة من أي مكان لإظهار Toast */
export function toast(message: string, type: ToastType = 'success') {
  _addToast?.(message, type)
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    _addToast = (message, type = 'success') => {
      const id = Date.now()
      setToasts(prev => [...prev, { id, message, type }])
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2500)
    }
    return () => { _addToast = null }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none"
      dir="rtl">
      {toasts.map(t => (
        <div key={t.id}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl shadow-lg text-sm font-medium
            text-white animate-in slide-in-from-bottom-4 duration-200 pointer-events-auto
            ${t.type === 'success' ? 'bg-maroon-600' :
              t.type === 'error'   ? 'bg-red-600'    : 'bg-slate-700'}`}
          style={{ background: t.type === 'success' ? 'var(--gradient-button)' : undefined }}>
          {t.type === 'success' && <CircleCheckBig size={15} />}
          {t.type === 'error'   && <AlertTriangle  size={15} />}
          <span>{t.message}</span>
          <button
            onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
            className="opacity-70 hover:opacity-100 mr-1">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}

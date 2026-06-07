'use client'

import { useState } from 'react'
import { usePermissions } from '@/lib/PermissionsContext'
import { Eye, LogOut } from 'lucide-react'

/**
 * شريط التقمّص — يظهر دائماً أعلى الشاشة عندما يدخل المشرف كمدرسة
 */
export default function ImpersonationBanner() {
  const { impersonating, impersonatedSchool } = usePermissions()
  const [exiting, setExiting] = useState(false)

  if (!impersonating) return null

  const exit = async () => {
    setExiting(true)
    await fetch('/api/impersonate', { method: 'DELETE' })
    window.location.href = '/dashboard/schools'
  }

  return (
    <div className="sticky top-0 z-[60] flex items-center justify-center gap-3 px-4 py-2 text-white text-sm font-medium shadow-md"
      style={{ background: 'linear-gradient(90deg, #b45309, #d97706)' }}>
      <Eye size={15} className="flex-shrink-0" />
      <span>
        تتصفّح كـ <span className="font-bold">{impersonatedSchool || 'مدرسة'}</span> — وضع المتابعة (مشرف النظام)
      </span>
      <button onClick={exit} disabled={exiting}
        className="flex items-center gap-1.5 mr-2 px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 transition-colors text-xs font-semibold disabled:opacity-50">
        <LogOut size={13} /> {exiting ? 'جارٍ الخروج...' : 'العودة لوضع المشرف'}
      </button>
    </div>
  )
}

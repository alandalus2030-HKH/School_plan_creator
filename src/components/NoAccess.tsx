'use client'

import Link from 'next/link'

interface NoAccessProps {
  message?: string
}

export default function NoAccess({ message }: NoAccessProps) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-sm">
        <div className="text-6xl mb-4">🔒</div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">غير مصرَّح لك بالدخول</h2>
        <p className="text-slate-500 text-sm mb-6">
          {message || 'ليس لديك الصلاحية للوصول إلى هذه الصفحة. تواصل مع مدير النظام إذا كنت تعتقد أن هذا خطأ.'}
        </p>
        <Link href="/dashboard/my-tasks"
          className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors">
          ← العودة إلى مهامي
        </Link>
      </div>
    </div>
  )
}

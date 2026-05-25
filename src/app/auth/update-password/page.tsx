'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function UpdatePasswordPage() {
  const supabase  = createClient()
  const router    = useRouter()
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm)   { setError('كلمتا المرور غير متطابقتين'); return }
    if (password.length < 8)    { setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل'); return }
    setLoading(true); setError('')

    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setLoading(false); return }

    setSuccess(true)
    setTimeout(() => router.replace('/dashboard'), 2500)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">

        <div className="text-center mb-7">
          <div className="text-5xl mb-3">🔐</div>
          <h1 className="text-2xl font-bold text-slate-800">تعيين كلمة مرور جديدة</h1>
          <p className="text-slate-500 text-sm mt-1">اختر كلمة مرور قوية وآمنة</p>
        </div>

        {success ? (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-4 rounded-xl text-center text-sm font-medium">
            ✅ تم تغيير كلمة المرور بنجاح!<br />
            <span className="text-xs text-green-600">جارٍ التحويل إلى لوحة التحكم...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">كلمة المرور الجديدة</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                required dir="ltr" placeholder="8 أحرف على الأقل"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">تأكيد كلمة المرور</label>
              <input
                type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                required dir="ltr" placeholder="أعد كتابة كلمة المرور"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 text-sm"
              />
            </div>

            {/* مؤشر القوة */}
            {password.length > 0 && (
              <div className="space-y-1">
                <div className="flex gap-1">
                  {[1,2,3,4].map(i => (
                    <div key={i} className={`flex-1 h-1.5 rounded-full transition-colors ${
                      password.length >= i * 3
                        ? i <= 1 ? 'bg-red-400' : i <= 2 ? 'bg-amber-400' : i <= 3 ? 'bg-blue-400' : 'bg-green-500'
                        : 'bg-slate-100'
                    }`} />
                  ))}
                </div>
                <p className="text-xs text-slate-400">
                  {password.length < 4 ? 'ضعيفة جداً' : password.length < 7 ? 'ضعيفة' : password.length < 10 ? 'متوسطة' : 'قوية ✓'}
                </p>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
                ⚠️ {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white font-semibold py-3 rounded-xl disabled:opacity-60 transition-colors mt-2">
              {loading ? 'جارٍ الحفظ...' : '🔒 تعيين كلمة المرور'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

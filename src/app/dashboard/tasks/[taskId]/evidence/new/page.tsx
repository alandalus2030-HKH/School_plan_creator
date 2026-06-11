'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import { FileText, FolderOpen, Lock } from 'lucide-react'
import Link from 'next/link'

export default function NewEvidencePage() {
  const router  = useRouter()
  const params  = useParams()
  const taskId  = params.taskId as string
  const supabase = createClient()

  const [name,        setName]        = useState('')
  const [description, setDescription] = useState('')
  const [file,        setFile]        = useState<File | null>(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [preview,     setPreview]     = useState<string | null>(null)
  const [taskLocked,  setTaskLocked]  = useState(false)

  /* المهمة المنجزة مقفلة — لا رفع أدلة (الحارس الخادمي: RLS في الترحيل 024) */
  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('tasks').select('status').eq('id', taskId).single()
      if (data?.status === 'completed') setTaskLocked(true)
    })()
  }, [taskId])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    if (!name) setName(f.name.replace(/\.[^.]+$/, ''))
    if (f.type.startsWith('image/')) {
      setPreview(URL.createObjectURL(f))
    } else {
      setPreview(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file)        { setError('يرجى اختيار ملف');   return }
    if (!name.trim()) { setError('اسم الدليل مطلوب');  return }

    setLoading(true)
    setError('')

    try {
      // Count existing evidence to generate number
      const { count } = await supabase
        .from('evidence')
        .select('id', { count: 'exact', head: true })
        .eq('task_id', taskId)

      const evNum = `دليل-${(count || 0) + 1}`

      // Upload file to Supabase Storage
      const ext      = file.name.split('.').pop()
      const filePath = `evidence/${taskId}/${Date.now()}.${ext}`

      const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from('evidence')
        .upload(filePath, file, { upsert: false })

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from('evidence').getPublicUrl(filePath)

      const { error: insertError } = await supabase
        .from('evidence')
        .insert({
          task_id:         taskId,
          name:            name.trim(),
          description:     description.trim() || null,
          file_url:        urlData.publicUrl,
          file_type:       file.type,
          file_size:       file.size,
          evidence_number: evNum,
        })

      if (insertError) throw insertError

      router.push(`/dashboard/tasks/${taskId}`)
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء الرفع')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/dashboard/tasks/${taskId}`}
          className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-400 hover:text-violet-600 hover:border-violet-300 transition-colors">
          ←
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-slate-800">إضافة دليل</h2>
          <p className="text-slate-500 text-sm mt-0.5">رفع دليل أو إثبات للمهمة</p>
        </div>
      </div>

      {taskLocked ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
          <Lock size={36} className="mx-auto mb-3" style={{ color: 'var(--maroon-300)' }} />
          <p className="text-sm font-semibold text-slate-700 mb-1">المهمة منجزة ومقفلة</p>
          <p className="text-xs text-slate-400 mb-4">لا يمكن رفع أدلة على مهمة معتمدة — اطلب إعادة فتحها من صفحة المهمة.</p>
          <Link href={`/dashboard/tasks/${taskId}`}
            className="inline-block px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors">
            ← العودة للمهمة
          </Link>
        </div>
      ) : (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              الملف <span className="text-red-500">*</span>
            </label>
            <div
              className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-violet-300 hover:bg-violet-50 transition-all cursor-pointer"
              onClick={() => document.getElementById('file-input')?.click()}>
              {preview ? (
                <img src={preview} alt="معاينة" className="max-h-32 mx-auto rounded-lg" />
              ) : file ? (
                <div className="flex flex-col items-center gap-2">
                  <FileText size={40} style={{ color: 'var(--maroon-400)', margin: '0 auto' }} />
                  <p className="text-sm text-slate-600 font-medium font-latin">{file.name}</p>
                  <p className="text-xs text-slate-400 font-latin">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <FolderOpen size={40} style={{ color: 'var(--maroon-300)', margin: '0 auto' }} />
                  <p className="text-sm text-slate-500">اضغط لاختيار ملف</p>
                  <p className="text-xs text-slate-400">PDF, صور, Word, Excel …</p>
                </div>
              )}
              <input
                id="file-input"
                type="file"
                onChange={handleFileChange}
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
              />
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              اسم الدليل <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="مثال: تقرير نتائج الاختبار الشهري"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-slate-50 text-slate-800"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">الوصف (اختياري)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="ملاحظات إضافية عن هذا الدليل..."
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-slate-50 text-slate-800 resize-none"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60 shadow-lg shadow-violet-200">
              {loading ? 'جارٍ الرفع...' : '📎 رفع الدليل'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
              إلغاء
            </button>
          </div>
        </form>
      </div>
      )}
    </div>
  )
}

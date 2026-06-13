'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import { FileText, FolderOpen, Lock, PlayCircle, Sparkles, Loader2 } from 'lucide-react'
import Link from 'next/link'

/** يحسب رقم المهمة الكامل من سلسلة العقد */
async function computeTaskNumber(
  supabase: ReturnType<typeof createClient>,
  nodeId: string,
  taskOrderNum: number,
): Promise<string | null> {
  const { data: node } = await supabase
    .from('plan_nodes').select('plan_id').eq('id', nodeId).single()
  if (!node) return null

  const { data: allNodes } = await supabase
    .from('plan_nodes')
    .select('id, parent_id, order_num, standard_code')
    .eq('plan_id', node.plan_id)
  if (!allNodes) return null

  const chain: { id: string; order_num: number; standard_code: string | null }[] = []
  let current = allNodes.find((n: any) => n.id === nodeId)
  while (current) {
    chain.unshift({ id: current.id, order_num: current.order_num, standard_code: (current as any).standard_code || null })
    current = allNodes.find((n: any) => n.id === current!.parent_id)
  }

  let baseIdx = -1
  for (let i = chain.length - 1; i >= 0; i--) {
    if (chain[i].standard_code) { baseIdx = i; break }
  }

  const path: (string | number)[] = []
  if (baseIdx >= 0) {
    path.push(chain[baseIdx].standard_code as string)
    for (let i = baseIdx + 1; i < chain.length; i++) path.push(chain[i].order_num)
  } else {
    for (const n of chain) path.push(n.order_num)
  }
  path.push(taskOrderNum)
  return path.join('.')
}

/** استخراج معرّف الفيديو من روابط يوتيوب المختلفة */
function extractYouTubeId(url: string): string | null {
  const pattern = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([^&\n?#]+)/
  const match = url.match(pattern)
  return match ? match[1] : null
}

export default function NewEvidencePage() {
  const router   = useRouter()
  const params   = useParams()
  const taskId   = params.taskId as string
  const supabase = createClient()

  /* النمط: ملف أو فيديو */
  const [mode, setMode] = useState<'file' | 'video'>('file')

  /* حقول مشتركة */
  const [name,        setName]        = useState('')
  const [description, setDescription] = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')

  /* حقول الملف */
  const [file,    setFile]    = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  /* حقول يوتيوب */
  const [videoUrl,      setVideoUrl]      = useState('')
  const [videoId,       setVideoId]       = useState<string | null>(null)
  const [fetchingMeta,  setFetchingMeta]  = useState(false)
  const [generatingAI,  setGeneratingAI]  = useState(false)

  /* بيانات المهمة لحساب رقم الدليل */
  const [taskLocked,   setTaskLocked]   = useState(false)
  const [taskNodeId,   setTaskNodeId]   = useState<string | null>(null)
  const [taskOrderNum, setTaskOrderNum] = useState<number>(1)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('tasks')
        .select('status, node_id, order_num')
        .eq('id', taskId)
        .single()
      if (data?.status === 'completed') setTaskLocked(true)
      if (data?.node_id)   setTaskNodeId(data.node_id)
      if (data?.order_num) setTaskOrderNum(data.order_num)
    })()
  }, [taskId])

  /* جلب عنوان الفيديو من oEmbed عند تغيير الرابط */
  const handleVideoUrlChange = async (url: string) => {
    setVideoUrl(url)
    const id = extractYouTubeId(url)
    setVideoId(id)
    if (id) {
      setFetchingMeta(true)
      try {
        const res = await fetch(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`
        )
        if (res.ok) {
          const data = await res.json()
          if (!name) setName(data.title || '')
        }
      } catch { /* الشبكة أو CORS — نتجاهل */ }
      setFetchingMeta(false)
    }
  }

  /* توليد الاسم والوصف بالذكاء الاصطناعي (Groq) */
  const generateAI = async () => {
    if (!videoId || !name) return
    setGeneratingAI(true)
    try {
      const res = await fetch('/api/ai/evidence-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoTitle: name, videoUrl }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.name)        setName(data.name)
        if (data.description) setDescription(data.description)
      }
    } catch { /* نتجاهل خطأ الشبكة */ }
    setGeneratingAI(false)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    if (!name) setName(f.name.replace(/\.[^.]+$/, ''))
    setPreview(f.type.startsWith('image/') ? URL.createObjectURL(f) : null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'file'  && !file)    { setError('يرجى اختيار ملف');      return }
    if (mode === 'video' && !videoId) { setError('رابط يوتيوب غير صحيح'); return }
    if (!name.trim())                  { setError('اسم الدليل مطلوب');     return }

    setLoading(true)
    setError('')

    try {
      /* الرقم التسلسلي */
      const { count } = await supabase
        .from('evidence')
        .select('id', { count: 'exact', head: true })
        .eq('task_id', taskId)

      const seq = (count || 0) + 1

      let taskNum: string | null = null
      if (taskNodeId) taskNum = await computeTaskNumber(supabase, taskNodeId, taskOrderNum)
      const evNum = taskNum ? `${taskNum}.${seq}` : `دليل-${seq}`

      if (mode === 'video') {
        /* دليل فيديو: نحفظ الرابط فقط + الصورة المصغّرة */
        const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
        const { error: insertError } = await supabase.from('evidence').insert({
          task_id:         taskId,
          name:            name.trim(),
          description:     description.trim() || null,
          file_url:        thumbnailUrl,
          file_type:       'video/youtube',
          file_size:       0,
          video_url:       videoUrl,
          evidence_number: evNum,
        })
        if (insertError) throw insertError
      } else {
        /* دليل ملف: رفع للـ Storage */
        const ext      = file!.name.split('.').pop()
        const filePath = `evidence/${taskId}/${Date.now()}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from('evidence').upload(filePath, file!, { upsert: false })
        if (uploadError) throw uploadError

        const { data: urlData } = supabase.storage.from('evidence').getPublicUrl(filePath)

        const { error: insertError } = await supabase.from('evidence').insert({
          task_id:         taskId,
          name:            name.trim(),
          description:     description.trim() || null,
          file_url:        urlData.publicUrl,
          file_type:       file!.type,
          file_size:       file!.size,
          evidence_number: evNum,
        })
        if (insertError) throw insertError
      }

      router.push(`/dashboard/tasks/${taskId}`)
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء الحفظ')
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
          <p className="text-slate-500 text-sm mt-0.5">رفع ملف أو إضافة فيديو يوتيوب</p>
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
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

          {/* Tab switcher */}
          <div className="flex border-b border-slate-200">
            <button
              type="button"
              onClick={() => setMode('file')}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold transition-colors ${
                mode === 'file'
                  ? 'bg-violet-50 text-violet-700 border-b-2 border-violet-600'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}>
              <FolderOpen size={16} /> رفع ملف
            </button>
            <button
              type="button"
              onClick={() => setMode('video')}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold transition-colors ${
                mode === 'video'
                  ? 'bg-red-50 text-red-600 border-b-2 border-red-500'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}>
              <PlayCircle size={16} /> فيديو يوتيوب
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">

            {/* ── وضع الملف ── */}
            {mode === 'file' && (
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
                      <p className="text-xs text-slate-400">PDF، صور، Word، Excel</p>
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
            )}

            {/* ── وضع يوتيوب ── */}
            {mode === 'video' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    رابط يوتيوب <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <PlayCircle size={18} className="absolute right-3 top-3.5" style={{ color: '#ef4444' }} />
                    <input
                      type="url"
                      value={videoUrl}
                      onChange={e => handleVideoUrlChange(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                      dir="ltr"
                      className="w-full pr-10 pl-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-300 bg-slate-50 text-slate-800 font-latin text-sm"
                    />
                    {fetchingMeta && (
                      <Loader2 size={16} className="absolute left-3 top-3.5 text-slate-400 animate-spin" />
                    )}
                  </div>
                  {videoId && !fetchingMeta && (
                    <p className="text-xs text-green-600 mt-1">✓ رابط يوتيوب صحيح</p>
                  )}
                  {videoUrl && !videoId && (
                    <p className="text-xs text-red-500 mt-1">رابط غير صحيح — يجب أن يكون رابط يوتيوب</p>
                  )}
                </div>

                {/* معاينة الصورة المصغّرة */}
                {videoId && (
                  <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-100">
                    <img
                      src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
                      alt="معاينة الفيديو"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <div className="w-14 h-14 bg-red-600 rounded-full flex items-center justify-center shadow-lg">
                        <span className="text-white text-2xl mr-[-3px]">▶</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* اسم الدليل — مشترك */}
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

            {/* الوصف — مشترك */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-slate-700">الوصف (اختياري)</label>
                {mode === 'video' && videoId && name && (
                  <button
                    type="button"
                    onClick={generateAI}
                    disabled={generatingAI}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-50 transition-colors font-medium">
                    <span className="inline-flex">
                      {generatingAI ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    </span>
                    <span>{generatingAI ? 'جارٍ التوليد...' : '✨ اقتراح بالذكاء الاصطناعي'}</span>
                  </button>
                )}
              </div>
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
                disabled={loading || (mode === 'video' && !videoId)}
                className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60 shadow-lg shadow-violet-200">
                {loading
                  ? 'جارٍ الحفظ...'
                  : mode === 'video' ? '🎬 حفظ دليل الفيديو' : '📎 رفع الدليل'}
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

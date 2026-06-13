'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import { FileText, FolderOpen, Lock, PlayCircle, Sparkles, Loader2, X, Plus } from 'lucide-react'
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

/** مرفق واحد في قائمة الدليل — إما ملف أو فيديو */
type Attachment = {
  kind:      'file' | 'video'
  title:     string
  /* ملف */
  file?:     File
  preview?:  string | null
  /* فيديو */
  videoUrl?: string
  videoId?:  string
}

export default function NewEvidencePage() {
  const router   = useRouter()
  const params   = useParams()
  const taskId   = params.taskId as string
  const supabase = createClient()

  /* قائمة المرفقات (ملفات + فيديوهات) لدليل واحد */
  const [attachments, setAttachments] = useState<Attachment[]>([])

  /* النمط النشط في أداة الإضافة */
  const [mode, setMode] = useState<'file' | 'video'>('file')

  /* بيانات الدليل */
  const [name,        setName]        = useState('')
  const [description, setDescription] = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')

  /* أداة إضافة الفيديو */
  const [videoUrl,     setVideoUrl]     = useState('')
  const [videoId,      setVideoId]      = useState<string | null>(null)
  const [videoTitle,   setVideoTitle]   = useState('')
  const [fetchingMeta, setFetchingMeta] = useState(false)
  const [generatingAI, setGeneratingAI] = useState(false)

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

  /* ── إضافة ملفات للقائمة ── */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const newOnes: Attachment[] = files.map(f => ({
      kind:    'file',
      title:   f.name,
      file:    f,
      preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
    }))
    setAttachments(prev => {
      const merged = [...prev, ...newOnes]
      if (!name && merged.length > 0) setName(merged[0].title.replace(/\.[^.]+$/, ''))
      return merged
    })
    e.target.value = ''   // السماح بإعادة اختيار نفس الملف
  }

  /* ── أداة الفيديو: جلب العنوان من oEmbed ── */
  const handleVideoUrlChange = async (url: string) => {
    setVideoUrl(url)
    const id = extractYouTubeId(url)
    setVideoId(id)
    setVideoTitle('')
    if (id) {
      setFetchingMeta(true)
      try {
        const res = await fetch(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`
        )
        if (res.ok) {
          const data = await res.json()
          setVideoTitle(data.title || '')
        }
      } catch { /* الشبكة أو CORS */ }
      setFetchingMeta(false)
    }
  }

  /* ── إضافة الفيديو الحالي للقائمة ── */
  const addVideo = () => {
    if (!videoId) return
    const title = videoTitle || `فيديو يوتيوب`
    setAttachments(prev => {
      const merged: Attachment[] = [...prev, { kind: 'video', title, videoUrl, videoId }]
      if (!name) setName(title)
      return merged
    })
    setVideoUrl(''); setVideoId(null); setVideoTitle('')
  }

  const removeAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx))
  }

  /* ── اقتراح الاسم والوصف بالذكاء الاصطناعي من أول فيديو ── */
  const generateAI = async () => {
    const firstVideo = attachments.find(a => a.kind === 'video')
    const sourceTitle = firstVideo?.title || name
    if (!sourceTitle) return
    setGeneratingAI(true)
    try {
      const res = await fetch('/api/ai/evidence-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoTitle: sourceTitle, videoUrl: firstVideo?.videoUrl || '' }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.name)        setName(data.name)
        if (data.description) setDescription(data.description)
      }
    } catch { /* نتجاهل */ }
    setGeneratingAI(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (attachments.length === 0) { setError('أضف ملفاً أو فيديو واحداً على الأقل'); return }
    if (!name.trim())             { setError('اسم الدليل مطلوب'); return }

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

      /* رفع كل الملفات + بناء صفوف evidence_files */
      const fileRows: {
        name: string; file_url: string; file_type: string | null
        file_size: number; video_url: string | null; order_num: number
      }[] = []

      for (let i = 0; i < attachments.length; i++) {
        const att = attachments[i]
        if (att.kind === 'video') {
          fileRows.push({
            name:      att.title,
            file_url:  `https://img.youtube.com/vi/${att.videoId}/maxresdefault.jpg`,
            file_type: 'video/youtube',
            file_size: 0,
            video_url: att.videoUrl || null,
            order_num: i + 1,
          })
        } else if (att.file) {
          const ext      = att.file.name.split('.').pop()
          const filePath = `evidence/${taskId}/${Date.now()}-${i}.${ext}`
          const { error: upErr } = await supabase.storage
            .from('evidence').upload(filePath, att.file, { upsert: false })
          if (upErr) throw upErr
          const { data: urlData } = supabase.storage.from('evidence').getPublicUrl(filePath)
          fileRows.push({
            name:      att.title,
            file_url:  urlData.publicUrl,
            file_type: att.file.type,
            file_size: att.file.size,
            video_url: null,
            order_num: i + 1,
          })
        }
      }

      /* الملف الأساسي (الأول) — يُخزَّن في صف الدليل للتوافق مع العروض القديمة */
      const primary = fileRows[0]

      const { data: evRow, error: insertError } = await supabase
        .from('evidence')
        .insert({
          task_id:         taskId,
          name:            name.trim(),
          description:     description.trim() || null,
          file_url:        primary.file_url,
          file_type:       primary.file_type,
          file_size:       primary.file_size,
          video_url:       primary.video_url,
          evidence_number: evNum,
        })
        .select('id')
        .single()

      if (insertError) throw insertError

      /* إدراج كل المرفقات في evidence_files */
      const { error: filesError } = await supabase
        .from('evidence_files')
        .insert(fileRows.map(r => ({ ...r, evidence_id: evRow.id })))
      if (filesError) throw filesError

      router.push(`/dashboard/tasks/${taskId}`)
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء الحفظ')
      setLoading(false)
    }
  }

  const hasVideo = attachments.some(a => a.kind === 'video')

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
          <p className="text-slate-500 text-sm mt-0.5">يمكن إضافة عدة ملفات وفيديوهات لدليل واحد</p>
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
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* ══ قائمة المرفقات المضافة ══ */}
          {attachments.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <p className="text-sm font-semibold text-slate-700 mb-3">
                المرفقات <span className="text-xs font-normal text-slate-400">({attachments.length})</span>
              </p>
              <div className="space-y-2">
                {attachments.map((att, idx) => (
                  <div key={idx} className={`flex items-center gap-3 p-2.5 rounded-xl border ${
                    att.kind === 'video' ? 'border-red-100 bg-red-50/40' : 'border-slate-100 bg-slate-50'
                  }`}>
                    {/* معاينة */}
                    {att.kind === 'video' ? (
                      <div className="relative w-12 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-slate-200">
                        <img src={`https://img.youtube.com/vi/${att.videoId}/mqdefault.jpg`} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <span className="text-white text-[10px]">▶</span>
                        </div>
                      </div>
                    ) : att.preview ? (
                      <img src={att.preview} alt="" className="w-12 h-9 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <span className="text-2xl flex-shrink-0 w-12 text-center">
                        {att.file?.type === 'application/pdf' ? '📄' : '📎'}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{att.title}</p>
                      <p className="text-xs text-slate-400">
                        {att.kind === 'video' ? '🎬 فيديو يوتيوب' : `${((att.file?.size || 0) / 1024).toFixed(0)} KB`}
                        {idx === 0 && <span className="text-violet-500 mr-2">• أساسي</span>}
                      </p>
                    </div>
                    <button type="button" onClick={() => removeAttachment(idx)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ أداة الإضافة ══ */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-slate-200">
              <button type="button" onClick={() => setMode('file')}
                className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold transition-colors ${
                  mode === 'file' ? 'bg-violet-50 text-violet-700 border-b-2 border-violet-600'
                                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
                <FolderOpen size={16} /> رفع ملف
              </button>
              <button type="button" onClick={() => setMode('video')}
                className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold transition-colors ${
                  mode === 'video' ? 'bg-red-50 text-red-600 border-b-2 border-red-500'
                                   : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
                <PlayCircle size={16} /> فيديو يوتيوب
              </button>
            </div>

            <div className="p-5">
              {/* وضع الملف */}
              {mode === 'file' && (
                <div
                  className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-violet-300 hover:bg-violet-50 transition-all cursor-pointer"
                  onClick={() => document.getElementById('file-input')?.click()}>
                  <div className="flex flex-col items-center gap-2">
                    <FolderOpen size={40} style={{ color: 'var(--maroon-300)', margin: '0 auto' }} />
                    <p className="text-sm text-slate-500">اضغط لاختيار ملف (يمكن اختيار عدة ملفات)</p>
                    <p className="text-xs text-slate-400">PDF، صور، Word، Excel</p>
                  </div>
                  <input id="file-input" type="file" multiple onChange={handleFileChange} className="hidden"
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" />
                </div>
              )}

              {/* وضع الفيديو */}
              {mode === 'video' && (
                <div className="space-y-3">
                  <div className="relative">
                    <PlayCircle size={18} className="absolute right-3 top-3.5" style={{ color: '#ef4444' }} />
                    <input type="url" value={videoUrl} onChange={e => handleVideoUrlChange(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..." dir="ltr"
                      className="w-full pr-10 pl-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-300 bg-slate-50 text-slate-800 font-latin text-sm" />
                    {fetchingMeta && <Loader2 size={16} className="absolute left-3 top-3.5 text-slate-400 animate-spin" />}
                  </div>

                  {videoId && (
                    <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-100">
                      <img src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`} alt="معاينة" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <div className="w-14 h-14 bg-red-600 rounded-full flex items-center justify-center shadow-lg">
                          <span className="text-white text-2xl mr-[-3px]">▶</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {videoTitle && <p className="text-xs text-slate-500 truncate">📺 {videoTitle}</p>}
                  {videoUrl && !videoId && <p className="text-xs text-red-500">رابط غير صحيح — يجب أن يكون رابط يوتيوب</p>}

                  <button type="button" onClick={addVideo} disabled={!videoId}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold disabled:opacity-50 transition-colors">
                    <Plus size={16} /> أضف الفيديو للقائمة
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ══ بيانات الدليل ══ */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                اسم الدليل <span className="text-red-500">*</span>
              </label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required
                placeholder="مثال: تقرير نتائج الاختبار الشهري"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-slate-50 text-slate-800" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-slate-700">الوصف (اختياري)</label>
                {hasVideo && (
                  <button type="button" onClick={generateAI} disabled={generatingAI}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-50 transition-colors font-medium">
                    <span className="inline-flex">{generatingAI ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}</span>
                    <span>{generatingAI ? 'جارٍ التوليد...' : '✨ اقتراح بالذكاء الاصطناعي'}</span>
                  </button>
                )}
              </div>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                placeholder="ملاحظات إضافية عن هذا الدليل..."
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-slate-50 text-slate-800 resize-none" />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
            )}

            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={loading || attachments.length === 0}
                className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60 shadow-lg shadow-violet-200">
                {loading ? 'جارٍ الحفظ...' : `📎 حفظ الدليل (${attachments.length} مرفق)`}
              </button>
              <button type="button" onClick={() => router.back()}
                className="px-6 py-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                إلغاء
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  )
}

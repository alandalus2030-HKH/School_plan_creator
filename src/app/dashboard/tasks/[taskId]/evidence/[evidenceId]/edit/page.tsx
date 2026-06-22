'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import { FolderOpen, Lock, PlayCircle, Loader2, X, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import ConfirmDialog from '@/components/ConfirmDialog'

function extractYouTubeId(url: string): string | null {
  const pattern = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([^&\n?#]+)/
  const match = url.match(pattern)
  return match ? match[1] : null
}

/** مرفق جديد سيُضاف */
type NewAttachment = {
  kind: 'file' | 'video'
  title: string
  file?: File
  preview?: string | null
  videoUrl?: string
  videoId?: string
}

export default function EditEvidencePage() {
  const router     = useRouter()
  const params     = useParams()
  const taskId     = params.taskId as string
  const evidenceId = params.evidenceId as string
  const supabase   = createClient()

  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')
  const [taskLocked, setTaskLocked] = useState(false)
  const [underReview, setUnderReview] = useState(false)

  /* بيانات الدليل */
  const [name,        setName]        = useState('')
  const [description, setDescription] = useState('')
  const [evStatus,    setEvStatus]    = useState<string>('')
  const [reviewNote,  setReviewNote]  = useState<string | null>(null)

  /* نوع الدليل (تصنيف) + الأنواع المطلوبة للمهمة */
  const [evidenceType,  setEvidenceType]  = useState('')
  const [typeOptions,   setTypeOptions]   = useState<string[]>([])
  const [requiredTypes, setRequiredTypes] = useState<string[]>([])

  /* تأكيد حذف مرفق */
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)

  /* المرفقات الحالية + المحذوفة + الجديدة */
  const [existing,   setExisting]   = useState<any[]>([])
  const [removedIds, setRemovedIds] = useState<string[]>([])
  const [newItems,   setNewItems]   = useState<NewAttachment[]>([])

  /* أداة إضافة الفيديو */
  const [mode,         setMode]         = useState<'file' | 'video'>('file')
  const [videoUrl,     setVideoUrl]     = useState('')
  const [videoId,      setVideoId]      = useState<string | null>(null)
  const [videoTitle,   setVideoTitle]   = useState('')
  const [fetchingMeta, setFetchingMeta] = useState(false)

  useEffect(() => {
    ;(async () => {
      /* قفل المهمة المنجزة + الأنواع المطلوبة + قائمة أنواع الأدلة */
      const [{ data: t }, { data: opts }] = await Promise.all([
        supabase.from('tasks').select('status, required_evidence_types').eq('id', taskId).single(),
        supabase.from('dropdown_options').select('value').eq('category', 'evidence_type').eq('is_active', true).order('sort_order'),
      ])
      if (t?.status === 'completed') setTaskLocked(true)
      if (t?.status === 'submitted') { setTaskLocked(true); setUnderReview(true) }
      if (Array.isArray(t?.required_evidence_types)) setRequiredTypes(t.required_evidence_types)
      setTypeOptions((opts || []).map((o: any) => o.value))

      const { data } = await supabase
        .from('evidence')
        .select('id, name, description, status, review_note, evidence_type, evidence_files ( id, name, file_url, file_type, file_size, video_url, order_num )')
        .eq('id', evidenceId)
        .single()
      if (data) {
        setName(data.name || '')
        setDescription(data.description || '')
        setEvStatus(data.status || '')
        setReviewNote(data.review_note || null)
        setEvidenceType(data.evidence_type || '')
        const files = (data.evidence_files || []).sort((a: any, b: any) => (a.order_num || 0) - (b.order_num || 0))
        setExisting(files)
      }
      setLoading(false)
    })()
  }, [taskId, evidenceId])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setNewItems(prev => [...prev, ...files.map(f => ({
      kind: 'file' as const, title: f.name, file: f,
      preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
    }))])
    e.target.value = ''
  }

  const handleVideoUrlChange = async (url: string) => {
    setVideoUrl(url)
    const id = extractYouTubeId(url)
    setVideoId(id)
    setVideoTitle('')
    if (id) {
      setFetchingMeta(true)
      try {
        const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`)
        if (res.ok) { const d = await res.json(); setVideoTitle(d.title || '') }
      } catch { /* */ }
      setFetchingMeta(false)
    }
  }

  const addVideo = () => {
    if (!videoId) return
    setNewItems(prev => [...prev, { kind: 'video', title: videoTitle || 'فيديو يوتيوب', videoUrl, videoId }])
    setVideoUrl(''); setVideoId(null); setVideoTitle('')
  }

  const removeExisting = (id: string) => setRemovedIds(prev => [...prev, id])
  const undoRemove     = (id: string) => setRemovedIds(prev => prev.filter(x => x !== id))
  const removeNew      = (idx: number) => setNewItems(prev => prev.filter((_, i) => i !== idx))

  const remainingExisting = existing.filter(f => !removedIds.includes(f.id))
  const totalCount = remainingExisting.length + newItems.length

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim())     { setError('اسم الدليل مطلوب'); return }
    if (totalCount === 0) { setError('يجب أن يبقى مرفق واحد على الأقل'); return }
    if (requiredTypes.length > 0 && !evidenceType) {
      setError('حدّد نوع الدليل من القائمة — هذه المهمة تتطلب أنواعاً محددة من الأدلة'); return
    }

    setSaving(true)
    setError('')
    try {
      /* 1) تحديث بيانات الدليل — الدليل المرفوض يعود تلقائياً لـ«قيد المراجعة» بعد
         تعديله (نمط راجِع وأعِد التقديم)، مع إبقاء سبب الرفض كإرشاد (review_note). */
      const { error: upErr } = await supabase.from('evidence')
        .update({
          name: name.trim(),
          description: description.trim() || null,
          evidence_type: evidenceType || null,
          ...(evStatus === 'rejected' ? { status: 'pending' } : {}),
        })
        .eq('id', evidenceId)
      if (upErr) throw upErr

      /* 2) حذف المرفقات المُزالة */
      if (removedIds.length > 0) {
        const { error: delErr } = await supabase.from('evidence_files').delete().in('id', removedIds)
        if (delErr) throw delErr
      }

      /* 3) رفع وإدراج المرفقات الجديدة */
      const inserted: any[] = []
      for (let i = 0; i < newItems.length; i++) {
        const att = newItems[i]
        if (att.kind === 'video') {
          inserted.push({
            evidence_id: evidenceId, name: att.title,
            file_url: `https://img.youtube.com/vi/${att.videoId}/maxresdefault.jpg`,
            file_type: 'video/youtube', file_size: 0, video_url: att.videoUrl || null,
          })
        } else if (att.file) {
          const ext = att.file.name.split('.').pop()
          const filePath = `evidence/${taskId}/${Date.now()}-${i}.${ext}`
          const { error: sErr } = await supabase.storage.from('evidence').upload(filePath, att.file, { upsert: false })
          if (sErr) throw sErr
          const { data: urlData } = supabase.storage.from('evidence').getPublicUrl(filePath)
          inserted.push({
            evidence_id: evidenceId, name: att.title,
            file_url: urlData.publicUrl, file_type: att.file.type, file_size: att.file.size, video_url: null,
          })
        }
      }
      if (inserted.length > 0) {
        const { error: insErr } = await supabase.from('evidence_files').insert(inserted)
        if (insErr) throw insErr
      }

      /* 4) إعادة ترقيم order_num + مزامنة الملف الأساسي على صف الدليل */
      const { data: allFiles } = await supabase
        .from('evidence_files').select('id, file_url, file_type, file_size, video_url, created_at, order_num')
        .eq('evidence_id', evidenceId)
        .order('order_num', { ascending: true }).order('created_at', { ascending: true })

      if (allFiles && allFiles.length > 0) {
        await Promise.all(allFiles.map((f: any, idx: number) =>
          supabase.from('evidence_files').update({ order_num: idx + 1 }).eq('id', f.id)
        ))
        const primary = allFiles[0]
        await supabase.from('evidence').update({
          file_url:  primary.file_url,
          file_type: primary.file_type,
          file_size: primary.file_size || 0,
          video_url: primary.video_url,
        }).eq('id', evidenceId)
      }

      router.push(`/dashboard/tasks/${taskId}`)
    } catch (err: any) {
      setError(err.message || 'تعذّر حفظ التعديلات')
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/dashboard/tasks/${taskId}`}
          className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-400 hover:text-violet-600 hover:border-violet-300 transition-colors">
          ←
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-slate-800">تعديل الدليل</h2>
          <p className="text-slate-500 text-sm mt-0.5">إعادة التسمية، حذف مرفق، أو إضافة مرفقات</p>
        </div>
      </div>

      {taskLocked ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
          <Lock size={36} className="mx-auto mb-3" style={{ color: 'var(--maroon-300)' }} />
          <p className="text-sm font-semibold text-slate-700 mb-1">{underReview ? 'المهمة مرفوعة للتقييم — الأدلة مقفلة' : 'المهمة منجزة ومقفلة'}</p>
          <p className="text-xs text-slate-400 mb-4">{underReview ? 'لا يمكن تعديل الأدلة أثناء المراجعة — أعِد المهمة للتعديل أولاً.' : 'لا يمكن تعديل أدلة مهمة معتمدة — اطلب إعادة فتحها أولاً.'}</p>
          <Link href={`/dashboard/tasks/${taskId}`} className="inline-block px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700">
            ← العودة للمهمة
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-5">

          {/* إرشاد: سبب الرفض السابق + توضيح أن الدليل سيعود لقيد المراجعة بعد الحفظ */}
          {evStatus === 'rejected' && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm">
              <p className="font-semibold text-red-700 mb-1">✕ هذا الدليل مرفوض</p>
              {reviewNote && <p className="text-red-700 mb-1"><span className="font-medium">سبب الرفض:</span> {reviewNote}</p>}
              <p className="text-red-600/80 text-xs">عالِج الملاحظة (احذف/أضف مرفقات)، وعند الحفظ ستعود حالة الدليل تلقائياً إلى «قيد المراجعة» لإعادة تقييمه.</p>
            </div>
          )}
          {evStatus === 'pending' && reviewNote && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm">
              <p className="text-amber-700"><span className="font-medium">↩️ ملاحظة المراجع السابقة:</span> {reviewNote}</p>
            </div>
          )}

          {/* المرفقات الحالية */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <p className="text-sm font-semibold text-slate-700 mb-3">المرفقات الحالية ({remainingExisting.length})</p>
            <div className="space-y-2">
              {existing.map((f: any) => {
                const removed = removedIds.includes(f.id)
                const isVid = f.file_type === 'video/youtube'
                return (
                  <div key={f.id} className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${
                    removed ? 'border-red-200 bg-red-50 opacity-60' : isVid ? 'border-red-100 bg-red-50/40' : 'border-slate-100 bg-slate-50'}`}>
                    {isVid && f.file_url ? (
                      <span className="relative w-12 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-slate-200">
                        <img src={f.file_url} alt="" className="w-full h-full object-cover" />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white text-[10px]">▶</span>
                      </span>
                    ) : (
                      <span className="text-2xl w-12 text-center flex-shrink-0">
                        {f.file_type?.startsWith('image') ? '🖼️' : f.file_type === 'application/pdf' ? '📄' : '📎'}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${removed ? 'line-through text-slate-400' : 'text-slate-700'}`}>{f.name}</p>
                      {removed && <p className="text-xs text-red-500">سيُحذف عند الحفظ</p>}
                    </div>
                    {removed ? (
                      <button type="button" onClick={() => undoRemove(f.id)} className="text-xs px-2.5 py-1.5 border border-slate-200 text-slate-500 rounded-lg">تراجع</button>
                    ) : (
                      <button type="button" onClick={() => setConfirmRemoveId(f.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="حذف المرفق">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                )
              })}

              {/* مرفقات جديدة */}
              {newItems.map((att, idx) => (
                <div key={`new-${idx}`} className={`flex items-center gap-3 p-2.5 rounded-xl border-2 border-dashed ${att.kind === 'video' ? 'border-red-200 bg-red-50/40' : 'border-violet-200 bg-violet-50/40'}`}>
                  {att.kind === 'video' ? (
                    <span className="relative w-12 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-slate-200">
                      <img src={`https://img.youtube.com/vi/${att.videoId}/mqdefault.jpg`} alt="" className="w-full h-full object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white text-[10px]">▶</span>
                    </span>
                  ) : att.preview ? (
                    <img src={att.preview} alt="" className="w-12 h-9 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <span className="text-2xl w-12 text-center flex-shrink-0">{att.file?.type === 'application/pdf' ? '📄' : '📎'}</span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{att.title}</p>
                    <p className="text-xs text-violet-500">جديد — سيُضاف عند الحفظ</p>
                  </div>
                  <button type="button" onClick={() => removeNew(idx)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* أداة إضافة مرفقات */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex border-b border-slate-200">
              <button type="button" onClick={() => setMode('file')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors ${mode === 'file' ? 'bg-violet-50 text-violet-700 border-b-2 border-violet-600' : 'text-slate-500 hover:bg-slate-50'}`}>
                <FolderOpen size={16} /> إضافة ملف
              </button>
              <button type="button" onClick={() => setMode('video')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors ${mode === 'video' ? 'bg-red-50 text-red-600 border-b-2 border-red-500' : 'text-slate-500 hover:bg-slate-50'}`}>
                <PlayCircle size={16} /> إضافة فيديو
              </button>
            </div>
            <div className="p-5">
              {mode === 'file' ? (
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-violet-300 hover:bg-violet-50 transition-all cursor-pointer"
                  onClick={() => document.getElementById('edit-file-input')?.click()}>
                  <FolderOpen size={32} style={{ color: 'var(--maroon-300)', margin: '0 auto' }} />
                  <p className="text-sm text-slate-500 mt-2">اضغط لاختيار ملف (يمكن اختيار عدة ملفات)</p>
                  <input id="edit-file-input" type="file" multiple onChange={handleFileChange} className="hidden"
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative">
                    <PlayCircle size={18} className="absolute right-3 top-3.5" style={{ color: '#ef4444' }} />
                    <input type="url" value={videoUrl} onChange={e => handleVideoUrlChange(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..." dir="ltr"
                      className="w-full pr-10 pl-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-300 bg-slate-50 text-slate-800 font-latin text-sm" />
                    {fetchingMeta && <Loader2 size={16} className="absolute left-3 top-3.5 text-slate-400 animate-spin" />}
                  </div>
                  {videoTitle && <p className="text-xs text-slate-500 truncate">📺 {videoTitle}</p>}
                  <button type="button" onClick={addVideo} disabled={!videoId}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold disabled:opacity-50">
                    <Plus size={16} /> أضف الفيديو
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* بيانات الدليل */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">اسم الدليل <span className="text-red-500">*</span></label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-slate-50 text-slate-800" />
            </div>

            {/* نوع الدليل (تصنيف) */}
            {typeOptions.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  نوع الدليل {requiredTypes.length > 0
                    ? <span className="text-red-500">* <span className="text-slate-400 font-normal text-xs">(مطلوب لهذه المهمة: {requiredTypes.join('، ')})</span></span>
                    : null}
                </label>
                <select value={evidenceType} onChange={e => setEvidenceType(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-slate-50 text-slate-800">
                  <option value="">{requiredTypes.length > 0 ? '— اختر نوع الدليل —' : '— بدون تصنيف —'}</option>
                  {typeOptions.map(t => <option key={t} value={t}>{t}{requiredTypes.includes(t) ? ' ⭐' : ''}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">الوصف (اختياري)</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-slate-50 text-slate-800 resize-none" />
            </div>

            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}

            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={saving || totalCount === 0}
                className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60 shadow-lg shadow-violet-200">
                {saving ? 'جارٍ الحفظ...' : `💾 حفظ التعديلات (${totalCount} مرفق)`}
              </button>
              <button type="button" onClick={() => router.back()}
                className="px-6 py-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">إلغاء</button>
            </div>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={!!confirmRemoveId}
        title="حذف المرفق"
        icon="🗑️"
        message={<>سيُحذف المرفق «<strong>{existing.find(f => f.id === confirmRemoveId)?.name || ''}</strong>» عند حفظ التعديلات. يمكنك التراجع قبل الحفظ.</>}
        confirmLabel="نعم، احذف"
        onConfirm={() => { if (confirmRemoveId) removeExisting(confirmRemoveId); setConfirmRemoveId(null) }}
        onCancel={() => setConfirmRemoveId(null)}
      />
    </div>
  )
}

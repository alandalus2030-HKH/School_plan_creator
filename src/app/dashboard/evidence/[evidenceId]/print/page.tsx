'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Printer, ArrowRight } from 'lucide-react'

export default function EvidencePrintPage() {
  const params      = useParams()
  const evidenceId  = params.evidenceId as string
  const supabase    = createClient()

  const [ev,       setEv]       = useState<any>(null)
  const [taskNum,  setTaskNum]  = useState<string | null>(null)
  const [planName, setPlanName] = useState<string | null>(null)
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('evidence')
        .select(`
          id, name, description, evidence_number, file_url, video_url, file_type, created_at,
          task:tasks (
            id, name_ar, order_num, node_id
          )
        `)
        .eq('id', evidenceId)
        .single()

      if (!data) { setLoading(false); return }
      setEv(data)

      /* بناء رقم المهمة ومسار الخطة */
      const task = data.task as any
      if (task?.node_id) {
        const { data: node } = await supabase
          .from('plan_nodes').select('plan_id').eq('id', task.node_id).single()
        if (node?.plan_id) {
          const [{ data: allNodes }, { data: plan }] = await Promise.all([
            supabase.from('plan_nodes')
              .select('id, parent_id, order_num, standard_code')
              .eq('plan_id', node.plan_id),
            supabase.from('plans').select('name_ar').eq('id', node.plan_id).single(),
          ])
          if (plan) setPlanName(plan.name_ar)
          if (allNodes) {
            const chain: { order_num: number; standard_code: string | null }[] = []
            let current = allNodes.find((n: any) => n.id === task.node_id)
            while (current) {
              chain.unshift({ order_num: current.order_num, standard_code: (current as any).standard_code || null })
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
            path.push(task.order_num)
            setTaskNum(path.join('.'))
          }
        }
      }
      setLoading(false)
    })()
  }, [evidenceId])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full" />
    </div>
  )
  if (!ev) return <p className="text-center text-slate-400 mt-12">الدليل غير موجود</p>

  const task      = ev.task as any
  const isVideo   = ev.file_type === 'video/youtube'
  const qrUrl     = isVideo && ev.video_url
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(ev.video_url)}&margin=10`
    : null

  return (
    <div className="max-w-2xl mx-auto">

      {/* أزرار التحكم — تختفي عند الطباعة */}
      <div className="print:hidden flex items-center gap-3 mb-6">
        <Link href={`/dashboard/tasks/${task?.id}`}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-violet-600 transition-colors">
          <ArrowRight size={16} /> العودة للمهمة
        </Link>
        <div className="flex-1" />
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold hover:brightness-110 transition-all shadow-lg shadow-violet-200"
          style={{ background: 'var(--gradient-button)' }}>
          <Printer size={16} /> طباعة
        </button>
      </div>

      {/* البطاقة القابلة للطباعة */}
      <div className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden print:rounded-none print:border-black print:border shadow-sm">

        {/* رأس البطاقة */}
        <div className="bg-gradient-to-l from-violet-700 to-indigo-800 text-white p-6 text-center print:bg-none print:bg-slate-800">
          <p className="text-sm opacity-75 mb-1">بطاقة دليل إثبات</p>
          <p className="text-4xl font-mono font-bold tracking-wider">{ev.evidence_number}</p>
          {planName && <p className="text-sm opacity-60 mt-2">{planName}</p>}
        </div>

        <div className="p-6 space-y-6">

          {/* الصورة المصغّرة + QR جنبًا لجنب */}
          {isVideo && ev.file_url && (
            <div className="grid grid-cols-2 gap-4 items-start">
              {/* صورة الفيديو مع ▶ */}
              <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-100 shadow-sm">
                <img src={ev.file_url} alt={ev.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-xl mr-[-2px]">▶</span>
                  </div>
                </div>
              </div>

              {/* QR Code */}
              {qrUrl && (
                <div className="flex flex-col items-center gap-2 py-2">
                  <img src={qrUrl} alt="QR Code" className="w-36 h-36 rounded-xl border border-slate-200" />
                  <p className="text-xs text-slate-500 text-center">امسح لمشاهدة الفيديو</p>
                  <p className="text-[10px] text-slate-400 text-center font-latin break-all leading-relaxed">
                    {ev.video_url}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* معلومات الدليل */}
          <div className="space-y-3">
            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
              <div>
                <p className="text-xs font-semibold text-slate-400 mb-0.5">اسم الدليل</p>
                <p className="text-base font-bold text-slate-800">{ev.name}</p>
              </div>
              {ev.description && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 mb-0.5">الوصف</p>
                  <p className="text-sm text-slate-700 leading-relaxed">{ev.description}</p>
                </div>
              )}
            </div>

            {/* معلومات المهمة */}
            {task && (
              <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 space-y-1.5">
                <p className="text-xs font-semibold text-violet-400">مرتبط بالمهمة</p>
                <div className="flex items-center gap-2">
                  {taskNum && (
                    <span className="font-mono text-sm font-bold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-lg">
                      {taskNum}
                    </span>
                  )}
                  <p className="text-sm font-semibold text-violet-800">{task.name_ar}</p>
                </div>
              </div>
            )}

            {/* التاريخ */}
            <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-100">
              <span>تاريخ الإضافة: {new Date(ev.created_at).toLocaleDateString('ar-QA', {
                year: 'numeric', month: 'long', day: 'numeric'
              })}</span>
              <span className="font-mono">{ev.evidence_number}</span>
            </div>
          </div>
        </div>
      </div>

      {/* CSS طباعة مضمّن */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .printable, .printable * { visibility: visible; }
          header, nav, aside, footer { display: none !important; }
          @page { margin: 1cm; }
        }
      `}</style>
    </div>
  )
}

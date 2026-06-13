'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Printer, ArrowRight } from 'lucide-react'

/** عنصر في التسلسل الهرمي للغلاف */
type CrumbEntry = { label: string; number: string; name: string }

export default function EvidencePrintPage() {
  const params     = useParams()
  const evidenceId = params.evidenceId as string
  const supabase   = createClient()

  const [ev,       setEv]       = useState<any>(null)
  const [task,     setTask]     = useState<any>(null)
  const [taskNum,  setTaskNum]  = useState<string | null>(null)
  const [planName, setPlanName] = useState<string | null>(null)
  const [school,   setSchool]   = useState<{ name_ar: string; logo_url: string | null } | null>(null)
  const [crumbs,   setCrumbs]   = useState<CrumbEntry[]>([])
  const [loading,  setLoading]  = useState(true)
  /* اتجاه كل مرفق صورة: 'l' أفقي | 'p' رأسي (يُكتشف عند تحميل الصورة) */
  const [orient,   setOrient]   = useState<Record<string, 'l' | 'p'>>({})

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('evidence')
        .select(`
          id, name, description, evidence_number, file_url, video_url, file_type, created_at,
          evidence_files ( id, name, file_url, file_type, file_size, video_url, order_num ),
          task:tasks ( id, name_ar, order_num, node_id )
        `)
        .eq('id', evidenceId)
        .single()

      if (!data) { setLoading(false); return }
      setEv(data)
      const t = data.task as any
      setTask(t)

      if (t?.node_id) {
        const { data: node } = await supabase
          .from('plan_nodes').select('plan_id').eq('id', t.node_id).single()
        if (node?.plan_id) {
          const [{ data: allNodes }, { data: plan }] = await Promise.all([
            supabase.from('plan_nodes')
              .select('id, parent_id, order_num, standard_code, level_num, name_ar')
              .eq('plan_id', node.plan_id),
            supabase.from('plans').select('name_ar, level_names, school_id').eq('id', node.plan_id).single(),
          ])
          if (plan) {
            setPlanName(plan.name_ar)
            /* المدرسة (الاسم + الشعار) */
            if (plan.school_id) {
              const { data: sch } = await supabase
                .from('schools').select('name_ar, logo_url').eq('id', plan.school_id).single()
              if (sch) setSchool(sch)
            }
            const levelNames: string[] = Array.isArray(plan.level_names) ? plan.level_names : []

            if (allNodes) {
              /* سلسلة العقد من الجذر حتى عقدة المهمة */
              const chain: any[] = []
              let current = allNodes.find((n: any) => n.id === t.node_id)
              while (current) {
                chain.unshift(current)
                current = allNodes.find((n: any) => n.id === current!.parent_id)
              }

              /* رقم كل عقدة في السلسلة */
              let baseIdx = -1
              for (let i = chain.length - 1; i >= 0; i--) {
                if (chain[i].standard_code) { baseIdx = i; break }
              }
              const numbers: string[] = []
              if (baseIdx >= 0) {
                const code  = chain[baseIdx].standard_code as string
                const parts = code.split('.')
                for (let j = 0; j < chain.length; j++) {
                  if (j < baseIdx) {
                    numbers[j] = parts.length === baseIdx + 1 ? parts.slice(0, j + 1).join('.') : ''
                  } else if (j === baseIdx) {
                    numbers[j] = code
                  } else {
                    numbers[j] = code + '.' + chain.slice(baseIdx + 1, j + 1).map((n: any) => n.order_num).join('.')
                  }
                }
              } else {
                for (let j = 0; j < chain.length; j++) {
                  numbers[j] = chain.slice(0, j + 1).map((n: any) => n.order_num).join('.')
                }
              }

              /* بناء عناصر التسلسل الهرمي */
              const entries: CrumbEntry[] = chain.map((n: any, j: number) => ({
                label:  levelNames[n.level_num - 1] || `المستوى ${n.level_num}`,
                number: numbers[j] || '—',
                name:   n.name_ar,
              }))
              setCrumbs(entries)

              /* رقم المهمة = رقم آخر عقدة + ترتيب المهمة */
              const lastNum = numbers[numbers.length - 1]
              setTaskNum(lastNum ? `${lastNum}.${t.order_num}` : null)
            }
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

  /* الملفات — من evidence_files مع احتياط للصف القديم */
  const files: any[] = (ev.evidence_files && ev.evidence_files.length > 0)
    ? [...ev.evidence_files].sort((a, b) => (a.order_num || 0) - (b.order_num || 0))
    : [{ id: ev.id, name: ev.name, file_url: ev.file_url, file_type: ev.file_type, video_url: ev.video_url, order_num: 1 }]

  const qrFor = (url: string) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}&margin=10`

  return (
    <div className="max-w-3xl mx-auto">

      {/* أزرار التحكم — تختفي عند الطباعة */}
      <div className="print:hidden flex items-center gap-3 mb-6">
        <Link href={`/dashboard/tasks/${task?.id}`}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-violet-600 transition-colors">
          <ArrowRight size={16} /> العودة للمهمة
        </Link>
        <div className="flex-1" />
        <button onClick={() => window.print()}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold hover:brightness-110 transition-all shadow-lg shadow-violet-200"
          style={{ background: 'var(--gradient-button)' }}>
          <Printer size={16} /> طباعة
        </button>
      </div>

      <div id="print-root">

      {/* ════════ صفحة الغلاف ════════ */}
      <div id="cover" className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm print:rounded-none print:border-0 print:shadow-none">

        {/* رأس: المدرسة + الشعار */}
        <div className="flex items-center gap-4 p-6 border-b-2" style={{ borderColor: 'var(--maroon-600, #8a1538)' }}>
          {school?.logo_url ? (
            <img src={school.logo_url} alt="شعار المدرسة" className="w-20 h-20 object-contain flex-shrink-0" />
          ) : (
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-white text-3xl font-bold flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#6f1029,#a83356)' }}>
              {(school?.name_ar || 'م')[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-slate-800">{school?.name_ar || 'المدرسة'}</h1>
            {planName && <p className="text-sm text-slate-500 mt-1">خطة: {planName}</p>}
          </div>
        </div>

        {/* التسلسل الهرمي */}
        <div className="p-6 space-y-2.5">
          {crumbs.map((c, i) => (
            <div key={i} className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0">
              <span className="text-xs font-semibold text-slate-400 w-28 flex-shrink-0 pt-0.5">{c.label}</span>
              <span className="font-mono text-sm font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-lg flex-shrink-0">{c.number}</span>
              <span className="text-sm text-slate-700 flex-1">{c.name}</span>
            </div>
          ))}
          {/* المهمة */}
          {task && (
            <div className="flex items-start gap-3 py-2 border-b border-slate-100">
              <span className="text-xs font-semibold text-slate-400 w-28 flex-shrink-0 pt-0.5">المهمة</span>
              {taskNum && <span className="font-mono text-sm font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-lg flex-shrink-0">{taskNum}</span>}
              <span className="text-sm text-slate-700 flex-1">{task.name_ar}</span>
            </div>
          )}
        </div>

        {/* ── رقم الدليل المميَّز ── */}
        <div className="mx-6 mb-8 mt-2 rounded-2xl border-2 p-6 text-center"
          style={{ borderColor: 'var(--maroon-600, #8a1538)', background: '#fbf2f4' }}>
          <p className="text-xs font-semibold text-slate-400 mb-2">الدليل</p>
          <p className="text-5xl font-mono font-bold tracking-wider mb-3" style={{ color: 'var(--maroon-700, #6f1029)' }}>
            {ev.evidence_number}
          </p>
          <p className="text-lg font-bold text-slate-800">{ev.name}</p>
          {files.length > 1 && (
            <p className="text-sm text-slate-500 mt-2">عدد المرفقات ({files.length})</p>
          )}
          {ev.description && <p className="text-sm text-slate-500 mt-2 leading-relaxed">{ev.description}</p>}
        </div>
      </div>

      {/* ════════ معاينة المرفقات ════════ */}
      {files.map((f: any, i: number) => {
        const isVid = f.file_type === 'video/youtube'
        const isImg = f.file_type?.startsWith('image')
        const isPdf = f.file_type === 'application/pdf'
        return (
          <div key={f.id} className={`attachment-page bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm print:rounded-none print:border-0 print:shadow-none print:mt-0 ${orient[f.id] === 'l' ? 'att-landscape' : ''}`}>
            {/* ترويسة المرفق */}
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
              <span className="font-mono text-sm font-bold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-lg">
                {ev.evidence_number}{files.length > 1 ? `.${i + 1}` : ''}
              </span>
              <span className="text-sm font-semibold text-slate-700 truncate">{f.name || (isVid ? 'فيديو' : 'مرفق')}</span>
            </div>

            {isVid && f.file_url ? (
              <div className="grid grid-cols-2 gap-4 items-start">
                <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-100 shadow-sm">
                  <img src={f.file_url} alt={f.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center">
                      <span className="text-white text-xl mr-[-2px]">▶</span>
                    </div>
                  </div>
                </div>
                {f.video_url && (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <img src={qrFor(f.video_url)} alt="QR" className="w-36 h-36 rounded-xl border border-slate-200" />
                    <p className="text-xs text-slate-500 text-center">امسح لمشاهدة الفيديو</p>
                    <p className="text-[10px] text-slate-400 text-center font-latin break-all leading-relaxed">{f.video_url}</p>
                  </div>
                )}
              </div>
            ) : isImg ? (
              <img src={f.file_url} alt={f.name}
                onLoad={e => {
                  const im = e.currentTarget
                  setOrient(o => ({ ...o, [f.id]: im.naturalWidth > im.naturalHeight ? 'l' : 'p' }))
                }}
                className="att-img mx-auto rounded-xl" />
            ) : isPdf ? (
              <>
                {/* معاينة على الشاشة — لا تظهر في الطباعة، لذا نوفّر بطاقة طباعة بديلة */}
                <object data={f.file_url} type="application/pdf" className="att-pdf w-full rounded-xl border border-slate-200 print:hidden" style={{ height: '70vh' }}>
                  <div className="flex flex-col items-center gap-3 p-8 text-center">
                    <span className="text-5xl">📄</span>
                    <p className="text-sm text-slate-600">تعذّرت المعاينة المدمجة</p>
                    <a href={f.file_url} target="_blank" rel="noopener noreferrer" className="text-violet-600 underline text-sm">فتح ملف PDF</a>
                  </div>
                </object>
                {/* بطاقة بديلة للطباعة (PDF لا يُطبع من داخل object) */}
                <div className="hidden print:flex items-center gap-5 bg-slate-50 rounded-xl p-5 border border-slate-200">
                  <span className="text-5xl flex-shrink-0">📄</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-slate-700 truncate">{f.name}</p>
                    <p className="text-xs text-slate-400 mb-1">ملف PDF — يُطبع من ملفه الأصلي. امسح الرمز لفتحه.</p>
                    <span className="text-xs text-slate-500 font-latin break-all">{f.file_url}</span>
                  </div>
                  <img src={qrFor(f.file_url)} alt="QR" className="w-28 h-28 rounded-xl border border-slate-200 flex-shrink-0" />
                </div>
              </>
            ) : (
              /* وورد/إكسل/غيره — بطاقة + QR للفتح (لا يدعمها المتصفح للمعاينة المباشرة) */
              <div className="flex items-center gap-5 bg-slate-50 rounded-xl p-5 border border-slate-200">
                <span className="text-5xl flex-shrink-0">
                  {f.file_type?.includes('word') || f.name?.match(/\.docx?$/i) ? '📝'
                    : f.file_type?.includes('sheet') || f.name?.match(/\.xlsx?$/i) ? '📊' : '📎'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-slate-700 truncate">{f.name}</p>
                  <p className="text-xs text-slate-400 mb-2">لا يدعم المتصفح معاينة هذا النوع — امسح الرمز أو افتح الرابط</p>
                  <a href={f.file_url} target="_blank" rel="noopener noreferrer" className="text-violet-600 underline text-sm font-latin break-all">فتح الملف</a>
                </div>
                <img src={qrFor(f.file_url)} alt="QR" className="w-28 h-28 rounded-xl border border-slate-200 flex-shrink-0" />
              </div>
            )}
          </div>
        )
      })}

      </div>{/* /print-root */}

      {/* CSS طباعة ذكية: المحتوى في التدفق الطبيعي (تجزئة صحيحة) + اتجاه تلقائي */}
      <style>{`
        .att-img { max-height: 72vh; max-width: 100%; object-fit: contain; }

        @page         { size: A4 portrait;  margin: 1.2cm; }
        @page landAtt { size: A4 landscape; margin: 1.2cm; }

        @media print {
          html, body { height: auto !important; overflow: visible !important; background: #fff !important; }

          #cover { page-break-after: always; }
          .attachment-page { page-break-before: always; break-inside: avoid; }

          /* اتجاه ذكي: الصور العريضة تُطبع في صفحة أفقية */
          .att-landscape { page: landAtt; }

          .att-img { max-height: 96%; }
        }
      `}</style>
    </div>
  )
}

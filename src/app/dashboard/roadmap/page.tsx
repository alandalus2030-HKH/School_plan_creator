'use client'

/* ════════════════════════════════════════════════════════════
   خارطة طريق المرحلة القادمة — قائمة تحقّق تفاعلية (نفس نمط test-plan).
   - الحالات تُحفظ محلياً (localStorage) فلا تضيع عند التحديث.
   - شريط تقدّم عام + لكل قسم/أسبوع.
   - زر «طباعة / حفظ PDF» يُصدّرها.
   المصدر: خطة العمل المرتّبة بالأولوية (محادثة 2026-07-02) — مسار الاعتماد
   QNSA على رأس الأولويات، يليه Backlog من WORKPLAN_V2 + الملفات القديمة.
   ════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react'
import { Printer, RotateCcw, CheckCircle2 } from 'lucide-react'

type Section = { id: string; title: string; badge?: string; items: string[] }

const SECTIONS: Section[] = [
  { id: '4-1', title: 'المرحلة 4 — الأسبوع 1: الإطار المرجعي المُصدَّر', badge: 'أولوية قصوى', items: [
    'يوم 1: تصميم + ترحيل جدول إطار مرجعي (محور→جانب→معيار رئيسي→معيار فرعي→مؤشر) بأعمدة ثنائية اللغة (name_ar/name_en) + framework_version + framework_node_id ثابت.',
    'يوم 2: ✅ تمّ — الإصدار النهائي (QNSA/final-2026) مزروع في framework_nodes: 283 عقدة بأربعة مستويات، مع سلم التقدير ونماذج الأدلة.',
    'يوم 3: أداة استيراد Excel/CSV لتحميل إصدار إطار جديد (لا استبدال — إصدار موازٍ).',
    'يوم 4: جدول ومنطق Crosswalk (مطابقة عقدة قديمة ← جديدة عبر الإصدارات).',
    'يوم 5: واجهة إدارة الإطار في الإعدادات (قسم «معايير QNSA») + اختبار الإصدارين معاً.',
  ]},
  { id: '4-2', title: 'المرحلة 4 — الأسبوع 2: ربط خطط المدرسة بالإطار', badge: 'أولوية قصوى', items: [
    'يوم 6: ترحيل plan_nodes.framework_node_id (ربط فعلي بدل نسخ standard_code نصياً) + RLS.',
    'يوم 7: تحديث StandardPicker ليربط بعقدة الإطار الحقيقية + ترحيل الأكواد النصية الحالية للربط الجديد.',
    'يوم 8: تحديث تقرير/عرض تغطية المعايير ليعتمد الربط الجديد بدل المطابقة النصية.',
  ]},
  { id: '4-3', title: 'المرحلة 4 — الأسبوع 3: التقرير الطولي عبر السنوات', badge: 'الميزة الأساسية', items: [
    'يوم 9: استعلام تجميعي عبر السنوات (أدلة + نتائج لكل معيار/مؤشر، الخطط النشطة والمؤرشفة معاً).',
    'يوم 10: بناء التقرير عبر ReportShell + طباعة/PDF بتنسيق رسمي.',
    'يوم 11: اختبار ببيانات تجريبية متعددة السنوات (3-5 سنوات) + إصلاح الحالات الحدّية.',
  ]},
  { id: '4-4', title: 'المرحلة 4 — الأسبوع 4: وضع المقيّم + لوحة الجاهزية', badge: 'أولوية قصوى', items: [
    'يوم 12: «وضع المقيّم» (قراءة فقط) — تصفّح معيار/مؤشر → كل الأدلة والنتائج عبر السنوات.',
    'يوم 13: لوحة جاهزية الاعتماد (تغطية كل مؤشر عبر الدورة الكاملة).',
    'يوم 14: اختبار شامل نهائي للمسار كاملاً + توثيق + دفع.',
  ]},
  { id: '5', title: 'المرحلة 5 — الدليل المشترك', badge: 'أولوية عالية', items: [
    'يوم 15: ترحيل جدول ربط evidence_links (متعدد-لمتعدد) + RLS عبر المهمة→الخطة→المدرسة.',
    'يوم 16: واجهة «إرفاق دليل موجود» على المهمة + تحديث الترقيم/العرض + مراجعة منطق إعادة الترقيم.',
  ]},
  { id: '6', title: 'المرحلة 6 — أولوية متوسطة', badge: 'متوسطة', items: [
    'يوم 17-18: حصر إدارة المهام بالقسم لرئيس القسم تحديداً (نطاق أضيق من manage_tasks الحالية).',
    'يوم 19-20: حِمل العمل بالساعات الفعلية — effort_hours + daily_capacity + heatmap + تحذير التجاوز.',
    'يوم 21: مُحفِّز قاعدة يمنع تواريخ المهام المحجوزة خادمياً (الواجهة تمنعها فقط حالياً).',
    'يوم 22-23: التوليد الخادمي لتقارير PDF (Puppeteer/Playwright) بدل طباعة المتصفح.',
  ]},
  { id: '7', title: 'المرحلة 7 — جودة الكود والأمان', badge: 'تنظيف', items: [
    'يوم 24-25: تفكيك reports/page.tsx (1631 سطراً) لمكوّنات أصغر.',
    'يوم 26: تفكيك users/page.tsx (1484 سطراً).',
    'يوم 27: Rate limiting على /api/users/create و/api/invite.',
    'يوم 28: إكمال Pagination في صفحة المستخدمين (موجود جزئياً في المهام).',
  ]},
  { id: '8', title: 'المرحلة 8 — تحسينات تجربة منخفضة الأولوية', badge: 'منخفضة', items: [
    'يوم 29: ترشيح لوحة التجميع حسب نوع الخطة + تصدير PDF مباشر للمتأخرة.',
    'يوم 30: نموذج KPI بوضعين (بسيط/متقدم) + «لمحة سريعة» افتراضية لصفحة التقارير.',
    'يوم 31: ربط قرارات الاجتماعات بإنشاء مهام مباشرة.',
  ]},
  { id: '9', title: 'المرحلة 9 — للتوسّع (بعد نضج المنتج/طلب السوق)', badge: 'بلا موعد', items: [
    'فهارس قاعدة البيانات + إصلاحات مدقّق أداء Supabase (WARN غير حرجة).',
    'i18n: استخراج نصوص الواجهة المتبقية للقاموس الإنجليزي.',
    'SSO + مزامنة تقويم خارجي (Google/Outlook) + API عام.',
    'خطوط الأساس/التباين + المسار الحرج (جدولة نمط MS Project).',
    'تدقيق إتاحة الوصول a11y + اختبار سعة/حمل فعلي + PWA.',
  ]},
  { id: '10', title: 'قرارات مؤجَّلة (لا تُنفَّذ دون قرار صريح)', badge: 'معلَّق', items: [
    'البريد الآلي (Resend/SMTP): يحتاج شراء نطاق (~$10/سنة) + إعداد SPF/DKIM.',
    'حماية كلمات المرور المسرَّبة: تحتاج ترقية Supabase لخطة Pro.',
    'النسخ الاحتياطية الرسمية (Pro + PITR): قرار ترقية Supabase.',
    'Vercel Pro / نطاق مخصّص للموقع.',
    'عطلتا العيدين في التقويم: بانتظار إعلان الوزارة.',
    'سياسة أرشفة تلقائية للخطط عند بدء عام دراسي جديد.',
    'قفل بنية الخطة المعتمدة (منع إضافة/حذف عقد بعد الاعتماد).',
    'مشاركة خطة للقراءة فقط (Viewer) لمستخدم محدّد خارج قسمه.',
    '«آلة الزمن» التنظيمية (لقطة سنوية مجمَّدة لهيكل المدرسة).',
    'ترقية الرؤية بالذكاء الاصطناعي لاستيراد التقويم (نموذج مدفوع).',
  ]},
]

const TOTAL = SECTIONS.reduce((n, s) => n + s.items.length, 0)
const STORAGE_KEY = 'roadmap_checks_v1'
const NOTES_KEY   = 'roadmap_notes_v1'

export default function RoadmapPage() {
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [notes,  setNotes]  = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try { setChecks(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')) } catch {}
    try { setNotes(JSON.parse(localStorage.getItem(NOTES_KEY) || '{}')) } catch {}
    setLoaded(true)
  }, [])
  useEffect(() => { if (loaded) localStorage.setItem(STORAGE_KEY, JSON.stringify(checks)) }, [checks, loaded])
  useEffect(() => { if (loaded) localStorage.setItem(NOTES_KEY, JSON.stringify(notes)) }, [notes, loaded])

  const toggle = (id: string) => setChecks(c => ({ ...c, [id]: !c[id] }))
  const setNote = (id: string, v: string) => setNotes(n => ({ ...n, [id]: v }))
  const reset  = () => { if (confirm('تصفير كل علامات الخطة والملاحظات؟')) { setChecks({}); setNotes({}) } }

  const doneCount = Object.values(checks).filter(Boolean).length
  const pct = TOTAL ? Math.round((doneCount / TOTAL) * 100) : 0
  const secDone = (s: Section) => s.items.filter((_, i) => checks[`${s.id}-${i}`]).length

  return (
    <div className="max-w-3xl mx-auto">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .tp-sheet { box-shadow: none !important; border: none !important; }
          @page { size: A4; margin: 14mm; }
        }
      `}</style>

      {/* رأس */}
      <div className="bg-gradient-to-l from-violet-600 to-indigo-700 text-white rounded-2xl p-6 mb-4 tp-sheet">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">خارطة طريق المرحلة القادمة</h1>
            <p className="text-violet-200 text-sm mt-1">مسار الاعتماد QNSA على رأس الأولويات · تُحفظ محلياً · قابلة للطباعة PDF</p>
          </div>
          <div className="text-left">
            <div className="text-4xl font-bold">{pct}%</div>
            <div className="text-violet-200 text-xs mt-1">{doneCount} / {TOTAL} بند</div>
          </div>
        </div>
        <div className="mt-4 h-2 bg-white/20 rounded-full overflow-hidden">
          <div className="h-full bg-white rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* أدوات (لا تُطبع) */}
      <div className="no-print flex items-center gap-2 mb-4 flex-wrap">
        <button onClick={() => window.print()}
          className="inline-flex items-center gap-2 text-sm text-white px-4 py-2 rounded-xl font-medium"
          style={{ background: 'var(--gradient-button, #8a1538)' }}>
          <Printer size={16} /> طباعة / حفظ PDF
        </button>
        <button onClick={reset}
          className="inline-flex items-center gap-2 text-sm text-slate-600 border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-50">
          <RotateCcw size={15} /> تصفير
        </button>
        <span className="text-xs text-slate-400">للحصول على PDF: اختر «حفظ كـ PDF» في وجهة الطباعة.</span>
      </div>

      {/* الأقسام */}
      <div className="space-y-4">
        {SECTIONS.map(s => {
          const d = secDone(s)
          const full = d === s.items.length
          return (
            <div key={s.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm tp-sheet break-inside-avoid">
              <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-100">
                <h2 className="font-bold text-slate-800 flex items-center gap-2">
                  {full && <CheckCircle2 size={16} className="text-emerald-500" />}
                  {s.title}
                  {s.badge && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-violet-50 text-violet-700 border border-violet-100">
                      {s.badge}
                    </span>
                  )}
                </h2>
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold flex-shrink-0 ${full ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {d}/{s.items.length}
                </span>
              </div>
              <div className="space-y-1.5">
                {s.items.map((item, i) => {
                  const id = `${s.id}-${i}`
                  const on = !!checks[id]
                  return (
                    <div key={id} className="p-2 rounded-lg hover:bg-slate-50 break-inside-avoid">
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input type="checkbox" checked={on} onChange={() => toggle(id)}
                          className="mt-0.5 w-4 h-4 accent-violet-600 flex-shrink-0" />
                        <span className={`text-sm leading-relaxed ${on ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{item}</span>
                      </label>
                      {/* حقل الملاحظة (يظهر على الشاشة) */}
                      <input
                        value={notes[id] || ''}
                        onChange={e => setNote(id, e.target.value)}
                        placeholder="📝 ملاحظة (اختياري)..."
                        className="no-print mt-1 mr-6 w-[calc(100%-1.75rem)] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-violet-300" />
                      {/* نسخة الطباعة للملاحظة (تظهر في الـPDF فقط عند وجود نص) */}
                      {notes[id]?.trim() && (
                        <p className="hidden print:block mt-1 mr-6 text-xs text-slate-600">📝 {notes[id]}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-slate-400 text-center mt-6">
        المصدر: خطة العمل المرتّبة بالأولوية (محادثة 2026-07-02) — التفاصيل الكاملة في WORKPLAN_V2.md.
      </p>
    </div>
  )
}

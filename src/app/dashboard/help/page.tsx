'use client'

import Link from 'next/link'
import {
  LayoutGrid, GanttChartSquare, CalendarDays, HelpCircle, ArrowLeft,
  ClipboardList, CircleCheckBig,
} from 'lucide-react'

/* بطاقة (عدسة أو طريقة عرض) */
type Card = {
  key: string
  Icon: any
  title: string
  tone: string          // لون مميّز
  question: string      // السؤال الذي تجيب عنه
  axis: string          // المحور / النطاق
  points: string[]      // نقاط القوة/الفوائد
  whenTo: string        // متى تستخدمها
  href?: string         // رابط مباشر للصفحة (للعدسات)
}

/* ════ عدسات المهام الثلاث ════ */
const LENSES: Card[] = [
  {
    key: 'my-tasks',
    Icon: ClipboardList,
    title: 'مهامي',
    tone: '#7c3aed',
    href: '/dashboard/my-tasks',
    question: '«ما الذي يخصّني، وما حالته؟»',
    axis: 'عدسة شخصية — ما كُلِّفت به أو تقيّمه أو يخصّ قسمك/فريقك',
    points: [
      'تبويبات: مهامي المباشرة · مهام قسمي · مهام فريقي · أقيّمها.',
      'بحث وفرز (الأقرب موعداً/الأعلى أولوية) وتصفية «المتأخرة فقط».',
      'روابط سريعة لفتح المهمة ورفع الأدلة + تنبيه بالمهام بانتظار تقييمك.',
      'بطاقات إحصائية لمهامك (جارية/منجزة/متأخرة) وصدارة الشهر.',
    ],
    whenTo: 'عملك الشخصي اليومي — «ماذا عليّ أن أنجز الآن».',
  },
  {
    key: 'all-tasks',
    Icon: CircleCheckBig,
    title: 'كل المهام',
    tone: '#0891b2',
    href: '/dashboard/tasks',
    question: '«أين هذه المهمة بالضبط، وكيف أتعامل معها؟»',
    axis: 'عدسة تشغيلية — كل مهام المدرسة (حسب صلاحيتك) بفلاتر غنية و٤ طرق عرض',
    points: [
      'فلاتر: بحث/حالة/أولوية/خطة/فريق/قسم/المكلّفة لي/التقييم.',
      'أربع عدسات عرض: قائمة · كانبان · جانت · تقويم.',
      'ترقيم صفحات للقوائم الطويلة + شارة القسم المكلَّف.',
      'هي وجهة الغوص القادم من لوحة التجميع (مُفلتراً على القسم/الحالة).',
    ],
    whenTo: 'البحث والتشغيل على مستوى المدرسة والتخطيط البصري.',
  },
  {
    key: 'aggregate',
    Icon: LayoutGrid,
    title: 'لوحة التجميع',
    tone: '#8a1538',
    href: '/dashboard/aggregate',
    question: '«كيف تسير خطط الأقسام، وأين التعثّر؟»',
    axis: 'عدسة إشرافية — مؤشرات مجمّعة لكل خطة/قسم ضمن نطاق إشرافك',
    points: [
      'مؤشرات إجمالية: نسبة الإنجاز · المتأخرات · الأدلة المقبولة.',
      'تجميع حسب القسم / النوع / صاحب الخطة + اتجاه الإنجاز عبر الزمن.',
      'تنبيه صاحب الخطة + غوص مباشر إلى مهام القسم/الخطة.',
      'تصدير CSV للتقارير الرسمية (الاعتماد).',
    ],
    whenTo: 'المتابعة الإدارية والمساءلة وتقارير الاعتماد.',
  },
]

const LENS_TABLE: { dim: string; mine: string; all: string; agg: string }[] = [
  { dim: 'المستوى',   mine: 'شخصي',                 all: 'تشغيلي',                 agg: 'إشرافي' },
  { dim: 'الوحدة',    mine: 'مهمة تخصّني',          all: 'مهمة (كل المدرسة)',      agg: 'خطة مجمّعة حسب القسم' },
  { dim: 'النطاق',    mine: 'ما يخصّني',            all: 'كل المدرسة (بصلاحية)',   agg: 'أقسامي المُشرف عليها' },
  { dim: 'أبرز أداة', mine: 'تبويبات + بحث/فرز',     all: 'فلاتر + ٤ عروض',         agg: 'مؤشرات + اتجاه + تصدير' },
  { dim: 'لمن؟',      mine: 'المنفّذ/المقيّم',       all: 'المدير/المنسّق',          agg: 'المشرف/القيادة' },
]

/* ════ طرق عرض المهام داخل «كل المهام» ════ */
const VIEWS: Card[] = [
  {
    key: 'kanban',
    Icon: LayoutGrid,
    title: 'كانبان',
    tone: '#3b82f6',
    question: '«في أي مرحلة كل مهمة، وأين التكدّس؟»',
    axis: 'الحالة وتدفّق العمل (أعمدة سير العمل)',
    points: [
      'نظرة لحظية على توزيع المهام عبر المراحل.',
      'سحب المهمة لتغيير حالتها — عبر سير العمل (بدء/رفع)، والنقلات التي تحتاج تقييماً أو سبباً تفتح المهمة عند مكانها.',
      'يكشف الاختناقات بصرياً (عمود متضخّم = تأخّر في تلك المرحلة).',
      'يُبرز المهام المحجوبة (بتبعية) والمتأخرة على البطاقة.',
    ],
    whenTo: 'المتابعة اليومية/الأسبوعية وإدارة التنفيذ واجتماعات الفريق.',
  },
  {
    key: 'gantt',
    Icon: GanttChartSquare,
    title: 'جانت',
    tone: '#8a1538',
    question: '«متى تبدأ وتنتهي، وما الذي يعتمد على ماذا؟»',
    axis: 'الزمن (خط أفقي يمثّل المدّة من البدء للانتهاء)',
    points: [
      'يُظهر المدد والتوازي والفجوات الزمنية بين المهام.',
      'أسهم التبعيات تكشف ما الذي يعطّل ما (المسار الحرج).',
      'تكبير مرن: سنة / ربع / شهر / أسبوع، مع خط «اليوم».',
      'يكشف إن كانت الخطة واقعية أم متراكمة في فترة واحدة.',
    ],
    whenTo: 'بناء الخطة الفصلية/السنوية ومراجعة التسلسل والتبعيات.',
  },
  {
    key: 'calendar',
    Icon: CalendarDays,
    title: 'التقويم',
    tone: '#f59e0b',
    question: '«ما المستحقّ هذا الشهر/الأسبوع؟»',
    axis: 'الزمن (شبكة شهرية حسب الموعد النهائي)',
    points: [
      'يضع المهام على أيام استحقاقها في سياق تقويم مألوف.',
      'يكشف ازدحام يوم بعينه (عدّة مهام تستحق في اليوم نفسه).',
      'تنقّل سريع بين الأشهر مع إبراز «اليوم».',
      'يساعد على توزيع الحِمل وتجنّب التكدّس.',
    ],
    whenTo: 'متابعة المواعيد النهائية وتوزيع العبء الزمني.',
  },
]

const VIEW_TABLE: { dim: string; kanban: string; gantt: string; calendar: string }[] = [
  { dim: 'المحور',        kanban: 'الحالة (أعمدة)',      gantt: 'الزمن (مدّة)',        calendar: 'الزمن (شهري)' },
  { dim: 'يعتمد على',     kanban: 'حالة المهمة',         gantt: 'تاريخ البدء + الانتهاء', calendar: 'الموعد النهائي' },
  { dim: 'التفاعل',       kanban: 'سحب لتغيير الحالة',    gantt: 'تكبير + نطاق + خط اليوم', calendar: 'تنقّل بين الأشهر' },
  { dim: 'التبعيات',      kanban: 'شارة «محجوبة» فقط',    gantt: 'أسهم تربط المهام',     calendar: 'لا تظهر' },
  { dim: 'يُبرز',          kanban: 'الاختناقات',          gantt: 'التسلسل والفجوات',     calendar: 'ازدحام المواعيد' },
  { dim: 'مهمة بلا تاريخ', kanban: 'تظهر طبيعياً',        gantt: 'لا تظهر (تحتاج تواريخ)', calendar: 'لا تظهر (تحتاج موعداً)' },
]

/* ════ مكوّنات مساعدة ════ */
function CardGrid({ items }: { items: Card[] }) {
  return (
    <div className="grid md:grid-cols-3 gap-4">
      {items.map(v => {
        const inner = (
          <>
            <div className="flex items-center gap-2 p-4 border-b border-slate-100" style={{ background: `${v.tone}10` }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ background: v.tone }}>
                <v.Icon size={18} />
              </div>
              <h3 className="font-bold text-slate-800">{v.title}</h3>
            </div>
            <div className="p-4 space-y-3 flex-1">
              <p className="text-sm font-semibold text-slate-700">{v.question}</p>
              <p className="text-xs text-slate-500"><span className="text-slate-400">{v.href ? 'النطاق:' : 'المحور:'}</span> {v.axis}</p>
              <ul className="space-y-1.5">
                {v.points.map((p, i) => (
                  <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: v.tone }} />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-600">
              <span className="font-semibold text-slate-700">متى تستخدمها: </span>{v.whenTo}
            </div>
          </>
        )
        return v.href ? (
          <Link key={v.key} href={v.href}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col hover:border-violet-300 hover:shadow-md transition-all">
            {inner}
          </Link>
        ) : (
          <div key={v.key} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            {inner}
          </div>
        )
      })}
    </div>
  )
}

export default function HelpPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* الترويسة */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white flex-shrink-0"
          style={{ background: 'var(--gradient-button, #8a1538)' }}>
          <HelpCircle size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">دليل الاستخدام</h1>
          <p className="text-sm text-slate-500">عدسات المهام الثلاث، وطرق عرض المهام — مميزات كل طريقة ومتى تستخدمها</p>
        </div>
      </div>

      {/* ═══════════ القسم الأول: عدسات المهام الثلاث ═══════════ */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-6 rounded-full" style={{ background: 'var(--maroon-600, #8a1538)' }} />
          <h2 className="text-lg font-bold text-slate-800">عدسات المهام الثلاث</h2>
        </div>

        <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 text-sm text-violet-900">
          ثلاث شاشات تنظر للمهام على ثلاثة <strong>ارتفاعات</strong> مختلفة:
          <strong> مهامي</strong> (الشخصي) ← <strong>كل المهام</strong> (التشغيل) ← <strong>لوحة التجميع</strong> (الإشراف).
          القوة في الانتقال بينها: من الصورة الكبرى إلى الإجراء.
        </div>

        <CardGrid items={LENSES} />

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <h3 className="font-bold text-slate-800 p-4 border-b border-slate-100">مقارنة سريعة</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead>
                <tr className="bg-slate-50 text-slate-500">
                  <th className="px-4 py-2.5 font-medium">البُعد</th>
                  <th className="px-4 py-2.5 font-medium">👤 مهامي</th>
                  <th className="px-4 py-2.5 font-medium">🗂️ كل المهام</th>
                  <th className="px-4 py-2.5 font-medium">📊 لوحة التجميع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {LENS_TABLE.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 font-medium text-slate-700">{r.dim}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.mine}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.all}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.agg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-slate-400">
          ملاحظة: ظهور «كل المهام» و«لوحة التجميع» يعتمد على صلاحياتك (إدارة المهام / عرض التجميع).
        </p>
      </section>

      {/* ═══════════ القسم الثاني: طرق عرض المهام ═══════════ */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-6 rounded-full" style={{ background: 'var(--maroon-600, #8a1538)' }} />
          <h2 className="text-lg font-bold text-slate-800">طرق عرض المهام داخل «كل المهام»</h2>
        </div>

        <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 text-sm text-violet-900">
          العدسات الثلاث للعرض تُظهر <strong>نفس المهام المُصفّاة</strong> بطرق مختلفة — تنتقل بينها بزر واحد في
          <Link href="/dashboard/tasks" className="font-semibold underline mx-1">كل المهام</Link>
          دون فقدان الفلاتر: <strong>خطّط بجانت، نفّذ بكانبان، راقب المواعيد بالتقويم</strong>.
        </div>

        <CardGrid items={VIEWS} />

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <h3 className="font-bold text-slate-800 p-4 border-b border-slate-100">مقارنة سريعة</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead>
                <tr className="bg-slate-50 text-slate-500">
                  <th className="px-4 py-2.5 font-medium">البُعد</th>
                  <th className="px-4 py-2.5 font-medium">🗂️ كانبان</th>
                  <th className="px-4 py-2.5 font-medium">📊 جانت</th>
                  <th className="px-4 py-2.5 font-medium">📅 التقويم</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {VIEW_TABLE.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 font-medium text-slate-700">{r.dim}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.kanban}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.gantt}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.calendar}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <Link href="/dashboard/tasks"
          className="inline-flex items-center gap-1.5 text-sm text-white px-4 py-2 rounded-xl font-medium transition-all hover:brightness-110"
          style={{ background: 'var(--gradient-button, #8a1538)' }}>
          جرّب العدسات في «كل المهام» <ArrowLeft size={15} />
        </Link>
      </section>
    </div>
  )
}

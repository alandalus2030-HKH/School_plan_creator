'use client'

import Link from 'next/link'
import {
  LayoutGrid, GanttChartSquare, CalendarDays, HelpCircle, ArrowLeft,
  ClipboardList, CircleCheckBig, BadgeCheck, Lock, Archive,
  User, Folder, BarChart3,
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
      'تصدير Excel للتقارير الرسمية (الاعتماد).',
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

/* ════ حالات الخطة: اعتماد · تجميد · أرشفة ════ */
const PLAN_STATES: Card[] = [
  {
    key: 'approve',
    Icon: BadgeCheck,
    title: 'الاعتماد',
    tone: '#059669',
    question: '«هل هذه الخطة مُقرّة رسمياً؟»',
    axis: 'ختم رسمي يُثبت إقرار الخطة — يحمي من الحذف، لكنه ليس قفلاً للتعديل',
    points: [
      'يضع شارة «معتمدة» على الخطة وفي التقارير ولوحة التجميع.',
      'يمنع حذف الخطة وحذف عناصرها (محاور/أهداف) حفاظاً على مصداقية السجل.',
      'التعديل والإضافة يبقيان متاحَين — الخطة تظل قابلة للتحديث.',
      'يُلغى بنقرة (إلغاء الاعتماد) لمن يملك صلاحية «اعتماد الخطط».',
    ],
    whenTo: 'عند إقرار الخطة رسمياً (مثل ملف اعتماد QNSA) مع إبقاء إمكانية تحديثها.',
  },
  {
    key: 'freeze',
    Icon: Lock,
    title: 'التجميد',
    tone: '#0284c7',
    question: '«أريد قفل الخطة تماماً فلا تتغيّر؟»',
    axis: 'قفل كامل — لا تعديل ولا إضافة ولا حذف ولا تنفيذ، مفروض في قاعدة البيانات',
    points: [
      'يمنع كل تغيير: المحاور والأهداف والمهام والمؤشرات والقراءات والأدلة وحالات المهام.',
      'مفروض على مستوى القاعدة — يغطي كل المسارات لا الواجهة فقط.',
      'الخطة تبقى ظاهرة وقابلة للقراءة والتقارير، لكنها مقفلة للتحرير.',
      'يُلغى بـ«إلغاء التجميد» لاستئناف العمل، لمن يملك صلاحية «تجميد الخطط».',
    ],
    whenTo: 'لتثبيت نسخة نهائية/مرجعية (نهاية فصل، تدقيق، حماية مؤقتة) دون حذفها.',
  },
  {
    key: 'archive',
    Icon: Archive,
    title: 'الأرشفة',
    tone: '#64748b',
    question: '«انتهى دور الخطة، أُبعدها عن العرض؟»',
    axis: 'إخفاء من القوائم النشطة ولوحة التجميع — للتنظيم لا للحماية',
    points: [
      'تختفي الخطة من قائمة الخطط النشطة ومن لوحة التجميع.',
      'تبقى محفوظة ويمكن استرجاعها بـ«إلغاء الأرشفة» في أي وقت.',
      'لا تقفل التعديل بذاتها — وظيفتها تقليل الزحام وترتيب المساحة.',
      'متاحة لمن يملك صلاحية «حذف وأرشفة الخطط».',
    ],
    whenTo: 'للخطط المكتملة أو القديمة التي لم تعد قيد المتابعة اليومية.',
  },
]

const STATE_TABLE: { dim: string; approve: string; freeze: string; archive: string }[] = [
  { dim: 'الغرض',           approve: 'إقرار رسمي',       freeze: 'قفل كامل',          archive: 'إخفاء وتنظيم' },
  { dim: 'تعديل المحتوى',   approve: 'متاح',          freeze: 'ممنوع تماماً',    archive: 'متاح' },
  { dim: 'الحذف',           approve: 'ممنوع',         freeze: 'ممنوع',          archive: 'متاح' },
  { dim: 'تنفيذ المهام',    approve: 'مستمر',         freeze: 'متوقّف',          archive: 'مستمر' },
  { dim: 'الظهور في اللوحات', approve: 'يظهر',           freeze: 'يظهر',              archive: 'مخفي' },
  { dim: 'قابل للتراجع',    approve: 'نعم',              freeze: 'نعم',               archive: 'نعم' },
  { dim: 'الصلاحية',        approve: 'اعتماد الخطط',     freeze: 'تجميد الخطط',       archive: 'حذف وأرشفة الخطط' },
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

/* ════ كتالوج الأدوار ومصفوفة الصلاحيات (يطابق ترحيل 055) ════ */
const ROLE_CATALOG: { name: string; tier: string; purpose: string }[] = [
  { name: 'مشرف المنصة',          tier: 'حوكمة عليا', purpose: 'مالك المنصة عبر كل المدارس (كل الصلاحيات).' },
  { name: 'مدير المدرسة',          tier: 'حوكمة',      purpose: 'الإدارة الكاملة للمدرسة + الحوكمة (أدوار/إعدادات/اعتماد/حذف).' },
  { name: 'نائب المدير',           tier: 'قيادة',      purpose: 'إشراف تشغيلي واسع بلا حوكمة.' },
  { name: 'منسّق الجودة والتطوير', tier: 'قيادة',      purpose: 'بناء وإدارة الخطط والاعتماد والمتابعة.' },
  { name: 'رئيس قسم',              tier: 'تشغيل',      purpose: 'يدير ويقيّم مهام قسمه + ينفّذ مهامه.' },
  { name: 'مقيّم',                 tier: 'تشغيل',      purpose: 'تقييم المهام ومراجعة الأدلة فقط (فصل واجبات).' },
  { name: 'موظف',                  tier: 'تشغيل',      purpose: 'ينفّذ المهام المكلّف بها ويرفع أدلتها.' },
  { name: 'مُطّلِع',               tier: 'قراءة',      purpose: 'عرض فقط (مجلس/وزارة/قيادة).' },
]

const ROLE_COLS = ['مشرف المنصة', 'مدير المدرسة', 'نائب المدير', 'منسّق الجودة', 'رئيس قسم', 'مقيّم', 'موظف', 'مُطّلِع']

/* لكل صلاحية: مصفوفة ✓/✗ بترتيب الأعمدة أعلاه */
const PERM_MATRIX: { label: string; on: boolean[] }[] = [
  /*                          منصة  مدير  نائب  جودة  قسم   مقيّم موظف مطّلع */
  { label: 'إدارة المستخدمين',   on: [1,1,0,0,0,0,0,0].map(Boolean) },
  { label: 'إدارة الأدوار',      on: [1,1,0,0,0,0,0,0].map(Boolean) },
  { label: 'إدارة الإعدادات',    on: [1,1,0,0,0,0,0,0].map(Boolean) },
  { label: 'إدارة الفرق',        on: [1,1,1,0,1,0,0,0].map(Boolean) },
  { label: 'عرض الخطط',          on: [1,1,1,1,1,0,0,1].map(Boolean) },
  { label: 'إنشاء/تعديل الخطط',  on: [1,1,1,1,0,0,0,0].map(Boolean) },
  { label: 'اعتماد الخطط',       on: [1,1,1,0,0,0,0,0].map(Boolean) },
  { label: 'تجميد الخطط',        on: [1,1,0,0,0,0,0,0].map(Boolean) },
  { label: 'حذف/أرشفة الخطط',    on: [1,1,0,0,0,0,0,0].map(Boolean) },
  { label: 'عرض المهام',         on: [1,1,1,1,1,1,1,0].map(Boolean) },
  { label: 'إدارة المهام',       on: [1,1,1,1,1,0,0,0].map(Boolean) },
  { label: 'تقييم المهام',       on: [1,1,1,0,1,1,0,0].map(Boolean) },
  { label: 'عرض الأدلة',         on: [1,1,1,1,1,1,0,1].map(Boolean) },
  { label: 'إضافة/تعديل الأدلة', on: [1,1,1,1,1,0,1,0].map(Boolean) },
  { label: 'اعتماد/رفض الأدلة',  on: [1,1,1,1,1,1,0,0].map(Boolean) },
  { label: 'عرض التقارير',       on: [1,1,1,1,1,1,0,1].map(Boolean) },
  { label: 'عرض لوحة التجميع',   on: [1,1,1,1,1,0,0,1].map(Boolean) },
  { label: 'إدارة الاجتماعات',   on: [1,1,1,1,0,0,0,0].map(Boolean) },
  { label: 'إدارة الأوسمة',      on: [1,1,0,0,0,0,0,0].map(Boolean) },
  { label: 'منح الأوسمة',        on: [1,1,1,0,1,0,0,0].map(Boolean) },
]

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
          <p className="text-sm text-slate-500">عدسات المهام، وطرق عرضها، وحالات الخطة (اعتماد/تجميد/أرشفة) — الفرق بينها ومتى تستخدم كلاً منها</p>
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
            <table className="w-full text-xs sm:text-sm text-right">
              <thead>
                <tr className="bg-slate-50 text-slate-500">
                  <th className="px-2.5 sm:px-4 py-2.5 font-medium">البُعد</th>
                  <th className="px-2.5 sm:px-4 py-2.5 font-medium"><span className="inline-flex items-center gap-1.5"><User size={14} /> مهامي</span></th>
                  <th className="px-2.5 sm:px-4 py-2.5 font-medium"><span className="inline-flex items-center gap-1.5"><Folder size={14} /> كل المهام</span></th>
                  <th className="px-2.5 sm:px-4 py-2.5 font-medium"><span className="inline-flex items-center gap-1.5"><BarChart3 size={14} /> لوحة التجميع</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {LENS_TABLE.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50/60">
                    <td className="px-2.5 sm:px-4 py-2.5 font-medium text-slate-700">{r.dim}</td>
                    <td className="px-2.5 sm:px-4 py-2.5 text-slate-600">{r.mine}</td>
                    <td className="px-2.5 sm:px-4 py-2.5 text-slate-600">{r.all}</td>
                    <td className="px-2.5 sm:px-4 py-2.5 text-slate-600">{r.agg}</td>
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
            <table className="w-full text-xs sm:text-sm text-right">
              <thead>
                <tr className="bg-slate-50 text-slate-500">
                  <th className="px-2.5 sm:px-4 py-2.5 font-medium">البُعد</th>
                  <th className="px-2.5 sm:px-4 py-2.5 font-medium"><span className="inline-flex items-center gap-1.5"><LayoutGrid size={14} /> كانبان</span></th>
                  <th className="px-2.5 sm:px-4 py-2.5 font-medium"><span className="inline-flex items-center gap-1.5"><GanttChartSquare size={14} /> جانت</span></th>
                  <th className="px-2.5 sm:px-4 py-2.5 font-medium"><span className="inline-flex items-center gap-1.5"><CalendarDays size={14} /> التقويم</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {VIEW_TABLE.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50/60">
                    <td className="px-2.5 sm:px-4 py-2.5 font-medium text-slate-700">{r.dim}</td>
                    <td className="px-2.5 sm:px-4 py-2.5 text-slate-600">{r.kanban}</td>
                    <td className="px-2.5 sm:px-4 py-2.5 text-slate-600">{r.gantt}</td>
                    <td className="px-2.5 sm:px-4 py-2.5 text-slate-600">{r.calendar}</td>
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

      {/* ═══════════ القسم الثالث: حالات الخطة ═══════════ */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-6 rounded-full" style={{ background: 'var(--maroon-600, #8a1538)' }} />
          <h2 className="text-lg font-bold text-slate-800">حالات الخطة: اعتماد · تجميد · أرشفة</h2>
        </div>

        <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 text-sm text-violet-900">
          ثلاثة إجراءات تبدو متشابهة لكنها تخدم أغراضاً مختلفة:
          <strong> الاعتماد</strong> ختمٌ رسمي يحمي من الحذف، و<strong>التجميد</strong> قفلٌ كامل يمنع أي تغيير،
          و<strong>الأرشفة</strong> إخفاءٌ للتنظيم. كلها <strong>قابلة للتراجع</strong> ولا تحذف الخطة.
        </div>

        <CardGrid items={PLAN_STATES} />

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <h3 className="font-bold text-slate-800 p-4 border-b border-slate-100">مقارنة سريعة</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm text-right">
              <thead>
                <tr className="bg-slate-50 text-slate-500">
                  <th className="px-2.5 sm:px-4 py-2.5 font-medium">البُعد</th>
                  <th className="px-2.5 sm:px-4 py-2.5 font-medium"><span className="inline-flex items-center gap-1.5"><BadgeCheck size={14} /> الاعتماد</span></th>
                  <th className="px-2.5 sm:px-4 py-2.5 font-medium"><span className="inline-flex items-center gap-1.5"><Lock size={14} /> التجميد</span></th>
                  <th className="px-2.5 sm:px-4 py-2.5 font-medium"><span className="inline-flex items-center gap-1.5"><Archive size={14} /> الأرشفة</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {STATE_TABLE.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50/60">
                    <td className="px-2.5 sm:px-4 py-2.5 font-medium text-slate-700">{r.dim}</td>
                    <td className="px-2.5 sm:px-4 py-2.5 text-slate-600">{r.approve}</td>
                    <td className="px-2.5 sm:px-4 py-2.5 text-slate-600">{r.freeze}</td>
                    <td className="px-2.5 sm:px-4 py-2.5 text-slate-600">{r.archive}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-slate-400">
          ملاحظة: هذه الإجراءات تتطلب صلاحيات مختلفة (اعتماد/تجميد/حذف الخطط)، وتُدار من رأس الخطة أو قائمة الخطط (⋮).
        </p>
      </section>

      {/* ═══════════ القسم الرابع: الأدوار والصلاحيات ═══════════ */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-6 rounded-full" style={{ background: 'var(--maroon-600, #8a1538)' }} />
          <h2 className="text-lg font-bold text-slate-800">الأدوار والصلاحيات</h2>
        </div>

        <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 text-sm text-violet-900">
          ثمانية أدوار مبنية على <strong>أقل صلاحية</strong> و<strong>فصل الواجبات</strong> و<strong>حصر الحوكمة</strong> في مدير المدرسة.
          المنفّذ لا يقيّم، والمقيّم لا ينفّذ، ولا أحد يقيّم مهمته (يُمنع تلقائياً). تُدار الأدوار من
          <span className="font-semibold mx-1">الإعدادات ← الأدوار والصلاحيات</span>.
        </div>

        {/* كتالوج الأدوار */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <h3 className="font-bold text-slate-800 p-4 border-b border-slate-100">كتالوج الأدوار</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm text-right">
              <thead>
                <tr className="bg-slate-50 text-slate-500">
                  <th className="px-2.5 sm:px-4 py-2.5 font-medium">الدور</th>
                  <th className="px-2.5 sm:px-4 py-2.5 font-medium">الطبقة</th>
                  <th className="px-2.5 sm:px-4 py-2.5 font-medium">الغرض</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {ROLE_CATALOG.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50/60">
                    <td className="px-2.5 sm:px-4 py-2.5 font-semibold text-slate-800 whitespace-nowrap">{r.name}</td>
                    <td className="px-2.5 sm:px-4 py-2.5 text-slate-500 whitespace-nowrap">{r.tier}</td>
                    <td className="px-2.5 sm:px-4 py-2.5 text-slate-600">{r.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* مصفوفة الصلاحيات */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <h3 className="font-bold text-slate-800 p-4 border-b border-slate-100">مصفوفة الصلاحيات</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-center border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500">
                  <th className="px-3 py-2.5 font-medium text-right sticky right-0 bg-slate-50">الصلاحية</th>
                  {ROLE_COLS.map(c => (
                    <th key={c} className="px-2 py-2.5 font-medium whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {PERM_MATRIX.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap sticky right-0 bg-white">{row.label}</td>
                    {row.on.map((v, j) => (
                      <td key={j} className="px-2 py-2">
                        {v
                          ? <span className="inline-flex"><CircleCheckBig size={15} className="text-emerald-600 mx-auto" /></span>
                          : <span className="text-slate-200">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-xs text-slate-400">
          ملاحظة: «رئيس قسم» يقيّم مهام قسمه عند تسجيله <strong>مشرف قسم</strong> (الإعدادات ← البنية التنظيمية). «مشرف المنصة» و«مدير المدرسة» دوران نظاميان محميّان من الحذف.
        </p>
      </section>
    </div>
  )
}

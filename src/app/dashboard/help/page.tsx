'use client'

import Link from 'next/link'
import { LayoutGrid, GanttChartSquare, CalendarDays, HelpCircle, ArrowLeft } from 'lucide-react'

/* بطاقة عدسة */
type View = {
  key: string
  Icon: any
  title: string
  tone: string          // لون مميّز
  question: string      // السؤال الذي تجيب عنه
  axis: string          // المحور
  points: string[]      // نقاط القوة/الفوائد
  whenTo: string        // متى تستخدمها
}

const VIEWS: View[] = [
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

const TABLE: { dim: string; kanban: string; gantt: string; calendar: string }[] = [
  { dim: 'المحور',        kanban: 'الحالة (أعمدة)',      gantt: 'الزمن (مدّة)',        calendar: 'الزمن (شهري)' },
  { dim: 'يعتمد على',     kanban: 'حالة المهمة',         gantt: 'تاريخ البدء + الانتهاء', calendar: 'الموعد النهائي' },
  { dim: 'التفاعل',       kanban: 'سحب لتغيير الحالة',    gantt: 'تكبير + نطاق + خط اليوم', calendar: 'تنقّل بين الأشهر' },
  { dim: 'التبعيات',      kanban: 'شارة «محجوبة» فقط',    gantt: 'أسهم تربط المهام',     calendar: 'لا تظهر' },
  { dim: 'يُبرز',          kanban: 'الاختناقات',          gantt: 'التسلسل والفجوات',     calendar: 'ازدحام المواعيد' },
  { dim: 'مهمة بلا تاريخ', kanban: 'تظهر طبيعياً',        gantt: 'لا تظهر (تحتاج تواريخ)', calendar: 'لا تظهر (تحتاج موعداً)' },
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
          <p className="text-sm text-slate-500">عدسات عرض المهام: كانبان / جانت / التقويم — مميزات كل طريقة ومتى تستخدمها</p>
        </div>
      </div>

      {/* تمهيد */}
      <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 text-sm text-violet-900">
        العدسات الثلاث تعرض <strong>نفس المهام المُصفّاة</strong> بطرق مختلفة — تنتقل بينها بزر واحد في صفحة
        <Link href="/dashboard/tasks" className="font-semibold underline mx-1">كل المهام</Link>
        دون فقدان الفلاتر. القوة في الجمع بينها: <strong>خطّط بجانت، نفّذ بكانبان، راقب المواعيد بالتقويم</strong>.
      </div>

      {/* بطاقات العدسات */}
      <div className="grid md:grid-cols-3 gap-4">
        {VIEWS.map(v => (
          <div key={v.key} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 p-4 border-b border-slate-100" style={{ background: `${v.tone}10` }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ background: v.tone }}>
                <v.Icon size={18} />
              </div>
              <h2 className="font-bold text-slate-800">{v.title}</h2>
            </div>
            <div className="p-4 space-y-3 flex-1">
              <p className="text-sm font-semibold text-slate-700">{v.question}</p>
              <p className="text-xs text-slate-500"><span className="text-slate-400">المحور:</span> {v.axis}</p>
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
          </div>
        ))}
      </div>

      {/* جدول المقارنة */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <h2 className="font-bold text-slate-800 p-4 border-b border-slate-100">مقارنة سريعة</h2>
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
              {TABLE.map((r, i) => (
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

      {/* دليل سريع: متى تستخدم أيّها */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <h2 className="font-bold text-slate-800 mb-3">متى تستخدم أيّها؟</h2>
        <div className="space-y-2 text-sm">
          <p className="flex items-start gap-2 text-slate-600"><LayoutGrid size={16} className="text-blue-500 mt-0.5 flex-shrink-0" /> تدير سير عمل يومي أو اجتماع متابعة → <strong className="text-slate-800">كانبان</strong></p>
          <p className="flex items-start gap-2 text-slate-600"><GanttChartSquare size={16} className="mt-0.5 flex-shrink-0" style={{ color: '#8a1538' }} /> تبني خطة أو تراجع تسلسلاً وتبعيات → <strong className="text-slate-800">جانت</strong></p>
          <p className="flex items-start gap-2 text-slate-600"><CalendarDays size={16} className="text-amber-500 mt-0.5 flex-shrink-0" /> تتابع المواعيد النهائية وتوزّع الحِمل → <strong className="text-slate-800">التقويم</strong></p>
        </div>
        <Link href="/dashboard/tasks"
          className="inline-flex items-center gap-1.5 mt-4 text-sm text-white px-4 py-2 rounded-xl font-medium transition-all hover:brightness-110"
          style={{ background: 'var(--gradient-button, #8a1538)' }}>
          جرّب العدسات في «كل المهام» <ArrowLeft size={15} />
        </Link>
      </div>
    </div>
  )
}

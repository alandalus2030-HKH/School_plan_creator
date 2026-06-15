'use client'

import Link from 'next/link'
import { usePermissions } from '@/lib/PermissionsContext'
import NoAccess from '@/components/NoAccess'
import {
  FileText, ClipboardList, Map, Users, Package, MapPin,
  TrendingUp, ShieldCheck, Award, ArrowLeft,
} from 'lucide-react'

type Report = { key: string; title: string; desc: string; href?: string }
type Group = { label: string; Icon: any; reports: Report[] }

/* الكتالوج — href = جاهز، بدونه = قريباً */
const GROUPS: Group[] = [
  {
    label: 'المهام', Icon: ClipboardList, reports: [
      { key: 'task-status', title: 'حالة المهام', desc: 'توزيع الحالات والمتأخرات', href: '/dashboard/reports/r/task-status' },
      { key: 'overdue', title: 'المهام المتأخرة', desc: 'قائمة المتأخر مع المكلَّفين', href: '/dashboard/reports/r/overdue' },
      { key: 'rework', title: 'المهام المُعادة', desc: 'الإعادات وأسبابها', href: '/dashboard/reports/r/rework' },
    ],
  },
  {
    label: 'الخطط', Icon: Map, reports: [
      { key: 'plans-portfolio', title: 'محفظة الخطط', desc: 'كل الخطط ومؤشراتها', href: '/dashboard/reports/r/plans-portfolio' },
      { key: 'plan-progress', title: 'تقدّم الخطة', desc: 'هرمية الخطة ونسبة الإنجاز' },
      { key: 'sip', title: 'خطة التحسين المدرسي (QNSA)', desc: 'مبادرات وأهداف وأدلة' },
    ],
  },
  {
    label: 'الأشخاص', Icon: Users, reports: [
      { key: 'staff-performance', title: 'أداء الموظف', desc: 'مكلّف/منجز/متأخر + التقييم', href: '/dashboard/reports/r/staff-performance' },
      { key: 'workload', title: 'عبء العمل', desc: 'توزيع المهام على الأفراد', href: '/dashboard/reports/r/workload' },
    ],
  },
  {
    label: 'الموارد والأماكن', Icon: Package, reports: [
      { key: 'resources', title: 'الموارد والميزانية', desc: 'الميزانية والموارد لكل خطة', href: '/dashboard/reports/r/resources' },
      { key: 'locations', title: 'استخدام الأماكن', desc: 'عدد المهام لكل مكان', href: '/dashboard/reports/r/locations' },
    ],
  },
  {
    label: 'الأداء والتحسين', Icon: TrendingUp, reports: [
      { key: 'performance', title: 'تحليل الأداء', desc: 'الإنجاز والجودة حسب القسم' },
      { key: 'trend', title: 'الاتجاه الزمني', desc: 'تطوّر الإنجاز عبر الوقت', href: '/dashboard/reports/r/trend' },
      { key: 'coverage', title: 'التغطية والفجوات', desc: 'تغطية المعايير بالأدلة' },
      { key: 'accreditation', title: 'جاهزية الاعتماد', desc: 'ملف الأدلة حسب المعيار' },
    ],
  },
  {
    label: 'الحوكمة والتحفيز', Icon: ShieldCheck, reports: [
      { key: 'audit', title: 'سجل التدقيق', desc: 'من فعل ماذا ومتى', href: '/dashboard/reports/r/audit' },
      { key: 'recognition', title: 'التقدير والصدارة', desc: 'الأوسمة والنقاط وموظف الشهر', href: '/dashboard/reports/r/recognition' },
    ],
  },
]

export default function OfficialReportsCatalog() {
  const { can, loading } = usePermissions()
  if (loading) return null
  if (!can('view_reports')) return <NoAccess />

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white flex-shrink-0"
          style={{ background: 'var(--gradient-button, #8a1538)' }}>
          <FileText size={22} />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-800">التقارير الرسمية</h1>
          <p className="text-sm text-slate-500">تقارير قابلة للطباعة وتصدير PDF بترويسة المدرسة وتوقيع المدير وختمها</p>
        </div>
        <Link href="/dashboard/reports" className="text-sm text-slate-500 hover:text-violet-700 inline-flex items-center gap-1">
          لوحة التحليلات <ArrowLeft size={15} />
        </Link>
      </div>

      {GROUPS.map(g => (
        <section key={g.label} className="space-y-3">
          <div className="flex items-center gap-2">
            <g.Icon size={18} style={{ color: 'var(--maroon-600, #8a1538)' }} />
            <h2 className="font-bold text-slate-800">{g.label}</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {g.reports.map(r => {
              const card = (
                <div className={`h-full bg-white rounded-2xl border p-4 transition-all
                  ${r.href ? 'border-slate-200 hover:border-violet-300 hover:shadow-md cursor-pointer' : 'border-dashed border-slate-200 opacity-70'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-slate-800 text-sm">{r.title}</h3>
                    {!r.href && <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">قريباً</span>}
                  </div>
                  <p className="text-xs text-slate-500">{r.desc}</p>
                </div>
              )
              return r.href
                ? <Link key={r.key} href={r.href}>{card}</Link>
                : <div key={r.key}>{card}</div>
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

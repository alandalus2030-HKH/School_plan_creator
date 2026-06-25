'use client'

import Link from 'next/link'
import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { usePermissions } from '@/lib/PermissionsContext'
import NoAccess from '@/components/NoAccess'
import {
  FileText, ClipboardList, Map, Users, Package, MapPin,
  TrendingUp, ShieldCheck, Award, ArrowLeft, Play, CalendarRange,
} from 'lucide-react'

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type Report = { key: string; title: string; desc: string; href?: string; timeBased?: boolean; schoolWide?: boolean }
type Group = { label: string; Icon: any; reports: Report[] }

/* الكتالوج — href = جاهز، بدونه = قريباً */
const GROUPS: Group[] = [
  {
    label: 'المهام', Icon: ClipboardList, reports: [
      { key: 'task-status', title: 'حالة المهام', desc: 'توزيع الحالات والمتأخرات', href: '/dashboard/reports/r/task-status' },
      { key: 'overdue', title: 'المهام المتأخرة', desc: 'قائمة المتأخر مع المكلَّفين', href: '/dashboard/reports/r/overdue' },
      { key: 'rework', title: 'المهام المُعادة', desc: 'الإعادات وأسبابها', href: '/dashboard/reports/r/rework', timeBased: true },
    ],
  },
  {
    label: 'الخطط', Icon: Map, reports: [
      { key: 'plans-portfolio', title: 'محفظة الخطط', desc: 'كل الخطط ومؤشراتها', href: '/dashboard/reports/r/plans-portfolio' },
      { key: 'plan-progress', title: 'تقدّم الخطة', desc: 'التقدّم حسب محاور الخطة', href: '/dashboard/reports/r/plan-progress' },
      { key: 'sip', title: 'خطة التحسين المدرسي (QNSA)', desc: 'تقرير الاعتماد الشامل', href: '/dashboard/reports/r/sip' },
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
      { key: 'performance', title: 'تحليل الأداء', desc: 'الإنجاز والجودة حسب القسم', href: '/dashboard/reports/r/performance' },
      { key: 'trend', title: 'الاتجاه الزمني', desc: 'تطوّر الإنجاز عبر الوقت', href: '/dashboard/reports/r/trend', timeBased: true, schoolWide: true },
      { key: 'coverage', title: 'التغطية والفجوات', desc: 'تغطية المعايير بالأدلة', href: '/dashboard/reports/r/coverage' },
      { key: 'accreditation', title: 'جاهزية الاعتماد', desc: 'الفجوات قبل الاعتماد', href: '/dashboard/reports/r/accreditation' },
    ],
  },
  {
    label: 'الحوكمة والتحفيز', Icon: ShieldCheck, reports: [
      { key: 'audit', title: 'سجل التدقيق', desc: 'من فعل ماذا ومتى', href: '/dashboard/reports/r/audit', timeBased: true, schoolWide: true },
      { key: 'recognition', title: 'التقدير والصدارة', desc: 'الأوسمة والنقاط وموظف الشهر', href: '/dashboard/reports/r/recognition', timeBased: true, schoolWide: true },
    ],
  },
]

export default function OfficialReportsCatalog() {
  const { can, loading } = usePermissions()
  const router = useRouter()
  const runnable = useMemo(() => GROUPS.flatMap(g => g.reports.filter(r => r.href).map(r => ({ ...r, group: g.label }))), [])
  const [sel, setSel] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState(todayStr())
  const [plans, setPlans] = useState<{ id: string; name_ar: string }[]>([])
  const [planId, setPlanId] = useState('')
  const selReport = runnable.find(r => r.key === sel)
  const isTime = !!selReport?.timeBased
  const isSchoolWide = !!selReport?.schoolWide

  useEffect(() => {
    fetch('/api/reports?type=plans-list').then(r => r.ok ? r.json() : { plans: [] })
      .then(j => setPlans(j.plans || [])).catch(() => {})
  }, [])

  const preset = (days: number) => {
    const d = new Date(); d.setDate(d.getDate() - days)
    setFrom(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
    setTo(todayStr())
  }
  const run = () => {
    if (!selReport?.href) return
    const p = new URLSearchParams()
    /* الخطة — للتقارير غير المدرسية الطابع */
    if (!isSchoolWide && planId) {
      p.set('plan', planId)
      const pl = plans.find(x => x.id === planId)
      if (pl) p.set('pl', pl.name_ar)
    }
    /* الفترة — للتقارير الزمنية دائماً، وللقطية فقط عند تحديد «من» صراحةً (حفاظاً على لقطة الوضع الحالي) */
    if (from) p.set('from', from)
    if (to && (isTime || from)) p.set('to', to)
    const qs = p.toString()
    router.push(selReport.href + (qs ? `?${qs}` : ''))
  }

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

      {/* ═══ مُشغّل التقارير: قائمة + فترة + إصدار ═══ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">اختر التقرير</label>
            <select value={sel} onChange={e => setSel(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-300">
              <option value="">— اختر تقريراً —</option>
              {GROUPS.map(g => (
                <optgroup key={g.label} label={g.label}>
                  {g.reports.filter(r => r.href).map(r => <option key={r.key} value={r.key}>{r.title}</option>)}
                </optgroup>
              ))}
            </select>
          </div>

          {/* منتقي الخطة — للتقارير غير المدرسية الطابع */}
          {selReport && !isSchoolWide && (
            <div className="min-w-[180px]">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">الخطة</label>
              <select value={planId} onChange={e => setPlanId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-300">
                <option value="">كل الخطط</option>
                {plans.map(p => <option key={p.id} value={p.id}>{p.name_ar}</option>)}
              </select>
            </div>
          )}

          {/* الفترة — لكل التقارير (للقطية: تُترك فارغة للوضع الحالي) */}
          {selReport && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">من</label>
                <input type="date" value={from} onChange={e => setFrom(e.target.value)} dir="ltr"
                  className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">إلى</label>
                <input type="date" value={to} onChange={e => setTo(e.target.value)} dir="ltr"
                  className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
              </div>
            </>
          )}

          <button onClick={run} disabled={!selReport?.href}
            className="inline-flex items-center gap-2 text-sm text-white px-5 py-2.5 rounded-xl font-medium transition-all hover:brightness-110 disabled:opacity-50"
            style={{ background: 'var(--gradient-button, #8a1538)' }}>
            <Play size={15} /> إصدار
          </button>
        </div>

        {selReport && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <CalendarRange size={14} className="text-slate-400" />
            <span className="text-xs text-slate-400">فترات سريعة:</span>
            {[['هذا الشهر', 30], ['آخر 90 يوماً', 90], ['هذا العام', 365]].map(([label, days]) => (
              <button key={label as string} onClick={() => preset(days as number)}
                className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:border-violet-300 transition-colors">
                {label as string}
              </button>
            ))}
            <button onClick={() => { setFrom(''); setTo(todayStr()) }}
              className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-500 hover:border-violet-300 transition-colors">
              مسح الفترة
            </button>
          </div>
        )}
        {selReport && !isTime && (
          <p className="text-xs text-slate-400 mt-2">
            اتركْ الفترة فارغة للحصول على لقطة الوضع الحالي، أو حدّد «من» لتصفية المهام حسب الموعد النهائي ضمن المدى.
          </p>
        )}
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

/* ════════════════════════════════════════════════════════════
   مُولّد تقرير الاعتماد المدرسي الوطني القطري (QNSA)
   يجمع بيانات الخطة كاملةً ويُنتج تقريراً احترافياً قابلاً للطباعة/PDF
   ════════════════════════════════════════════════════════════ */

import { createClient } from './supabase/client'

const STATUS_AR: Record<string, string> = {
  not_started: 'لم تبدأ', in_progress: 'جارية', completed: 'منجزة', delayed: 'متأخرة',
}
const STATUS_COLOR: Record<string, string> = {
  not_started: '#64748b', in_progress: '#8a1538', completed: '#16a34a', delayed: '#dc2626',
}
const RATING_AR: Record<number, string> = {
  5: 'ممتاز', 4: 'جيد جداً', 3: 'جيد', 2: 'مقبول', 1: 'ضعيف',
}

const esc = (s: any) => String(s ?? '').replace(/[<>&]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;' }[c] || c))
const rateColor = (p: number) => p >= 80 ? '#16a34a' : p >= 50 ? '#d97706' : '#8a1538'

/**
 * يُولّد تقرير QNSA لخطة معيّنة ويفتح نافذة الطباعة (حفظ كـ PDF)
 */
export async function generateQnsaReport(planId: string) {
  const supabase = createClient()

  /* ── جمع البيانات ── */
  const { data: plan } = await supabase
    .from('plans')
    .select('id, name_ar, academic_year, school_id, owner_id')
    .eq('id', planId).single()
  if (!plan) { alert('تعذّر تحميل الخطة'); return }

  /* مسؤول الخطة (صاحب الخطة) — للتوثيق في الغلاف */
  let ownerName: string | null = null
  if (plan.owner_id) {
    const { data: owner } = await supabase.from('profiles').select('name_ar').eq('id', plan.owner_id).maybeSingle()
    ownerName = owner?.name_ar || null
  }

  const [{ data: school }, { data: nodes }] = await Promise.all([
    supabase.from('schools')
      .select('name_ar, name_en, logo_url, vision_ar, mission_ar, address, phone, email, principal_name, ministry_number, report_header, report_footer')
      .eq('id', plan.school_id).single(),
    supabase.from('plan_nodes')
      .select('id, parent_id, level_num, name_ar, order_num')
      .eq('plan_id', planId).is('deleted_at', null).order('order_num'),
  ])

  const nodeIds = (nodes || []).map(n => n.id)

  let tasks: any[] = [], kpis: any[] = [], readings: any[] = [], evidence: any[] = []
  let transitions: any[] = []
  const actorNames: Record<string, string> = {}
  if (nodeIds.length > 0) {
    const [t, k] = await Promise.all([
      supabase.from('tasks')
        .select('id, name_ar, status, start_date, end_date, rating, node_id')
        .in('node_id', nodeIds).is('deleted_at', null),
      supabase.from('kpis')
        .select('id, name_ar, target_value, baseline_value, unit, node_id')
        .in('node_id', nodeIds),
    ])
    tasks = t.data || []
    kpis  = k.data || []

    const taskIds = tasks.map(x => x.id)
    const kpiIds  = kpis.map(x => x.id)
    const [ev, rd] = await Promise.all([
      taskIds.length ? supabase.from('evidence').select('id, task_id').in('task_id', taskIds).is('deleted_at', null) : Promise.resolve({ data: [] }),
      kpiIds.length  ? supabase.from('kpi_readings').select('kpi_id, actual_value, reading_date').in('kpi_id', kpiIds).order('reading_date', { ascending: false }) : Promise.resolve({ data: [] }),
    ])
    evidence = ev.data || []
    readings = rd.data || []

    /* سجل التحوّلات (الاعتماد والمراجعة) لمصداقية تقرير الاعتماد */
    if (taskIds.length) {
      const { data: trs } = await supabase.from('task_transitions')
        .select('task_id, from_status, to_status, actor_id, note, created_at')
        .in('task_id', taskIds).order('created_at', { ascending: true })
      transitions = trs || []
      const actorIds = [...new Set(transitions.map(t => t.actor_id).filter(Boolean))]
      if (actorIds.length) {
        const { data: acts } = await supabase.from('profiles').select('id, name_ar').in('id', actorIds)
        for (const a of acts || []) actorNames[a.id] = a.name_ar
      }
    }
  }

  /* ── خرائط مساعدة ── */
  const childrenOf = (pid: string | null) =>
    (nodes || []).filter(n => n.parent_id === pid).sort((a, b) => a.order_num - b.order_num)
  const tasksOf = (nid: string) => tasks.filter(t => t.node_id === nid)
  const evCount = (tid: string) => evidence.filter(e => e.task_id === tid).length
  const latestReading: Record<string, { val: number; date: string }> = {}
  readings.forEach(r => { if (!latestReading[r.kpi_id]) latestReading[r.kpi_id] = { val: r.actual_value, date: r.reading_date } })

  /* جمع كل مهام عقدة وأحفادها */
  const collectTasks = (nid: string): any[] => {
    const own = tasksOf(nid)
    const kids = childrenOf(nid).flatMap(c => collectTasks(c.id))
    return [...own, ...kids]
  }

  /* ── إحصائيات عامة ── */
  const total     = tasks.length
  const completed = tasks.filter(t => t.status === 'completed').length
  const delayed   = tasks.filter(t => t.status === 'delayed').length
  const inProg    = tasks.filter(t => t.status === 'in_progress').length
  const notStart  = tasks.filter(t => t.status === 'not_started').length
  const overall   = total > 0 ? Math.round((completed / total) * 100) : 0
  const rated     = tasks.filter(t => t.rating != null)
  const avgRating = rated.length > 0 ? (rated.reduce((s, t) => s + (t.rating || 0), 0) / rated.length).toFixed(1) : '—'
  const totalEvidence = evidence.length

  const topNodes = childrenOf(null)

  /* ════════════ بناء HTML ════════════ */

  /* رأس التقرير */
  const logoHtml = school?.logo_url
    ? `<img src="${esc(school.logo_url)}" style="height:64px;width:64px;object-fit:contain;border-radius:8px" />`
    : `<div style="height:64px;width:64px;border-radius:12px;background:linear-gradient(135deg,#6f1029,#a83356);display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;font-weight:700">${esc((school?.name_ar || 'م')[0])}</div>`

  /* بيانات الاتصال (سطر واحد) */
  const contactBits = [
    school?.principal_name ? `المدير: ${esc(school.principal_name)}` : '',
    school?.ministry_number ? `الرقم الوزاري: ${esc(school.ministry_number)}` : '',
    school?.phone ? `هاتف: ${esc(school.phone)}` : '',
    school?.email ? esc(school.email) : '',
  ].filter(Boolean).join(' · ')

  const header = `
    ${school?.report_header ? `<div class="custom-header">${esc(school.report_header)}</div>` : ''}
    <div class="cover">
      <div class="cover-top">
        ${logoHtml}
        <div style="flex:1">
          <div class="school-name">${esc(school?.name_ar || 'المدرسة')}</div>
          ${school?.name_en ? `<div class="school-en">${esc(school.name_en)}</div>` : ''}
          ${school?.address ? `<div class="school-addr">${esc(school.address)}</div>` : ''}
        </div>
        <div class="qnsa-seal">
          <div style="font-size:10px;opacity:.8">دولة قطر</div>
          <div style="font-weight:700">QNSA</div>
          <div style="font-size:9px;opacity:.8">الاعتماد المدرسي</div>
        </div>
      </div>
      <h1 class="report-title">تقرير الخطة التطويرية وفق معايير الاعتماد المدرسي الوطني</h1>
      <div class="report-sub">${esc(plan.name_ar)} · العام الدراسي ${esc(plan.academic_year)}</div>
      ${ownerName ? `<div class="vm"><span class="vm-label">مسؤول الخطة:</span> ${esc(ownerName)}</div>` : ''}
      ${school?.vision_ar ? `<div class="vm"><span class="vm-label">الرؤية:</span> ${esc(school.vision_ar)}</div>` : ''}
      ${school?.mission_ar ? `<div class="vm"><span class="vm-label">الرسالة:</span> ${esc(school.mission_ar)}</div>` : ''}
      ${contactBits ? `<div class="contact-bar">${contactBits}</div>` : ''}
    </div>`

  /* ملخص تنفيذي */
  const summary = `
    <div class="section">
      <h2 class="sec-title">الملخص التنفيذي</h2>
      <div class="stats">
        <div class="stat"><div class="stat-val" style="color:#1e293b">${total}</div><div class="stat-lbl">إجمالي المهام</div></div>
        <div class="stat"><div class="stat-val" style="color:#16a34a">${completed}</div><div class="stat-lbl">منجزة</div></div>
        <div class="stat"><div class="stat-val" style="color:#8a1538">${inProg}</div><div class="stat-lbl">جارية</div></div>
        <div class="stat"><div class="stat-val" style="color:#64748b">${notStart}</div><div class="stat-lbl">لم تبدأ</div></div>
        <div class="stat"><div class="stat-val" style="color:#dc2626">${delayed}</div><div class="stat-lbl">متأخرة</div></div>
        <div class="stat"><div class="stat-val" style="color:#a83356">${avgRating}</div><div class="stat-lbl">متوسط التقييم</div></div>
      </div>
      <div class="overall">
        <div class="overall-head"><span>نسبة الإنجاز الكلية للخطة</span><span style="font-size:18px;font-weight:700;color:${rateColor(overall)}">${overall}%</span></div>
        <div class="bar-bg"><div class="bar" style="width:${overall}%;background:${rateColor(overall)}"></div></div>
        <div class="overall-foot">عدد المحاور: ${topNodes.length} · إجمالي مؤشرات الأداء: ${kpis.length} · إجمالي الأدلة المرفوعة: ${totalEvidence}</div>
      </div>
    </div>`

  /* أقسام المحاور */
  const axisSections = topNodes.map((axis, idx) => {
    const axisTasks = collectTasks(axis.id)
    const aTotal = axisTasks.length
    const aDone  = axisTasks.filter(t => t.status === 'completed').length
    const aRate  = aTotal > 0 ? Math.round((aDone / aTotal) * 100) : 0

    /* مهام المحور (مسطّحة مع مسارها) */
    const pathOf = (nid: string): string => {
      const path: string[] = []
      let cur = (nodes || []).find(n => n.id === nid)
      while (cur && cur.id !== axis.id) { path.unshift(cur.name_ar); cur = (nodes || []).find(n => n.id === cur!.parent_id) }
      return path.join(' ← ')
    }
    const taskRows = axisTasks.map(t => {
      const sc = STATUS_COLOR[t.status] || '#64748b'
      const isLate = t.end_date && t.status !== 'completed' && new Date(t.end_date) < new Date()
      return `<tr>
        <td><strong>${esc(t.name_ar)}</strong>${pathOf(t.node_id) ? `<br><span class="muted">${esc(pathOf(t.node_id))}</span>` : ''}</td>
        <td>${t.end_date ? new Date(t.end_date).toLocaleDateString('ar-QA') + (isLate ? ' ⚠' : '') : '—'}</td>
        <td><span class="badge" style="background:${sc}1a;color:${sc}">${STATUS_AR[t.status] || t.status}</span></td>
        <td>${t.rating ? (RATING_AR[t.rating] || t.rating) : '—'}</td>
        <td style="text-align:center">${evCount(t.id) || '—'}</td>
      </tr>`
    }).join('')

    /* مؤشرات أداء المحور */
    const axisNodeIds = [axis.id, ...collectDescendantIds(axis.id, nodes || [])]
    const axisKpis = kpis.filter(k => axisNodeIds.includes(k.node_id))
    const kpiRows = axisKpis.map(k => {
      const lr = latestReading[k.id]
      const pct = (k.target_value && lr) ? Math.min(Math.round((lr.val / k.target_value) * 100), 100) : null
      return `<tr>
        <td><strong>${esc(k.name_ar)}</strong></td>
        <td>${k.baseline_value != null ? esc(k.baseline_value) + esc(k.unit || '') : '—'}</td>
        <td><strong>${k.target_value != null ? esc(k.target_value) + esc(k.unit || '') : '—'}</strong></td>
        <td style="color:${pct != null ? rateColor(pct) : '#94a3b8'};font-weight:600">${lr != null ? esc(lr.val) + esc(k.unit || '') : '—'}</td>
        <td>${pct != null ? `<span style="color:${rateColor(pct)};font-weight:700">${pct}%</span>` : 'لا قراءات'}</td>
      </tr>`
    }).join('')

    return `
      <div class="section axis">
        <div class="axis-head">
          <div class="axis-num">${idx + 1}</div>
          <div style="flex:1">
            <div class="axis-name">${esc(axis.name_ar)}</div>
            <div class="axis-meta">${aDone}/${aTotal} مهمة منجزة · ${axisKpis.length} مؤشر أداء</div>
          </div>
          <div class="axis-rate" style="color:${rateColor(aRate)}">${aRate}%</div>
        </div>
        <div class="bar-bg" style="margin:8px 0 14px"><div class="bar" style="width:${aRate}%;background:${rateColor(aRate)}"></div></div>

        ${aTotal > 0 ? `
        <h3 class="sub-title">المهام والإجراءات</h3>
        <table>
          <thead><tr><th>المهمة / المسار</th><th>الموعد</th><th>الحالة</th><th>التقييم</th><th>الأدلة</th></tr></thead>
          <tbody>${taskRows}</tbody>
        </table>` : '<p class="empty">لا توجد مهام مسجّلة لهذا المحور</p>'}

        ${axisKpis.length > 0 ? `
        <h3 class="sub-title" style="margin-top:14px">مؤشرات الأداء (KPIs)</h3>
        <table>
          <thead><tr><th>المؤشر</th><th>الخط الأساسي</th><th>المستهدف</th><th>آخر قراءة</th><th>نسبة التحقق</th></tr></thead>
          <tbody>${kpiRows}</tbody>
        </table>` : ''}
      </div>`
  }).join('')

  /* سجل الاعتماد والمراجعة (سلسلة سير العمل الموثّقة) */
  const ACTION_AR: Record<string, string> = {
    submitted: 'رفع للتقييم', completed: 'اعتماد وإنجاز', returned: 'إعادة للتعديل',
    in_progress: 'بدء/إعادة فتح', not_started: 'إعادة فتح',
  }
  const taskName = (id: string) => tasks.find(t => t.id === id)?.name_ar || '—'
  const trackable = transitions.filter(t => ['submitted', 'completed', 'returned'].includes(t.to_status))
  const approvalSection = trackable.length ? `
    <div class="section">
      <h2 class="sec-title">سجل الاعتماد والمراجعة</h2>
      <p class="muted" style="margin-bottom:8px">توثيق سلسلة سير العمل: من رفع/اعتمد/أعاد كل مهمة ومتى — لتعزيز مصداقية ملف الاعتماد.</p>
      <table>
        <thead><tr><th>المهمة</th><th>الإجراء</th><th>المنفِّذ</th><th>التاريخ</th><th>ملاحظة / سبب</th></tr></thead>
        <tbody>${trackable.map(t => `<tr>
          <td><strong>${esc(taskName(t.task_id))}</strong></td>
          <td>${esc(ACTION_AR[t.to_status] || t.to_status)}</td>
          <td>${esc(actorNames[t.actor_id] || '—')}</td>
          <td>${new Date(t.created_at).toLocaleDateString('ar-QA')}</td>
          <td>${esc(t.note || '—')}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>` : ''

  const html = header + summary + axisSections + approvalSection

  /* ════════════ فتح نافذة الطباعة ════════════ */
  const win = window.open('', '_blank', 'width=1000,height=760')
  if (!win) { alert('يُرجى السماح بالنوافذ المنبثقة لتصدير التقرير'); return }
  win.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>تقرير QNSA — ${esc(plan.name_ar)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Cairo','Segoe UI',Tahoma,Arial,sans-serif;color:#1e293b;direction:rtl;font-size:12.5px;padding:0;background:#fff}
  .custom-header{text-align:center;font-size:11px;color:#6f1029;font-weight:600;padding:8px 32px 0}
  .cover{background:linear-gradient(135deg,#46091a,#8a1538 60%,#a83356);color:#fff;padding:28px 32px;border-radius:0 0 18px 18px;margin-bottom:22px}
  .school-addr{font-size:10.5px;opacity:.8;margin-top:3px}
  .contact-bar{font-size:10.5px;opacity:.9;margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.2)}
  .cover-top{display:flex;align-items:center;gap:16px;margin-bottom:18px}
  .school-name{font-size:22px;font-weight:700}
  .school-en{font-size:13px;opacity:.85;direction:ltr;text-align:right}
  .qnsa-seal{text-align:center;border:2px solid rgba(255,255,255,.5);border-radius:10px;padding:8px 12px;line-height:1.4}
  .report-title{font-size:19px;font-weight:700;margin-bottom:6px;line-height:1.4}
  .report-sub{font-size:13px;opacity:.9;margin-bottom:14px}
  .vm{font-size:11.5px;opacity:.92;margin-top:5px;line-height:1.6}
  .vm-label{font-weight:700;opacity:1}
  .section{padding:0 32px;margin-bottom:24px;page-break-inside:avoid}
  .sec-title{font-size:16px;font-weight:700;color:#8a1538;border-bottom:2px solid #e9bcc6;padding-bottom:6px;margin-bottom:14px}
  .stats{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:16px}
  .stat{background:#fbf2f4;border:1px solid #f4dde2;border-radius:10px;padding:12px 6px;text-align:center}
  .stat-val{font-size:22px;font-weight:700}
  .stat-lbl{font-size:10px;color:#64748b;margin-top:3px}
  .overall{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px}
  .overall-head{display:flex;justify-content:space-between;align-items:center;font-weight:600;margin-bottom:8px}
  .overall-foot{font-size:10.5px;color:#64748b;margin-top:8px}
  .bar-bg{height:9px;background:#f1f5f9;border-radius:999px;overflow:hidden}
  .bar{height:100%;border-radius:999px}
  .axis{border:1px solid #e9bcc6;border-radius:14px;padding:16px;margin:0 32px 18px}
  .axis-head{display:flex;align-items:center;gap:12px}
  .axis-num{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,#6f1029,#a83356);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;flex-shrink:0}
  .axis-name{font-size:15px;font-weight:700;color:#1e293b}
  .axis-meta{font-size:11px;color:#64748b;margin-top:2px}
  .axis-rate{font-size:20px;font-weight:700}
  .sub-title{font-size:12.5px;font-weight:700;color:#6f1029;margin-bottom:6px}
  table{width:100%;border-collapse:collapse;font-size:11.5px;margin-top:4px}
  th{background:#fbf2f4;padding:7px 10px;text-align:right;font-weight:700;color:#6f1029;border-bottom:1.5px solid #e9bcc6}
  td{padding:7px 10px;border-bottom:1px solid #f1f5f9;color:#334155;vertical-align:top}
  .badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:10.5px;font-weight:700}
  .muted{font-size:10px;color:#94a3b8}
  .empty{font-size:11.5px;color:#94a3b8;padding:10px 0;text-align:center}
  .foot{padding:14px 32px;border-top:1px solid #f1f5f9;color:#94a3b8;font-size:10px;display:flex;justify-content:space-between;margin-top:14px}
  @media print{.axis,.section{page-break-inside:avoid}@page{margin:1.2cm}.cover{border-radius:0}}
</style></head><body>
  ${html}
  <div class="foot">
    <span>${school?.report_footer ? esc(school.report_footer) : 'نظام متابعة الخطط المدرسية · تقرير وفق معايير الاعتماد المدرسي الوطني القطري (QNSA)'}</span>
    <span>تاريخ الإصدار: ${new Date().toLocaleDateString('ar-QA')}</span>
  </div>
  <script>window.onload=()=>{setTimeout(()=>window.print(),400)}<\/script>
</body></html>`)
  win.document.close()
}

/* جمع معرّفات كل الأحفاد لعقدة */
function collectDescendantIds(nid: string, nodes: any[]): string[] {
  const kids = nodes.filter(n => n.parent_id === nid)
  return kids.flatMap(k => [k.id, ...collectDescendantIds(k.id, nodes)])
}

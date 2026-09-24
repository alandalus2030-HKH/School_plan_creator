/* ════════════════════════════════════════════════════════════════
   تحقّق مزدوج المصدر لكتالوج «official-2026»
   ────────────────────────────────────────────────────────────────
   الملفّان في Desktop/guide يحملان المحتوى نفسه بصيغتين:
     · accreditation_catalog_2026.json      (شجرة)
     · كتالوج الاعتماد - بيانات البرمجية.xlsx (ثماني أوراق مسطّحة)
   هذا السكربت يطابقهما عنصراً بعنصر. أيّ اختلاف يتوقّف عنده قبل
   أن يصل القاعدة — فالمطابقة بين مصدرين مستقلّين تكشف خطأ التحويل،
   لا خطأ الوثيقة الأصلية (ذاك يكشفه التدقيق البشريّ).

   التشغيل: node scripts/qnsa-official-2026/verify_sources.mjs
   ════════════════════════════════════════════════════════════════ */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const SRC  = 'C:/Users/pcl_h/Desktop/guide'
const JSONF = path.join(SRC, 'accreditation_catalog_2026.json')
const XLSXF = path.join(SRC, 'كتالوج الاعتماد - بيانات البرمجية.xlsx')

/* المسافات وأسطر النهاية وحدها تُسوّى؛ ما عدا ذلك يُقارَن حرفياً */
const norm = t => String(t ?? '').replace(/\r\n?/g, '\n').replace(/[ \t\u00a0]+/g, ' ').trim()

/* ── (1) تسطيح JSON إلى الجداول الثمانية ── */
const tree = JSON.parse(fs.readFileSync(JSONF, 'utf8'))
const J = { mains: [], aspects: [], subs: [], inds: [], expl: [], refl: [], evid: [], rubric: [] }

for (const st of tree.standards) {
  J.mains.push({ code: st.number, name: st.name })
  for (const a of st.aspects) {
    J.aspects.push({ code: a.number, parent: st.number, name: a.name })
    ;(a.evidence || []).forEach(e => J.evid.push({ code: e.number, aspect: a.number, text: e.text }))
    for (const s of a.substandards) {
      J.subs.push({ code: s.number, aspect: a.number, main: st.number, name: s.name, nInd: s.indicators.length })
      s.indicators.forEach(i => J.inds.push({ code: i.number, sub: s.number, aspect: a.number, text: i.text }))
      ;(s.explanatory_data || []).forEach((e, n) => J.expl.push({ sub: s.number, seq: n + 1, level: e.level, text: e.text }))
      ;(s.reflection_questions || []).forEach((q, n) => J.refl.push({ sub: s.number, seq: n + 1, text: q.text }))
      ;(s.rubric || []).forEach(r => J.rubric.push({
        sub: s.number, row: r.row, group: r.group || '',
        excellent: r.excellent, very_good: r.very_good, good: r.good, acceptable: r.acceptable, weak: r.weak,
      }))
    }
  }
}

/* ── (2) قراءة أوراق Excel ── */
const wb = XLSX.readFile(XLSXF)
const sheet = n => XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '' })
const X = {
  mains:   sheet('المعايير الرئيسة'),
  aspects: sheet('الجوانب'),
  subs:    sheet('المعايير الفرعية'),
  inds:    sheet('مؤشرات الأداء'),
  expl:    sheet('البيانات التوضيحية'),
  refl:    sheet('أسئلة التأمل'),
  evid:    sheet('الأدلة'),
  rubric:  sheet('سلم التقدير'),
}

/* ── (3) المقارنة ── */
let failures = 0
const report = []

/** يقارن مجموعتين بمفتاحٍ واحد وحقولٍ نصّية */
function compare(label, jRows, xRows, keyOf, fields) {
  const jMap = new Map(jRows.map(r => [keyOf.j(r), r]))
  const xMap = new Map(xRows.map(r => [keyOf.x(r), r]))
  const onlyJ = [...jMap.keys()].filter(k => !xMap.has(k))
  const onlyX = [...xMap.keys()].filter(k => !jMap.has(k))
  const diffs = []

  for (const [k, jr] of jMap) {
    const xr = xMap.get(k); if (!xr) continue
    for (const f of fields) {
      const a = norm(f.j(jr)), b = norm(f.x(xr))
      if (a !== b) diffs.push({ key: k, field: f.name, json: a, xlsx: b })
    }
  }

  const ok = !onlyJ.length && !onlyX.length && !diffs.length
  if (!ok) failures++
  report.push({ label, jn: jRows.length, xn: xRows.length, onlyJ, onlyX, diffs, ok })
}

const S = k => r => r[k]

compare('المعايير الرئيسة', J.mains, X.mains,
  { j: r => r.code, x: r => String(r['رقم المعيار']) },
  [{ name: 'الاسم', j: r => r.name, x: S('اسم المعيار الرئيس') }])

compare('الجوانب', J.aspects, X.aspects,
  { j: r => r.code, x: r => String(r['رقم الجانب']) },
  [{ name: 'الاسم', j: r => r.name, x: S('اسم الجانب') },
   { name: 'الأب',  j: r => r.parent, x: r => String(r['رقم المعيار الرئيس']) }])

compare('المعايير الفرعية', J.subs, X.subs,
  { j: r => r.code, x: r => String(r['رقم المعيار الفرعي']) },
  [{ name: 'الاسم',        j: r => r.name,  x: S('اسم المعيار الفرعي') },
   { name: 'الجانب',       j: r => r.aspect, x: r => String(r['رقم الجانب']) },
   { name: 'عدد المؤشرات', j: r => r.nInd,  x: r => String(r['عدد المؤشرات']) }])

compare('مؤشرات الأداء', J.inds, X.inds,
  { j: r => r.code, x: r => String(r['رقم المؤشر']) },
  [{ name: 'النصّ',   j: r => r.text, x: S('نص المؤشر') },
   { name: 'المعيار', j: r => r.sub,  x: r => String(r['رقم المعيار الفرعي']) }])

compare('البيانات التوضيحية', J.expl, X.expl,
  { j: r => r.sub + '#' + r.seq, x: r => String(r['رقم المعيار الفرعي']) + '#' + String(r['الترتيب']) },
  [{ name: 'النصّ', j: r => r.text, x: S('النص') }])

compare('أسئلة التأمل', J.refl, X.refl,
  { j: r => r.sub + '#' + r.seq, x: r => String(r['رقم المعيار الفرعي']) + '#' + String(r['الترتيب']) },
  [{ name: 'السؤال', j: r => r.text, x: S('السؤال') }])

/* ترقيم الأدلة يختلف شكلاً بين المصدرين — JSON: «1.1.E3» · Excel: «1.1.3» —
   والمضمون واحد. يُوحَّد المفتاح إلى «كود الجانب # ترتيب الدليل». */
const evKey = (aspect, code) => `${aspect}#${String(code).split('.').pop().replace(/^E/i, '')}`

compare('نماذج الأدلة', J.evid, X.evid,
  { j: r => evKey(r.aspect, r.code), x: r => evKey(String(r['رقم الجانب']), r['رقم الدليل']) },
  [{ name: 'النصّ',  j: r => r.text,   x: S('الدليل') },
   { name: 'الجانب', j: r => r.aspect, x: r => String(r['رقم الجانب']) }])

compare('سلم التقدير', J.rubric, X.rubric,
  { j: r => r.sub + '#' + r.row, x: r => String(r['رقم المعيار الفرعي']) + '#' + String(r['رقم الصف']) },
  [{ name: 'ممتاز',   j: r => r.excellent,  x: S('ممتاز') },
   { name: 'جيد جداً', j: r => r.very_good, x: S('جيد جداً') },
   { name: 'جيد',     j: r => r.good,       x: S('جيد') },
   { name: 'مقبول',   j: r => r.acceptable, x: S('مقبول') },
   { name: 'ضعيف',    j: r => r.weak,       x: S('ضعيف') }])

/* ── (4) العرض ── */
console.log('تحقّق مزدوج المصدر — JSON مقابل Excel')
console.log('═'.repeat(64))
for (const r of report) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.label}: JSON ${r.jn} · Excel ${r.xn}`
    + (r.ok ? ' — مطابق' : ` — فروق: ${r.diffs.length} · في JSON فقط: ${r.onlyJ.length} · في Excel فقط: ${r.onlyX.length}`))
  r.onlyJ.slice(0, 5).forEach(k => console.log('    في JSON فقط:', k))
  r.onlyX.slice(0, 5).forEach(k => console.log('    في Excel فقط:', k))
  r.diffs.slice(0, 5).forEach(d => {
    console.log(`    ✗ ${d.key} · ${d.field}`)
    console.log('       JSON :', d.json.slice(0, 120))
    console.log('       Excel:', d.xlsx.slice(0, 120))
  })
}
console.log('═'.repeat(64))
const total = { subs: J.subs.length, inds: J.inds.length, rubric: J.rubric.length, evid: J.evid.length }
console.log(`الإجمالي: ${J.mains.length} محاور · ${J.aspects.length} جوانب · ${total.subs} معايير فرعية · ${total.inds} مؤشرات`)
console.log(`         ${total.rubric} صفّ سلم (${total.rubric * 5} عبارة) · ${total.evid} نموذج دليل`)
console.log(`         ${J.expl.length} بياناً توضيحياً · ${J.refl.length} سؤال تأمّل`)

if (failures) { console.log(`\n✗ أخفق ${failures} من ${report.length} فحوص — لا تُولَّد الترحيلات قبل حلّها.`); process.exitCode = 1 }
else console.log('\n✓ المصدران متطابقان تماماً.')

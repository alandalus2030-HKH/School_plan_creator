/* ════════════════════════════════════════════════════════════════
   توليد `docs/QNSA_FRAMEWORK_FULL.docx` — نسخةٌ كاملة من الإطار النشط
   ────────────────────────────────────────────────────────────────
   يسأل القاعدة مباشرةً، ويُرشّح **بعقد الإصدار النشط**: الجداول التابعة
   (`framework_rubric` · `framework_evidence_samples` ·
    `framework_node_notes`) لا تحمل `framework_id` — تتصل بالإطار عبر
   العقدة وحدها. ومن نسي الترشيح جمع الإصدارات: أوّل استخراجٍ غير
   مرشَّح أعطى 345 صفّ تقدير و449 نموذجاً بدل 168 و245.

   ويتوقّف بخطأ إن خالفت الأرقام الرسمية — فالمستند لا يُسلَّم ناقصاً.

   التشغيل من جذر المشروع:   npm run framework:docx
   ويقرأ مفاتيح القاعدة من `.env.local`.
   ════════════════════════════════════════════════════════════════ */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

let docx
try { docx = await import('docx') } catch {
  console.error('المكتبة `docx` غير مثبّتة. ثبّتها مرّةً: npm i -D docx')
  process.exit(2)
}
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, TableOfContents, PageBreak, PageNumber, Footer,
} = docx

/* ── الأرقام الرسمية — حارسٌ لا زينة ── */
const EXPECTED = { l1: 5, l2: 15, l3: 76, l4: 284, rows: 168, descs: 840, samples: 245, notes: 819 }

/* ── القاعدة ── */
const envText = fs.readFileSync(path.resolve('.env.local'), 'utf8')
const env = Object.fromEntries(envText.split(/\r?\n/).filter(l => l.includes('='))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const page = async (t, sel, extra = q => q) => {
  let out = [], from = 0
  for (;;) {
    const { data, error } = await extra(db.from(t).select(sel)).range(from, from + 999)
    if (error) { console.error(`تعذّرت قراءة ${t}: ${error.message}`); process.exit(2) }
    out = out.concat(data || [])
    if (!data || data.length < 1000) break
    from += 1000
  }
  return out
}

const { data: fw, error: fwErr } = await db.from('frameworks')
  .select('id, code, version, name_ar').eq('status', 'active').single()
if (fwErr || !fw) { console.error('لا إصدار نشط في القاعدة'); process.exit(2) }

const nodes = await page('framework_nodes', 'id,code,name_ar,level,sort_order', q => q.eq('framework_id', fw.id))
const ids   = new Set(nodes.map(n => n.id))
const keep  = a => a.filter(r => ids.has(r.framework_node_id))     // ← الترشيح الذي لا يُنسى
const rubric  = keep(await page('framework_rubric', 'framework_node_id,row_index,level,descriptor_ar'))
const samples = keep(await page('framework_evidence_samples', 'framework_node_id,text_ar,sort_order'))
const notes   = keep(await page('framework_node_notes', 'framework_node_id,kind,sort_order,text_ar,depth,source_page'))
const { data: scale } = await db.from('framework_rating_scale')
  .select('level,name_ar,name_en').eq('framework_id', fw.id).order('level')

/* ── الحارس ── */
const actual = {
  l1: nodes.filter(n => n.level === 1).length, l2: nodes.filter(n => n.level === 2).length,
  l3: nodes.filter(n => n.level === 3).length, l4: nodes.filter(n => n.level === 4).length,
  rows: new Set(rubric.map(r => r.framework_node_id + '#' + r.row_index)).size,
  descs: rubric.length, samples: samples.length, notes: notes.length,
}
const bad = Object.entries(EXPECTED).filter(([k, v]) => actual[k] !== v)
if (bad.length) {
  console.error('الأرقام لا تطابق الرسمية — لم يُولَّد المستند:')
  bad.forEach(([k, v]) => console.error(`  ${k}: ${actual[k]} (المتوقع ${v})`))
  console.error('شغّل  node scripts/qnsa-official-2026/verify_db.mjs  لتعرف أين الخلل.')
  process.exit(1)
}

/* ════════ البناء ════════ */
const FONT = 'Arial'
const C = { main: '8A1538', aspect: '6D28D9', sub: '0F766E', ind: '334155', soft: '64748B' }
const byParent = (pid, lvl) => nodes.filter(n => n.parent_id === pid && n.level === lvl)
const kids = (code, lvl) => nodes.filter(n => n.level === lvl && n.code.startsWith(code + '.')
  && n.code.split('.').length === lvl).sort(cmpCode)
const cmpCode = (a, b) => a.code.localeCompare(b.code, 'en', { numeric: true })
const roots = nodes.filter(n => n.level === 1).sort(cmpCode)

const group = (arr, key) => arr.reduce((m, r) => ((m[r[key]] ||= []).push(r), m), {})
const rubricOf = group(rubric, 'framework_node_id')
const samplesOf = group(samples, 'framework_node_id')
const notesOf = group(notes, 'framework_node_id')
const idOfCode = new Map(nodes.map(n => [n.code, n.id]))
const scaleName = Object.fromEntries((scale || []).map(s => [s.level, s.name_ar]))

/* النصّ قد يحمل أسطراً داخله — والمكتبة لا تقبلها داخل TextRun */
const splitRuns = (text, o = {}) =>
  String(text ?? '').split(/\r?\n/).map((part, i) => new TextRun({
    text: part, break: i ? 1 : 0, rightToLeft: true, font: FONT,
    size: o.size ?? 22, bold: o.bold, color: o.color, italics: o.italics,
  }))

const P = (text, o = {}) => new Paragraph({
  bidirectional: true, alignment: o.align || AlignmentType.RIGHT,
  spacing: { after: o.after ?? 80, line: 300 }, indent: o.indent,
  heading: o.heading, pageBreakBefore: o.pageBreakBefore,
  children: splitRuns(text, o),
})

const runs = (parts, o = {}) => new Paragraph({
  bidirectional: true, alignment: AlignmentType.RIGHT,
  spacing: { after: o.after ?? 80, line: 300 }, indent: o.indent,
  children: parts.flatMap(p => splitRuns(p.t, p)),
})

const cell = (text, o = {}) => new TableCell({
  width: { size: o.w, type: WidthType.DXA },
  shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: 'auto' } : undefined,
  margins: { top: 80, bottom: 80, left: 120, right: 120 },
  children: [P(text, { size: o.size ?? 20, bold: o.bold, color: o.color, after: 0 })],
})

const FULL = 9360
const kid = []

/* الغلاف */
kid.push(
  new Paragraph({ spacing: { after: 2400 }, children: [] }),
  P(fw.name_ar || 'إطار الاعتماد المدرسي الوطني', { align: AlignmentType.CENTER, size: 44, bold: true, color: C.main, after: 200 }),
  P(`${fw.code} · إصدار ${fw.version}`, { align: AlignmentType.CENTER, size: 26, color: C.soft, after: 1200 }),
  P('نسخةٌ كاملة مستخرَجة من قاعدة بيانات نظام متابعة الخطط المدرسية', { align: AlignmentType.CENTER, size: 22, color: C.ind, after: 100 }),
  P(`تاريخ الاستخراج: ${new Date().toISOString().slice(0, 10)}`, { align: AlignmentType.CENTER, size: 20, color: C.soft, after: 1600 }),
)
kid.push(new Table({
  width: { size: 6000, type: WidthType.DXA }, columnWidths: [4200, 1800],
  alignment: AlignmentType.CENTER, visuallyRightToLeft: true,
  rows: [
    ['المعايير الرئيسة', actual.l1], ['الجوانب', actual.l2],
    ['المعايير الفرعية', actual.l3], ['مؤشرات الأداء', actual.l4],
    ['صفوف سلّم التقدير', actual.rows], ['أوصاف الأداء (صفوف × 5 مستويات)', actual.descs],
    ['نماذج الأدلة الدالّة', actual.samples], ['الإرشادات وأسئلة التأمّل', actual.notes],
  ].map(([k, v]) => new TableRow({ children: [
    cell(k, { w: 4200, fill: 'F8FAFC' }), cell(String(v), { w: 1800, bold: true, color: C.main }),
  ] })),
}))
kid.push(new Paragraph({ children: [new PageBreak()] }))

/* المحتويات */
kid.push(P('المحتويات', { heading: HeadingLevel.HEADING_1, size: 32, bold: true, color: C.main, after: 200 }))
kid.push(new TableOfContents('المحتويات', { hyperlink: true, headingStyleRange: '1-2' }))
kid.push(new Paragraph({ children: [new PageBreak()] }))

/* سلّم التقدير */
kid.push(P('سلّم التقدير', { heading: HeadingLevel.HEADING_1, size: 32, bold: true, color: C.main, after: 120 }))
kid.push(P('خمسة مستويات يُحكَم بها على كل صفٍّ من صفوف السلّم تحت المعيار الفرعي.', { color: C.soft, size: 20, after: 200 }))
kid.push(new Table({
  width: { size: FULL, type: WidthType.DXA }, columnWidths: [1200, 3000, 5160], visuallyRightToLeft: true,
  rows: [
    new TableRow({ tableHeader: true, children: [
      cell('المستوى', { w: 1200, bold: true, fill: 'F1F5F9' }),
      cell('التقدير', { w: 3000, bold: true, fill: 'F1F5F9' }),
      cell('بالإنجليزية', { w: 5160, bold: true, fill: 'F1F5F9' }),
    ] }),
    ...[...(scale || [])].sort((a, b) => b.level - a.level).map(s => new TableRow({ children: [
      cell(String(s.level), { w: 1200 }), cell(s.name_ar, { w: 3000, bold: true }), cell(s.name_en || '', { w: 5160 }),
    ] })),
  ],
}))

/* المتن */
for (const main of roots) {
  kid.push(P(`المعيار الرئيس ${main.code} — ${main.name_ar}`, {
    heading: HeadingLevel.HEADING_1, size: 32, bold: true, color: C.main, after: 160, pageBreakBefore: true }))

  for (const asp of kids(main.code, 2)) {
    kid.push(P(`${asp.code} — ${asp.name_ar}`, {
      heading: HeadingLevel.HEADING_2, size: 27, bold: true, color: C.aspect, after: 120 }))

    const sam = (samplesOf[asp.id] || []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    if (sam.length) {
      kid.push(P(`نماذج الأدلة الدالّة على هذا الجانب (${sam.length}) — استرشادية لا حاصرة`, { size: 20, bold: true, color: C.soft, after: 60 }))
      sam.forEach(x => kid.push(runs([{ t: '•  ', color: C.aspect, bold: true }, { t: x.text_ar, size: 20 }], { indent: { right: 300 }, after: 40 })))
      kid.push(P('', { after: 80 }))
    }

    for (const sub of kids(asp.code, 3)) {
      kid.push(P(`${sub.code} — ${sub.name_ar}`, {
        heading: HeadingLevel.HEADING_3, size: 24, bold: true, color: C.sub, after: 100 }))

      const inds = kids(sub.code, 4)
      if (inds.length) {
        kid.push(P(`مؤشرات الأداء (${inds.length})`, { size: 20, bold: true, color: C.soft, after: 60 }))
        inds.forEach(i => kid.push(runs(
          [{ t: `${i.code}  `, bold: true, color: C.ind, size: 20 }, { t: i.name_ar, size: 21 }],
          { indent: { right: 300 }, after: 50 })))
      }

      const rows = rubricOf[sub.id] || []
      if (rows.length) {
        const byRow = group(rows, 'row_index')
        const idxs = Object.keys(byRow).map(Number).sort((a, b) => a - b)
        kid.push(P(`سلّم التقدير — ${idxs.length} ${idxs.length === 1 ? 'صفّ' : 'صفوف'}`, { size: 20, bold: true, color: C.soft, after: 60 }))
        idxs.forEach(ri => {
          const descs = byRow[ri].sort((a, b) => b.level - a.level)
          kid.push(new Table({
            width: { size: FULL, type: WidthType.DXA }, columnWidths: [1500, 7860], visuallyRightToLeft: true,
            rows: [
              new TableRow({ tableHeader: true, children: [
                cell(`الصفّ ${ri}`, { w: 1500, bold: true, fill: 'EEF2FF', color: C.sub }),
                cell('وصف الأداء', { w: 7860, bold: true, fill: 'EEF2FF', color: C.sub }),
              ] }),
              ...descs.map(d => new TableRow({ children: [
                cell(scaleName[d.level] || String(d.level), { w: 1500, bold: true, fill: 'F8FAFC' }),
                cell(d.descriptor_ar, { w: 7860, size: 19 }),
              ] })),
            ],
          }))
          kid.push(P('', { after: 100 }))
        })
      }

      const nts = (notesOf[sub.id] || []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      const block = (title, arr, color) => {
        if (!arr.length) return
        const pages = [...new Set(arr.map(n => n.source_page).filter(Boolean))].sort((a, b) => a - b)
        kid.push(P(`${title} (${arr.length})${pages.length ? ` — ص ${pages.join('، ')}` : ''}`, { size: 20, bold: true, color: C.soft, after: 60 }))
        arr.forEach(n => kid.push(runs([{ t: '— ', color, bold: true }, { t: n.text_ar, size: 19 }],
          { indent: { right: 300 + 200 * Math.max(0, (n.depth || 1) - 1) }, after: 40 })))
        kid.push(P('', { after: 80 }))
      }
      block('إرشادات التطبيق', nts.filter(n => n.kind === 'guidance'), C.sub)
      block('أسئلة التأمّل', nts.filter(n => n.kind === 'reflection'), C.aspect)
    }
  }
}

const doc = new Document({
  creator: 'نظام متابعة الخطط المدرسية',
  title: fw.name_ar || 'إطار الاعتماد',
  description: `استخراج كامل — ${fw.code} ${fw.version}`,
  styles: {
    default: {
      document: { run: { font: FONT, size: 22 }, paragraph: { spacing: { line: 300 } } },
      heading1: { run: { font: FONT, size: 32, bold: true, color: C.main }, paragraph: { spacing: { before: 240, after: 160 } } },
      heading2: { run: { font: FONT, size: 27, bold: true, color: C.aspect }, paragraph: { spacing: { before: 200, after: 120 } } },
      heading3: { run: { font: FONT, size: 24, bold: true, color: C.sub }, paragraph: { spacing: { before: 160, after: 100 } } },
    },
  },
  sections: [{
    properties: { page: { margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } } },
    footers: { default: new Footer({ children: [new Paragraph({
      alignment: AlignmentType.CENTER, bidirectional: true,
      children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: C.soft })],
    })] }) },
    children: kid,
  }],
})

const OUT = process.argv[2] || 'docs/QNSA_FRAMEWORK_FULL.docx'
const buf = await Packer.toBuffer(doc)
fs.writeFileSync(path.resolve(OUT), buf)
console.log(`✔ ${OUT} · ${(buf.length / 1048576).toFixed(2)} م.ب · ` +
  `${actual.l1}/${actual.l2}/${actual.l3}/${actual.l4} عقدة · ${actual.rows} صفّاً (${actual.descs} عبارة) · ` +
  `${actual.samples} نموذجاً · ${actual.notes} ملاحظة`)

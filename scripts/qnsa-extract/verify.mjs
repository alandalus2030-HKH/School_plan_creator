/* تحقّق حرفي: هل يرد نصّ كل عقدة كما هو في جداول الوثيقة؟
   المنهج: نبني «كومة قشّ» من نصوص خلايا الوثيقة، ثم نحذف منها المسافات
   وعلامات التعداد — فيصير موضع الفاصل وعلامة البند بلا أثر، وأي اختلاف
   في الحروف يظهر فوراً.
   كومتان: (أ) كل الخلايا بترتيب الصفوف — للعقد العادية.
           (ب) كل عمود على حدة — للبنود الموصولة عبر فاصل صفحة، إذ يكون
               الشقّان خليّتين متجاورتين في العمود نفسه. */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const DIR = path.dirname(fileURLToPath(import.meta.url))
const SP = process.env.QNSA_WORK || path.join(DIR, 'work')

const T = JSON.parse(fs.readFileSync(path.join(SP, 'tables.json'), 'utf8'))
const c = JSON.parse(fs.readFileSync(path.join(SP, 'catalog.json'), 'utf8'))

const MARKS = [' ', ' ', '\t', '\n', '\r', '•', '*', '▪', '◦']
const strip = s => { let o = ''; for (const ch of String(s)) if (!MARKS.includes(ch)) o += ch; return o }

const hay = strip(T.flat(2).join('\n'))
const cols = []
for (const table of T) {
  const w = table.reduce((m, r) => Math.max(m, r.length), 0)
  for (let ci = 0; ci < w; ci++) cols.push(strip(table.map(r => r[ci] || '').join('\n')))
}
/* كومة ثالثة: فاصل الصفحة قد يقسم الجدول نفسه إلى جدولين متتاليين،
   فنصل خلايا كل فهرس عمود عبر كل الجداول بترتيب الوثيقة. */
const LF = String.fromCharCode(10)
const streams = []
const width = T.reduce((m, t) => Math.max(m, t.reduce((k, r) => Math.max(k, r.length), 0)), 0)
for (let ci = 0; ci < width; ci++)
  streams.push(strip(T.map(t => t.map(r => r[ci] || '').join(LF)).join(LF)))

/* كومة رابعة: صفوف الرأس وعناوين الجوانب تتكرّر داخل الجداول عند كل فاصل
   صفحة، فتتوسّط نصّاً موصولاً وتقطع تجاوره. فنبني مجرى كل عمود من صفوف
   **البيانات** وحدها — ما يتحقّق به وصلُ وصفٍ امتدّ عبر فاصل صفحة. */
const HEADWORDS = ['المعيارالفرعي', 'المعاييرالفرعية', 'ضعيف', 'مقبول', 'جيد', 'جيدجدا', 'جيدجداً', 'ممتاز']
const isHeadRow = row => row.map(strip).filter(Boolean).some(c => HEADWORDS.includes(c))
/* عنوان جانب = خليّة واحدة مملوءة تذكر «الجانب». ولا يكفي شرط الخليّة
   الواحدة: صفوف السلم قد تملأ مستوى واحداً فقط، وإسقاطها يقطع المجرى. */
const isTitleRow = row => {
  const f = row.filter(c => strip(c))
  return f.length === 1 && /الجانب|المعيار\s+(الأول|الثاني|الثالث|الرابع|الخامس)/.test(String(f[0]))
}
const dataStreams = []
for (let ci = 0; ci < width; ci++) {
  const parts = []
  for (const t of T) for (const r of t) {
    if (isHeadRow(r) || isTitleRow(r)) continue
    parts.push(r[ci] || '')
  }
  dataStreams.push(strip(parts.join(LF)))
}

const found = t => {
  const s = strip(t)
  return hay.includes(s) || cols.some(col => col.includes(s))
      || streams.some(st => st.includes(s)) || dataStreams.some(st => st.includes(s))
}

const nodes = []
for (const s of c.standards) nodes.push({ code: s.code, lvl: 'معيار رئيس', text: s.name })
for (const a of c.aspects) nodes.push({ code: a.code, lvl: 'جانب', text: a.name })
for (const s of c.subs) {
  nodes.push({ code: s.code, lvl: 'معيار فرعي', text: s.name, decided: s.decided })
  s.indicators.forEach((ind, i) => nodes.push({ code: `${s.code}.${i + 1}`, lvl: 'مؤشر', text: ind }))
}

const miss = nodes.filter(n => !found(n.text))
console.log('عقد مفحوصة:', nodes.length,
            '· مطابِقة حرفياً:', nodes.length - miss.length,
            '· غير مطابِقة:', miss.length)
for (const n of miss) {
  console.log('  ✗', n.code, '(' + n.lvl + ')', n.decided ? '— نصّ معتمد بقرار المستخدم' : '')
  console.log('     ' + n.text.slice(0, 120))
}
process.exitCode = miss.filter(n => !n.decided).length ? 1 : 0

/* ── سلم التقدير (إن وُجد) ──────────────────────────────────────── */
const rp = path.join(SP, 'rubric.json')
if (fs.existsSync(rp)) {
  const rub = JSON.parse(fs.readFileSync(rp, 'utf8'))
  const cells = []
  for (const g of rub.groups) for (let i = 0; i < g.rows.length; i++)
    for (let n = 1; n <= 5; n++) {
      const t = g.rows[i][n]
      if (t) cells.push({ code: g.code + '#' + i, lvl: rub.levels[n], text: t })
    }
  /* كومة خامسة — خاصّة بالسلم: ترتيب الأعمدة ينقلب بين جدول وآخر، فوصلٌ
     عبر فاصل صفحة بين جدولين مختلفي الترتيب لا يظهر متجاوراً في مجرى
     فهرسٍ ثابت. فنبني مجرى كل **مستوى** باستعمال تخطيط كل جدول المسجَّل
     في rubric.json — وهو عين ما قرأ به المستخرجُ الجداول. */
  const levelStreams = []
  for (let n = 1; n <= 5; n++) {
    const parts = []
    T.forEach((t, ti) => {
      const lay = rub.layouts[ti]
      if (!lay) return
      for (const r of t) {
        if (isHeadRow(r) || isTitleRow(r)) continue
        parts.push(r[lay.lv[n]] || '')
      }
    })
    levelStreams.push(strip(parts.join(LF)))
  }
  const foundR = t => found(t) || levelStreams.some(st => st.includes(strip(t)))

  const bad = cells.filter(c => !foundR(c.text))
  console.log('')
  console.log('سلم التقدير — أوصاف مفحوصة:', cells.length,
              '· مطابِقة حرفياً:', cells.length - bad.length, '· غير مطابِقة:', bad.length)
  bad.slice(0, 15).forEach(c => {
    console.log('  ✗', c.code, '(' + c.lvl + ')')
    console.log('     ' + c.text.slice(0, 110))
  })
  if (bad.length) process.exitCode = 1
}

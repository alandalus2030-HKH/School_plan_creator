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

const found = t => {
  const s = strip(t)
  return hay.includes(s) || cols.some(col => col.includes(s)) || streams.some(st => st.includes(s))
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

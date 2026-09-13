/* محلّل OOXML بمكدّس — يحترم الجداول المتداخلة */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(DIR, '../..')                      // جذر المستودع
const SP = process.env.QNSA_WORK || path.join(DIR, 'work')   // مجلّد الوسائط
const xml = fs.readFileSync(SP + '/document.xml', 'utf8')
const body = xml.slice(xml.indexOf('<w:body>') + 8, xml.lastIndexOf('</w:body>'))

const decode = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                     .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
const textOfP = frag => decode(frag.replace(/<w:tab\/>/g, ' ').replace(/<w:br\/>/g, '\n')
                                  .replace(/<[^>]+>/g, ''))
                        .replace(/[ \t\u00a0]+/g, ' ').replace(/ ?\n ?/g, '\n').trim()

const root = { type: 'root', children: [] }
const stack = [root]
const cur = () => stack[stack.length - 1]
const push = n => { cur().children.push(n); stack.push(n) }

/* علامة فاصل الصفحة الفعلية: يكتبها Word حيث انكسرت الصفحة عند آخر عرض،
   أو يضعها المؤلّف صريحةً. شاهدٌ مادّي لا تخمين — يُستعمل في وصل الأوصاف. */
const PB = /<w:lastRenderedPageBreak\/>|<w:br w:type="page"\/>/

const re = /<w:tbl>|<\/w:tbl>|<w:tr[ >]|<\/w:tr>|<w:tc[ >]|<\/w:tc>|<w:p[ >]|<\/w:p>/g
let m, pStart = -1
while ((m = re.exec(body))) {
  const tag = m[0]
  if (pStart >= 0) {                    // داخل فقرة: نتجاهل كل شيء حتى </w:p>
    if (tag === '</w:p>') {
      const frag = body.slice(pStart, m.index)
      const t = textOfP(frag)
      const pbIdx = frag.search(PB)
      /* تُحفَظ الفقرة الخالية أيضاً إن حملت فاصلاً — فهي شاهد موضعه مهمّ */
      if (t || pbIdx >= 0) {
        const tIdx = frag.search(/<w:t[ >]/)
        cur().children.push({ type: 'p', text: t, pb: pbIdx >= 0,
                              pbBeforeText: pbIdx >= 0 && (tIdx < 0 || pbIdx < tIdx) })
      }
      pStart = -1
    }
    continue
  }
  if (tag === '<w:tbl>')       push({ type: 'table', children: [] })
  else if (tag === '</w:tbl>') { while (stack.length > 1 && cur().type !== 'table') stack.pop(); if (stack.length > 1) stack.pop() }
  else if (tag.startsWith('<w:tr')) push({ type: 'tr', children: [] })
  else if (tag === '</w:tr>')  { while (stack.length > 1 && cur().type !== 'tr') stack.pop(); if (stack.length > 1) stack.pop() }
  else if (tag.startsWith('<w:tc')) push({ type: 'tc', children: [] })
  else if (tag === '</w:tc>')  { while (stack.length > 1 && cur().type !== 'tc') stack.pop(); if (stack.length > 1) stack.pop() }
  else if (tag.startsWith('<w:p')) pStart = body.indexOf('>', m.index) + 1
}

/* نصّ خلية = فقراتها المباشرة (تتجاهل الجداول الداخلية) */
const cellText = tc => tc.children.filter(c => c.type === 'p').map(c => c.text).join('\n').trim()

/* هل يبدأ هذا الصفّ صفحةً جديدة؟ أي: يحمل فاصلاً يسبق أوّل نصّ فيه. */
const rowStartsPage = tr => {
  let seenText = false
  for (const tc of tr.children.filter(c => c.type === 'tc'))
    for (const p of tc.children.filter(c => c.type === 'p')) {
      if (p.pb && p.pbBeforeText && !seenText) return true
      if (p.text) seenText = true
    }
  return false
}
const tablesOf = node => {
  const out = []
  const walk = n => { for (const c of n.children || []) { if (c.type === 'table') out.push(c); walk(c) } }
  walk(node); return out
}

const tables = tablesOf(root)
const summary = tables.map((t, i) => {
  const rows = t.children.filter(c => c.type === 'tr')
  const head = (rows[0]?.children.filter(c => c.type === 'tc') || []).map(cellText)
  return { i, rows: rows.length, cols: head.length, head: head.map(h => h.slice(0, 30)) }
})
fs.writeFileSync(SP + '/tables.json', JSON.stringify(
  tables.map(t => t.children.filter(c => c.type === 'tr')
    .map(tr => tr.children.filter(c => c.type === 'tc').map(cellText))), null, 1), 'utf8')

/* فواصل الصفحات: لكل جدول، فهارس الصفوف التي تبدأ صفحةً جديدة */
const pageBreaks = tables.map(t =>
  t.children.filter(c => c.type === 'tr').reduce((a, tr, ri) => (rowStartsPage(tr) && a.push(ri), a), []))
fs.writeFileSync(SP + '/page_breaks.json', JSON.stringify(pageBreaks), 'utf8')
console.log('صفوف تبدأ صفحةً جديدة:', pageBreaks.reduce((n, a) => n + a.length, 0))

console.log('جداول:', tables.length)
const byCols = {}
summary.forEach(s => { byCols[s.cols] = (byCols[s.cols] || 0) + 1 })
console.log('توزيع الأعمدة:', JSON.stringify(byCols))
summary.filter(s => s.cols === 4).slice(0, 6).forEach(s =>
  console.log(`  #${s.i} صفوف=${s.rows} → ${s.head.join(' ¦ ')}`))

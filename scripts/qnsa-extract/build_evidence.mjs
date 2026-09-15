/* ══════════════════════════════════════════════════════════════════
   استخراج «نماذج الأدلة والوثائق» — جدول واحد لكل جانب (15 جدولاً)

   البنية: جدول بعمودين يلي جداول تفاصيل الجانب، رأسه «نماذج الأدلة والوثائق»
   أو «الأدلة والوثائق»، وخلاياه قوائم أدلة سطراً سطراً. الأدلة للجانب كلّه
   (المستوى 2) — الوثيقة لا تُسندها إلى معيار فرعي بعينه، فلا نختلق إسناداً.

   علل الوثيقة المعالَجة:
   1. جدول 2.1 كان يضيع في المحلّل بسبب <w:p …/> مغلقة ذاتياً قبله — أُصلح في
      parse2، ويُتحقَّق هنا أن الجوانب الخمسة عشر كلّها لها جدول واحد بالترتيب.
   2. ترتيب القراءة: في الجدول ذي <w:bidiVisual/> الخليّة الأولى هي اليمنى،
      وفي غيره الأخيرة. (تحقّقنا من المعنى على 39 جدول سلم ذي رأس: 39/39.)
   3. أدلّة عدّة في سطر واحد: «… المساعد).- التوصيف …» · «دليل الموظف. - دليل ولي الأمر.»
      ⇒ تُفصَل عند شرطةٍ تلي علامة نهاية جملة فقط (لا تُمَسّ «السيرة الذاتية - المؤهل»).
   4. دليلٌ ملتفّ على سطرين أو ثلاثة (2.1): السطر التالي بلا شرطة، وسابقه غير
      منتهٍ أو فيه قوس مفتوح ⇒ تكملة. أمّا سطرٌ بلا شرطة بعد دليلٍ تامّ فدليلٌ
      سقطت شرطته.
   5. خلايا بلا علامات ولا نقاط أصلاً (1.1 · 4.1) ⇒ كل سطر دليل، إلا ما بدأ بواو
      أو حرف جرّ أو جاء بعد قوس مفتوح.
   6. شرطة في آخر السطر («وثيقة معايير المنهج المطبق.-») — أثر اتجاه النصّ.
   ══════════════════════════════════════════════════════════════════ */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const DIR = path.dirname(fileURLToPath(import.meta.url))
const SP = process.env.QNSA_WORK || path.join(DIR, 'work')

const T = JSON.parse(fs.readFileSync(path.join(SP, 'tables.json'), 'utf8'))
const META = JSON.parse(fs.readFileSync(path.join(SP, 'tables_meta.json'), 'utf8'))
const catalog = JSON.parse(fs.readFileSync(path.join(SP, 'catalog.json'), 'utf8'))

const norm = s => String(s || '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim()
const SUB = /^(\d+)\s*\.\s*(\d+)\s*\.\s*\d+/
const HEAD = /^(نماذج )?الأدلة والوثائق$/
const MARK = /^[-–•*▪◦]\s*/
const ENDS = /[.؟!]\s*$/
const PARTICLES = new Set(['من', 'إلى', 'على', 'في', 'عن', 'مع', 'أو', 'مما', 'حيث', 'بما', 'التي', 'الذي'])
const WAW_WORDS = new Set(['وثيقة', 'وثائق', 'وحدة', 'وزارة', 'وضع', 'وصف'])
const firstWord = t => t.replace(MARK, '').split(/\s+/)[0] || ''
const startsAsCont = t => {
  const w = firstWord(t)
  return PARTICLES.has(w) || (w.startsWith('و') && !WAW_WORDS.has(w))
}
const openParen = t => (t.match(/\(/g) || []).length > (t.match(/\)/g) || []).length
/* «تامّ» = ينتهي بعلامة جملة، أو بقوسٍ مغلق ولا قوس مفتوح عالقاً */
const complete = t => ENDS.test(t) || (/\)\s*$/.test(t) && !openParen(t))

/* ── (1) الجداول وجوانبها بترتيب الوثيقة ─────────────────────────── */
const tables = []
let aspect = null
T.forEach((t, ti) => {
  const w = t.reduce((m, r) => Math.max(m, r.length), 0)
  if (w === 4) for (const r of t) for (const c of r) {
    const m = norm(c).match(SUB)
    if (m) aspect = m[1] + '.' + m[2]
  }
  if (w === 2 && HEAD.test(norm(t[0]?.[0]))) tables.push({ ti, aspect, bidi: META[ti].bidi, rows: t.slice(1) })
})

const aspects = catalog.aspects.map(a => a.code)
const seen = tables.map(t => t.aspect)
if (seen.length !== aspects.length || seen.some((a, i) => a !== aspects[i]))
  throw new Error(`جداول الأدلة لا تقابل الجوانب واحداً لواحد بالترتيب:\n  وُجد: ${seen.join(' ')}\n  متوقَّع: ${aspects.join(' ')}`)

/* ── (2) تفكيك الأدلة ───────────────────────────────────────────── */
const joins = [], splits = [], lostMarks = []
const groups = tables.map(tb => {
  const items = []
  for (const row of tb.rows) {
    /* الخليّة اليمنى أوّلاً */
    const cells = tb.bidi ? row : [...row].reverse()
    for (const cell of cells) {
      const lines = String(cell).split('\n').map(norm).filter(Boolean)
        .map(l => l.replace(/\s*-\s*$/, ''))                       // (6) شرطة في آخر السطر
      if (!lines.length) continue
      const marked = lines.filter(l => MARK.test(l)).length
      const markerCell = marked >= lines.length / 2
      let cur = null
      const flush = () => { if (cur) items.push(cur); cur = null }
      for (const line of lines) {
        const hasMark = MARK.test(line)
        const body = line.replace(MARK, '')
        let cont
        if (!cur) cont = false
        else if (startsAsCont(body) || openParen(cur.text)) cont = true
        else if (markerCell) cont = !hasMark && !complete(cur.text)   // (4)
        else cont = false                                               // (5)
        if (cont) {
          joins.push({ aspect: tb.aspect, before: cur.text.slice(-50), after: body.slice(0, 50) })
          cur.text = norm(cur.text + ' ' + body)
          cur.lines++
        } else {
          if (cur && markerCell && !hasMark) lostMarks.push({ aspect: tb.aspect, text: body.slice(0, 60) })
          flush()
          cur = { text: body, lines: 1 }
        }
      }
      flush()
    }
  }
  /* (3) أدلّة عدّة ملصقة: شرطة تلي علامة نهاية جملة */
  const out = []
  for (const it of items) {
    const parts = it.text.split(/(?<=[.؟!])\s*-\s*(?=\S)/).map(norm).filter(Boolean)
    if (parts.length > 1) splits.push({ aspect: tb.aspect, parts: parts.map(p => p.slice(0, 45)) })
    out.push(...parts)
  }
  return { code: tb.aspect, ti: tb.ti, items: out }
})

/* ── (3) سلامة ─────────────────────────────────────────────────── */
const integrity = {
  short: [], unbalanced: [], embeddedMark: [],
}
for (const g of groups) g.items.forEach((t, i) => {
  if (t.length < 8) integrity.short.push({ code: g.code, at: i, text: t })
  if (openParen(t) || (t.match(/\)/g) || []).length > (t.match(/\(/g) || []).length)
    integrity.unbalanced.push({ code: g.code, at: i, text: t.slice(0, 80) })
  if (/[.؟!]\s*-\s/.test(t)) integrity.embeddedMark.push({ code: g.code, at: i, text: t.slice(0, 80) })
})

fs.writeFileSync(path.join(SP, 'evidence.json'), JSON.stringify({ groups }, null, 1), 'utf8')
fs.writeFileSync(path.join(SP, 'evidence_flags.json'),
  JSON.stringify({ joins, splits, lostMarks, integrity }, null, 1), 'utf8')

const total = groups.reduce((n, g) => n + g.items.length, 0)
console.log('جداول الأدلة:', groups.length, '(جانب لكلٍّ منها، بالترتيب) · أدلّة:', total)
console.log('لكل جانب:', groups.map(g => g.code + '=' + g.items.length).join(' · '))
console.log('وُصِل (دليل ملتفّ على أسطر):', joins.length, '· فُصِل (أدلّة ملصقة):', splits.length, '· شرطة ساقطة:', lostMarks.length)
console.log('سلامة — قصيرة:', integrity.short.length, '· أقواس غير متوازنة:', integrity.unbalanced.length,
            '· شرطة داخلية باقية:', integrity.embeddedMark.length)

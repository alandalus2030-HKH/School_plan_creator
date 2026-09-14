/* بناء كتالوج QNSA من جداول الوثيقة — 4 مستويات + محتوى داعم */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(DIR, '../..')                      // جذر المستودع
const SP = process.env.QNSA_WORK || path.join(DIR, 'work')   // مجلّد الوسائط
const T = JSON.parse(fs.readFileSync(SP + '/tables.json', 'utf8'))

const norm = s => (s || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim()
const tidyCode = c => c.replace(/\s+/g, '')
const SUB_RE = /^(\d+\s*\.\s*\d+\s*\.\s*\d+)\s*(.*)$/s

/* ══ (1) القائمة المرجعية من جداول الملخّص 1..4 ══ */
const standards = new Map(), aspects = new Map(), subs = new Map()
for (const ti of [1, 2, 3, 4]) {
  for (const row of T[ti]) {
    if (row.length < 3) continue
    const [subCell, aspCell, stdCell] = row
    if (norm(subCell) === 'المعيار الفرعي') continue
    const stdTxt = norm(stdCell)
    if (stdTxt) {
      const m = stdTxt.match(/^(\d+)\s*\.\s*(.+)$/s)
      if (m) { const c = tidyCode(m[1]); if (!standards.has(c)) standards.set(c, { code: c, level: 1, name: norm(m[2]) }) }
    }
    const aspTxt = norm(aspCell)
    if (aspTxt) {
      const m = aspTxt.match(/^([\d.\s]+?)\s+(\D.*)$/s)
      if (m) { const c = tidyCode(m[1]); if (!aspects.has(c)) aspects.set(c, { code: c, level: 2, name: norm(m[2]), parent: c.split('.')[0] }) }
    }
    for (const line of String(subCell).split('\n')) {
      const m = norm(line).match(SUB_RE)
      if (!m || !m[2]) continue
      /* تصحيح ترقيم الوثيقة (قرار المستخدم 2026-09-10): «الإدارة الصفية…» تُرقَّم
         2.3.4 في جدول الملخّص و2.3.3 في قسم التفاصيل — يُعتمد 2.3.3 ليتصل التسلسل */
      const RENUMBER = { '2.3.4': '2.3.3' }
      const c = RENUMBER[tidyCode(m[1])] || tidyCode(m[1])
      if (!subs.has(c)) subs.set(c, { code: c, level: 3, name: norm(m[2]), parent: c.split('.').slice(0, 2).join('.'), raw: [], guidance: [], questions: [] })
    }
  }
}

/* ══ (2) جداول التفاصيل — ترتيب الأعمدة يتغيّر بين الأقسام، فنقرؤه من صفّ الرأس ══ */
const HEAD_SUB = ['المعيار الفرعي', 'المعايير الفرعية']
const HEAD_IND = 'مؤشرات الأداء', HEAD_GUIDE = 'البيانات التوضيحية', HEAD_Q = 'أسئلة التأمل الذاتي'
let map = { sub: 3, ind: 2, guide: 1, quest: 0 }   // ترتيب المعيارين 1 و2 (قبل أول رأس)
let cursor = null
const unmatched = []

for (let ti = 0; ti < T.length; ti++) {
  for (const row of T[ti]) {
    if (row.length !== 4) continue
    const cells = row.map(norm)

    /* صفّ رأس؟ يحدّد ترتيب الأعمدة لما بعده */
    const iSub = cells.findIndex(c => HEAD_SUB.includes(c))
    const iInd = cells.indexOf(HEAD_IND)
    if (iSub >= 0 && iInd >= 0) {
      map = { sub: iSub, ind: iInd, guide: cells.indexOf(HEAD_GUIDE), quest: cells.indexOf(HEAD_Q) }
      cursor = null
      continue
    }

    const subCell = cells[map.sub], ind = cells[map.ind]
    const guide = map.guide >= 0 ? cells[map.guide] : '', quest = map.quest >= 0 ? cells[map.quest] : ''
    const m = subCell.match(SUB_RE)
    if (m && m[2]) {
      /* الترقيم موحَّد على 2.3.3 في مرحلة الملخّص أعلاه، فقسم التفاصيل يطابق مباشرةً */
      const code = tidyCode(m[1])
      cursor = subs.get(code) || null
      if (!cursor) { unmatched.push({ ti, code, txt: norm(m[2]).slice(0, 70) }); continue }
      if (!cursor.detailName) cursor.detailName = norm(m[2])   // صياغة قسم التفاصيل
    } else if (subCell && !cursor) { unmatched.push({ ti, code: '—', txt: subCell.slice(0, 70) }); continue }

    if (!cursor) continue
    if (ind)   cursor.raw.push(ind)
    if (guide) cursor.guidance.push(guide)
    if (quest) cursor.questions.push(quest)
  }
}

/* ══ (3) تفكيك المؤشرات: علامة التعداد تختلف بين الأقسام (* · • · -) ══ */
/* علامات لا لبس فيها أولاً؛ الشرطة آخر خيار لأنها تظهر داخل قوائم بين قوسين */
const STRONG = [/[•]/g, /[*]/g, /[▪◦]/g]
const DASH = /(?:^|(?<=\s))[-–](?=\s*[؀-ۿ])/g
const splitCell = cell => {
  let best = null, bestN = 0
  for (const re of STRONG) { const n = (cell.match(re) || []).length; if (n > bestN) { bestN = n; best = re } }
  if (!best && (cell.match(DASH) || []).length) best = DASH
  if (!best) return [cell.replace(/\s+/g, ' ').trim()].filter(Boolean)
  const parts = cell.split(best)
  /* بندٌ سقطت علامته (1.1.2: «الوضع المالي للمدرسة…» سطرٌ بلا «*» في خليّة
     معلَّمة): داخل البند المعلَّم، سطرٌ جديد بعد جملة تامّة ولا يبدأ كتكملة
     = بندٌ مستقلّ. والجزء الأوّل قبل أيّ علامة يُترك سليماً — فهو تكملة
     خليّةٍ سابقة. */
  const out = []
  parts.forEach((p, k) => {
    const lines = p.split('\n').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean)
    if (k === 0 || lines.length < 2) { out.push(lines.join(' ')); return }
    let curItem = lines[0]
    for (const line of lines.slice(1)) {
      if (/[.؟!]\s*$/.test(curItem) && !startsAsCont(line)) { out.push(curItem); curItem = line }
      else curItem += ' ' + line
    }
    out.push(curItem)
  })
  return out.map(x => x.trim()).filter(x => x.length > 3)
}

/* يبدأ كتكملة: واوٌ زائدة أو حرفٌ لا يُفتتح به بند */
const PARTICLES = new Set(['من', 'إلى', 'على', 'في', 'عن', 'مع', 'أو', 'مما', 'حيث', 'بما',
  'لكن', 'إلا', 'كما', 'التي', 'الذي', 'ثم', 'بين', 'لدى', 'ضمن', 'خلال', 'عبر', 'حسب'])
const firstWordOf = t => String(t).trim().replace(/^[«"(/]+/, '').split(/\s+/)[0] || ''
const startsAsCont = t => {
  const w = firstWordOf(t)
  return PARTICLES.has(w) || /^و/.test(w)
}
/* تكرار كلمة عند حدّ الصفحة: «…ومهارات الطلبة.» ثم «الطلبة، وتحليل…» */
const bare = w => w.replace(/[.،,؛:؟!()«»"]/g, '')
const dupBoundary = (prev, next) => {
  const pw = String(prev).trim().split(/\s+/).pop() || ''
  return bare(pw) !== '' && bare(pw) === bare(firstWordOf(next))
}
/* ══ (3.1) حدود الصفحات: قرار الوصل لكل موضع ══
   مواضع انقطع فيها نصّ «مؤشرات الأداء» بين خليّتين عبر فاصل صفحة.
   المفتاح: «الكود@فهرس البند الذي يبدأ بعد الفاصل».
   wrap = البندان جملة واحدة مقطوعة → تُوصَل.
   split = البند التالي جملة مستقلّة → يبقيان منفصلين.
   المعيار لغوي لا تقديري: في الثمانية الموصولة يبدأ الشقّ الثاني بكلمة
   لا تصحّ بداية جملة (حرف جرّ · عطف · صفة · مضاف إليه). */
const JUNCTION = {
  '1.2.4@6': 'wrap',   // …وضمان التزامهم ‖ بمواعيد العمل، مما يضمن…
  '1.5.4@3': 'wrap',   // …من خلال زيارات ‖ منتظمة من أجل تطوير…
  '3.1.5@4': 'wrap',   // …مستويات مقاربة ‖ أو متفوقة على المعدلات…
  '4.1.1@8': 'wrap',   // …لحماية الطلبة ‖ /الأطفال داخل المدرسة…
  '4.1.4@3': 'wrap',   // …لتحفيزهم ‖ على تحقيق المزيد…
  '5.1.2@1': 'split',  // …للموظفين الجدد ‖ تقييم فعالية التدريب… (جملة مستقلّة)
  '5.2.1@7': 'wrap',   // …بيئة مدرسية ‖ تدعم تعلمهم وتطورهم (إن وجد).
  '5.2.2@5': 'wrap',   // …تسهل وصول ‖ الطلبة والمعلمين إلى الموارد…
  '5.3.2@6': 'wrap',   // …مع اتخاذ ‖ الإجراءات الوقائية اللازمة…
  /* تدقيق المستخدم اليدوي (2026-09-14): موضعان انتهى شقّهما الأوّل بنقطة
     شاردة، ففاتا كاشفَ «السابق بلا نقطة» */
  '2.2.3@2': 'wrap',         // …إلى العليا). ‖ وفق خصائص واحتياجات كل مرحلة عمرية…
  '3.1.2@2': 'wrap-dedupe',  // …ومهارات الطلبة. ‖ الطلبة، وتحليل نتائجها… (كلمة مكرّرة عند الحدّ — النصّ المصحَّح اعتمده المستخدم 2026-09-14)
}
const flags = []
const merges = []
const textEdits = []   // تعديلات على النصّ الحرفيّ بقرار (wrap-dedupe)
/* قياس التغطية: كم من نصّ عمود «مؤشرات الأداء» الخام نجا إلى المؤشرات النهائية؟
   يكشف ما يُفقَد في التفكيك والترشيح — مقياس اكتمال لا مطابقة. */
const stripAll = s => String(s).replace(/[\s•*▪◦\-–]/g, '')
let rawChars = 0, indChars = 0
for (const s of subs.values()) {
  const items = []
  for (const cell of s.raw) {
    rawChars += stripAll(cell).length
    const parts = splitCell(cell)
    if (!parts.length) continue
    const prev = items[items.length - 1]
    /* حدّ خلية = موضع وصلٍ محتمل إذا: لم ينتهِ السابق بعلامة جملة، أو بدأ
       التالي كتكملة (واو · حرف جرّ)، أو تكرّرت الكلمة عند الحدّ. فالنقطة
       وحدها لا تنفي الانقطاع — 2.2.3 و3.1.2 انتهى شقّهما الأوّل بنقطة.
       ولا نصل بالتخمين: الوصل بقرار مسجَّل في JUNCTION، وما لا قرار له يُرفع. */
    if (prev && (!/[.؟!]\s*$/.test(prev) || startsAsCont(parts[0]) || dupBoundary(prev, parts[0]))) {
      const key = s.code + '@' + items.length
      const decision = JUNCTION[key]
      if (decision === 'wrap' || decision === 'wrap-dedupe') {
        const rawHead = parts.shift()
        let head = rawHead, tail = prev
        if (decision === 'wrap-dedupe') {
          /* تُحذف الكلمة المكرّرة وعلامة الجملة الشاردة قبلها — تعديلٌ على
             النصّ الحرفيّ، فيُسجَّل في textEdits ليعرفه التحقّق والتقرير */
          tail = prev.replace(/[.؟!]\s*$/, '')
          head = rawHead.replace(/^[^\s،,؛:.]+\s*/, '')   // الكلمة وحدها — تبقى «،» بعدها
        }
        /* «/» و«،» و«)» تلتصق بما قبلها؛ غير ذلك تفصله مسافة واحدة */
        const glue = /^[/،)]/.test(head) ? '' : ' '
        items[items.length - 1] = tail + glue + head
        merges.push({ key, text: items[items.length - 1] })
        if (decision === 'wrap-dedupe')
          textEdits.push({ key, text: items[items.length - 1],
                           source: '…' + prev.slice(-45) + ' ‖ ' + rawHead.slice(0, 45) + '…' })
        if (!parts.length) continue
      } else {
        flags.push({ code: s.code, kind: 'حدّ صفحة — راجع الوصل', at: items.length,
                     decided: decision === 'split' ? 'منفصلان بقرارك' : null,
                     before: prev.slice(-90), after: parts[0].slice(0, 90) })
      }
    }
    items.push(...parts)
  }
  /* عناوين داخل الخلايا ليست مؤشرات */
  const LABELS = /^(مجالات التركيز|نماذج الأدلة والوثائق|الأدلة والوثائق|مؤشرات الأداء)\s*$/
  s.indicators = items.filter(x => !LABELS.test(x))
  indChars += s.indicators.reduce((n, x) => n + stripAll(x).length, 0)
  s.indicators.forEach((x, i) => { if (x.length < 25) flags.push({ code: s.code + '.' + (i + 1), kind: 'قصير — يحتاج مراجعة', text: x }) })
  s.guidanceText  = s.guidance.join('\n')
  s.questionsText = s.questions.join('\n')
  delete s.raw; delete s.guidance; delete s.questions
}

/* ══ (3.5) صياغات معتمدة بقرار المستخدم (2026-09-10) ══
   الوثيقة تصوغ 22 معياراً فرعياً بشكلين مختلفين (ملخّص/تفاصيل). هذه السبعة
   حُسمت صراحةً: يُعتمد النصّ أدناه في الملخّص والتفاصيل معاً. */
const NAME_OVERRIDE = {
  '2.3.1': 'البيئة التعليمية داعمة للتعلم، وتوفر الفرص لممارسة الأنشطة الصفية المختلفة.',
  '3.1.8': 'إجراء تحليلات لنتائج تقييمات الطلبة لتحديد مستوى الأداء، والاستفادة منها في تحليل مستوى الأداء وتطويره.',
  '3.2.3': 'رعاية الطلبة ذوي الإعاقة وتوفير الدعم الملائم لهم مما يعزز فرصهم في تحقيق النجاح.',
  '3.2.5': 'توفير الدعم لتنمية المهارات اللغوية لضمان تحقيق أهداف المنهج الدراسي.',
  '4.1.3': 'الحضور المنتظم وانضباط الطلبة، مما يسهم في توفير بيئة تعليمية منظمة.',
  '5.3.2': 'تقديم خدمات رعاية صحية شاملة للطلبة لضمان صحتهم وسلامتهم.',
  '5.3.3': 'تنفيذ صيانة شاملة ومنتظمة للمرافق المدرسية لضمان استدامتها وسلامة البيئة التعليمية.',
}
for (const [code, name] of Object.entries(NAME_OVERRIDE)) {
  const s = subs.get(code)
  if (!s) { console.warn('⚠ الكود غير موجود:', code); continue }
  if (s.name !== name) { s.summaryName = s.name; s.name = name; s.decided = true }
  else s.decided = true
}

const out = { standards: [...standards.values()], aspects: [...aspects.values()], subs: [...subs.values()] }
fs.writeFileSync(SP + '/catalog.json', JSON.stringify(out, null, 1), 'utf8')

const totalInd = out.subs.reduce((n, s) => n + s.indicators.length, 0)
console.log('معايير رئيسة:', out.standards.length, '· جوانب:', out.aspects.length, '· معايير فرعية:', out.subs.length)
console.log('مؤشرات:', totalInd)
console.log('تغطية نصّ عمود المؤشرات:', indChars, '/', rawChars,
            '=', (100 * indChars / rawChars).toFixed(2) + '%',
            '· المفقود:', rawChars - indChars, 'حرفاً')
const noInd = out.subs.filter(s => !s.indicators.length)
console.log('بلا مؤشرات:', noInd.length, noInd.map(s => s.code).join(' '))
console.log('صفوف غير مطابَقة:', unmatched.length)
unmatched.slice(0, 8).forEach(u => console.log('   ج' + u.ti, u.code, u.txt))
console.log('تنبيهات مراجعة:', flags.length)
fs.writeFileSync(SP + '/flags.json', JSON.stringify(flags, null, 1), 'utf8')
fs.writeFileSync(SP + '/merges.json', JSON.stringify(merges, null, 1), 'utf8')
fs.writeFileSync(SP + '/text_edits.json', JSON.stringify(textEdits, null, 1), 'utf8')
console.log('مواضع وُصِلت بقرار:', merges.length)
merges.forEach(m => console.log('   ' + m.key + ' → ' + m.text.slice(0, 110)))
console.log('عدد المؤشرات لكل معيار رئيس:',
  JSON.stringify([1, 2, 3, 4, 5].reduce((a, n) => (a[n] = out.subs.filter(s => s.code.startsWith(n + '.')).reduce((k, s) => k + s.indicators.length, 0), a), {})))

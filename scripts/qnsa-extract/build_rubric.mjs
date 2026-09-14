/* ══════════════════════════════════════════════════════════════════
   استخراج سلم التقدير اللفظي من جداول الوثيقة (42 جدولاً بستة أعمدة)

   البنية: مجموعة أوصاف لكل **معيار فرعي**، كل وصف بخمسة مستويات
   (ضعيف · مقبول · جيد · جيد جداً · ممتاز). وخليّة المعيار الفرعي تظهر في
   أول صفّ من مجموعته وتبقى فارغة في بقيّتها.

   ‼ الوصف **ليس** مقابلاً لمؤشر أداء واحد — والعدد يشهد: الأوصاف أقلّ من
   المؤشرات بفارق كبير، ولا يتساويان إلا في قليل من المعايير الفرعية. فالسلم
   يحكم على المعيار الفرعي بجوانب جودة قد تجمع مؤشّرين أو تفصّل واحداً
   (3.1.6 مثلاً: مؤشران، وأربعة أوصاف — تهيئة وتيمز وبيرلز وبيزا).
   لذلك يُربَط السلم بعقدة **المستوى الثالث**، ولا نفترض ربطاً بالمؤشرات.
   (الأعداد الجارية يطبعها التشغيل، ويسجّلها docs/QNSA_CATALOG_REVIEW.md.)

   علل الوثيقة المعالَجة هنا:
   1. ترتيب الأعمدة ينعكس: عمود المعيار الفرعي في 0 أو 5، والسلم يجري
      تصاعدياً أو تنازلياً → يُقرأ من صفّ الرأس لا بفهرس ثابت.
   2. ثلاثة جداول بلا صفّ رأس (تكملة صفحة) — ولا تُورَّث تخطيط سابقها لأن
      الشكل ينقلب فعلاً بينها → يُستنتَج من عمود الأكواد.
   3. أسماء المستويات تختلف رسماً («جيد جداً» / «جيد جدا») → تُطبَّع.
   4. صفوف الرأس وعناوين الجوانب تتكرّر داخل الجدول عند حدود الصفحات.
   5. الوصف الواحد يُقطَّع على صفّين أو ثلاثة → يُوصَل بشاهد موجَب فقط:
      فاصل صفحة مسجَّل في الوثيقة، أو السابق ينتهي بحرف جرّ/عطف، أو أغلب
      مستويات الصفّ لا تبدأ بكلمة تفتح وصفاً، أو بصمة الشظيّة (لا مستوى يفتح
      وصفاً + ابتداءٌ بواو/أو/حرف جرّ أو صفٌّ شحيح). ولا يُوصَل لمجرّد غياب نقطة.
      وRUBRIC_JUNCTION يستثني أيّ موضع بـ'wrap' أو 'split' عند الحاجة.
   6. المرجع البشريّ: work/audit_counts.json — verify.mjs يُخفق إن اختلف أيّ عدد.
   ══════════════════════════════════════════════════════════════════ */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const DIR = path.dirname(fileURLToPath(import.meta.url))
const SP = process.env.QNSA_WORK || path.join(DIR, 'work')

const T = JSON.parse(fs.readFileSync(path.join(SP, 'tables.json'), 'utf8'))
const catalog = JSON.parse(fs.readFileSync(path.join(SP, 'catalog.json'), 'utf8'))

const norm = s => String(s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
/* تطبيع للمقارنة فقط: حذف التشكيل وتوحيد الألف والياء */
const fold = s => norm(s).replace(/[ً-ْٰـ]/g, '')
                         .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')

const LEVEL_NAMES = { 1: 'ضعيف', 2: 'مقبول', 3: 'جيد', 4: 'جيد جداً', 5: 'ممتاز' }
const LEVEL_BY_FOLD = new Map(Object.entries(LEVEL_NAMES).map(([n, v]) => [fold(v), +n]))
const HEAD_SUB = new Set(['المعيار الفرعي', 'المعايير الفرعية'].map(fold))
const SUB_RE = /^(\d+\s*\.\s*\d+\s*\.\s*\d+)\s*(.*)$/s
const tidy = c => c.replace(/\s+/g, '')
const RENUMBER = { '2.3.4': '2.3.3' }   // القرار نفسه المطبَّق في build_catalog

/* فواصل الصفحات الفعلية من الوثيقة: ti → فهارس الصفوف التي تبدأ صفحة */
const PAGE_BREAKS = fs.existsSync(path.join(SP, 'page_breaks.json'))
  ? JSON.parse(fs.readFileSync(path.join(SP, 'page_breaks.json'), 'utf8')) : []

const firstWord = t => String(t).trim().replace(/^[«"(]+/, '').split(/\s+/)[0] || ''
/* ما «يفتح وصفاً»: يُجمَع من صفوف الوثيقة التي تحمل أكواد المعايير الفرعية
   (أوصاف جديدة يقيناً)، ومعه مكمّمات التدرّج التي تفتح الجملة الاسمية. */
const OPENERS = new Set(['قلة', 'بعض', 'معظم', 'الغالبية', 'جميع'])

/* ── (1) المرور على الجداول ──────────────────────────────────────── */
let map = null            // { sub: idx, lv: {1..5: idx} } — يُورَّث عبر الجداول
const groups = []         // { code, rows: [ {1..5: text} ], ti }
let cur = null
const notes = []
const layouts = {}   // ti → تخطيط أعمدة الجدول (لأداة التحقّق)

/* تخطيط الأعمدة له شكلان فقط في الوثيقة:
     أ) عمود المعيار في 5، والسلم تصاعدي في 0..4 (ضعيف → ممتاز)
     ب) عمود المعيار في 0، والسلم تنازلي في 1..5 (ممتاز → ضعيف)
   ثلاثة جداول بلا صفّ رأس (تكملة صفحة) — ولا تُورَّث تخطيط ما قبلها لأن
   الشكل ينقلب بينها فعلاً؛ فيُستنتَج من العمود الذي يحمل أكواد المعايير. */
const LAYOUT_A = { sub: 5, lv: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 } }
const LAYOUT_B = { sub: 0, lv: { 5: 1, 4: 2, 3: 3, 2: 4, 1: 5 } }
const layoutOf = table => {
  let c0 = 0, c5 = 0
  for (const row of table) {
    if (SUB_RE.test(norm(row[0]))) c0++
    if (SUB_RE.test(norm(row[5]))) c5++
  }
  return c0 > c5 ? LAYOUT_B : c5 > c0 ? LAYOUT_A : null
}

for (let ti = 0; ti < T.length; ti++) {
  const table = T[ti]
  if (table.reduce((m, r) => Math.max(m, r.length), 0) !== 6) continue

  /* جدول بلا صفّ رأس → استنتج تخطيطه من موضع الأكواد */
  const hasHead = table.some(r => r.map(c => fold(norm(c))).some(c => HEAD_SUB.has(c)))
  if (!hasHead) {
    const inferred = layoutOf(table)
    if (inferred) map = inferred
    else notes.push({ ti, kind: 'جدول بلا رأس ولا أكواد — وُرِّث التخطيط السابق' })
  }

  /* صفّ تالٍ لصفّ رأس مُعاد: موضع انقسامٍ محتمل (شاهد بنيويّ مساعد، لا قاطع —
     فالوثيقة تقسم الجداول والصفوف أيضاً بلا فاصل صفحة حقيقي) */
  let afterHead = true
  let ri = -1

  for (const row of table) {
    ri++
    const cells = row.map(norm)

    /* صفّ رأس؟ */
    const iSub = cells.findIndex(c => HEAD_SUB.has(fold(c)))
    if (iSub >= 0) {
      const lv = {}
      cells.forEach((c, k) => { const n = LEVEL_BY_FOLD.get(fold(c)); if (n) lv[n] = k })
      /* صفّ الرأس يتكرّر عند كل فاصل صفحة، فهو علامة الفاصل الموثوقة */
      if (Object.keys(lv).length === 5) { map = { sub: iSub, lv }; afterHead = true; continue }
      notes.push({ ti, kind: 'صفّ رأس ناقص المستويات', cells: cells.map(c => c.slice(0, 20)) })
      continue
    }
    if (!map) { notes.push({ ti, kind: 'صفّ قبل أيّ رأس — أُهمل' }); continue }

    /* عنوان جانب (خليّة واحدة مملوءة) */
    const filled = cells.filter(Boolean)
    if (filled.length === 1 && /الجانب/.test(filled[0])) continue

    const label = cells[map.sub]
    const desc = {}
    for (let n = 1; n <= 5; n++) desc[n] = cells[map.lv[n]] || ''
    if (!Object.values(desc).some(Boolean)) continue   // صفّ بلا أوصاف

    const m = label.match(SUB_RE)
    if (m && m[2]) {
      const code = RENUMBER[tidy(m[1])] || tidy(m[1])
      cur = { code, rubricName: norm(m[2]), rows: [], ti }
      groups.push(cur)
    } else if (label && !m) {
      notes.push({ ti, kind: 'خليّة معيار بلا كود', txt: label.slice(0, 60) })
    }
    if (!cur) { notes.push({ ti, kind: 'صفّ أوصاف قبل أيّ معيار فرعي — أُهمل' }); continue }
    /* الصفّ الذي يحمل كود معيارٍ فرعيّ وصفٌ جديد يقيناً، فكلماته الأولى
       تُجمَع لتكون القائمة المرجعية لِما «يفتح وصفاً» — مستخرجةً من الوثيقة
       لا مكتوبةً بالحدس. */
    if (m && m[2]) for (let n = 1; n <= 5; n++)
      if (desc[n]) OPENERS.add(firstWord(desc[n]))
    desc.afterHead = afterHead && !(m && m[2])        // صفّ يلي رأساً مُعاداً
    desc.pageStart = (PAGE_BREAKS[ti] || []).includes(ri)   // شاهد مادّي من الوثيقة
    afterHead = false
    cur.rows.push(desc)
  }
  layouts[ti] = map
}

/* ── (2) وصل الصفوف المقطوعة عبر فواصل الصفحات ──────────────────── */
/* القرار مسجَّل لكل موضع: المفتاح «الكود#فهرس الصفّ». wrap = تكملة الصفّ
   السابق · split = صفّ مستقلّ. يملأ هذا الجزء بعد أول تشغيل تشخيصي. */
const RUBRIC_JUNCTION = JSON.parse(
  fs.existsSync(path.join(DIR, 'rubric_junctions.json'))
    ? fs.readFileSync(path.join(DIR, 'rubric_junctions.json'), 'utf8') : '{}')

/* «منتهية» = تنتهي بعلامة نهاية جملة، ويُسمح بلاحقة بين قوسين بعدها
   مثل «. (إن وجد)» فهي شائعة في الوثيقة ولا تعني أن الجملة مقطوعة. */
const ENDS = /(?:[.؟!]\s*(?:\([^)]*\)\s*)?|\))\s*$/

/* ── تمييز «تكملة وصف» من «وصف جديد» ─────────────────────────────
   الترقيم وحده لا يكفي: الوثيقة تُسقط النقطة الختامية كثيراً، فلو اعتمدنا
   «السابق بلا نقطة ⇒ وصل» لفُصلت أوصافٌ موصولة ووُصلت أوصافٌ مستقلّة.
   (هذا ما أوقع 1.1.1 في أربعة أوصاف ثم اثنين، وصوابها ثلاثة.)

   فالقرار يقوم على شاهدين نصّيين موجَبين لا على غياب النقطة:
   أ) السابق ينتهي بكلمة تستدعي ما بعدها (حرف جرّ · عطف · فاصلة).
   ب) هذا الصفّ يبدأ بكلمة لا تفتح وصفاً.

   وقائمة ما يفتح وصفاً مستخرجةٌ من الوثيقة نفسها: الصفوف التي تحمل كود
   معيارٍ فرعيّ هي أوصافٌ جديدة يقيناً، وكلماتها الأولى 38 كلمة، ليس فيها
   ما يبدأ بواو إلا «وحدة». فالبدء بواو شاهد تكملة موثوق. */
const WAW_WORDS = new Set(['وحدة', 'وزارة', 'وضوح', 'وضع', 'وفق', 'وجود', 'وثائق', 'واقعية', 'وسائل'])
const PARTICLES = new Set([
  'من', 'إلى', 'على', 'في', 'عن', 'مع', 'أو', 'أم', 'مما', 'ما', 'حيث', 'بما', 'بحيث',
  'لكن', 'إلا', 'كما', 'التي', 'الذي', 'اللذين', 'اللاتي', 'ثم', 'إذ', 'بين', 'نحو',
  'لدى', 'ضمن', 'خلال', 'عبر', 'حسب', 'أثناء', 'تجاه', 'وذلك', 'لذلك',
])
const DEMANDING = new Set([...PARTICLES, 'و'])
const lastWord = t => {
  const w = String(t).trim().split(/\s+/)
  return w[w.length - 1] || ''
}
/* يفتح وصفاً: كلمته الأولى من القائمة المستخرجة من الوثيقة (كلمات الصفوف
   التي تحمل أكواد المعايير) أو من مكمّمات التدرّج. وما خلا ذلك لا يفتح وصفاً
   — وهو شاهد تكملة. ويزيده تأكيداً ابتداءٌ بواو زائدة أو بحرف جرّ. */
const opensDescriptor = t => OPENERS.has(firstWord(t))
const startsAsCont = t => {
  const w = firstWord(t)
  if (!w) return false
  if (PARTICLES.has(w)) return true
  return w.startsWith('و') && !WAW_WORDS.has(w)
}
/* ينتهي مستدعياً ما بعده: حرف جرّ أو عطف أو فاصلة */
const demandsMore = t => {
  const s = String(t).trim()
  if (/[،:,؛]$/.test(s)) return true
  return DEMANDING.has(lastWord(s).replace(/[«»")]/g, ''))
}

const merged = [], votes = [], trace = []
for (const g of groups) {
  const out = []
  for (const row of g.rows) {
    const prev = out[out.length - 1]
    /* القرار يُتّخذ **عموداً عموداً**: الوثيقة قد تقطع وصفاً في عمود واحد
       فقط (مثلاً «ضعيف» وحده يفيض إلى صفّ تالٍ). فننظر في كل مستوى مملوء
       في الصفّ الحالي: هل نظيره في الصفّ السابق جملة مقطوعة أم تامّة؟ */
    /* الشاهد الأول (بوّابة): هل في الصفّ السابق مستوى واحد على الأقل غير
       منتهٍ بعلامة جملة؟ إن كان كله منتهياً فالصفّ الحالي وصفٌ جديد يقيناً. */
    const open = []
    if (prev) for (let n = 1; n <= 5; n++) {
      if (row[n] && prev[n] && !ENDS.test(prev[n])) open.push(n)
    }

    /* الشاهدان الموجَبان، يُحسبان على المستويات المملوءة في الصفّ الحالي */
    const demand = [], contStart = [], openers = [], nonOpeners = [], veto = []
    if (prev) for (let n = 1; n <= 5; n++) {
      if (!row[n]) continue
      if (prev[n] && demandsMore(prev[n])) demand.push(n)   // السابق يستدعي ما بعده
      const cont = startsAsCont(row[n])
      if (cont) contStart.push(n)                           // واو زائدة أو حرف جرّ
      ;(opensDescriptor(row[n]) ? openers : nonOpeners).push(n)
      /* نقضٌ للوصل: في هذا المستوى انتهى السابق جملةً تامّة، وهذا لا يبدأ
         كتكملة ⇒ شاهدٌ موجَب على أنه وصف جديد. والوصل هنا يفضي إلى وصفٍ
         بنقطةٍ في وسطه — وهو ما وقع في 1.4.1 و5.1.1 قبل هذا النقض. */
      if (prev[n] && ENDS.test(prev[n]) && !cont) veto.push(n)
    }

    const key = g.code + '#' + out.length
    /* مراتب القرار:
       1. قرار بشريّ في RUBRIC_JUNCTION — يغلب كل شيء.
       2. شاهد مادّي: الصفّ يبدأ صفحةً جديدة في الوثيقة (lastRenderedPageBreak).
       3. شاهدٌ نصّيّ موجَب، والبوّابة مفتوحة:
          - السابق ينتهي بحرف جرّ/عطف/فاصلة، أو
          - لا يبدأ أيُّ مستوى من هذا الصفّ بكلمة تفتح وصفاً.
       وما خلا ذلك: وصفٌ جديد. فالوصل لا يحدث إلا بشاهد، لا بغياب نقطة. */
    const filledN = [1, 2, 3, 4, 5].filter(n => row[n]).length
    const prevFilledN = prev ? [1, 2, 3, 4, 5].filter(n => prev[n]).length : 0
    const evidence = !prev ? null
      : row.pageStart ? 'فاصل صفحة في الوثيقة'
      /* بصمة الشظيّة (تدقيق المستخدم 2026-09-14 — 3.1.4 و3.1.5 و5.3.2): لا
         مستوى يبدأ بكلمة تفتح وصفاً، ومعها إمّا ابتداءٌ بواو/أو/حرف جرّ، وإمّا
         صفٌّ شحيح يملأ مستويين أو ثلاثة أقلّ من سابقه. هذا الشاهد لا يلتفت
         إلى نقطة السابق — فالشظايا الأربع الفائتة كان سابقها كلّه منتهياً بنقطة. */
      : openers.length === 0 && (contStart.length > 0 || filledN <= prevFilledN - 2)
        ? (contStart.length ? 'شظيّة: لا مستوى يفتح وصفاً، وتبدأ بواو/أو/حرف جرّ'
                            : `شظيّة: لا مستوى يفتح وصفاً، وتملأ ${filledN} من ${prevFilledN}`)
      : open.length === 0 ? null
      /* يُوازَن النقض بالمستويات التي تطلب التكملة: إن كانت المستويات
         الناقضة أكثرَ أو مثلَها فهو وصف جديد، وإلا فالنقض ضجيجُ ترقيم. */
      : veto.length >= open.length ? null
      : demand.length ? 'السابق ينتهي بحرف جرّ أو عطف'
      : nonOpeners.length > openers.length
        ? `أغلب المستويات لا تبدأ بكلمة تفتح وصفاً (${nonOpeners.length}/${nonOpeners.length + openers.length})`
        : null
    const decision = RUBRIC_JUNCTION[key] || (evidence ? 'wrap' : 'split')
    /* أثرُ كل قرار بشواهده — للتشخيص والمراجعة */
    if (prev) trace.push({ key, decision, evidence, pageStart: row.pageStart,
      filled: [1,2,3,4,5].filter(n => row[n]).length, prevFilled: [1,2,3,4,5].filter(n => prev[n]).length,
      open: open.length, demand: demand.length, contStart: contStart.length,
      openers: openers.length, nonOpeners: nonOpeners.length, veto: veto.length,
      starts: [1,2,3,4,5].filter(n => row[n]).map(n => firstWord(row[n])) })

    /* يُرفع للمراجعة كل وصلٍ شاهده ضعيف، وكل فصلٍ ترك السابق مقطوعاً */
    if (prev && decision === 'wrap' && !row.pageStart && !demand.length) {
      votes.push({ key, code: g.code, at: out.length, decision, evidence,
                   contStart: contStart.map(n => LEVEL_NAMES[n]),
                   sample: (prev[open[0] || 5] || '').slice(-60) + ' ⟨' + (row[open[0] || 5] || '').slice(0, 60) + '⟩' })
    }
    if (prev && decision === 'split' && open.length) {
      votes.push({ key, code: g.code, at: out.length, decision,
                   evidence: 'السابق بلا نقطة لكن هذا الصفّ يفتح وصفاً',
                   openers: openers.map(n => LEVEL_NAMES[n]),
                   sample: (prev[open[0]] || '').slice(-60) + ' ⟨' + (row[open[0]] || '').slice(0, 60) + '⟩' })
    }
    if (prev && decision === 'wrap') {
      for (let n = 1; n <= 5; n++) {
        if (!row[n]) continue
        const glue = /^[/،)]/.test(row[n]) || !prev[n] ? '' : ' '
        prev[n] = (prev[n] || '') + glue + row[n]
      }
      merged.push(key)
      continue
    }
    out.push(row)
  }
  g.rows = out
}

/* ── (3) مطابقة الصفوف بالمؤشرات ─────────────────────────────────── */
const indCount = new Map(catalog.subs.map(s => [s.code, s.indicators.length]))
const byCode = new Map()
for (const g of groups) {
  if (!byCode.has(g.code)) byCode.set(g.code, { code: g.code, rows: [], rubricName: g.rubricName })
  /* afterBreak شاهد تحليل لا بيانات — يُسقَط قبل الحفظ */
  byCode.get(g.code).rows.push(...g.rows.map(r => ({ 1: r[1], 2: r[2], 3: r[3], 4: r[4], 5: r[5] })))
}

/* سلامة: وصفٌ مكتملٌ ينتهي بعلامة نهاية جملة وتُملأ مستوياته الخمسة.
   ما يخالف ذلك يُرفع للمراجعة بدل أن يُمرَّر صامتاً. */
/* فحصان متقابلان يحرسان الخطأين المتناظرين:
   - وصفٌ لا ينتهي بعلامة جملة ⇒ احتمال وصلٍ فائت (أو سقوط نقطة في الوثيقة،
     ويُميَّز بأوّل كلمات الوصف التالي: إن افتتح بفعل فهو وصفٌ جديد فعلاً).
   - وصفٌ وُصِل وفيه نقطةٌ في وسطه يتبعها كلام ⇒ احتمال وصفين دُمجا. */
const mergedSet = new Set(merged)
const integrity = { unterminated: [], missingLevels: [], overMerged: [] }
for (const [code, g] of byCode) {
  g.rows.forEach((row, i) => {
    const probe = row[5] || row[4] || row[3] || row[2] || row[1] || ''
    if (probe && !ENDS.test(probe)) {
      const nxt = g.rows[i + 1]
      const head = nxt ? String(nxt[5] || nxt[1] || '').split(/\s+/).slice(0, 4).join(' ') : null
      integrity.unterminated.push({ code, at: i, tail: probe.slice(-70),
        next: head, verdict: !nxt ? 'لا وصف بعده — سقوط نقطة في الوثيقة'
          : opensDescriptor(head) ? 'التالي يفتتح بكلمة تفتح وصفاً — وصفٌ جديد'
          : 'يحتاج مراجعة' })
    }
    const empty = [1, 2, 3, 4, 5].filter(n => !row[n])
    if (empty.length) integrity.missingLevels.push({ code, at: i, levels: empty.map(n => LEVEL_NAMES[n]) })
    if (mergedSet.has(code + '#' + (i + 1)) && /[.؟!]\s+(?!\()/.test(probe)) {
      const parts = probe.split(/(?<=[.؟!])\s+/)
      integrity.overMerged.push({ code, at: i, join: parts.slice(0, 2).join(' ▌').slice(-140) })
    }
  })
}

const report = []
for (const [code, g] of byCode) {
  const want = indCount.get(code)
  report.push({ code, rubricRows: g.rows.length, indicators: want === undefined ? null : want,
                ok: want === g.rows.length })
}
const unknown = [...byCode.keys()].filter(c => !indCount.has(c))
const missing = catalog.subs.map(s => s.code).filter(c => !byCode.has(c))

fs.writeFileSync(path.join(SP, 'rubric.json'),
  JSON.stringify({ levels: LEVEL_NAMES, layouts, groups: [...byCode.values()] }, null, 1), 'utf8')
fs.writeFileSync(path.join(SP, 'rubric_flags.json'),
  JSON.stringify({ merged, votes, notes, report, integrity, trace }, null, 1), 'utf8')

/* ── (4) تقرير ───────────────────────────────────────────────────── */
const totalRows = [...byCode.values()].reduce((n, g) => n + g.rows.length, 0)
const totalInd = catalog.subs.reduce((n, s) => n + s.indicators.length, 0)
console.log('مجموعات السلم:', byCode.size, 'من', catalog.subs.length, 'معياراً فرعياً')
console.log('صفوف وصفية:', totalRows, '· مؤشرات الكتالوج:', totalInd)
console.log('وُصِل:', merged.length, '· قرارات بالأغلبية:', votes.length + ' (وصل ' + votes.filter(v => v.decision === 'wrap').length + ' · فصل ' + votes.filter(v => v.decision === 'split').length + ')')
console.log('أكواد في السلم ليست في الكتالوج:', unknown.length, unknown.join(' '))
console.log('معايير فرعية بلا سلم:', missing.length, missing.join(' '))
const bad = report.filter(r => !r.ok)
console.log('عدم تطابق العدد:', bad.length)
bad.forEach(r => console.log('   ' + r.code + ': سلم=' + r.rubricRows + ' · مؤشرات=' + r.indicators))
if (notes.length) { console.log('ملاحظات تحليل:', notes.length); notes.slice(0, 10).forEach(n => console.log('   ج' + n.ti, n.kind, n.txt || '')) }

console.log('سلامة — أوصاف لا تنتهي بعلامة جملة:', integrity.unterminated.length)
integrity.unterminated.forEach(u => console.log("   " + u.code + "#" + u.at + " → " + u.verdict))
console.log('سلامة — أوصاف موصولة بنقطة في وسطها (شبهة دمج وصفين):', integrity.overMerged.length)
integrity.overMerged.forEach(u => console.log("   " + u.code + "#" + u.at + " " + u.join))
console.log('سلامة — أوصاف ناقصة المستويات:', integrity.missingLevels.length)
integrity.missingLevels.slice(0, 12).forEach(u => console.log("   " + u.code + "#" + u.at + " ناقص: " + u.levels.join(" · ")))

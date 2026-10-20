/* ════════════════════════════════════════════════════════════════
   مطابقة **قاعدة البيانات** بملفّ الهيئة — الطبقة الرابعة من التحقّق
   ────────────────────────────────────────────────────────────────
   `verify_sources.mjs` يطابق مصدرَي الهيئة ببعضهما (JSON ↔ Excel)،
   وهذا يطابق **ما استقرّ في القاعدة** بالمصدر المعتمد. فبينهما فرق:
   الأوّل يكشف خطأ التحويل قبل أن يصل القاعدة، وهذا يكشف ما طرأ عليها
   بعده — ترحيلٌ ناقص · تحريرٌ يدويّ · أو إصدارٌ اختلط بإصدار.

   ويطابق شيئين:
     (1) البنية: الأكواد الـ380 وأسماؤها، والأرقام الرسمية.
     (2) النصوص: 284 مؤشّراً · 840 عبارة سلّم · 245 نموذجاً ·
         366 بياناً توضيحياً · 453 سؤال تأمّل — نصّاً بنصّ.

   ⚠ وما يُقرأ من الجداول التابعة يُرشَّح **بعقد الإصدار النشط**: هي لا
     تحمل `framework_id`، وفي القاعدة إصدارات مؤرشفة. ومن نسي الترشيح
     جمع الإصدارات وظنّ الأرقام خاطئة (الدرس في CLAUDE.md).

   التشغيل من جذر المشروع:
     node scripts/qnsa-official-2026/verify_db.mjs [مسار accreditation_catalog_2026.json]
   ويقرأ مفاتيح القاعدة من `.env.local`. يخرج بـ1 إن وُجد فرق.
   ════════════════════════════════════════════════════════════════ */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

/* ── مجلّد الهيئة: من المعامل، أو من متغيّر بيئة، أو المواضع المعروفة ── */
const CANDIDATES = [
  process.argv[2],
  process.env.QNSA_CATALOG,
  'C:/Users/pcl_h/Desktop/guide/accreditation_catalog_2026.json',
  'C:/Users/pcl_h/Desktop/desktop11-10-20266/guide/accreditation_catalog_2026.json',
].filter(Boolean)
const CAT = CANDIDATES.find(p => fs.existsSync(p))
if (!CAT) {
  console.error('لم يُعثر على ملفّ الهيئة. مرّر مساره:\n' +
    '  node scripts/qnsa-official-2026/verify_db.mjs "D:/.../accreditation_catalog_2026.json"')
  process.exit(2)
}

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

/* التطويل والتشكيل والمسافات تُسوّى — الفرق الشكليّ ليس خلافاً في النصّ */
const norm = s => String(s ?? '')
  .replace(/\u0640/g, '')
  .replace(/[\u064B-\u0652\u0670]/g, '')
  .replace(/[\u200f\u200e\u00a0]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const cat = JSON.parse(fs.readFileSync(CAT, 'utf8'))
const { data: fw, error: fwErr } = await db.from('frameworks')
  .select('id, version, status').eq('status', 'active').single()
if (fwErr || !fw) { console.error('لا إصدار نشط في القاعدة'); process.exit(2) }

const nodes = await page('framework_nodes', 'id,code,name_ar,level', q => q.eq('framework_id', fw.id))
const ids   = new Set(nodes.map(n => n.id))
const keep  = a => a.filter(r => ids.has(r.framework_node_id))     // ← الترشيح الذي لا يُنسى
const byCode = new Map(nodes.map(n => [n.code, n]))
const codeOf = new Map(nodes.map(n => [n.id, n.code]))

const rubric  = keep(await page('framework_rubric', 'framework_node_id,row_index,level,descriptor_ar'))
const samples = keep(await page('framework_evidence_samples', 'framework_node_id,text_ar'))
const notes   = keep(await page('framework_node_notes', 'framework_node_id,kind,text_ar'))

const bucket = (arr, fn) => arr.reduce((m, r) => ((m[codeOf.get(r.framework_node_id)] ||= []).push(fn(r)), m), {})
const dbRub = rubric.reduce((m, r) => {
  const c = codeOf.get(r.framework_node_id)
  ;((m[c] ||= {})[r.row_index] ||= {})[r.level] = norm(r.descriptor_ar)
  return m
}, {})
const dbSam = bucket(samples, r => norm(r.text_ar))
const dbGui = bucket(notes.filter(n => n.kind === 'guidance'),   r => norm(r.text_ar))
const dbRef = bucket(notes.filter(n => n.kind === 'reflection'), r => norm(r.text_ar))

/* ── (1) البنية ── */
const report = []
const add = (name, actual, expected, extra = '') =>
  report.push({ name, actual: String(actual), expected: String(expected), ok: String(actual) === String(expected), extra })

const srcCodes = new Map()      // كود ← اسم، من الملفّ
for (const st of cat.standards) {
  srcCodes.set(String(st.number), st.name)
  for (const asp of st.aspects) {
    srcCodes.set(String(asp.number), asp.name)
    for (const sub of asp.substandards) {
      srcCodes.set(String(sub.number), sub.name)
      for (const ind of sub.indicators || []) srcCodes.set(String(ind.number), ind.text)
    }
  }
}
const depth = c => c.split('.').length
for (const L of [1, 2, 3, 4]) {
  add(`عقد المستوى ${L}`, nodes.filter(n => n.level === L).length,
      [...srcCodes.keys()].filter(c => depth(c) === L).length)
}
const missing = [...srcCodes.keys()].filter(c => !byCode.has(c))
const extra   = nodes.filter(n => !srcCodes.has(n.code)).map(n => n.code)
add('أكواد في المصدر وليست في القاعدة', missing.length, 0, missing.slice(0, 8).join(' · '))
add('أكواد في القاعدة وليست في المصدر', extra.length, 0, extra.slice(0, 8).join(' · '))

const nameDiff = []
for (const [code, name] of srcCodes) {
  const n = byCode.get(code)
  if (n && norm(n.name_ar) !== norm(name)) nameDiff.push({ code, db: n.name_ar, src: name })
}
add('أسماء ونصوص العقد', nameDiff.length ? `${nameDiff.length} مختلفاً` : 'مطابقة', 'مطابقة')

add('صفوف سلّم التقدير', new Set(rubric.map(r => r.framework_node_id + '#' + r.row_index)).size, 168)
add('عبارات السلّم', rubric.length, 840)
add('نماذج الأدلة', samples.length, 245)
add('البيانات التوضيحية', notes.filter(n => n.kind === 'guidance').length, 366)
add('أسئلة التأمّل', notes.filter(n => n.kind === 'reflection').length, 453)
add('الإصدار النشط', fw.version, 'official-2026')

/* ── (2) النصوص ── */
const LVL = { excellent: 5, very_good: 4, good: 3, acceptable: 2, weak: 1 }
const miss = { rub: [], sam: [], gui: [], ref: [] }
const seen = { rub: 0, sam: 0, gui: 0, ref: 0 }
const cmp = (code, src, dbArr, b) => {
  const set = new Set(dbArr || [])
  for (const t of src) { seen[b]++; if (!set.has(norm(t))) miss[b].push({ code, t }) }
}
for (const st of cat.standards) for (const asp of st.aspects) {
  cmp(String(asp.number), (asp.evidence || []).map(e => e.text ?? e), dbSam[String(asp.number)], 'sam')
  for (const sub of asp.substandards) {
    const c = String(sub.number)
    cmp(c, (sub.explanatory_data || []).map(e => e.text), dbGui[c], 'gui')
    cmp(c, (sub.reflection_questions || []).map(e => e.text), dbRef[c], 'ref')
    for (const row of sub.rubric || []) {
      const dbRow = (dbRub[c] || {})[row.row]
      for (const [k, lv] of Object.entries(LVL)) {
        if (row[k] == null) continue
        seen.rub++
        if (!dbRow || dbRow[lv] !== norm(row[k])) miss.rub.push({ code: `${c}#${row.row}/${k}`, t: row[k] })
      }
    }
  }
}
const TEXTS = [['عبارات السلّم', 'rub'], ['نماذج الأدلة', 'sam'],
               ['البيانات التوضيحية', 'gui'], ['أسئلة التأمّل', 'ref']]
for (const [ar, b] of TEXTS) add(`نصوص: ${ar}`, miss[b].length ? `${miss[b].length} مختلفاً` : `${seen[b]} مطابقاً`,
                                 miss[b].length ? 'مطابقة' : `${seen[b]} مطابقاً`)

/* ── الطباعة ── */
const W = 38
let fail = 0
console.log(`المصدر: ${CAT}\nالإصدار: ${fw.version}\n`)
for (const r of report) {
  if (!r.ok) fail++
  console.log(`${r.ok ? '✔' : '✘'} ${r.name.padEnd(W)} ${r.actual.padStart(14)}  (المتوقع ${r.expected})${r.extra ? '  ← ' + r.extra : ''}`)
}
if (nameDiff.length) {
  console.log('\n— فروق الأسماء (أوّل خمسة) —')
  nameDiff.slice(0, 5).forEach(d => console.log(`  [${d.code}]\n    القاعدة: ${d.db.slice(0, 95)}\n    المصدر : ${d.src.slice(0, 95)}`))
}
for (const [ar, b] of TEXTS) if (miss[b].length) {
  console.log(`\n— ${ar}: أوّل ثلاثة فروق —`)
  miss[b].slice(0, 3).forEach(x => console.log(`  [${x.code}] ${String(x.t).slice(0, 110)}`))
}
const texts = Object.values(seen).reduce((a, b) => a + b, 0) + srcCodes.size
console.log(`\nالنتيجة: ${report.length - fail}/${report.length} فحصاً · ${texts} عنصراً قوبل` +
            (fail ? ` — ${fail} فرقاً` : ' — مطابقة تامّة'))
process.exit(fail ? 1 : 0)

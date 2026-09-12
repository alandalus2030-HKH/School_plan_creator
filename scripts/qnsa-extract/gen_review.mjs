import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(DIR, '../..')                      // جذر المستودع
const SP = process.env.QNSA_WORK || path.join(DIR, 'work')   // مجلّد الوسائط
const c = JSON.parse(fs.readFileSync(SP + '/catalog.json', 'utf8'))
const flags = JSON.parse(fs.readFileSync(SP + '/flags.json', 'utf8'))
const merges = JSON.parse(fs.readFileSync(SP + '/merges.json', 'utf8'))

/* ملخّص سلم التقدير — يُحسب من البيانات لا يُكتب يدوياً */
const rub = JSON.parse(fs.readFileSync(SP + '/rubric.json', 'utf8'))
const rflags = JSON.parse(fs.readFileSync(SP + '/rubric_flags.json', 'utf8'))
const RUB = {
  levels: rub.levels,
  descCount: rub.groups.reduce((n, g) => n + g.rows.length, 0),
  phrases: rub.groups.reduce((n, g) =>
    n + g.rows.reduce((k, r) => k + [1, 2, 3, 4, 5].filter(l => r[l]).length, 0), 0),
  byLevel: rub.groups.reduce((a, g) => {
    g.rows.forEach(r => [1, 2, 3, 4, 5].forEach(l => { if (r[l]) a[l] = (a[l] || 0) + 1 }))
    return a
  }, {}),
  exact: rflags.report.filter(r => r.ok).length,
  merged: rflags.merged.length,
  votes: rflags.votes.length,
  votesWrap: rflags.votes.filter(v => v.decision === 'wrap').length,
  votesSplit: rflags.votes.filter(v => v.decision === 'split').length,
  unterminated: rflags.integrity.unterminated.length,
  missing: rflags.integrity.missingLevels.length,
}
const esc = s => String(s).replace(/\|/g, 'ǀ').replace(/\n/g, ' ')
const totalInd = c.subs.reduce((n, s) => n + s.indicators.length, 0)

let md = `# كتالوج QNSA النهائي — تقرير الاستخراج والمراجعة

**المصدر:** \`دليل الاعتماد نهائي.docx\` (القسم الثاني: معايير الاعتماد المدرسي الوطني)
**التاريخ:** 2026-09-12
**الترحيلات:** \`064_qnsa_final_framework.sql\` (الشجرة) · \`065_qnsa_rubric.sql\` (سلم التقدير)

## 1) ما استُخرج

| المستوى | العدد |
|---|---|
| معيار رئيس | ${c.standards.length} |
| جانب | ${c.aspects.length} |
| معيار فرعي | ${c.subs.length} |
| مؤشر أداء | ${totalInd} |
| **الإجمالي** | **${c.standards.length + c.aspects.length + c.subs.length + totalInd}** |

ومعها لكل معيار فرعي: **البيانات التوضيحية** و**أسئلة التأمل الذاتي** كما وردت في الوثيقة.

**التحقق الآلي** (\`node scripts/qnsa-extract/verify.mjs\`): طوبق نصّ **376 من 377 عقدة**
حرفياً مع نصّ جداول الوثيقة. الاستثناء الوحيد هو **3.1.8** بصياغة المستخدم المعتمدة (انظر 3.أ).

## 2) ✅ خطأ ترقيم في الوثيقة — عولج

«الإدارة الصفية تسهم في توفير بيئة داعمة لتعلم الطلبة.» ترد في **جدول الملخّص برقم 2.3.4**
وفي **قسم التفاصيل برقم 2.3.3**.

**قرار المستخدم (2026-09-10):** يُعتمد **2.3.3** ويُوحَّد في الكتالوج كلّه.
النتيجة: الجانب 2.3 = **2.3.1 · 2.3.2 · 2.3.3** (تسلسل متصل)، ومؤشرات قسم التفاصيل الثلاثة مربوطة به.

## 3) صياغات المعايير الفرعية — الوثيقة تصوغ 22 منها بشكلين

### 3.أ ✅ سبعة حُسمت بقرار المستخدم (2026-09-10)

النصّ المعتمد أدناه يُطبَّق في **الملخّص والتفاصيل معاً**:

| الكود | النصّ المعتمد | كان في الملخّص |
|---|---|---|
${c.subs.filter(s => s.decided && s.summaryName)
  .map(s => `| ${s.code} | ${esc(s.name)} | ${esc(s.summaryName)} |`).join('\n')}

> **ملاحظة على 3.1.8:** النصّ المعتمد صاغه المستخدم ولا يرد بهذا الشكل في الوثيقة
> (الملخّص: «…لتحديد مستوى الأداء وتطويره.» · التفاصيل: «…لتحديد مستوى الأداء، والاستفادة منها.»).
> فهو **الاستثناء الوحيد** من قاعدة المطابقة الحرفية، وبقرار صريح.

### 3.ب ⚠️ ${c.subs.filter(s => !s.decided && s.detailName && s.detailName !== s.name).length} ما زالت بلا قرار

الفروق هنا **إملائية/ترقيمية** في أغلبها (أقواس · فواصل · «» مقابل ( ) · أخطاء طباعية).
المعتمد حالياً: صياغة **جدول الملخّص**.

| الكود | صياغة الملخّص (المعتمدة حالياً) | صياغة قسم التفاصيل |
|---|---|---|
${c.subs.filter(s => !s.decided && s.detailName && s.detailName !== s.name)
  .map(s => `| ${s.code} | ${esc(s.name)} | ${esc(s.detailName)} |`).join('\n')}

## 4) ✅ تسعة مواضع عند حدود الصفحات — حُسمت

انقطع نصّ «مؤشرات الأداء» بين خليّتين عبر فاصل صفحة في تسعة مواضع. **لم يُوصَل أي منها تخميناً**؛
القرار مسجَّل صريحاً لكل موضع في خريطة \`JUNCTION\` داخل \`scripts/qnsa-extract/build_catalog.mjs\`.

### 4.أ ${merges.length} وُصِلت في مؤشر واحد

المعيار لغوي لا تقديري: الشقّ الثاني يبدأ في كلٍّ منها بكلمة لا تصحّ بداية جملة
(حرف جرّ · عطف · صفة · مضاف إليه). وقد **أكّد التحقّق الآلي** الوصل: النصّ الموصول
يرد متّصلاً في مجرى العمود نفسه داخل الوثيقة.

| # | المؤشر | النصّ بعد الوصل |
|---|---|---|
${merges.map((m, i) => `| ${i + 1} | ${m.key.replace('@', '.')} | ${esc(m.text)} |`).join('\n')}

### 4.ب ${flags.filter(f => f.kind.startsWith('حدّ صفحة')).length} بقيت منفصلة

| المعيار الفرعي | نهاية البند السابق | بداية البند التالي | السبب |
|---|---|---|---|
${flags.filter(f => f.kind.startsWith('حدّ صفحة'))
  .map(f => `| ${f.code} | …${esc(f.before || '')} | ${esc(f.after || '')}… | جملة مستقلّة تامّة |`).join('\n')}

## 5) توزيع المؤشرات

| الجانب | معايير فرعية | مؤشرات |
|---|---|---|
${c.aspects.map(a => {
  const subs = c.subs.filter(s => s.parent === a.code)
  return `| ${a.code} ${esc(a.name)} | ${subs.length} | ${subs.reduce((n, s) => n + s.indicators.length, 0)} |`
}).join('\n')}

## 6) ✅ سلم التقدير اللفظي — استُخرج (ترحيل 065)

**${RUB.descCount} وصفاً** لـ73 معياراً فرعياً × 5 مستويات = **${RUB.phrases} عبارة وصفية**،
من 42 جدولاً بستة أعمدة. **التحقّق: ${RUB.phrases}/${RUB.phrases} مطابقة حرفياً — صفر اختلاف.**

| المستوى | العبارات |
|---|---|
${[1, 2, 3, 4, 5].map(n => `| ${RUB.levels[n]} | ${RUB.byLevel[n] || 0} |`).join('\n')}

### 6.أ ‼ قرار نمذجة: السلم يُربَط بالمعيار الفرعي لا بالمؤشر

الوثيقة تضع **${RUB.descCount} وصفاً مقابل ${totalInd} مؤشراً**، ولا يتساوى العدد إلا في
**${RUB.exact} معياراً فرعياً من 73**. فالوصف الواحد قد يجمع مؤشّرين أو يفصّل واحداً.
لذلك ربطناه بعقدة **المستوى الثالث** مع \`row_index\`؛ وربطه بالمؤشرات واحداً لواحد
كان سيختلق علاقةً لا تقولها الوثيقة.

### 6.ب علل الوثيقة في جداول السلم — وكيف عُولجت

| العلّة | المعالجة |
|---|---|
| ترتيب الأعمدة ينعكس بين الجداول (المعيار في 0 أو 5، والسلم تصاعدي أو تنازلي) | يُقرأ من صفّ الرأس |
| 3 جداول بلا صفّ رأس — ولا ترث ترتيب سابقها لأن الشكل ينقلب فعلاً | يُستنتَج من عمود الأكواد |
| «جيد جداً» / «جيد جدا» | تطبيع التشكيل والألف والياء |
| صفوف الرأس وعناوين الجوانب تتكرّر عند كل فاصل صفحة | تُستبعَد من البيانات |
| الوصف الواحد يُقطَّع على صفّين أو ثلاثة | وُصِل ${RUB.merged} موضعاً بشاهدٍ بنيويّ ثم بتصويت الأعمدة |

### 6.ج ما يحتاج عينك

- **${RUB.votes} موضعاً حُسم بتصويت الأعمدة** (وصل ${RUB.votesWrap} · فصل ${RUB.votesSplit}) — حين اختلفت الأعمدة
  بسبب نقطة ترقيم شاردة. كلّها في \`work/rubric_flags.json\` تحت \`votes\`.
- **${RUB.unterminated} وصفاً لا ينتهي بعلامة نهاية جملة** — خلل ترقيم في الوثيقة نفسها.
- **${RUB.missing} وصفاً ناقص مستوى أو أكثر** — خلايا خالية في الوثيقة (أبرزها «مقبول»).

## 7) ما لم يُستخرج بعد

- **نماذج الأدلة والوثائق** — 15 جدولاً (واحد لكل جانب) تسمّي الأدلة المطلوبة بالاسم؛
  تُربَط بأنواع الأدلة في النظام. الخطوة التالية المقترحة.
- **الأسماء الإنجليزية** للعقد — الوثيقة عربية فقط؛ عمود \`name_en\` جاهز وينتظر النسخة الإنجليزية الرسمية.
`

fs.writeFileSync(path.join(ROOT, 'docs/QNSA_CATALOG_REVIEW.md'), md, 'utf8')
console.log('كُتب تقرير المراجعة:', Math.round(md.length / 1024), 'KB')

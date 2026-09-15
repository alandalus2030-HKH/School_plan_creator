/* توليد ترحيل 066: تحديث صياغات المعايير الفرعية المحسومة بعد تثبيت 064
   (قرار المستخدم 2026-09-15). يُحدِّث name_ar فقط — لا كود ولا ترقيم ولا مؤشرات. */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(DIR, '../..')
const SP = process.env.QNSA_WORK || path.join(DIR, 'work')

const c = JSON.parse(fs.readFileSync(path.join(SP, 'catalog.json'), 'utf8'))
const q = s => "'" + String(s).replace(/'/g, "''") + "'"

/* ما اختير فيه نصّ التفاصيل = ما تغيّر عن المثبَّت بـ064 (الذي حمل صياغة الملخّص) */
const changes = c.subs
  .filter(s => s.decidedOn === '2026-09-15' && s.wordingPick === 'detail' && s.summaryName)
  .map(s => ({ code: s.code, old: s.summaryName, neu: s.name }))
const keptSummary = c.subs.filter(s => s.decidedOn === '2026-09-15' && s.wordingPick === 'summary').map(s => s.code)

if (!changes.length) { console.log('لا تغييرات — لم يُولَّد 066'); process.exit(0) }

const rows = changes.map(x => `    (${q(x.code)}, ${q(x.old)}, ${q(x.neu)})`).join(',\n')
const expect = changes.map(x => `  (${q(x.code)}, ${q(x.neu)})`).join(',\n')

const sql = `-- ════════════════════════════════════════════════════════════════
-- 066 — صياغات المعايير الفرعية المحسومة (QNSA/final-2026)
-- ════════════════════════════════════════════════════════════════
-- قرار المستخدم (2026-09-15) في الفروق الباقية بين صياغة جدول الملخّص وصياغة
--   قسم التفاصيل في «دليل الاعتماد نهائي.docx». الترحيل 064 ثبّت صياغة الملخّص؛
--   وهنا تُعتمد صياغة التفاصيل في ${changes.length} معياراً فرعياً، وكلّها نصّ الوثيقة حرفياً.
--   وأُبقيت صياغة الملخّص (بلا تغيير هنا) في: ${keptSummary.join(' · ')}.
--
-- النطاق: عمود name_ar للمستوى 3 فقط. لا يمسّ الأكواد ولا الترقيم ولا المؤشرات
--   ولا سلم التقدير — فتطبيقه على الإصدار المثبَّت آمن دون إعادة تشغيل 064.
--
-- آمن لإعادة التشغيل: يتخطّى ما حُدِّث سابقاً، ويتوقّف بخطأ صريح إن وجد نصّاً
--   غير النصّين المتوقَّعين (أي تعديلاً يدوياً لم يُحسَب حسابه) بدل أن يكتب فوقه.
--   كل تحديث يُسجَّل في سجلّ التدقيق عبر مُشغّل audit_row_change (ترحيل 063).
--
-- التوليد: node scripts/qnsa-extract/{build_catalog,gen_wording_sql}.mjs
-- ════════════════════════════════════════════════════════════════

DO $w$
DECLARE fw uuid; r record; cur text; n int := 0; skipped int := 0;
BEGIN
  SELECT id INTO fw FROM frameworks WHERE code = 'QNSA' AND version = 'final-2026';
  IF fw IS NULL THEN RAISE EXCEPTION 'الإصدار QNSA/final-2026 غير موجود — شغّل الترحيل 064 أولاً'; END IF;

  FOR r IN SELECT * FROM (VALUES
${rows}
  ) AS v(code, old_name, new_name) LOOP
    SELECT name_ar INTO cur FROM framework_nodes
     WHERE framework_id = fw AND level = 3 AND code = r.code;
    IF NOT FOUND THEN RAISE EXCEPTION 'المعيار الفرعي % غير موجود', r.code; END IF;

    IF cur = r.new_name THEN skipped := skipped + 1; CONTINUE; END IF;
    IF cur <> r.old_name THEN
      RAISE EXCEPTION 'نصّ المعيار % في القاعدة غير متوقَّع: «%»', r.code, cur;
    END IF;

    UPDATE framework_nodes SET name_ar = r.new_name
     WHERE framework_id = fw AND level = 3 AND code = r.code;
    n := n + 1;
  END LOOP;

  RAISE NOTICE 'حُدِّث % معياراً فرعياً · سبق تحديثه %', n, skipped;
END $w$;

-- ── تحقّق ───────────────────────────────────────────────────────
SELECT v.code AS المعيار,
       CASE WHEN fn.name_ar = v.expected THEN 'مطابق' ELSE 'مختلف' END AS الحالة
FROM (VALUES
${expect}
) AS v(code, expected)
JOIN frameworks f ON f.code = 'QNSA' AND f.version = 'final-2026'
LEFT JOIN framework_nodes fn ON fn.framework_id = f.id AND fn.level = 3 AND fn.code = v.code
ORDER BY string_to_array(v.code, '.')::int[];
-- المتوقّع: ${changes.length} صفّاً، كلّها «مطابق»
`

fs.writeFileSync(path.join(ROOT, 'database/migrations/066_qnsa_wording_decisions.sql'), sql, 'utf8')
console.log('066: تحديث', changes.length, 'معياراً فرعياً ·', changes.map(x => x.code).join(' '))
console.log('أُبقيت صياغة الملخّص:', keptSummary.join(' '))

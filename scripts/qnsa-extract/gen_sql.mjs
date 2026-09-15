import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(DIR, '../..')                      // جذر المستودع
const SP = process.env.QNSA_WORK || path.join(DIR, 'work')   // مجلّد الوسائط
const c = JSON.parse(fs.readFileSync(SP + '/catalog.json', 'utf8'))
const merges = JSON.parse(fs.readFileSync(SP + '/merges.json', 'utf8'))
const splitCount = JSON.parse(fs.readFileSync(SP + '/flags.json', 'utf8'))
  .filter(f => f.kind.startsWith('حدّ صفحة') && f.decided).length
const q = s => s === null || s === undefined || s === '' ? 'NULL' : "'" + String(s).replace(/'/g, "''") + "'"
const numOf = code => parseInt(code.split('.').pop(), 10) || 0

const rows = []
for (const s of c.standards) rows.push([s.code, 1, null, s.name, numOf(s.code), null, null])
for (const a of c.aspects)   rows.push([a.code, 2, a.parent, a.name, numOf(a.code), null, null])
for (const s of c.subs) {
  rows.push([s.code, 3, s.parent, s.name, numOf(s.code), s.guidanceText || null, s.questionsText || null])
  s.indicators.forEach((ind, i) => rows.push([`${s.code}.${i + 1}`, 4, s.code, ind, i + 1, null, null]))
}
rows.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], 'en', { numeric: true }))

const values = rows.map(r =>
  `  (${q(r[0])}, ${r[1]}, ${q(r[2])}, ${q(r[3])}, ${r[4]}, ${q(r[5])}, ${q(r[6])})`).join(',\n')

const sql = `-- ════════════════════════════════════════════════════════════════
-- 064 — زرع إطار QNSA النهائي (الدليل الإرشادي للاعتماد المدرسي الوطني)
-- ════════════════════════════════════════════════════════════════
-- المرحلة 4 · الأسبوع 1 · اليوم 2.
-- المصدر: «دليل الاعتماد نهائي.docx» — استُخرج آلياً من جداول الوثيقة
--   (جدول الملخّص للمستويات 1-3، وجداول «مؤشرات الأداء» لكل جانب للمستوى 4)
--   ثم دُقِّق آلياً (scripts/qnsa-extract/verify.mjs) بثلاثة فحوص:
--     · المطابقة الحرفية: نصّ كل عقدة يرد في جداول الوثيقة، إلا تعديلين بقرار
--       صريح — صياغة 3.1.8، ووصل 3.1.2 بحذف كلمة كُرِّرت عند حدّ الصفحة.
--     · التغطية: نصّ عمود المؤشرات كلّه في الكتالوج (المفقود عناوين وتكرار حدّ).
--     · المرجع البشريّ: عدد المؤشرات لكل معيار فرعي يطابق تدقيق المستخدم اليدويّ
--       (2026-09-14) في المعايير الفرعية الـ73 كلّها.
--
-- التوليد: node scripts/qnsa-extract/{build_catalog,gen_sql}.mjs — لا تحرّر هذا
--   الملف يدوياً؛ حرّر السكربت وأعد التوليد.
--
-- حدود الصفحات: ${merges.length + splitCount} موضعاً انقطع فيها نصّ مؤشر بين خليّتين —
--   وُصِل ${merges.length} في مؤشر واحد وبقي ${splitCount} منفصلاً، كلٌّ بقرار مسجَّل في خريطة
--   JUNCTION داخل build_catalog.mjs. وبندٌ سقطت علامة تعداده (1.1.2) فُصِل عن سابقه.
--   التفصيل في docs/QNSA_CATALOG_REVIEW.md.
--
-- المحتوى:  5 معايير رئيسة · 15 جانباً · 73 معياراً فرعياً · ${c.subs.reduce((n, s) => n + s.indicators.length, 0)} مؤشر أداء
--   + «البيانات التوضيحية» و«أسئلة التأمل الذاتي» لكل معيار فرعي (نصّ الوثيقة حرفياً).
--
-- تصحيح ترقيم (قرار المستخدم 2026-09-10): «الإدارة الصفية تسهم في توفير بيئة
--   داعمة لتعلم الطلبة.» ترد في جدول ملخّص الوثيقة برقم 2.3.4 وفي قسم التفاصيل
--   برقم 2.3.3 — اعتُمد **2.3.3** ليتصل تسلسل الجانب 2.3 (2.3.1 · 2.3.2 · 2.3.3).
--
-- هذا الإصدار يحلّ محلّ مسوّدة الترحيل 027 (QNSA/draft-2026):
--   القديم يُؤرشَف ولا يُحذف — خطط الأعوام السابقة تبقى مرتبطة به.
-- ════════════════════════════════════════════════════════════════

-- ── (0) أعمدة المحتوى الداعم (تُضاف إن لم تكن موجودة) ───────────
ALTER TABLE framework_nodes ADD COLUMN IF NOT EXISTS guidance_ar   TEXT;  -- البيانات التوضيحية
ALTER TABLE framework_nodes ADD COLUMN IF NOT EXISTS reflection_ar TEXT;  -- أسئلة التأمل الذاتي

-- ── (1) الإصدار الجديد + أرشفة المسوّدة ─────────────────────────
UPDATE frameworks SET status = 'archived' WHERE code = 'QNSA' AND version = 'draft-2026';

INSERT INTO frameworks (code, version, name_ar, name_en, status, source_note)
VALUES ('QNSA', 'final-2026',
        'معايير الاعتماد المدرسي الوطني — الدليل الإرشادي (النسخة النهائية)',
        'Qatar National School Accreditation Standards — Final Guide',
        'active',
        'دليل الاعتماد نهائي.docx — القسم الثاني: معايير الاعتماد المدرسي الوطني')
ON CONFLICT (code, version) DO UPDATE
SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en,
    status = 'active', source_note = EXCLUDED.source_note;

INSERT INTO framework_levels (framework_id, level, name_ar, name_en)
SELECT f.id, v.level, v.name_ar, v.name_en
FROM frameworks f,
     (VALUES (1, 'معيار رئيس', 'Standard'),
             (2, 'جانب',       'Aspect'),
             (3, 'معيار فرعي', 'Sub-standard'),
             (4, 'مؤشر أداء',  'Performance Indicator')
     ) AS v(level, name_ar, name_en)
WHERE f.code = 'QNSA' AND f.version = 'final-2026'
ON CONFLICT (framework_id, level) DO UPDATE
SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en;

-- ── (2) العقد في جدول مرحلي ثم إدراجها مستوىً بعد مستوى ─────────
CREATE TEMP TABLE _qnsa_seed (
  code text, level int, parent text, name_ar text,
  sort_order int, guidance text, reflection text
) ON COMMIT DROP;

INSERT INTO _qnsa_seed (code, level, parent, name_ar, sort_order, guidance, reflection) VALUES
${values};

DO $seed$
DECLARE fw uuid; lvl int; n int;
BEGIN
  SELECT id INTO fw FROM frameworks WHERE code = 'QNSA' AND version = 'final-2026';
  IF fw IS NULL THEN RAISE EXCEPTION 'الإصدار QNSA/final-2026 غير موجود'; END IF;

  FOR lvl IN 1..4 LOOP
    INSERT INTO framework_nodes
      (framework_id, parent_id, level, code, name_ar, sort_order, guidance_ar, reflection_ar)
    SELECT fw, p.id, s.level, s.code, s.name_ar, s.sort_order, s.guidance, s.reflection
    FROM _qnsa_seed s
    LEFT JOIN framework_nodes p ON p.framework_id = fw AND p.code = s.parent
    WHERE s.level = lvl
    ON CONFLICT (framework_id, code) DO UPDATE
    SET name_ar = EXCLUDED.name_ar, parent_id = EXCLUDED.parent_id,
        sort_order = EXCLUDED.sort_order, level = EXCLUDED.level,
        guidance_ar = EXCLUDED.guidance_ar, reflection_ar = EXCLUDED.reflection_ar;

    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'المستوى %: % عقدة', lvl, n;
  END LOOP;

  -- كل عقدة (عدا المستوى 1) يجب أن يكون لها أب
  SELECT count(*) INTO n FROM framework_nodes
   WHERE framework_id = fw AND level > 1 AND parent_id IS NULL;
  IF n > 0 THEN RAISE EXCEPTION 'عقد بلا أب: %', n; END IF;
END $seed$;

-- ── (3) تحقّق ───────────────────────────────────────────────────
SELECT n.level, l.name_ar AS المستوى, count(*) AS العدد
FROM framework_nodes n
JOIN frameworks f ON f.id = n.framework_id
JOIN framework_levels l ON l.framework_id = f.id AND l.level = n.level
WHERE f.code = 'QNSA' AND f.version = 'final-2026'
GROUP BY n.level, l.name_ar ORDER BY n.level;
-- المتوقّع: 1 → 5 · 2 → 15 · 3 → 73 · 4 → ${c.subs.reduce((n, s) => n + s.indicators.length, 0)}

SELECT code, version, status FROM frameworks WHERE code = 'QNSA' ORDER BY version;
-- المتوقّع: draft-2026 = archived · final-2026 = active
`

/* هذا الترحيل شُغِّل في قاعدة الإنتاج (2026-09-15). ملفّه سجلٌّ لِما نُفِّذ فعلاً،
   فلا يُعاد توليده بمحتوى جديد — أيّ تغيير لاحق يمضي في ترحيل تحديث (066 فما بعده).
   لإعادة التوليد عمداً (قاعدة جديدة فارغة مثلاً): QNSA_REGEN_APPLIED=1 */
const target = path.join(ROOT, 'database/migrations/064_qnsa_final_framework.sql')
if (fs.existsSync(target) && !process.env.QNSA_REGEN_APPLIED) {
  console.log('⏭  064_qnsa_final_framework.sql مُطبَّق في الإنتاج — لم يُعَد توليده (QNSA_REGEN_APPLIED=1 للتجاوز)')
} else {
  fs.writeFileSync(target, sql, 'utf8')
}
console.log('صفوف:', rows.length, '· حجم SQL:', Math.round(sql.length / 1024), 'KB')
console.log('لكل مستوى:', JSON.stringify(rows.reduce((a, r) => (a[r[1]] = (a[r[1]] || 0) + 1, a), {})))

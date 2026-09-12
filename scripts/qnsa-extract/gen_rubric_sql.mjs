/* توليد ترحيل 065: جدول سلم التقدير اللفظي + زرع أوصاف QNSA/final-2026 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(DIR, '../..')
const SP = process.env.QNSA_WORK || path.join(DIR, 'work')

const rub = JSON.parse(fs.readFileSync(path.join(SP, 'rubric.json'), 'utf8'))
const q = s => s === null || s === undefined || s === '' ? 'NULL' : "'" + String(s).replace(/'/g, "''") + "'"

const rows = []
for (const g of rub.groups) {
  g.rows.forEach((desc, i) => {
    for (let n = 1; n <= 5; n++) if (desc[n]) rows.push([g.code, i, n, desc[n]])
  })
}
rows.sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }) || a[1] - b[1] || a[2] - b[2])

const values = rows.map(r => `  (${q(r[0])}, ${r[1]}, ${r[2]}, ${q(r[3])})`).join(',\n')
const descCount = rub.groups.reduce((n, g) => n + g.rows.length, 0)

const sql = `-- ════════════════════════════════════════════════════════════════
-- 065 — سلم التقدير اللفظي لإطار QNSA النهائي
-- ════════════════════════════════════════════════════════════════
-- المرحلة 4 · الأسبوع 1 · اليوم 2.5.
-- المصدر: «دليل الاعتماد نهائي.docx» — 42 جدولاً بستة أعمدة، تَلي جداول
--   مؤشرات كل جانب، وتصف أداء المدرسة في خمسة مستويات متدرّجة.
--
-- المحتوى: ${descCount} وصفاً لـ73 معياراً فرعياً · ${rows.length} عبارة وصفية
--   (${descCount} × 5 مستويات، ناقصةً ${descCount * 5 - rows.length} خلايا خالية في الوثيقة).
--
-- التوليد: node scripts/qnsa-extract/{build_rubric,gen_rubric_sql}.mjs
--   لا تحرّر هذا الملف يدوياً؛ حرّر السكربت وأعد التوليد.
--
-- التحقّق (scripts/qnsa-extract/verify.mjs): ${rows.length} من ${rows.length} عبارة
--   نصّها مطابق حرفياً لنصّ الوثيقة — صفر اختلاف.
--
-- ‼ قرار نمذجة: الوصف مرتبط بعقدة **المعيار الفرعي** (المستوى 3) لا بمؤشر
--   أداء. فالوثيقة تضع ${descCount} وصفاً مقابل 284 مؤشراً، ولا يتساوى العدد
--   إلا في 14 معياراً فرعياً من 73 — أي أن الوصف قد يجمع مؤشّرين أو يفصّل
--   واحداً. فربطه بالمؤشرات واحداً لواحد اختلاقُ علاقةٍ لا تقولها الوثيقة.
-- ════════════════════════════════════════════════════════════════

-- ── (1) سلم التقدير كبيانات لا ككود ─────────────────────────────
-- عدد المستويات وأسماؤها من خصائص الإطار: QNSA خمسة، وإطار آخر قد يكون
-- أربعة أو ستة. فلا تُكتب في الكود ولا في قيد CHECK.
CREATE TABLE IF NOT EXISTS framework_rating_scale (
  framework_id uuid NOT NULL REFERENCES frameworks(id) ON DELETE CASCADE,
  level        int  NOT NULL CHECK (level >= 1),
  name_ar      text NOT NULL,
  name_en      text,
  PRIMARY KEY (framework_id, level)
);

COMMENT ON TABLE framework_rating_scale IS
  'مستويات الحكم على الأداء لكل إصدار إطار (QNSA: ضعيف → ممتاز)';

-- ── (2) أوصاف الأداء ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS framework_rubric (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_node_id uuid NOT NULL REFERENCES framework_nodes(id) ON DELETE CASCADE,
  row_index         int  NOT NULL CHECK (row_index >= 0),  -- ترتيب الوصف داخل المعيار الفرعي
  level             int  NOT NULL CHECK (level >= 1),
  descriptor_ar     text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (framework_node_id, row_index, level)
);

CREATE INDEX IF NOT EXISTS framework_rubric_node_idx
  ON framework_rubric (framework_node_id, row_index, level);

COMMENT ON TABLE framework_rubric IS
  'وصف الأداء لكل مستوى من سلم التقدير، مرتبطاً بعقدة المعيار الفرعي';
COMMENT ON COLUMN framework_rubric.row_index IS
  'الوصف الواحد داخل المعيار الفرعي؛ ليس مقابلاً لمؤشر أداء بعينه';

-- ── (3) RLS ونمط التدقيق — عين ما في الترحيل 063 ────────────────
ALTER TABLE framework_rating_scale ENABLE ROW LEVEL SECURITY;
ALTER TABLE framework_rubric       ENABLE ROW LEVEL SECURITY;

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['framework_rating_scale', 'framework_rubric'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_read',  t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_write', t);

    -- السلم مرجع عام لا بيانات مدرسة: أي مستخدم مسجّل يقرأه (لا عزل مدرسة)
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (auth.uid() IS NOT NULL)',
      t || '_read', t);

    -- الكتابة من المتصفح لمشرف النظام وحده؛ الاستيراد الخادمي يتجاوز RLS
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (my_is_super_admin()) WITH CHECK (my_is_super_admin())',
      t || '_write', t);
  END LOOP;
END $do$;

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['framework_rating_scale', 'framework_rubric'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%I ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON %I
       FOR EACH ROW EXECUTE FUNCTION audit_row_change()', t, t);
  END LOOP;
END $do$;

-- ── (4) مستويات سلم QNSA ───────────────────────────────────────
INSERT INTO framework_rating_scale (framework_id, level, name_ar, name_en)
SELECT f.id, v.level, v.name_ar, v.name_en
FROM frameworks f,
     (VALUES (1, 'ضعيف',     'Weak'),
             (2, 'مقبول',    'Acceptable'),
             (3, 'جيد',       'Good'),
             (4, 'جيد جداً', 'Very Good'),
             (5, 'ممتاز',    'Outstanding')
     ) AS v(level, name_ar, name_en)
WHERE f.code = 'QNSA' AND f.version = 'final-2026'
ON CONFLICT (framework_id, level) DO UPDATE
SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en;

-- ── (5) الأوصاف ────────────────────────────────────────────────
CREATE TEMP TABLE _qnsa_rubric (
  code text, row_index int, level int, descriptor text
) ON COMMIT DROP;

INSERT INTO _qnsa_rubric (code, row_index, level, descriptor) VALUES
${values};

DO $seed$
DECLARE fw uuid; n int; orphan int;
BEGIN
  SELECT id INTO fw FROM frameworks WHERE code = 'QNSA' AND version = 'final-2026';
  IF fw IS NULL THEN
    RAISE EXCEPTION 'الإصدار QNSA/final-2026 غير موجود — شغّل الترحيل 064 أولاً';
  END IF;

  -- كل كود في السلم يجب أن يقابل عقدة معيار فرعي في هذا الإصدار
  SELECT count(*) INTO orphan
  FROM (SELECT DISTINCT code FROM _qnsa_rubric) s
  LEFT JOIN framework_nodes fn ON fn.framework_id = fw AND fn.code = s.code AND fn.level = 3
  WHERE fn.id IS NULL;
  IF orphan > 0 THEN
    RAISE EXCEPTION 'أكواد في السلم بلا عقدة معيار فرعي مقابلة: %', orphan;
  END IF;

  INSERT INTO framework_rubric (framework_node_id, row_index, level, descriptor_ar)
  SELECT fn.id, s.row_index, s.level, s.descriptor
  FROM _qnsa_rubric s
  JOIN framework_nodes fn
    ON fn.framework_id = fw AND fn.code = s.code AND fn.level = 3
  ON CONFLICT (framework_node_id, row_index, level) DO UPDATE
  SET descriptor_ar = EXCLUDED.descriptor_ar;

  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'عبارات وصفية مزروعة: %', n;
END $seed$;

-- ── (6) تحقّق ──────────────────────────────────────────────────
SELECT s.level, s.name_ar AS المستوى, count(*) AS العبارات
FROM framework_rubric r
JOIN framework_nodes fn ON fn.id = r.framework_node_id
JOIN frameworks f ON f.id = fn.framework_id
JOIN framework_rating_scale s ON s.framework_id = f.id AND s.level = r.level
WHERE f.code = 'QNSA' AND f.version = 'final-2026'
GROUP BY s.level, s.name_ar ORDER BY s.level;
-- المجموع المتوقّع: ${rows.length} عبارة

SELECT count(DISTINCT (r.framework_node_id, r.row_index)) AS الأوصاف,
       count(DISTINCT r.framework_node_id)                AS معايير_فرعية
FROM framework_rubric r
JOIN framework_nodes fn ON fn.id = r.framework_node_id
JOIN frameworks f ON f.id = fn.framework_id
WHERE f.code = 'QNSA' AND f.version = 'final-2026';
-- المتوقّع: ${descCount} وصفاً · 73 معياراً فرعياً
`

fs.writeFileSync(path.join(ROOT, 'database/migrations/065_qnsa_rubric.sql'), sql, 'utf8')
console.log('أوصاف:', descCount, '· عبارات:', rows.length, '· حجم SQL:', Math.round(sql.length / 1024), 'KB')
const byLevel = rows.reduce((a, r) => (a[r[2]] = (a[r[2]] || 0) + 1, a), {})
console.log('لكل مستوى:', JSON.stringify(byLevel))

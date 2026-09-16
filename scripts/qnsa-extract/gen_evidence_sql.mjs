/* توليد ترحيل 067: جدول «نماذج الأدلة والوثائق» + زرع أدلّة QNSA/final-2026 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(DIR, '../..')
const SP = process.env.QNSA_WORK || path.join(DIR, 'work')

const ev = JSON.parse(fs.readFileSync(path.join(SP, 'evidence.json'), 'utf8'))
const q = s => "'" + String(s).replace(/'/g, "''") + "'"

const rows = ev.groups.flatMap(g => g.items.map((t, i) => [g.code, i + 1, t]))
const total = rows.length
const values = rows.map(r => `  (${q(r[0])}, ${r[1]}, ${q(r[2])})`).join(',\n')
const expectCounts = ev.groups.map(g => `  (${q(g.code)}, ${g.items.length})`).join(',\n')

const sql = `-- ════════════════════════════════════════════════════════════════
-- 067 — نماذج الأدلة والوثائق لإطار QNSA النهائي
-- ════════════════════════════════════════════════════════════════
-- المصدر: «دليل الاعتماد نهائي.docx» — جدول «نماذج الأدلة والوثائق» الذي يلي
--   تفاصيل كل جانب: 15 جدولاً لـ15 جانباً · ${total} دليلاً.
--
-- التوليد: node scripts/qnsa-extract/{parse2,build_evidence,gen_evidence_sql}.mjs
--   لا تحرّر هذا الملف يدوياً؛ حرّر السكربت وأعد التوليد.
--
-- التحقّق (scripts/qnsa-extract/verify.mjs): ${total} من ${total} دليلاً نصّه يرد في
--   الوثيقة حرفياً.
--
-- ‼ قرار نمذجة: الدليل مرتبط بعقدة **الجانب** (المستوى 2)، لأن الوثيقة تضع قائمة
--   أدلة واحدة لكل جانب ولا تُسند الدليل إلى معيار فرعي أو مؤشر بعينه. وإسناده
--   لمستوى أدنى اختلاقُ علاقةٍ لا تقولها الوثيقة.
--
-- ملاحظة: جدول أدلة 2.1 كان ضائعاً من المحلّل (فقرة فارغة <w:p …/> مغلقة ذاتياً
--   قبله ابتلعت وسوم فتحه). أُصلح المحلّل، وصار يتوقّف إن نقص جدول واحد.
-- ════════════════════════════════════════════════════════════════

-- ── (1) الجدول ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS framework_evidence_samples (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_node_id uuid NOT NULL REFERENCES framework_nodes(id) ON DELETE CASCADE,  -- عقدة الجانب
  sort_order        int  NOT NULL CHECK (sort_order >= 1),
  text_ar           text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (framework_node_id, sort_order)
);

COMMENT ON TABLE framework_evidence_samples IS
  'نماذج الأدلة والوثائق التي يقترحها الإطار لكل جانب (مرجع لا أدلة مدرسة)';

-- ── (2) RLS ونمط التدقيق — عين ما في الترحيلين 063 و065 ─────────
ALTER TABLE framework_evidence_samples ENABLE ROW LEVEL SECURITY;

DO $do$
DECLARE t text := 'framework_evidence_samples';
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_read',  t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_write', t);

  -- مرجع عام لا بيانات مدرسة: أي مستخدم مسجّل يقرأه (لا عزل مدرسة)
  EXECUTE format(
    'CREATE POLICY %I ON %I FOR SELECT USING (auth.uid() IS NOT NULL)',
    t || '_read', t);

  -- الكتابة من المتصفح لمشرف النظام وحده؛ الاستيراد الخادمي يتجاوز RLS
  EXECUTE format(
    'CREATE POLICY %I ON %I FOR ALL USING (my_is_super_admin()) WITH CHECK (my_is_super_admin())',
    t || '_write', t);

  EXECUTE format('DROP TRIGGER IF EXISTS audit_%I ON %I', t, t);
  EXECUTE format(
    'CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON %I
     FOR EACH ROW EXECUTE FUNCTION audit_row_change()', t, t);
END $do$;

-- ── (3) الأدلّة ────────────────────────────────────────────────
CREATE TEMP TABLE _qnsa_evidence (
  code text, sort_order int, text_ar text
) ON COMMIT DROP;

INSERT INTO _qnsa_evidence (code, sort_order, text_ar) VALUES
${values};

DO $seed$
DECLARE fw uuid; n int; orphan int;
BEGIN
  SELECT id INTO fw FROM frameworks WHERE code = 'QNSA' AND version = 'final-2026';
  IF fw IS NULL THEN
    RAISE EXCEPTION 'الإصدار QNSA/final-2026 غير موجود — شغّل الترحيل 064 أولاً';
  END IF;

  -- كل كود يجب أن يقابل عقدة جانب (المستوى 2) في هذا الإصدار
  SELECT count(*) INTO orphan
  FROM (SELECT DISTINCT code FROM _qnsa_evidence) s
  LEFT JOIN framework_nodes fn ON fn.framework_id = fw AND fn.code = s.code AND fn.level = 2
  WHERE fn.id IS NULL;
  IF orphan > 0 THEN
    RAISE EXCEPTION 'أكواد أدلّة بلا عقدة جانب مقابلة: %', orphan;
  END IF;

  INSERT INTO framework_evidence_samples (framework_node_id, sort_order, text_ar)
  SELECT fn.id, s.sort_order, s.text_ar
  FROM _qnsa_evidence s
  JOIN framework_nodes fn ON fn.framework_id = fw AND fn.code = s.code AND fn.level = 2
  ON CONFLICT (framework_node_id, sort_order) DO UPDATE
  SET text_ar = EXCLUDED.text_ar;

  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'أدلّة مزروعة: %', n;
END $seed$;

-- ── (4) تحقّق: عدد الأدلة لكل جانب مقابل المتوقَّع، وصفّ الإجمالي ─
(SELECT v.code AS الجانب, count(e.id) AS الأدلة, v.expected AS المتوقع,
       CASE WHEN count(e.id) = v.expected THEN 'مطابق' ELSE 'مختلف' END AS الحالة
FROM (VALUES
${expectCounts}
) AS v(code, expected)
JOIN frameworks f ON f.code = 'QNSA' AND f.version = 'final-2026'
LEFT JOIN framework_nodes fn ON fn.framework_id = f.id AND fn.level = 2 AND fn.code = v.code
LEFT JOIN framework_evidence_samples e ON e.framework_node_id = fn.id
GROUP BY v.code, v.expected
 ORDER BY string_to_array(v.code, '.')::int[])
UNION ALL
(SELECT 'الإجمالي', count(e.id), ${total},
       CASE WHEN count(e.id) = ${total} THEN 'مطابق' ELSE 'مختلف' END
FROM framework_evidence_samples e
JOIN framework_nodes fn ON fn.id = e.framework_node_id
JOIN frameworks f ON f.id = fn.framework_id
WHERE f.code = 'QNSA' AND f.version = 'final-2026');
-- المتوقّع: 16 صفّاً (15 جانباً + الإجمالي ${total})، كلّها «مطابق»
`

const target = path.join(ROOT, 'database/migrations/067_qnsa_evidence_samples.sql')
if (fs.existsSync(target) && !process.env.QNSA_REGEN_APPLIED) {
  console.log('⏭  067 مُطبَّق في الإنتاج — لم يُعَد توليده (QNSA_REGEN_APPLIED=1 للتجاوز)')
} else {
  fs.writeFileSync(target, sql, 'utf8')
  console.log('067: أدلّة', total, '· جوانب', ev.groups.length, '· حجم', Math.round(sql.length / 1024), 'KB')
}

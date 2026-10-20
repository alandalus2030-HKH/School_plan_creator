-- ════════════════════════════════════════════════════════════════
-- 087 · تصحيح نطاق الحارس: «نشطٌ واحد **لكل إطار**» لا واحدٌ للنظام
--
-- العلّة (خطأ في 086 الذي كتبتُه بالأمس): أضفتُ فهرساً فريداً
--     ON frameworks ((status)) WHERE status = 'active'
-- أي **إطارٌ نشطٌ واحد في النظام كلّه**. ولم أفحص ما هو قائم قبل أن
-- أبني فوقه: ترحيل 063 فيه منذ زمن
--     CREATE UNIQUE INDEX frameworks_one_active
--       ON frameworks (code) WHERE status = 'active';
-- وهو **أصوب نطاقاً**: لكل إطارٍ إصدارٌ نشطٌ واحد.
--
-- والمخالفة في الوثيقة §13.1 بنصّها: «والبنية تحتمله اليوم: جدول
-- الأطر يقبل **أطراً متعدّدة بإصدارات متعدّدة**، وسلم التقدير مرتبط
-- بالإطار لا بالنظام — فكوجنيا بمستوياتها وDSIB بستّة تعمل بلا تعديل
-- مخطّط». و«التقييم الإلزامي إطارٌ قائم بذاته» ووثيقته وصلت في
-- 30 سبتمبر 2026. فلو أُدخل غداً لمنع فهرسي تفعيله، ولبدا العطل في
-- البيانات وهو في حارسٍ زائد.
--
-- والعطل أوسع من الفهرس: `active_framework_id()` تفترض نشطاً واحداً،
-- وسياسات القراءة الأربع بُنيت عليها — فمع إطارين نشطين تُخفي الثاني
-- بكامله.
--
-- والتصحيح ثلاثة، في معاملةٍ واحدة لأن السياسات تعتمد الدالّة:
--   (1) يُحذف الفهرس الزائد، ويبقى حارس 063.
--   (2) الدالّة تصير مُعنونةً بالإطار: active_framework_id('QNSA').
--   (3) السياسات تُعاد على القاعدة الصحيحة: **يُخفى المؤرشف لا الأطر
--       الأخرى** — فيُقضى غرض المستخدم («لا نرجع إلى القديم في أيّ
--       عملية») ولا يُسدّ باب §13.
--
-- متطلّبات: 063 · 086.
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ── (1) الفهرس الزائد يسقط · وحارس 063 يبقى ─────────────────────
DROP INDEX IF EXISTS idx_frameworks_single_active;

-- ── (2) السياسات تُحذف قبل الدالّة لأنها تعتمدها ────────────────
DROP POLICY IF EXISTS framework_nodes_read            ON framework_nodes;
DROP POLICY IF EXISTS framework_rubric_read           ON framework_rubric;
DROP POLICY IF EXISTS framework_evidence_samples_read ON framework_evidence_samples;
DROP POLICY IF EXISTS framework_node_notes_read       ON framework_node_notes;

DROP FUNCTION IF EXISTS active_framework_id();

-- ── (3) الدالّة مُعنونةً بالإطار ─────────────────────────────────
CREATE OR REPLACE FUNCTION active_framework_id(p_code text DEFAULT 'QNSA')
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM frameworks WHERE code = p_code AND status = 'active' LIMIT 1
$$;

COMMENT ON FUNCTION active_framework_id IS
  'الإصدار النشط لإطارٍ بعينه — افتراضه QNSA. ولكل إطارٍ نشطٌ واحد (فهرس 063)';

-- ── (4) القراءة: يُخفى **المؤرشف** لا الأطر الأخرى ───────────────
-- القاعدة: تُرى العقدة إن كان إصدارها نشطاً — أيّاً كان إطارها.
-- فتُحجب الإصدارات المؤرشفة وحدها، ويبقى بابُ الأطر المتعدّدة (13.1).
CREATE POLICY framework_nodes_read ON framework_nodes FOR SELECT
  USING (auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM frameworks f
    WHERE f.id = framework_nodes.framework_id AND f.status = 'active'));

-- والتابعة تُرى بقدر ما تُرى عقدتها — فهي لا تحمل framework_id أصلاً
CREATE POLICY framework_rubric_read ON framework_rubric FOR SELECT
  USING (auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM framework_nodes n JOIN frameworks f ON f.id = n.framework_id
    WHERE n.id = framework_rubric.framework_node_id AND f.status = 'active'));

CREATE POLICY framework_evidence_samples_read ON framework_evidence_samples FOR SELECT
  USING (auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM framework_nodes n JOIN frameworks f ON f.id = n.framework_id
    WHERE n.id = framework_evidence_samples.framework_node_id AND f.status = 'active'));

CREATE POLICY framework_node_notes_read ON framework_node_notes FOR SELECT
  USING (auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM framework_nodes n JOIN frameworks f ON f.id = n.framework_id
    WHERE n.id = framework_node_notes.framework_node_id AND f.status = 'active'));

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- التحقّق — يُشغَّل بعد الترحيل
-- ════════════════════════════════════════════════════════════════
-- SELECT 'الفهرس الزائد سقط' AS الفحص,
--        (SELECT count(*) FROM pg_indexes WHERE indexname = 'idx_frameworks_single_active')::text AS الفعلي, '0' AS المتوقع
-- UNION ALL SELECT 'حارس 063 باقٍ (نشطٌ لكل إطار)',
--        (SELECT count(*) FROM pg_indexes WHERE indexname = 'frameworks_one_active')::text, '1'
-- UNION ALL SELECT 'الدالّة بمعاملها',
--        (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--          WHERE p.proname = 'active_framework_id' AND n.nspname = 'public' AND p.pronargs = 1)::text, '1'
-- UNION ALL SELECT 'تُرجع إصدار QNSA النشط',
--        (SELECT version FROM frameworks WHERE id = active_framework_id()), 'official-2026'
-- UNION ALL SELECT 'سياسات القراءة الأربع',
--        (SELECT count(*) FROM pg_policies WHERE policyname IN
--          ('framework_nodes_read','framework_rubric_read',
--           'framework_evidence_samples_read','framework_node_notes_read'))::text, '4'
-- UNION ALL SELECT 'عقد مرئية (النشط وحده)',
--        (SELECT count(*) FROM framework_nodes n JOIN frameworks f ON f.id = n.framework_id
--          WHERE f.status = 'active')::text, '380'
-- UNION ALL SELECT 'عقد مؤرشفة (محفوظة ومحجوبة)',
--        (SELECT count(*) FROM framework_nodes n JOIN frameworks f ON f.id = n.framework_id
--          WHERE f.status <> 'active')::text, '376';

-- اختبارٌ يتراجع عن نفسه — حارس 063 ما زال يمنع إصدارين نشطين لإطارٍ واحد:
-- BEGIN;
--   UPDATE frameworks SET status = 'active' WHERE version = 'final-2026';   -- يجب أن يفشل
-- ROLLBACK;

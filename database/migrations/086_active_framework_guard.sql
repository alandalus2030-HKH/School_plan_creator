-- ════════════════════════════════════════════════════════════════
-- 086 · الإصدار النشط وحده يُرى — حارسٌ لا حذف
--
-- العلّة (رُصدت 2026-10-13): الجداول التابعة للإطار — `framework_rubric`
-- و`framework_evidence_samples` و`framework_node_notes` — **لا تحمل
-- `framework_id`**؛ تتصل بالإطار عبر العقدة وحدها. وفي القاعدة ثلاثة
-- إصدارات (draft-2026 · final-2026 مؤرشفان · official-2026 نشط)، فأيّ
-- عدٍّ أو استخراجٍ بلا ترشيحٍ بعقد الإصدار النشط **يجمع الإصدارات**.
-- وقع ذلك فعلاً في استخراج الإطار: 345 صفّ تقدير و449 نموذجاً، والصحيح
-- 168 و245.
--
-- وقرار المستخدم (2026-10-20): الإصدار القديم استُبدل رسمياً، فلا يُرجَع
-- إليه في أيّ عملية. والعلاج **حارسٌ لا حذف** — فأثر «ما تغيّر عن
-- الإصدار السابق» سندٌ تحتاجه الجهة أحياناً، وإتلافه لا يُشترى به شيء.
--
-- ثلاث طبقات:
--   (1) `active_framework_id()` — مصدرٌ واحد لمعرفة الإصدار النشط،
--       يُستعمل في السياسات وفي أيّ استعلامٍ لاحق.
--   (2) فهرسٌ فريدٌ جزئيّ: **إصدارٌ نشطٌ واحد لا غير** — فلا يستيقظ
--       إصداران فيختلط الإطار صامتاً.
--   (3) سياسات القراءة: عقد الإصدارات غير النشطة **لا تُرى من المتصفّح**
--       ولا تُرى معها صفوف السلّم ولا الأدلة ولا الملاحظات.
--       ⚠ وحدّه الصريح: **service role يتجاوز RLS** — فالمسارات الخادمية
--       تبقى مسؤولةً عن ترشيحها، والسياسة تحرس المتصفّح وحده.
--
-- متطلّبات: 063 (السجلّ والسياسات) · 065 · 067 · 072.
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ── (1) مصدرٌ واحد للإصدار النشط ─────────────────────────────────
CREATE OR REPLACE FUNCTION active_framework_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM frameworks WHERE status = 'active' ORDER BY created_at DESC LIMIT 1
$$;

COMMENT ON FUNCTION active_framework_id IS
  'معرّف الإطار النشط — يُستعمل في السياسات وفي كل استعلامٍ يمسّ الجداول التابعة (086)';

-- ── (2) إصدارٌ نشطٌ واحد لا غير ──────────────────────────────────
DROP INDEX IF EXISTS idx_frameworks_single_active;
CREATE UNIQUE INDEX idx_frameworks_single_active
  ON frameworks ((status)) WHERE status = 'active';

-- ── (3) القراءة: النشط وحده يُرى من المتصفّح ─────────────────────
DO $do$
BEGIN
  /* العقد */
  DROP POLICY IF EXISTS framework_nodes_read ON framework_nodes;
  CREATE POLICY framework_nodes_read ON framework_nodes FOR SELECT
    USING (auth.uid() IS NOT NULL AND framework_id = active_framework_id());

  /* السجلّ نفسه: تُقرأ الإصدارات كلّها — الواجهة تحتاج أن تعرف ما أُرشف */
  DROP POLICY IF EXISTS frameworks_read ON frameworks;
  CREATE POLICY frameworks_read ON frameworks FOR SELECT
    USING (auth.uid() IS NOT NULL);

  /* التابعة: تُرى بقدر ما تُرى عقدتها */
  DROP POLICY IF EXISTS framework_rubric_read ON framework_rubric;
  CREATE POLICY framework_rubric_read ON framework_rubric FOR SELECT
    USING (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM framework_nodes n
      WHERE n.id = framework_rubric.framework_node_id AND n.framework_id = active_framework_id()));

  DROP POLICY IF EXISTS framework_evidence_samples_read ON framework_evidence_samples;
  CREATE POLICY framework_evidence_samples_read ON framework_evidence_samples FOR SELECT
    USING (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM framework_nodes n
      WHERE n.id = framework_evidence_samples.framework_node_id AND n.framework_id = active_framework_id()));

  DROP POLICY IF EXISTS framework_node_notes_read ON framework_node_notes;
  CREATE POLICY framework_node_notes_read ON framework_node_notes FOR SELECT
    USING (auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM framework_nodes n
      WHERE n.id = framework_node_notes.framework_node_id AND n.framework_id = active_framework_id()));
END $do$;

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- التحقّق — يُشغَّل بعد الترحيل
-- ════════════════════════════════════════════════════════════════
-- SELECT 'إصدارٌ نشطٌ واحد' AS الفحص,
--        (SELECT count(*) FROM frameworks WHERE status = 'active')::text AS الفعلي, '1' AS المتوقع
-- UNION ALL SELECT 'الفهرس الفريد قائم',
--        (SELECT count(*) FROM pg_indexes WHERE indexname = 'idx_frameworks_single_active')::text, '1'
-- UNION ALL SELECT 'الدالّة تُرجع النشط',
--        (SELECT version FROM frameworks WHERE id = active_framework_id()), 'official-2026'
-- UNION ALL SELECT 'سياسات القراءة الأربع',
--        (SELECT count(*) FROM pg_policies WHERE policyname IN
--          ('framework_nodes_read','framework_rubric_read',
--           'framework_evidence_samples_read','framework_node_notes_read'))::text, '4'
-- UNION ALL SELECT 'عقد النشط (للمقارنة)',
--        (SELECT count(*) FROM framework_nodes WHERE framework_id = active_framework_id())::text, '380'
-- UNION ALL SELECT 'عقد المؤرشف (محفوظة لا محذوفة)',
--        (SELECT count(*) FROM framework_nodes WHERE framework_id <> active_framework_id())::text, '376';

-- اختبارٌ يتراجع عن نفسه — يُثبت منع إصدارين نشطين:
-- BEGIN;
--   UPDATE frameworks SET status = 'active' WHERE version = 'final-2026';   -- يجب أن يفشل
-- ROLLBACK;

-- ════════════════════════════════════════════════════════════════
-- 068 — ربط عقد الخطط بإطار QNSA النهائي
-- ════════════════════════════════════════════════════════════════
-- الترحيل 027 ربط عقدة الخطة بالكتالوج الأوّل (مسودة) عبر عمود نصّي
--   plan_nodes.standard_code. والترحيلات 063–067 ثبّتت الإطار النهائي:
--   283 عقدة بمعرّف UUID ثابت، مع سلم تقدير ونماذج أدلة وبيانات توضيحية.
--
-- هنا علاقتان مختلفتان، عمداً:
--   1) الهويّة   — عقدة الخطة **هي** بندٌ من الإطار (محور/جانب/معيار فرعي).
--      عمود plan_nodes.framework_node_id، واحد لا أكثر، يحلّ محلّ standard_code.
--   2) الإسهام  — هدفٌ في الخطة **يخدم** مؤشّر أداء أو أكثر.
--      جدول plan_node_indicators (متعدّد لمتعدّد)، وهو أساس التقرير الطولي
--      للمؤشّر عبر السنوات.
--
-- لا تعبئة من القديم: بيانات ما قبل الإطلاق كانت تجريبية ومُسحت بأداة المشرف
--   (إعادة تهيئة ما قبل الإطلاق) قبل هذا الترحيل، فلا خطط ولا عقد تُنقَل.
--   ولذلك لا حاجة لتعطيل مُشغّل التجميد (053) هنا.
--   ⚠ إن وُجدت عقد قديمة رغم ذلك، يُبلِّغ الترحيل عنها ولا يلمسها.
--
-- standard_code وqnsa_standards يبقيان مؤقّتاً حتى تتحوّل الواجهة إلى
--   framework_nodes؛ ثمّ يُسقطهما الترحيل 069.
--
-- آمن لإعادة التشغيل: كل شيء IF NOT EXISTS / DROP POLICY IF EXISTS.
-- ════════════════════════════════════════════════════════════════

-- ════ 1) الهويّة ════
ALTER TABLE plan_nodes
  ADD COLUMN IF NOT EXISTS framework_node_id UUID REFERENCES framework_nodes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS plan_nodes_framework_node
  ON plan_nodes (framework_node_id) WHERE framework_node_id IS NOT NULL;

COMMENT ON COLUMN plan_nodes.framework_node_id IS
  'بند الإطار الذي تمثّله هذه العقدة (المستويات 1–3). يحلّ محلّ standard_code النصّي.';

-- ════ 2) الإسهام: الهدف ← مؤشرات الأداء ════
CREATE TABLE IF NOT EXISTS plan_node_indicators (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_node_id      UUID NOT NULL REFERENCES plan_nodes(id)      ON DELETE CASCADE,
  framework_node_id UUID NOT NULL REFERENCES framework_nodes(id) ON DELETE CASCADE,
  note_ar           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID,
  UNIQUE (plan_node_id, framework_node_id)
);

-- فهرس الاتجاه المعاكس: من المؤشّر إلى كل ما خدمه عبر السنوات (التقرير الطولي)
CREATE INDEX IF NOT EXISTS plan_node_indicators_by_indicator
  ON plan_node_indicators (framework_node_id);

COMMENT ON TABLE plan_node_indicators IS
  'إسهام عقدة الخطة في مؤشرات أداء الإطار — متعدّد لمتعدّد. أساس التقرير الطولي للمؤشّر.';

-- ════ RLS: عزل المدرسة عبر الخطة، كما في plan_nodes (الترحيل 028) ════
ALTER TABLE plan_node_indicators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pni_select" ON plan_node_indicators;
CREATE POLICY "pni_select" ON plan_node_indicators FOR SELECT
USING (EXISTS (
  SELECT 1 FROM plan_nodes n JOIN plans p ON p.id = n.plan_id
  WHERE n.id = plan_node_indicators.plan_node_id
    AND n.deleted_at IS NULL AND p.school_id = my_school_id()
));

DROP POLICY IF EXISTS "pni_insert" ON plan_node_indicators;
CREATE POLICY "pni_insert" ON plan_node_indicators FOR INSERT
WITH CHECK (my_perm('manage_plans') AND EXISTS (
  SELECT 1 FROM plan_nodes n JOIN plans p ON p.id = n.plan_id
  WHERE n.id = plan_node_indicators.plan_node_id
    AND n.deleted_at IS NULL AND p.school_id = my_school_id()
));

-- الربط وصلة لا محتوى: حذفها حذفٌ صلب مسموح لمن يملك إدارة الخطط
DROP POLICY IF EXISTS "pni_delete" ON plan_node_indicators;
CREATE POLICY "pni_delete" ON plan_node_indicators FOR DELETE
USING (my_perm('manage_plans') AND EXISTS (
  SELECT 1 FROM plan_nodes n JOIN plans p ON p.id = n.plan_id
  WHERE n.id = plan_node_indicators.plan_node_id
    AND n.deleted_at IS NULL AND p.school_id = my_school_id()
));

-- ════ تنبيه إن بقيت عقد قديمة (لا يلمسها الترحيل) ════
DO $chk$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM plan_nodes WHERE standard_code IS NOT NULL;
  IF n > 0 THEN
    RAISE WARNING 'بقيت % عقدة تحمل standard_code ولم تُربط — رُبطها الترحيل لا يشملها بعد المسح', n;
  END IF;
END $chk$;

-- ════ التحقق ════
SELECT 'عمود الهويّة في plan_nodes' AS البند,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_name = 'plan_nodes' AND column_name = 'framework_node_id')
       THEN 'موجود' ELSE '✗ مفقود' END AS الحالة
UNION ALL
SELECT 'سياسات plan_node_indicators',
       count(*)::text || ' (المتوقّع 3)'
  FROM pg_policies WHERE tablename = 'plan_node_indicators'
UNION ALL
SELECT 'عقد خطط باقية في القاعدة',
       count(*)::text
  FROM plan_nodes
UNION ALL
SELECT 'وصلات عقدة ← مؤشر',
       count(*)::text
  FROM plan_node_indicators;
-- المتوقّع بعد المسح: موجود · 3 (المتوقّع 3) · 0 · 0

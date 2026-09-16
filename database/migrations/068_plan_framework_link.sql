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
-- standard_code يبقى كما هو — شبكة أمان وسِجلّ لِما كان. لا يُحذف في هذا الترحيل.
--
-- التعبئة: مطابقة بالكود **وبالمستوى معاً**. الاشتراط الثاني ضروري لا تزيّد:
--   مؤشرات الإطار مرقّمة رباعياً (1.2.1.1)، وفي القاعدة عقدتان تجريبيتان
--   تحملان كوداً رباعياً في المستوى الرابع تسرّب من الترقيم الهرمي المحسوب،
--   فلولا شرط المستوى لالتصقت عقدة عبثية بمؤشّر صحيح.
--
-- مُشغّل التجميد (053) يمنع تعديل عقد أي خطة مجمّدة. التعبئة لا تمسّ محتوى
--   الخطة — إنما تصل العقدة بالبند الذي تشير إليه أصلاً — فيُعطَّل المُشغّل
--   للتعبئة وحدها ثم يُعاد تفعيله.
--
-- آمن لإعادة التشغيل: كل شيء IF NOT EXISTS، والتعبئة لا تمسّ عقدة مربوطة.
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

-- ════ 3) تعبئة الهويّة من الكتالوج القديم ════
DO $link$
DECLARE fw uuid; n int;
BEGIN
  SELECT id INTO fw FROM frameworks WHERE code = 'QNSA' AND version = 'final-2026';
  IF fw IS NULL THEN
    RAISE EXCEPTION 'الإصدار QNSA/final-2026 غير موجود — شغّل الترحيل 064 أولاً';
  END IF;

  ALTER TABLE plan_nodes DISABLE TRIGGER freeze_guard_plan_nodes;

  UPDATE plan_nodes p
     SET framework_node_id = fn.id
    FROM framework_nodes fn
   WHERE fn.framework_id = fw
     AND fn.code  = p.standard_code
     AND fn.level = p.level_num          -- يمنع التصاق كودٍ رباعيّ بمؤشّر
     AND p.level_num BETWEEN 1 AND 3
     AND p.standard_code IS NOT NULL
     AND p.framework_node_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;

  ALTER TABLE plan_nodes ENABLE TRIGGER freeze_guard_plan_nodes;

  RAISE NOTICE 'رُبطت % عقدة بالإطار النهائي', n;
END $link$;

-- ════ التحقق ════
SELECT 'عقد تحمل كوداً (مستوى 1–3)' AS البند,
       count(*) AS العدد
  FROM plan_nodes
 WHERE standard_code IS NOT NULL AND level_num BETWEEN 1 AND 3 AND deleted_at IS NULL
UNION ALL
SELECT 'منها مربوطة بالإطار',
       count(*)
  FROM plan_nodes
 WHERE framework_node_id IS NOT NULL AND deleted_at IS NULL
UNION ALL
SELECT 'بقيت بلا ربط (كود لا يقابله بند)',
       count(*)
  FROM plan_nodes
 WHERE standard_code IS NOT NULL AND level_num BETWEEN 1 AND 3
   AND framework_node_id IS NULL AND deleted_at IS NULL
UNION ALL
SELECT 'صيغت الوصلة: عقدة ← مؤشر',
       count(*)
  FROM plan_node_indicators;
-- المتوقّع: 57 · 57 · 0 · 0

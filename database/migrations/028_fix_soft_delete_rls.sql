-- ============================================================
-- الترحيل 028: إصلاح الحذف الناعم للخطط والعقد (RLS)
-- ============================================================
-- التاريخ: 2026-06-12
-- المشكلة (مثبتة بمحاكاة على القاعدة): سياستا plans_school و
--   plan_nodes_school (ترحيل 016) شاملتان (FOR ALL) وشرط
--   `deleted_at IS NULL` داخل USING — وPostgreSQL يفرض شرط USING
--   لسياسة ALL على الصف الجديد بعد UPDATE أيضاً، فأي حذف ناعم
--   (تعيين deleted_at) يُرفض بـ:
--   "new row violates row-level security policy"
--   → الحذف الناعم للخطط والعقد كان معطّلاً للجميع منذ 016.
--
-- الحل: تفكيك السياستين إلى أوامر منفصلة — القراءة تخفي المحذوف
--   كما كانت، والتحديث يتحقق من المدرسة فقط على الصف الجديد،
--   ولا حذف صلب من العميل (اتساقاً مع نمط الترحيل 024).
-- ============================================================

-- ════ PLANS ════
DROP POLICY IF EXISTS "plans_school" ON plans;

CREATE POLICY "plans_select" ON plans FOR SELECT
USING (school_id = my_school_id() AND deleted_at IS NULL);

CREATE POLICY "plans_insert" ON plans FOR INSERT
WITH CHECK (school_id = my_school_id());

CREATE POLICY "plans_update" ON plans FOR UPDATE
USING (school_id = my_school_id() AND deleted_at IS NULL)
WITH CHECK (school_id = my_school_id());

-- لا سياسة DELETE → لا حذف صلب من العميل (الحذف ناعم دائماً)

-- ════ PLAN_NODES ════
DROP POLICY IF EXISTS "plan_nodes_school" ON plan_nodes;

CREATE POLICY "plan_nodes_select" ON plan_nodes FOR SELECT
USING (
  deleted_at IS NULL AND EXISTS (
    SELECT 1 FROM plans p WHERE p.id = plan_nodes.plan_id AND p.school_id = my_school_id()
  )
);

CREATE POLICY "plan_nodes_insert" ON plan_nodes FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM plans p WHERE p.id = plan_nodes.plan_id AND p.school_id = my_school_id())
);

CREATE POLICY "plan_nodes_update" ON plan_nodes FOR UPDATE
USING (
  deleted_at IS NULL AND EXISTS (
    SELECT 1 FROM plans p WHERE p.id = plan_nodes.plan_id AND p.school_id = my_school_id()
  )
)
WITH CHECK (
  EXISTS (SELECT 1 FROM plans p WHERE p.id = plan_nodes.plan_id AND p.school_id = my_school_id())
);

-- لا سياسة DELETE → لا حذف صلب من العميل

-- ════ التحقق ════
SELECT tablename, policyname, cmd,
  CASE WHEN cmd = 'ALL' THEN '⚠️ راجِع' ELSE '✅' END AS status
FROM pg_policies
WHERE tablename IN ('plans', 'plan_nodes')
ORDER BY tablename, policyname;
-- المتوقع: 3 سياسات لكل جدول (SELECT/INSERT/UPDATE) بلا أي ALL

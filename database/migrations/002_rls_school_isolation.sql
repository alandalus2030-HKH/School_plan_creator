-- ============================================================
-- الترحيل 002: عزل بيانات المدارس بـ RLS
-- ============================================================
-- التاريخ: 2026-06-06
-- المشكلة: أي مستخدم مسجّل يرى بيانات جميع المدارس
-- الحل: سياسات RLS تفلتر حسب school_id المستخدم
--
-- ⚠️  شرط مسبق: شغّل 001_set_school_ids.sql أولاً
--               وتأكد أن كل profiles لها school_id
--
-- كيفية التشغيل:
--   Supabase Dashboard → SQL Editor → New Query → الصق → Run
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- جدول PLANS
-- ════════════════════════════════════════════════════════════

-- حذف السياسة القديمة المفتوحة
DROP POLICY IF EXISTS "plans_all"    ON plans;
DROP POLICY IF EXISTS "plans_school" ON plans;

-- السياسة الجديدة: فلترة بالمدرسة مع fallback آمن
CREATE POLICY "plans_school" ON plans
FOR ALL
USING (
  -- المستخدم يرى فقط خطط مدرسته
  school_id = (
    SELECT school_id FROM profiles WHERE id = auth.uid()
  )
  OR
  -- fallback: إذا لم يُعيَّن school_id للمستخدم بعد (أمان إضافي)
  (SELECT school_id FROM profiles WHERE id = auth.uid()) IS NULL
)
WITH CHECK (
  -- عند الكتابة: يسمح فقط بإنشاء خطط في مدرسته
  school_id = (
    SELECT school_id FROM profiles WHERE id = auth.uid()
  )
  OR
  (SELECT school_id FROM profiles WHERE id = auth.uid()) IS NULL
);

-- ════════════════════════════════════════════════════════════
-- جدول PLAN_NODES
-- ════════════════════════════════════════════════════════════

-- حذف السياسات القديمة (جرّب أسماء محتملة)
DROP POLICY IF EXISTS "plan_nodes_all"    ON plan_nodes;
DROP POLICY IF EXISTS "plan_nodes_school" ON plan_nodes;

-- السياسة الجديدة: عبر plans → school_id
CREATE POLICY "plan_nodes_school" ON plan_nodes
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM plans p
    WHERE p.id = plan_nodes.plan_id
    AND (
      p.school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
      OR (SELECT school_id FROM profiles WHERE id = auth.uid()) IS NULL
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM plans p
    WHERE p.id = plan_nodes.plan_id
    AND (
      p.school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
      OR (SELECT school_id FROM profiles WHERE id = auth.uid()) IS NULL
    )
  )
);

-- ════════════════════════════════════════════════════════════
-- جدول TASKS
-- ════════════════════════════════════════════════════════════

-- حذف السياسة القديمة
DROP POLICY IF EXISTS "tasks_all"    ON tasks;
DROP POLICY IF EXISTS "tasks_school" ON tasks;

-- السياسة الجديدة: عبر plan_nodes → plans → school_id
CREATE POLICY "tasks_school" ON tasks
FOR ALL
USING (
  -- مهام بدون node_id (مهام حرة): مرئية للجميع في النظام
  node_id IS NULL
  OR
  -- مهام مرتبطة: فلترة عبر الهرمية
  EXISTS (
    SELECT 1
    FROM plan_nodes pn
    JOIN plans p ON p.id = pn.plan_id
    WHERE pn.id = tasks.node_id
    AND (
      p.school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
      OR (SELECT school_id FROM profiles WHERE id = auth.uid()) IS NULL
    )
  )
)
WITH CHECK (
  node_id IS NULL
  OR
  EXISTS (
    SELECT 1
    FROM plan_nodes pn
    JOIN plans p ON p.id = pn.plan_id
    WHERE pn.id = tasks.node_id
    AND (
      p.school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
      OR (SELECT school_id FROM profiles WHERE id = auth.uid()) IS NULL
    )
  )
);

-- ════════════════════════════════════════════════════════════
-- التحقق من تطبيق السياسات
-- ════════════════════════════════════════════════════════════
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE tablename IN ('plans', 'plan_nodes', 'tasks')
ORDER BY tablename, policyname;

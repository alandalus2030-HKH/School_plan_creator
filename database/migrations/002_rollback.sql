-- ============================================================
-- ROLLBACK للترحيل 002 — للاستخدام عند الطوارئ فقط
-- ============================================================
-- شغّل هذا إذا توقف التطبيق بعد تشغيل 002_rls_school_isolation.sql
-- يُعيد السياسات للوضع القديم المفتوح
-- ============================================================

-- إزالة السياسات الجديدة
DROP POLICY IF EXISTS "plans_school"      ON plans;
DROP POLICY IF EXISTS "plan_nodes_school" ON plan_nodes;
DROP POLICY IF EXISTS "tasks_school"      ON tasks;

-- إعادة السياسات القديمة المفتوحة
CREATE POLICY "plans_all" ON plans
FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "plan_nodes_all" ON plan_nodes
FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "tasks_all" ON tasks
FOR ALL USING (auth.uid() IS NOT NULL);

-- تأكيد الإعادة
SELECT tablename, policyname FROM pg_policies
WHERE tablename IN ('plans', 'plan_nodes', 'tasks')
ORDER BY tablename;

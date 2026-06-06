-- ============================================================
-- الترحيل 002b: حذف السياسات القديمة المتعارضة
-- ============================================================
-- التاريخ: 2026-06-06
-- السبب: وُجدت في قاعدة البيانات الحية سياسات قديمة لم تكن
--        موثّقة في schema.sql وكانت تُلغي سياسات العزل الجديدة:
--
--   plans.allow_authenticated   → (auth.uid() IS NOT NULL)
--   tasks.allow_authenticated   → (auth.uid() IS NOT NULL)
--   tasks.allow_status_update   → UPDATE: (auth.uid() IS NOT NULL)
--
-- في PostgreSQL: عند وجود سياستَين تُجمَعان بـ OR
-- → السياسة الأوسع تفوز دائماً → لا عزل فعلي
--
-- الحل: حذف السياسات القديمة وإبقاء الجديدة فقط
-- ============================================================

DROP POLICY IF EXISTS "allow_authenticated" ON plans;
DROP POLICY IF EXISTS "allow_authenticated" ON tasks;
DROP POLICY IF EXISTS "allow_status_update" ON tasks;

-- النتيجة المتوقعة: 3 سياسات فقط
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('plans', 'plan_nodes', 'tasks')
ORDER BY tablename, policyname;

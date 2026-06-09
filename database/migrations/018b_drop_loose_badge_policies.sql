-- ============================================================
-- الترحيل 018b: حذف السياسات الفضفاضة المتبقية على الأوسمة
-- ============================================================
-- السبب: الترحيل 018 أضاف سياسات العزل لكن بقيت السياسة القديمة
--   "allow_authenticated" (FOR ALL USING auth.uid() IS NOT NULL).
--   وبما أن RLS يدمج السياسات المتعددة بـ OR، فإن وجود الفضفاضة
--   يُبطل العزل. هذا الترحيل يحذفها فيبقى العزل وحده فعّالاً.
-- ============================================================

DROP POLICY IF EXISTS allow_authenticated ON badges;
DROP POLICY IF EXISTS allow_authenticated ON user_badges;

-- (وقائي) حذف أي سياسة قديمة محتملة أخرى
DROP POLICY IF EXISTS badges_all      ON badges;
DROP POLICY IF EXISTS user_badges_all ON user_badges;

-- التحقق — يجب أن تبقى سياسة واحدة فقط لكل جدول (*_school)
SELECT tablename, policyname FROM pg_policies
WHERE tablename IN ('badges', 'user_badges')
ORDER BY tablename, policyname;

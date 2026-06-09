-- ============================================================
-- الترحيل 018: عزل الأوسمة بالمدرسة (إصلاح تسريب RLS)
-- ============================================================
-- التاريخ: 2026-06-09
-- المشكلة: badges/user_badges عليها سياسات قديمة فضفاضة
--   (auth.uid() IS NOT NULL) تسمح لأي مستخدم برؤية/تعديل
--   أوسمة كل المدارس. هذا الترحيل يعزلها بـ my_school_id().
-- ============================================================

-- ── الأوسمة (مرتبطة مباشرة بالمدرسة) ──────────────────────
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS badges_all      ON badges;
DROP POLICY IF EXISTS "badges_all"    ON badges;
DROP POLICY IF EXISTS badges_school   ON badges;
CREATE POLICY badges_school ON badges FOR ALL
  USING      (school_id = my_school_id())
  WITH CHECK (school_id = my_school_id());

-- ── أوسمة المستخدمين (تُعزَل عبر مدرسة الوسام) ────────────
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_badges_all    ON user_badges;
DROP POLICY IF EXISTS "user_badges_all"  ON user_badges;
DROP POLICY IF EXISTS user_badges_school ON user_badges;
CREATE POLICY user_badges_school ON user_badges FOR ALL
  USING (EXISTS (
    SELECT 1 FROM badges b
    WHERE b.id = user_badges.badge_id AND b.school_id = my_school_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM badges b
    WHERE b.id = user_badges.badge_id AND b.school_id = my_school_id()
  ));

-- التحقق
SELECT tablename, policyname FROM pg_policies
WHERE tablename IN ('badges', 'user_badges')
ORDER BY tablename, policyname;

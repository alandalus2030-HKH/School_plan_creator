-- ============================================================
-- الترحيل 011: إغلاق تسريبات العزل بين المدارس
-- ============================================================
-- التاريخ: 2026-06-07
-- المشكلة المكتشفة: مدير مدرسة جديدة يرى بيانات مدرسة أخرى في:
--   - المستخدمون (profiles): سياسة profiles_read مفتوحة
--   - الاجتماعات (meetings): لم تُضف RLS بالمدرسة
--   - جداول مرتبطة لم تُعزل: meeting_attendees, team_members,
--     task_comments, kpi_readings
--
-- الحل: دالة my_school_id() آمنة + سياسات معزولة بالمدرسة
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1. دالة مساعدة آمنة (SECURITY DEFINER) لتفادي التكرار اللانهائي
--    تقرأ school_id للمستخدم الحالي متجاوزةً RLS
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION my_school_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT school_id FROM profiles WHERE id = auth.uid()
$$;

-- ════════════════════════════════════════════════════════════
-- 2. PROFILES — إغلاق التسريب الأكبر
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "profiles_read"        ON profiles;
DROP POLICY IF EXISTS "profiles_own"         ON profiles;
DROP POLICY IF EXISTS "profiles_school"      ON profiles;
DROP POLICY IF EXISTS "allow_authenticated"  ON profiles;

-- المستخدم يدير ملفه الشخصي بالكامل
CREATE POLICY "profiles_own" ON profiles
FOR ALL
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- المستخدم يرى/يدير مستخدمي مدرسته فقط (الإدارة مقيّدة بالواجهة)
CREATE POLICY "profiles_school" ON profiles
FOR ALL
USING (
  school_id = my_school_id()
  OR my_school_id() IS NULL
)
WITH CHECK (
  school_id = my_school_id()
  OR my_school_id() IS NULL
);

-- ════════════════════════════════════════════════════════════
-- 3. MEETINGS — إضافة العزل المفقود
-- ════════════════════════════════════════════════════════════
-- backfill: الاجتماعات القديمة بلا school_id → أقدم مدرسة (مدرستي)
UPDATE meetings
SET school_id = (SELECT id FROM schools ORDER BY created_at LIMIT 1)
WHERE school_id IS NULL;

DROP POLICY IF EXISTS "meetings_all"         ON meetings;
DROP POLICY IF EXISTS "allow_authenticated"  ON meetings;
DROP POLICY IF EXISTS "meetings_school"      ON meetings;

CREATE POLICY "meetings_school" ON meetings
FOR ALL
USING (
  school_id = my_school_id()
  OR my_school_id() IS NULL
)
WITH CHECK (
  school_id = my_school_id()
  OR my_school_id() IS NULL
);

-- ════════════════════════════════════════════════════════════
-- 4. MEETING_ATTENDEES — عبر الاجتماع
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "meeting_attendees_all"    ON meeting_attendees;
DROP POLICY IF EXISTS "allow_authenticated"      ON meeting_attendees;
DROP POLICY IF EXISTS "meeting_attendees_school" ON meeting_attendees;

CREATE POLICY "meeting_attendees_school" ON meeting_attendees
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM meetings m
    WHERE m.id = meeting_attendees.meeting_id
    AND (m.school_id = my_school_id() OR my_school_id() IS NULL)
  )
)
WITH CHECK (auth.uid() IS NOT NULL);

-- ════════════════════════════════════════════════════════════
-- 5. TEAM_MEMBERS — عبر الفريق
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "team_members_all"     ON team_members;
DROP POLICY IF EXISTS "allow_authenticated"  ON team_members;
DROP POLICY IF EXISTS "team_members_school"  ON team_members;

CREATE POLICY "team_members_school" ON team_members
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM teams t
    WHERE t.id = team_members.team_id
    AND (t.school_id = my_school_id() OR my_school_id() IS NULL)
  )
)
WITH CHECK (auth.uid() IS NOT NULL);

-- ════════════════════════════════════════════════════════════
-- 6. TASK_COMMENTS — عبر المهمة → العقدة → الخطة
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "task_comments_all"    ON task_comments;
DROP POLICY IF EXISTS "allow_authenticated"  ON task_comments;
DROP POLICY IF EXISTS "task_comments_school" ON task_comments;

CREATE POLICY "task_comments_school" ON task_comments
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM tasks t
    LEFT JOIN plan_nodes pn ON pn.id = t.node_id
    LEFT JOIN plans p ON p.id = pn.plan_id
    WHERE t.id = task_comments.task_id
    AND (t.node_id IS NULL OR p.school_id = my_school_id() OR my_school_id() IS NULL)
  )
)
WITH CHECK (auth.uid() IS NOT NULL);

-- ════════════════════════════════════════════════════════════
-- 7. KPI_READINGS — عبر المؤشر → العقدة → الخطة
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "kpi_readings_all"     ON kpi_readings;
DROP POLICY IF EXISTS "allow_authenticated"  ON kpi_readings;
DROP POLICY IF EXISTS "kpi_readings_school"  ON kpi_readings;

CREATE POLICY "kpi_readings_school" ON kpi_readings
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM kpis k
    JOIN plan_nodes pn ON pn.id = k.node_id
    JOIN plans p ON p.id = pn.plan_id
    WHERE k.id = kpi_readings.kpi_id
    AND (p.school_id = my_school_id() OR my_school_id() IS NULL)
  )
)
WITH CHECK (auth.uid() IS NOT NULL);

-- ════════════════════════════════════════════════════════════
-- التحقق: عرض كل السياسات بعد التطبيق
-- ════════════════════════════════════════════════════════════
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN (
  'profiles', 'meetings', 'meeting_attendees',
  'team_members', 'task_comments', 'kpi_readings'
)
ORDER BY tablename, policyname;

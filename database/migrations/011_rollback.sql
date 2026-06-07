-- ============================================================
-- ROLLBACK للترحيل 011 — للطوارئ فقط
-- يُعيد السياسات المفتوحة (يلغي العزل)
-- ============================================================

DROP POLICY IF EXISTS "profiles_own"             ON profiles;
DROP POLICY IF EXISTS "profiles_school"          ON profiles;
DROP POLICY IF EXISTS "meetings_school"          ON meetings;
DROP POLICY IF EXISTS "meeting_attendees_school" ON meeting_attendees;
DROP POLICY IF EXISTS "team_members_school"      ON team_members;
DROP POLICY IF EXISTS "task_comments_school"     ON task_comments;
DROP POLICY IF EXISTS "kpi_readings_school"      ON kpi_readings;

-- إعادة السياسات المفتوحة المؤقتة
CREATE POLICY "profiles_own"  ON profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "profiles_read" ON profiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "meetings_all"          ON meetings          FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "meeting_attendees_all" ON meeting_attendees FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "team_members_all"      ON team_members      FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "task_comments_all"     ON task_comments     FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "kpi_readings_all"      ON kpi_readings      FOR ALL USING (auth.uid() IS NOT NULL);

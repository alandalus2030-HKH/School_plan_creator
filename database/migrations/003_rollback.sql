-- ============================================================
-- ROLLBACK للترحيل 003 — للاستخدام عند الطوارئ فقط
-- ============================================================

DROP POLICY IF EXISTS "teams_school"         ON teams;
DROP POLICY IF EXISTS "kpis_school"          ON kpis;
DROP POLICY IF EXISTS "notifications_read"   ON notifications;
DROP POLICY IF EXISTS "notifications_insert" ON notifications;
DROP POLICY IF EXISTS "notifications_update" ON notifications;
DROP POLICY IF EXISTS "notifications_delete" ON notifications;
DROP POLICY IF EXISTS "evidence_school"      ON evidence;

-- إعادة السياسات المفتوحة المؤقتة
CREATE POLICY "teams_all"         ON teams         FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "kpis_all"          ON kpis          FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "notifications_all" ON notifications  FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "evidence_all"      ON evidence       FOR ALL USING (auth.uid() IS NOT NULL);

SELECT tablename, policyname FROM pg_policies
WHERE tablename IN ('teams','kpis','notifications','evidence')
ORDER BY tablename;

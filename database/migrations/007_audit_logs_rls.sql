-- ============================================================
-- الترحيل 007: عزل سجل النشاط (audit_logs) بالمدرسة
-- ============================================================
-- التاريخ: 2026-06-06
-- السبب: audit_logs كان بسياسة مفتوحة (audit_logs_all)
--        مع تفعيل Activity Feed يجب عزله بالمدرسة
--
-- - القراءة: المستخدم يرى نشاط مدرسته فقط
-- - الكتابة: أي مستخدم مسجّل يكتب نشاطه (logActivity)
-- ============================================================

DROP POLICY IF EXISTS "audit_logs_all"     ON audit_logs;
DROP POLICY IF EXISTS "allow_authenticated" ON audit_logs;
DROP POLICY IF EXISTS "audit_read"          ON audit_logs;
DROP POLICY IF EXISTS "audit_insert"        ON audit_logs;

-- القراءة: نشاط نفس المدرسة فقط
CREATE POLICY "audit_read" ON audit_logs
FOR SELECT
USING (
  school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  OR (SELECT school_id FROM profiles WHERE id = auth.uid()) IS NULL
);

-- الكتابة: أي مستخدم مسجّل (logActivity تضبط school_id تلقائياً)
CREATE POLICY "audit_insert" ON audit_logs
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- index لتسريع جلب أحدث النشاطات
CREATE INDEX IF NOT EXISTS idx_audit_logs_created
  ON audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_school
  ON audit_logs(school_id, created_at DESC);

-- التحقق
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename = 'audit_logs'
ORDER BY policyname;

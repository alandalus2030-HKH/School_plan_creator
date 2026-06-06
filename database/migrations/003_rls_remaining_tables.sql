-- ============================================================
-- الترحيل 003: RLS للجداول المتبقية
-- ============================================================
-- التاريخ: 2026-06-06
-- الجداول: teams, kpis, notifications, evidence
--
-- ⚠️  شرط مسبق: الترحيلات 001 و 002 و 002b يجب أن تكون
--               مُشغَّلة مسبقاً
--
-- درس من اليوم 3: قد توجد سياسات قديمة بأسماء غير متوقعة
-- → نستخدم IF EXISTS دائماً + نتحقق في النهاية
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1. جدول TEAMS
-- ════════════════════════════════════════════════════════════
-- teams لها school_id مباشرة → سياسة بسيطة

DROP POLICY IF EXISTS "teams_all"          ON teams;
DROP POLICY IF EXISTS "allow_authenticated" ON teams;
DROP POLICY IF EXISTS "teams_school"       ON teams;

CREATE POLICY "teams_school" ON teams
FOR ALL
USING (
  school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  OR (SELECT school_id FROM profiles WHERE id = auth.uid()) IS NULL
)
WITH CHECK (
  school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  OR (SELECT school_id FROM profiles WHERE id = auth.uid()) IS NULL
);

-- ════════════════════════════════════════════════════════════
-- 2. جدول KPIS
-- ════════════════════════════════════════════════════════════
-- kpis ترتبط بـ node_id → plan_nodes → plans → school_id

DROP POLICY IF EXISTS "kpis_all"           ON kpis;
DROP POLICY IF EXISTS "allow_authenticated" ON kpis;
DROP POLICY IF EXISTS "kpis_school"        ON kpis;

CREATE POLICY "kpis_school" ON kpis
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM plan_nodes pn
    JOIN plans p ON p.id = pn.plan_id
    WHERE pn.id = kpis.node_id
    AND (
      p.school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
      OR (SELECT school_id FROM profiles WHERE id = auth.uid()) IS NULL
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM plan_nodes pn
    JOIN plans p ON p.id = pn.plan_id
    WHERE pn.id = kpis.node_id
    AND (
      p.school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
      OR (SELECT school_id FROM profiles WHERE id = auth.uid()) IS NULL
    )
  )
);

-- ════════════════════════════════════════════════════════════
-- 3. جدول NOTIFICATIONS
-- ════════════════════════════════════════════════════════════
-- الإشعارات: كل مستخدم يرى إشعاراته فقط
-- لكن المرسِل يجب أن يستطيع إنشاء إشعارات للآخرين

DROP POLICY IF EXISTS "notifications_all"    ON notifications;
DROP POLICY IF EXISTS "allow_authenticated"  ON notifications;
DROP POLICY IF EXISTS "notifications_own"    ON notifications;
DROP POLICY IF EXISTS "notifications_read"   ON notifications;
DROP POLICY IF EXISTS "notifications_insert" ON notifications;
DROP POLICY IF EXISTS "notifications_update" ON notifications;
DROP POLICY IF EXISTS "notifications_delete" ON notifications;

-- قراءة: المستخدم يرى إشعاراته فقط
CREATE POLICY "notifications_read" ON notifications
FOR SELECT
USING (recipient_id = auth.uid());

-- إنشاء: أي مستخدم مسجّل يمكنه إرسال إشعار (الـ API تتحقق من الصلاحيات)
CREATE POLICY "notifications_insert" ON notifications
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- تحديث: المستخدم يُحدّث إشعاراته فقط (مثل mark as read)
CREATE POLICY "notifications_update" ON notifications
FOR UPDATE
USING (recipient_id = auth.uid());

-- حذف: المستخدم يحذف إشعاراته فقط
CREATE POLICY "notifications_delete" ON notifications
FOR DELETE
USING (recipient_id = auth.uid());

-- ════════════════════════════════════════════════════════════
-- 4. جدول EVIDENCE
-- ════════════════════════════════════════════════════════════
-- evidence ترتبط بـ task_id → tasks → node_id → plan_nodes → plans → school_id

DROP POLICY IF EXISTS "evidence_all"        ON evidence;
DROP POLICY IF EXISTS "allow_authenticated" ON evidence;
DROP POLICY IF EXISTS "evidence_school"     ON evidence;

CREATE POLICY "evidence_school" ON evidence
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM tasks t
    JOIN plan_nodes pn ON pn.id = t.node_id
    JOIN plans p ON p.id = pn.plan_id
    WHERE t.id = evidence.task_id
    AND (
      p.school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
      OR (SELECT school_id FROM profiles WHERE id = auth.uid()) IS NULL
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM tasks t
    JOIN plan_nodes pn ON pn.id = t.node_id
    JOIN plans p ON p.id = pn.plan_id
    WHERE t.id = evidence.task_id
    AND (
      p.school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
      OR (SELECT school_id FROM profiles WHERE id = auth.uid()) IS NULL
    )
  )
);

-- ════════════════════════════════════════════════════════════
-- التحقق الشامل من جميع السياسات
-- ════════════════════════════════════════════════════════════
SELECT
  tablename,
  policyname,
  cmd,
  CASE
    WHEN qual LIKE '%IS NOT NULL%' THEN '⚠️ مفتوحة'
    ELSE '✅ مقيّدة'
  END AS security_status
FROM pg_policies
WHERE tablename IN (
  'plans', 'plan_nodes', 'tasks',
  'teams', 'kpis', 'notifications', 'evidence'
)
ORDER BY tablename, policyname;

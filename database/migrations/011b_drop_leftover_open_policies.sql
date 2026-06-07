-- ============================================================
-- الترحيل 011b: حذف السياسات المفتوحة القديمة المتبقية
-- ============================================================
-- التاريخ: 2026-06-07
-- اكتُشفت أثناء التحقق من 011: سياسات قديمة أُنشئت يدوياً في
-- Supabase ولم تكن في ملفات الترحيل. وجودها مع السياسات
-- الجديدة يُلغي العزل (RLS يجمع بـ OR → الأوسع يفوز)
--
-- الحل: حذفها — السياسات الجديدة تُغطّي كل الوصول المطلوب:
--   profiles_own (الملف الشخصي) + profiles_school (نفس المدرسة)
-- ============================================================

-- ── profiles — حذف السياسات المنفصلة المفتوحة ──────────────
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;
DROP POLICY IF EXISTS "profiles_delete" ON profiles;

-- ── kpi_readings ──────────────────────────────────────────
DROP POLICY IF EXISTS "allow_all_kpi_readings" ON kpi_readings;

-- ── team_members — حذف السياسات المفتوحة ──────────────────
DROP POLICY IF EXISTS "read"                ON team_members;
DROP POLICY IF EXISTS "write"               ON team_members;
DROP POLICY IF EXISTS "team_members_read"   ON team_members;
DROP POLICY IF EXISTS "team_members_write"  ON team_members;

-- ════════════════════════════════════════════════════════════
-- فحص شامل: كشف أي سياسة مفتوحة متبقية على كل الجداول الحساسة
-- العمود security_status:
--   ⚠️ مفتوحة  = السياسة تسمح لأي مستخدم مسجّل (تسريب محتمل)
--   ✅ مقيّدة   = معزولة بالمدرسة
-- ════════════════════════════════════════════════════════════
SELECT
  tablename,
  policyname,
  cmd,
  CASE
    WHEN qual IS NULL THEN '✅ مقيّدة (INSERT check)'
    WHEN qual = '(auth.uid() IS NOT NULL)' THEN '⚠️ مفتوحة'
    WHEN qual LIKE '%my_school_id%'
      OR qual LIKE '%school_id%'
      OR qual LIKE '%auth.uid() = id%'
      OR qual LIKE '%recipient_id%' THEN '✅ مقيّدة'
    ELSE '❓ راجِع يدوياً'
  END AS security_status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles', 'plans', 'plan_nodes', 'tasks', 'teams',
    'team_members', 'kpis', 'kpi_readings', 'evidence',
    'task_comments', 'notifications', 'meetings',
    'meeting_attendees', 'audit_logs', 'subtasks'
  )
ORDER BY
  CASE WHEN qual = '(auth.uid() IS NOT NULL)' THEN 0 ELSE 1 END,
  tablename, policyname;

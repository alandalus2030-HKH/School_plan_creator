-- ============================================================
-- الترحيل 026: تحصين RLS — ربط الكتابة بصلاحيات الأدوار
-- ============================================================
-- التاريخ: 2026-06-11
-- مسح pg_policies كشف ثغرات حرجة:
--   🔴 roles: سياسة roles_all بشرط true — أي مستخدم يعدّل صلاحيات
--      أي دور (تصعيد صلاحيات كامل إلى 'all' من console المتصفح!)
--   🔴 schools: ALL لأي مستخدم مسجّل بلا عزل — تعديل/حذف أي مدرسة
--   🟠 dropdown_options: شرط true — كتابة مفتوحة للجميع
--   🟠 teams/team_members: أي عضو مدرسة يدير الفرق والأعضاء
--   🟠 meetings/meeting_attendees: أي عضو مدرسة يدير الاجتماعات
--   🟡 motivational_quotes / kpi_readings: كتابة متساهلة
--   🔴 plan_nodes: RLS معطَّل بالكامل (relrowsecurity=false) —
--      السياسة موجودة لكنها غير مفعَّلة: كل عقد خطط كل المدارس
--      مكشوفة قراءةً وكتابةً لأي مستخدم مسجّل!
--
-- المبدأ: القراءة تبقى كما اعتاد التطبيق، والكتابة من العميل تُربط
-- بصلاحية الدور عبر my_perm() — والـ APIs الخادمية (service role)
-- تتجاوز RLS فلا تتأثر.
-- ============================================================

-- ════ 0) دالة فحص صلاحية الدور للمستخدم الحالي ════
-- SECURITY DEFINER لتجاوز RLS داخلياً (نمط my_school_id — ترحيل 011/016)
CREATE OR REPLACE FUNCTION my_perm(p TEXT) RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles pr
    LEFT JOIN roles r ON r.code = pr.role
    WHERE pr.id = auth.uid()
      AND (
        pr.is_super_admin
        OR pr.role IN ('super_admin', 'school_admin', 'admin')
        OR (r.permissions ? 'all')
        OR (r.permissions ? p)
      )
  )
$$;

-- ════ 1) ROLES — إغلاق ثغرة تصعيد الصلاحيات ════
DROP POLICY IF EXISTS "allow_authenticated" ON roles;
DROP POLICY IF EXISTS "roles_all"           ON roles;

CREATE POLICY "roles_read" ON roles FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "roles_admin_insert" ON roles FOR INSERT
WITH CHECK (my_perm('manage_roles') OR my_perm('manage_settings'));

CREATE POLICY "roles_admin_update" ON roles FOR UPDATE
USING (my_perm('manage_roles') OR my_perm('manage_settings'))
WITH CHECK (my_perm('manage_roles') OR my_perm('manage_settings'));

CREATE POLICY "roles_admin_delete" ON roles FOR DELETE
USING (my_perm('manage_roles') OR my_perm('manage_settings'));

-- ════ 2) SCHOOLS — قراءة فقط من العميل ════
-- كل عمليات الكتابة على المدارس تتم عبر APIs خادمية
-- (onboarding / school-profile / schools/[schoolId]) بـ service role
DROP POLICY IF EXISTS "allow_authenticated" ON schools;

CREATE POLICY "schools_read" ON schools FOR SELECT
USING (auth.uid() IS NOT NULL);

-- ════ 3) DROPDOWN_OPTIONS — الكتابة لإدارة الإعدادات فقط ════
DROP POLICY IF EXISTS "dropdown_all" ON dropdown_options;

CREATE POLICY "dropdown_read" ON dropdown_options FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "dropdown_admin_insert" ON dropdown_options FOR INSERT
WITH CHECK (my_perm('manage_settings'));

CREATE POLICY "dropdown_admin_update" ON dropdown_options FOR UPDATE
USING (my_perm('manage_settings'))
WITH CHECK (my_perm('manage_settings'));

CREATE POLICY "dropdown_admin_delete" ON dropdown_options FOR DELETE
USING (my_perm('manage_settings'));

-- ════ 4) TEAMS — الإدارة لصاحب manage_teams ════
DROP POLICY IF EXISTS "teams_school" ON teams;

CREATE POLICY "teams_read" ON teams FOR SELECT
USING (school_id = my_school_id());

CREATE POLICY "teams_manage_insert" ON teams FOR INSERT
WITH CHECK (school_id = my_school_id() AND my_perm('manage_teams'));

CREATE POLICY "teams_manage_update" ON teams FOR UPDATE
USING (school_id = my_school_id() AND my_perm('manage_teams'))
WITH CHECK (school_id = my_school_id() AND my_perm('manage_teams'));

CREATE POLICY "teams_manage_delete" ON teams FOR DELETE
USING (school_id = my_school_id() AND my_perm('manage_teams'));

-- ════ 5) TEAM_MEMBERS — manage_teams أو manage_users ════
-- (صفحة المستخدمين تحرّر عضوية الفرق ضمن إدارة المستخدم)
DROP POLICY IF EXISTS "team_members_school" ON team_members;

CREATE POLICY "team_members_read" ON team_members FOR SELECT
USING (
  EXISTS (SELECT 1 FROM teams t WHERE t.id = team_members.team_id AND t.school_id = my_school_id())
);

CREATE POLICY "team_members_manage_insert" ON team_members FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM teams t WHERE t.id = team_members.team_id AND t.school_id = my_school_id())
  AND (my_perm('manage_teams') OR my_perm('manage_users'))
);

CREATE POLICY "team_members_manage_update" ON team_members FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM teams t WHERE t.id = team_members.team_id AND t.school_id = my_school_id())
  AND (my_perm('manage_teams') OR my_perm('manage_users'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM teams t WHERE t.id = team_members.team_id AND t.school_id = my_school_id())
  AND (my_perm('manage_teams') OR my_perm('manage_users'))
);

CREATE POLICY "team_members_manage_delete" ON team_members FOR DELETE
USING (
  EXISTS (SELECT 1 FROM teams t WHERE t.id = team_members.team_id AND t.school_id = my_school_id())
  AND (my_perm('manage_teams') OR my_perm('manage_users'))
);

-- ════ 6) MEETINGS — manage_meetings (+ توافق رجعي: خطط/مهام) ════
DROP POLICY IF EXISTS "meetings_school" ON meetings;

CREATE POLICY "meetings_read" ON meetings FOR SELECT
USING (school_id = my_school_id());

CREATE POLICY "meetings_manage_insert" ON meetings FOR INSERT
WITH CHECK (
  school_id = my_school_id()
  AND (my_perm('manage_meetings') OR my_perm('manage_plans') OR my_perm('manage_tasks'))
);

CREATE POLICY "meetings_manage_update" ON meetings FOR UPDATE
USING (
  school_id = my_school_id()
  AND (my_perm('manage_meetings') OR my_perm('manage_plans') OR my_perm('manage_tasks'))
)
WITH CHECK (
  school_id = my_school_id()
  AND (my_perm('manage_meetings') OR my_perm('manage_plans') OR my_perm('manage_tasks'))
);

CREATE POLICY "meetings_manage_delete" ON meetings FOR DELETE
USING (
  school_id = my_school_id()
  AND (my_perm('manage_meetings') OR my_perm('manage_plans') OR my_perm('manage_tasks'))
);

-- ════ 7) MEETING_ATTENDEES — تتبع سياسات الاجتماع ════
DROP POLICY IF EXISTS "meeting_attendees_school" ON meeting_attendees;

CREATE POLICY "meeting_attendees_read" ON meeting_attendees FOR SELECT
USING (
  EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_attendees.meeting_id AND m.school_id = my_school_id())
);

CREATE POLICY "meeting_attendees_manage_insert" ON meeting_attendees FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_attendees.meeting_id AND m.school_id = my_school_id())
  AND (my_perm('manage_meetings') OR my_perm('manage_plans') OR my_perm('manage_tasks'))
);

CREATE POLICY "meeting_attendees_manage_update" ON meeting_attendees FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_attendees.meeting_id AND m.school_id = my_school_id())
  AND (my_perm('manage_meetings') OR my_perm('manage_plans') OR my_perm('manage_tasks'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_attendees.meeting_id AND m.school_id = my_school_id())
  AND (my_perm('manage_meetings') OR my_perm('manage_plans') OR my_perm('manage_tasks'))
);

CREATE POLICY "meeting_attendees_manage_delete" ON meeting_attendees FOR DELETE
USING (
  EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_attendees.meeting_id AND m.school_id = my_school_id())
  AND (my_perm('manage_meetings') OR my_perm('manage_plans') OR my_perm('manage_tasks'))
);

-- ════ 8) MOTIVATIONAL_QUOTES — الكتابة لإدارة الإعدادات ════
DROP POLICY IF EXISTS "allow_authenticated" ON motivational_quotes;

CREATE POLICY "quotes_read" ON motivational_quotes FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "quotes_admin_insert" ON motivational_quotes FOR INSERT
WITH CHECK (my_perm('manage_settings'));

CREATE POLICY "quotes_admin_update" ON motivational_quotes FOR UPDATE
USING (my_perm('manage_settings'))
WITH CHECK (my_perm('manage_settings'));

CREATE POLICY "quotes_admin_delete" ON motivational_quotes FOR DELETE
USING (my_perm('manage_settings'));

-- ════ 9) KPI_READINGS — إزالة WITH CHECK المتساهل وfallback IS NULL ════
DROP POLICY IF EXISTS "kpi_readings_school" ON kpi_readings;

CREATE POLICY "kpi_readings_school" ON kpi_readings FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM kpis k JOIN plan_nodes pn ON pn.id = k.node_id JOIN plans p ON p.id = pn.plan_id
    WHERE k.id = kpi_readings.kpi_id AND p.school_id = my_school_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM kpis k JOIN plan_nodes pn ON pn.id = k.node_id JOIN plans p ON p.id = pn.plan_id
    WHERE k.id = kpi_readings.kpi_id AND p.school_id = my_school_id()
  )
);

-- ════ 10) PLAN_NODES — إعادة تفعيل RLS المعطَّل ════
ALTER TABLE plan_nodes ENABLE ROW LEVEL SECURITY;

-- ════ التحقق 1: RLS مفعَّل على كل الجداول ════
SELECT c.relname, c.relrowsecurity AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
-- يجب أن يكون الناتج صفر صفوف

-- ════ التحقق 2: لا يجب أن تبقى أي سياسة بشرط true أو auth فقط للكتابة ════
SELECT tablename, policyname, cmd,
  CASE
    WHEN cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
     AND (COALESCE(qual, with_check) = 'true'
       OR COALESCE(with_check, qual) = '(auth.uid() IS NOT NULL)')
     AND tablename NOT IN ('audit_logs', 'notifications', 'task_comments')
    THEN '⚠️ راجِع'
    ELSE '✅'
  END AS status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('roles','schools','dropdown_options','teams','team_members',
                    'meetings','meeting_attendees','motivational_quotes','kpi_readings')
ORDER BY tablename, policyname;

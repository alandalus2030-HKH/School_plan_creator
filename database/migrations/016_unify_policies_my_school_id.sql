-- ============================================================
-- الترحيل 016: توحيد كل سياسات البيانات لتستخدم my_school_id()
-- ============================================================
-- التاريخ: 2026-06-08
-- المشكلة: سياسات الخطط/المهام/المؤشرات (ترحيلات 002/003/006)
--   تستخدم استعلاماً مباشراً (SELECT school_id FROM profiles...)
--   فلا تحترم active_school_id → "الدخول كمدرسة" لا يعمل فيها
--
-- الحل: إعادة إنشاء كل السياسات باستخدام my_school_id()
--   (التي تحترم active_school_id للمشرف المتقمّص)
--   + إزالة fallback الخطير (IS NULL) — كل المستخدمين لهم مدرسة
-- ============================================================

-- ════ PLANS ════
DROP POLICY IF EXISTS "plans_school" ON plans;
CREATE POLICY "plans_school" ON plans FOR ALL
USING (school_id = my_school_id() AND deleted_at IS NULL)
WITH CHECK (school_id = my_school_id());

-- ════ PLAN_NODES (عبر الخطة) ════
DROP POLICY IF EXISTS "plan_nodes_school" ON plan_nodes;
CREATE POLICY "plan_nodes_school" ON plan_nodes FOR ALL
USING (
  deleted_at IS NULL AND EXISTS (
    SELECT 1 FROM plans p WHERE p.id = plan_nodes.plan_id AND p.school_id = my_school_id()
  )
)
WITH CHECK (
  EXISTS (SELECT 1 FROM plans p WHERE p.id = plan_nodes.plan_id AND p.school_id = my_school_id())
);

-- ════ TASKS (عبر العقدة → الخطة، أو مهام حرة بلا عقدة) ════
DROP POLICY IF EXISTS "tasks_school" ON tasks;
CREATE POLICY "tasks_school" ON tasks FOR ALL
USING (
  deleted_at IS NULL AND (
    node_id IS NULL OR EXISTS (
      SELECT 1 FROM plan_nodes pn JOIN plans p ON p.id = pn.plan_id
      WHERE pn.id = tasks.node_id AND p.school_id = my_school_id()
    )
  )
)
WITH CHECK (
  node_id IS NULL OR EXISTS (
    SELECT 1 FROM plan_nodes pn JOIN plans p ON p.id = pn.plan_id
    WHERE pn.id = tasks.node_id AND p.school_id = my_school_id()
  )
);

-- ════ TEAMS ════
DROP POLICY IF EXISTS "teams_school" ON teams;
CREATE POLICY "teams_school" ON teams FOR ALL
USING (school_id = my_school_id())
WITH CHECK (school_id = my_school_id());

-- ════ KPIS (عبر العقدة → الخطة) ════
DROP POLICY IF EXISTS "kpis_school" ON kpis;
CREATE POLICY "kpis_school" ON kpis FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM plan_nodes pn JOIN plans p ON p.id = pn.plan_id
    WHERE pn.id = kpis.node_id AND p.school_id = my_school_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM plan_nodes pn JOIN plans p ON p.id = pn.plan_id
    WHERE pn.id = kpis.node_id AND p.school_id = my_school_id()
  )
);

-- ════ EVIDENCE (عبر المهمة → العقدة → الخطة) ════
DROP POLICY IF EXISTS "evidence_school" ON evidence;
CREATE POLICY "evidence_school" ON evidence FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM tasks t JOIN plan_nodes pn ON pn.id = t.node_id JOIN plans p ON p.id = pn.plan_id
    WHERE t.id = evidence.task_id AND p.school_id = my_school_id()
  )
)
WITH CHECK (auth.uid() IS NOT NULL);

-- ════ SUBTASKS (عبر المهمة) ════
DROP POLICY IF EXISTS "subtasks_school" ON subtasks;
CREATE POLICY "subtasks_school" ON subtasks FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM tasks t LEFT JOIN plan_nodes pn ON pn.id = t.node_id LEFT JOIN plans p ON p.id = pn.plan_id
    WHERE t.id = subtasks.task_id AND (t.node_id IS NULL OR p.school_id = my_school_id())
  )
)
WITH CHECK (auth.uid() IS NOT NULL);

-- ════ تحديث سياسات الترحيل 011 لإزالة fallback (IS NULL) ════
-- profiles: نُبقي على profiles_own + نُحدّث profiles_school
DROP POLICY IF EXISTS "profiles_school" ON profiles;
CREATE POLICY "profiles_school" ON profiles FOR ALL
USING (school_id = my_school_id())
WITH CHECK (school_id = my_school_id());

-- meetings
DROP POLICY IF EXISTS "meetings_school" ON meetings;
CREATE POLICY "meetings_school" ON meetings FOR ALL
USING (school_id = my_school_id())
WITH CHECK (school_id = my_school_id());

-- ════ التحقق ════
SELECT tablename, policyname,
  CASE WHEN qual LIKE '%my_school_id%' THEN '✅ موحّدة' ELSE '⚠️ راجِع' END AS status
FROM pg_policies
WHERE tablename IN ('plans','plan_nodes','tasks','teams','kpis','evidence','subtasks','profiles','meetings')
ORDER BY tablename, policyname;

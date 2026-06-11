-- ============================================================
-- الترحيل 024: قفل المهام المنجزة على مستوى القاعدة (RLS)
-- ============================================================
-- التاريخ: 2026-06-11
-- الغرض: المهمة المنجزة = سجل اعتماد (QNSA) لا يُعدَّل تعديلاً صامتاً.
--   الواجهة والـ API يمنعان التعديل، وهذا الترحيل يكمل الطبقة الثالثة:
--   منع التعديل من المتصفح مباشرةً (supabase-js) على:
--     1) المهمة نفسها (UPDATE) عندما تكون منجزة
--        + منع تعيين status='completed' من العميل (الاعتماد عبر الخادم فقط)
--        + إلغاء DELETE من العميل نهائياً (الحذف في التطبيق ناعم عبر API)
--     2) الأدلة (INSERT/UPDATE/DELETE) لمهمة منجزة
--     3) الخطوات الفرعية (INSERT/UPDATE/DELETE) لمهمة منجزة
--   التعليقات (task_comments) تبقى مفتوحة عمداً — قرار تصميمي.
--   إعادة الفتح: عبر /api/tasks/[taskId]/transition (action=reopen)
--   بصلاحية manage_tasks وسبب إلزامي — service role يتجاوز RLS.
-- ============================================================

-- ════ TASKS: تفكيك tasks_school (FOR ALL) — ترحيل 016 ════
DROP POLICY IF EXISTS "tasks_school" ON tasks;

CREATE POLICY "tasks_school_select" ON tasks FOR SELECT
USING (
  deleted_at IS NULL AND (
    node_id IS NULL OR EXISTS (
      SELECT 1 FROM plan_nodes pn JOIN plans p ON p.id = pn.plan_id
      WHERE pn.id = tasks.node_id AND p.school_id = my_school_id()
    )
  )
);

CREATE POLICY "tasks_school_insert" ON tasks FOR INSERT
WITH CHECK (
  status IS DISTINCT FROM 'completed' AND (
    node_id IS NULL OR EXISTS (
      SELECT 1 FROM plan_nodes pn JOIN plans p ON p.id = pn.plan_id
      WHERE pn.id = tasks.node_id AND p.school_id = my_school_id()
    )
  )
);

-- التعديل: ممنوع على المنجزة، وممنوع تعيين "منجزة" من العميل (الاعتماد عبر الخادم)
CREATE POLICY "tasks_school_update" ON tasks FOR UPDATE
USING (
  deleted_at IS NULL AND status <> 'completed' AND (
    node_id IS NULL OR EXISTS (
      SELECT 1 FROM plan_nodes pn JOIN plans p ON p.id = pn.plan_id
      WHERE pn.id = tasks.node_id AND p.school_id = my_school_id()
    )
  )
)
WITH CHECK (
  status IS DISTINCT FROM 'completed' AND (
    node_id IS NULL OR EXISTS (
      SELECT 1 FROM plan_nodes pn JOIN plans p ON p.id = pn.plan_id
      WHERE pn.id = tasks.node_id AND p.school_id = my_school_id()
    )
  )
);

-- لا سياسة DELETE → لا حذف صلب من العميل إطلاقاً (الحذف الناعم عبر API)

-- ════ EVIDENCE: تفكيك evidence_school (FOR ALL) — ترحيل 016 ════
DROP POLICY IF EXISTS "evidence_school" ON evidence;

CREATE POLICY "evidence_school_select" ON evidence FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM tasks t JOIN plan_nodes pn ON pn.id = t.node_id JOIN plans p ON p.id = pn.plan_id
    WHERE t.id = evidence.task_id AND p.school_id = my_school_id()
  )
);

CREATE POLICY "evidence_school_insert" ON evidence FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tasks t JOIN plan_nodes pn ON pn.id = t.node_id JOIN plans p ON p.id = pn.plan_id
    WHERE t.id = evidence.task_id AND p.school_id = my_school_id() AND t.status <> 'completed'
  )
);

CREATE POLICY "evidence_school_update" ON evidence FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM tasks t JOIN plan_nodes pn ON pn.id = t.node_id JOIN plans p ON p.id = pn.plan_id
    WHERE t.id = evidence.task_id AND p.school_id = my_school_id() AND t.status <> 'completed'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tasks t JOIN plan_nodes pn ON pn.id = t.node_id JOIN plans p ON p.id = pn.plan_id
    WHERE t.id = evidence.task_id AND p.school_id = my_school_id() AND t.status <> 'completed'
  )
);

CREATE POLICY "evidence_school_delete" ON evidence FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM tasks t JOIN plan_nodes pn ON pn.id = t.node_id JOIN plans p ON p.id = pn.plan_id
    WHERE t.id = evidence.task_id AND p.school_id = my_school_id() AND t.status <> 'completed'
  )
);

-- ════ SUBTASKS: تفكيك subtasks_school (FOR ALL) — ترحيل 016 ════
DROP POLICY IF EXISTS "subtasks_school" ON subtasks;

CREATE POLICY "subtasks_school_select" ON subtasks FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM tasks t LEFT JOIN plan_nodes pn ON pn.id = t.node_id LEFT JOIN plans p ON p.id = pn.plan_id
    WHERE t.id = subtasks.task_id AND (t.node_id IS NULL OR p.school_id = my_school_id())
  )
);

CREATE POLICY "subtasks_school_insert" ON subtasks FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tasks t LEFT JOIN plan_nodes pn ON pn.id = t.node_id LEFT JOIN plans p ON p.id = pn.plan_id
    WHERE t.id = subtasks.task_id AND (t.node_id IS NULL OR p.school_id = my_school_id())
      AND t.status <> 'completed'
  )
);

CREATE POLICY "subtasks_school_update" ON subtasks FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM tasks t LEFT JOIN plan_nodes pn ON pn.id = t.node_id LEFT JOIN plans p ON p.id = pn.plan_id
    WHERE t.id = subtasks.task_id AND (t.node_id IS NULL OR p.school_id = my_school_id())
      AND t.status <> 'completed'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tasks t LEFT JOIN plan_nodes pn ON pn.id = t.node_id LEFT JOIN plans p ON p.id = pn.plan_id
    WHERE t.id = subtasks.task_id AND (t.node_id IS NULL OR p.school_id = my_school_id())
      AND t.status <> 'completed'
  )
);

CREATE POLICY "subtasks_school_delete" ON subtasks FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM tasks t LEFT JOIN plan_nodes pn ON pn.id = t.node_id LEFT JOIN plans p ON p.id = pn.plan_id
    WHERE t.id = subtasks.task_id AND (t.node_id IS NULL OR p.school_id = my_school_id())
      AND t.status <> 'completed'
  )
);

-- ════ التحقق ════
SELECT tablename, policyname, cmd,
  CASE WHEN cmd = 'ALL' THEN '⚠️ راجِع' ELSE '✅' END AS status
FROM pg_policies
WHERE tablename IN ('tasks', 'evidence', 'subtasks', 'task_comments')
ORDER BY tablename, policyname;

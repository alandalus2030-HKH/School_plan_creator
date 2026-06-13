-- ════════════════════════════════════════════════════════════════
-- 039: حماية الدليل المعتمد من التعديل/الحذف (RLS)
--   الدليل المعتمد (status='accepted') سجلّ موثّق — يلزم إلغاء اعتماده
--   أولاً (بصلاحية review_evidence عبر API) قبل أي تعديل/حذف.
--   (الحذف يمرّ عبر API بصلاحية الخدمة — وله حارس مماثل في الكود.)
-- ════════════════════════════════════════════════════════════════

-- evidence: منع التعديل عند الاعتماد
DROP POLICY IF EXISTS "evidence_school_update" ON evidence;
CREATE POLICY "evidence_school_update" ON evidence FOR UPDATE
USING (
  has_permission('manage_evidence') AND evidence.status <> 'accepted' AND EXISTS (
    SELECT 1 FROM tasks t JOIN plan_nodes pn ON pn.id = t.node_id JOIN plans p ON p.id = pn.plan_id
    WHERE t.id = evidence.task_id AND p.school_id = my_school_id() AND t.status <> 'completed'
  )
)
WITH CHECK (
  has_permission('manage_evidence') AND EXISTS (
    SELECT 1 FROM tasks t JOIN plan_nodes pn ON pn.id = t.node_id JOIN plans p ON p.id = pn.plan_id
    WHERE t.id = evidence.task_id AND p.school_id = my_school_id() AND t.status <> 'completed'
  )
);

-- evidence: منع الحذف المباشر عند الاعتماد (دفاع إضافي؛ الحذف الفعلي عبر API)
DROP POLICY IF EXISTS "evidence_school_delete" ON evidence;
CREATE POLICY "evidence_school_delete" ON evidence FOR DELETE
USING (
  has_permission('manage_evidence') AND evidence.status <> 'accepted' AND EXISTS (
    SELECT 1 FROM tasks t JOIN plan_nodes pn ON pn.id = t.node_id JOIN plans p ON p.id = pn.plan_id
    WHERE t.id = evidence.task_id AND p.school_id = my_school_id() AND t.status <> 'completed'
  )
);

-- evidence_files: منع تغيير ملفات الدليل المعتمد
DROP POLICY IF EXISTS "evidence_files_write" ON evidence_files;
CREATE POLICY "evidence_files_write" ON evidence_files FOR ALL
USING (has_permission('manage_evidence') AND EXISTS (
  SELECT 1 FROM evidence e JOIN tasks t ON t.id = e.task_id
  JOIN plan_nodes pn ON pn.id = t.node_id JOIN plans p ON p.id = pn.plan_id
  WHERE e.id = evidence_files.evidence_id AND p.school_id = my_school_id() AND e.status <> 'accepted'
))
WITH CHECK (has_permission('manage_evidence') AND EXISTS (
  SELECT 1 FROM evidence e JOIN tasks t ON t.id = e.task_id
  JOIN plan_nodes pn ON pn.id = t.node_id JOIN plans p ON p.id = pn.plan_id
  WHERE e.id = evidence_files.evidence_id AND p.school_id = my_school_id() AND e.status <> 'accepted'
));

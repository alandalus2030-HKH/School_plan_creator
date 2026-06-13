-- ════════════════════════════════════════════════════════════════
-- 038: إغلاق كتابة الأدلة على مستوى القاعدة (RLS)
--   كتابة evidence / evidence_files / evidence_links تتطلب manage_evidence.
--   القراءة تبقى مفتوحة لأعضاء المدرسة. عمليات الحذف/الاعتماد تمرّ عبر
--   API بصلاحية الخدمة (تتجاوز RLS) فلا تتأثر — حراستها في الـ API.
-- ════════════════════════════════════════════════════════════════

-- دالة فحص صلاحية المستخدم الحالي (SECURITY DEFINER لتجاوز RLS على roles/profiles)
CREATE OR REPLACE FUNCTION has_permission(perm text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE((
    SELECT (p.is_super_admin IS TRUE) OR (r.permissions ? 'all') OR (r.permissions ? perm)
    FROM profiles p LEFT JOIN roles r ON r.code = p.role
    WHERE p.id = auth.uid()
  ), false);
$$;

-- ════ evidence: إضافة شرط manage_evidence على الكتابة (مع إبقاء قفل المهمة المنجزة) ════
DROP POLICY IF EXISTS "evidence_school_insert" ON evidence;
CREATE POLICY "evidence_school_insert" ON evidence FOR INSERT
WITH CHECK (
  has_permission('manage_evidence') AND EXISTS (
    SELECT 1 FROM tasks t JOIN plan_nodes pn ON pn.id = t.node_id JOIN plans p ON p.id = pn.plan_id
    WHERE t.id = evidence.task_id AND p.school_id = my_school_id() AND t.status <> 'completed'
  )
);

DROP POLICY IF EXISTS "evidence_school_update" ON evidence;
CREATE POLICY "evidence_school_update" ON evidence FOR UPDATE
USING (
  has_permission('manage_evidence') AND EXISTS (
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

DROP POLICY IF EXISTS "evidence_school_delete" ON evidence;
CREATE POLICY "evidence_school_delete" ON evidence FOR DELETE
USING (
  has_permission('manage_evidence') AND EXISTS (
    SELECT 1 FROM tasks t JOIN plan_nodes pn ON pn.id = t.node_id JOIN plans p ON p.id = pn.plan_id
    WHERE t.id = evidence.task_id AND p.school_id = my_school_id() AND t.status <> 'completed'
  )
);
-- evidence_school_select يبقى كما هو (قراءة لأعضاء المدرسة)

-- ════ evidence_files: فصل القراءة عن الكتابة (الكتابة تتطلب manage_evidence) ════
DROP POLICY IF EXISTS "evidence_files_school" ON evidence_files;
CREATE POLICY "evidence_files_select" ON evidence_files FOR SELECT
USING (EXISTS (
  SELECT 1 FROM evidence e JOIN tasks t ON t.id = e.task_id
  JOIN plan_nodes pn ON pn.id = t.node_id JOIN plans p ON p.id = pn.plan_id
  WHERE e.id = evidence_files.evidence_id AND p.school_id = my_school_id()
));
CREATE POLICY "evidence_files_write" ON evidence_files FOR ALL
USING (has_permission('manage_evidence') AND EXISTS (
  SELECT 1 FROM evidence e JOIN tasks t ON t.id = e.task_id
  JOIN plan_nodes pn ON pn.id = t.node_id JOIN plans p ON p.id = pn.plan_id
  WHERE e.id = evidence_files.evidence_id AND p.school_id = my_school_id()
))
WITH CHECK (has_permission('manage_evidence') AND EXISTS (
  SELECT 1 FROM evidence e JOIN tasks t ON t.id = e.task_id
  JOIN plan_nodes pn ON pn.id = t.node_id JOIN plans p ON p.id = pn.plan_id
  WHERE e.id = evidence_files.evidence_id AND p.school_id = my_school_id()
));

-- ════ evidence_links: فصل القراءة عن الكتابة (الكتابة تتطلب manage_evidence) ════
DROP POLICY IF EXISTS "evidence_links_rw" ON evidence_links;
CREATE POLICY "evidence_links_select" ON evidence_links FOR SELECT
USING (EXISTS (
  SELECT 1 FROM tasks t JOIN plan_nodes pn ON pn.id = t.node_id JOIN plans p ON p.id = pn.plan_id
  WHERE t.id = evidence_links.task_id AND p.school_id = my_school_id()
));
CREATE POLICY "evidence_links_write" ON evidence_links FOR ALL
USING (has_permission('manage_evidence') AND EXISTS (
  SELECT 1 FROM tasks t JOIN plan_nodes pn ON pn.id = t.node_id JOIN plans p ON p.id = pn.plan_id
  WHERE t.id = evidence_links.task_id AND p.school_id = my_school_id()
))
WITH CHECK (has_permission('manage_evidence') AND EXISTS (
  SELECT 1 FROM tasks t JOIN plan_nodes pn ON pn.id = t.node_id JOIN plans p ON p.id = pn.plan_id
  WHERE t.id = evidence_links.task_id AND p.school_id = my_school_id()
));

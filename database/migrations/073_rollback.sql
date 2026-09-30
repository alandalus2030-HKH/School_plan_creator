-- ════════════════════════════════════════════════════════════════
-- تراجع الترحيل 073 — يعيد حراسة الأدلة إلى حالها قبله
--
--   يُشغَّل إن ظهر خلل في جدول التحقّق أو في الشاشات القائمة.
--   **لا يحذف الأعمدة ولا الجداول الجديدة** — حذفها يُفقد بيانات إن
--   كانت قد امتلأت، والأعمدة الفارغة لا تضرّ. يُعيد **السياسات** فقط،
--   ويُعيد task_id إلزامياً إن لم يكن ثمّة دليل بلا مهمّة.
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ════ evidence: سياسات 038 + 039 + 049 كما كانت ════

DROP POLICY IF EXISTS "evidence_school_select" ON evidence;
CREATE POLICY "evidence_school_select" ON evidence FOR SELECT
USING (EXISTS (
  SELECT 1 FROM tasks t JOIN plan_nodes pn ON pn.id = t.node_id JOIN plans p ON p.id = pn.plan_id
  WHERE t.id = evidence.task_id AND p.school_id = my_school_id()
));

DROP POLICY IF EXISTS "evidence_school_insert" ON evidence;
CREATE POLICY "evidence_school_insert" ON evidence FOR INSERT
WITH CHECK (
  has_permission('manage_evidence') AND EXISTS (
    SELECT 1 FROM tasks t JOIN plan_nodes pn ON pn.id = t.node_id JOIN plans p ON p.id = pn.plan_id
    WHERE t.id = evidence.task_id AND p.school_id = my_school_id()
      AND t.status NOT IN ('completed','submitted')
  )
);

DROP POLICY IF EXISTS "evidence_school_update" ON evidence;
CREATE POLICY "evidence_school_update" ON evidence FOR UPDATE
USING (
  has_permission('manage_evidence') AND status <> 'accepted' AND EXISTS (
    SELECT 1 FROM tasks t JOIN plan_nodes pn ON pn.id = t.node_id JOIN plans p ON p.id = pn.plan_id
    WHERE t.id = evidence.task_id AND p.school_id = my_school_id()
      AND t.status NOT IN ('completed','submitted')
  )
)
WITH CHECK (
  has_permission('manage_evidence') AND EXISTS (
    SELECT 1 FROM tasks t JOIN plan_nodes pn ON pn.id = t.node_id JOIN plans p ON p.id = pn.plan_id
    WHERE t.id = evidence.task_id AND p.school_id = my_school_id()
      AND t.status NOT IN ('completed','submitted')
  )
);

DROP POLICY IF EXISTS "evidence_school_delete" ON evidence;
CREATE POLICY "evidence_school_delete" ON evidence FOR DELETE
USING (
  has_permission('manage_evidence') AND status <> 'accepted' AND EXISTS (
    SELECT 1 FROM tasks t JOIN plan_nodes pn ON pn.id = t.node_id JOIN plans p ON p.id = pn.plan_id
    WHERE t.id = evidence.task_id AND p.school_id = my_school_id()
      AND t.status NOT IN ('completed','submitted')
  )
);

-- ════ evidence_files: العزل عبر المهمة كما كان ════

DROP POLICY IF EXISTS "evidence_files_select" ON evidence_files;
CREATE POLICY "evidence_files_select" ON evidence_files FOR SELECT
USING (EXISTS (
  SELECT 1 FROM evidence e JOIN tasks t ON t.id = e.task_id
  JOIN plan_nodes pn ON pn.id = t.node_id JOIN plans p ON p.id = pn.plan_id
  WHERE e.id = evidence_files.evidence_id AND p.school_id = my_school_id()
));

DROP POLICY IF EXISTS "evidence_files_write" ON evidence_files;
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

-- ════ مُشغّل التجميد: نصّ 053 ════

CREATE OR REPLACE FUNCTION trg_freeze_evidence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE pid uuid;
BEGIN
  SELECT n.plan_id INTO pid FROM tasks t JOIN plan_nodes n ON n.id = t.node_id
  WHERE t.id = COALESCE(NEW.task_id, OLD.task_id);
  IF is_plan_frozen(pid) THEN
    RAISE EXCEPTION 'الخطة مجمّدة — لا يمكن تعديل أدلتها';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $fn$;

-- ════ إعادة إلزام task_id — تُنفَّذ فقط إن لم يوجد دليل بلا مهمّة ════

DO $do$
DECLARE loose int;
BEGIN
  SELECT count(*) INTO loose FROM evidence WHERE task_id IS NULL;
  IF loose = 0 THEN
    ALTER TABLE evidence ALTER COLUMN task_id SET NOT NULL;
    RAISE NOTICE 'أُعيد إلزام task_id';
  ELSE
    RAISE NOTICE 'بقي task_id اختيارياً: % دليلاً بلا مهمّة (أدلة القناة المباشرة)', loose;
  END IF;
END $do$;

COMMIT;

-- تحقّق
SELECT tablename AS الجدول, policyname AS السياسة, cmd AS العملية
FROM pg_policies
WHERE tablename IN ('evidence','evidence_files')
ORDER BY tablename, policyname;

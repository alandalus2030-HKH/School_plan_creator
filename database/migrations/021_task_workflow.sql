-- ============================================================
-- الترحيل 021: سير عمل المهام والأدلة (المرحلة الثانية)
-- ============================================================
-- التاريخ: 2026-06-09
-- يضيف حالتَي "مرفوعة/مُعادة" + تحقّق الأدلة + أنواعها +
-- سجل التحوّلات، ويرحّل البيانات الحالية بأمان.
-- ============================================================

-- ════ 1) حقول سير عمل المهمة ════
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS submitted_at            TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS submitted_by            UUID;        -- REFERENCES profiles(id)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS return_note             TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS required_evidence_types TEXT[];

-- ════ 2) حقول تحقّق الدليل ════
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS status        TEXT NOT NULL DEFAULT 'pending'; -- pending|accepted|rejected
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS review_note   TEXT;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS evidence_type TEXT;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS reviewed_by   UUID;        -- REFERENCES profiles(id)
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS reviewed_at   TIMESTAMPTZ;

-- ════ 3) سجل التحوّلات ════
CREATE TABLE IF NOT EXISTS task_transitions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL,            -- REFERENCES tasks(id)
  from_status TEXT,
  to_status   TEXT NOT NULL,
  actor_id    UUID,                     -- REFERENCES profiles(id)
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_transitions_task ON task_transitions(task_id, created_at);

ALTER TABLE task_transitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS task_transitions_school ON task_transitions;
CREATE POLICY task_transitions_school ON task_transitions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM tasks t
    JOIN plan_nodes pn ON pn.id = t.node_id
    JOIN plans p ON p.id = pn.plan_id
    WHERE t.id = task_transitions.task_id AND p.school_id = my_school_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM tasks t
    JOIN plan_nodes pn ON pn.id = t.node_id
    JOIN plans p ON p.id = pn.plan_id
    WHERE t.id = task_transitions.task_id AND p.school_id = my_school_id()
  ));

-- ════ 4) فئة أنواع الأدلة (عامة — dropdown_options بلا school_id) ════
INSERT INTO dropdown_options (category, value, sort_order)
SELECT 'evidence_type', v, ord FROM (VALUES
  ('خطة', 1), ('محضر اجتماع', 2), ('تقرير', 3),
  ('صور', 4), ('مستند', 5), ('نتائج/إحصاءات', 6)
) AS seed(v, ord)
WHERE NOT EXISTS (SELECT 1 FROM dropdown_options WHERE category = 'evidence_type');

-- ════ 5) ترحيل البيانات الحالية ════
-- "متأخرة" لم تعد حالة سير عمل → ترجع "جارية" (التأخير يُحسب كوسم لاحقاً)
UPDATE tasks SET status = 'in_progress' WHERE status = 'delayed';
-- الأدلة الموجودة تُعتبر معتمدة (لئلا تتعطّل المهام المنجزة سابقاً)
UPDATE evidence SET status = 'accepted';

-- ════ التحقق ════
SELECT 'tasks cols' AS chk, string_agg(column_name, ', ') AS cols
FROM information_schema.columns
WHERE table_name = 'tasks' AND column_name IN ('submitted_at','submitted_by','return_note','required_evidence_types')
UNION ALL
SELECT 'evidence cols', string_agg(column_name, ', ')
FROM information_schema.columns
WHERE table_name = 'evidence' AND column_name IN ('status','review_note','evidence_type','reviewed_by','reviewed_at')
UNION ALL
SELECT 'task_transitions', (SELECT COUNT(*)::text || ' policy' FROM pg_policies WHERE tablename='task_transitions')
UNION ALL
SELECT 'evidence_type seeds', (SELECT COUNT(*)::text FROM dropdown_options WHERE category='evidence_type');

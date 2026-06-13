-- ════════════════════════════════════════════════════════════════
-- 034: الدليل المشترك (نهج كوجنيا)
--   ربط نفس الدليل بعدة مهام دون إعادة رفعه.
--   evidence.task_id يبقى المهمة الأصلية (المالكة)؛ evidence_links
--   تضيف ارتباطات بمهام أخرى (متعدد-لمتعدد).
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS evidence_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  task_id     UUID NOT NULL REFERENCES tasks(id)    ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (evidence_id, task_id)
);
CREATE INDEX IF NOT EXISTS idx_evidence_links_task     ON evidence_links(task_id);
CREATE INDEX IF NOT EXISTS idx_evidence_links_evidence ON evidence_links(evidence_id);

-- ════ RLS: نفس مسار العزل (المهمة → العقدة → الخطة → المدرسة) ════
ALTER TABLE evidence_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "evidence_links_rw" ON evidence_links;
CREATE POLICY "evidence_links_rw" ON evidence_links FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM tasks t
    JOIN plan_nodes pn ON pn.id = t.node_id
    JOIN plans p       ON p.id  = pn.plan_id
    WHERE t.id = evidence_links.task_id AND p.school_id = my_school_id()
  )
)
WITH CHECK (auth.uid() IS NOT NULL);

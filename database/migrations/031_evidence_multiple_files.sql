-- ════════════════════════════════════════════════════════════════
-- 031: ملفات متعددة لكل دليل
-- دليل واحد (evidence) ← عدة ملفات/فيديوهات (evidence_files)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS evidence_files (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  name        TEXT,
  file_url    TEXT NOT NULL,
  file_type   TEXT,
  file_size   BIGINT DEFAULT 0,
  video_url   TEXT,
  order_num   INT DEFAULT 1,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_files_evidence ON evidence_files(evidence_id);

-- ════ RLS: نفس مسار العزل (دليل → مهمة → عقدة → خطة → مدرسة) ════
ALTER TABLE evidence_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "evidence_files_school" ON evidence_files;
CREATE POLICY "evidence_files_school" ON evidence_files FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM evidence e
    JOIN tasks t       ON t.id  = e.task_id
    JOIN plan_nodes pn ON pn.id = t.node_id
    JOIN plans p       ON p.id  = pn.plan_id
    WHERE e.id = evidence_files.evidence_id AND p.school_id = my_school_id()
  )
)
WITH CHECK (auth.uid() IS NOT NULL);

-- ════ ترحيل البيانات الحالية: كل دليل قائم له ملف واحد ════
INSERT INTO evidence_files (evidence_id, name, file_url, file_type, file_size, video_url, order_num, created_at)
SELECT id, name, file_url, file_type, COALESCE(file_size, 0), video_url, 1, created_at
FROM evidence e
WHERE e.file_url IS NOT NULL
  AND e.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM evidence_files ef WHERE ef.evidence_id = e.id);

-- تحقق
SELECT
  (SELECT COUNT(*) FROM evidence WHERE deleted_at IS NULL) AS evidence_count,
  (SELECT COUNT(*) FROM evidence_files)                    AS files_count;

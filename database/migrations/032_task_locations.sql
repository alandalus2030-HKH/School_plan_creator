-- ════════════════════════════════════════════════════════════════
-- 032: أماكن المهام (موارد مكانية مشتركة) لمنع التعارض
--   school_locations: كتالوج الأماكن لكل مدرسة (قابل للإدارة)
--   task_locations:   ربط المهمة بأماكنها (متعدد)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS school_locations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name_ar     TEXT NOT NULL,
  sort_order  INT DEFAULT 0,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_school_locations_school ON school_locations(school_id);

ALTER TABLE school_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "school_locations_rw" ON school_locations;
CREATE POLICY "school_locations_rw" ON school_locations FOR ALL
USING (school_id = my_school_id())
WITH CHECK (school_id = my_school_id());

-- ════ ربط المهمة بالأماكن (متعدد) ════
CREATE TABLE IF NOT EXISTS task_locations (
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES school_locations(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, location_id)
);
CREATE INDEX IF NOT EXISTS idx_task_locations_task     ON task_locations(task_id);
CREATE INDEX IF NOT EXISTS idx_task_locations_location ON task_locations(location_id);

ALTER TABLE task_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "task_locations_rw" ON task_locations;
CREATE POLICY "task_locations_rw" ON task_locations FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM tasks t
    JOIN plan_nodes pn ON pn.id = t.node_id
    JOIN plans p       ON p.id  = pn.plan_id
    WHERE t.id = task_locations.task_id AND p.school_id = my_school_id()
  )
)
WITH CHECK (auth.uid() IS NOT NULL);

-- ════ بذور: الأماكن الافتراضية لكل مدرسة قائمة ════
INSERT INTO school_locations (school_id, name_ar, sort_order)
SELECT s.id, v.name, v.ord
FROM schools s
CROSS JOIN (VALUES
  ('الصف الدراسي', 1),
  ('ساحة المدرسة', 2),
  ('الصالة الرياضية', 3),
  ('غرفة التطوير المهني', 4),
  ('المسرح', 5),
  ('الملاعب الخارجية', 6)
) AS v(name, ord)
WHERE NOT EXISTS (SELECT 1 FROM school_locations sl WHERE sl.school_id = s.id);

-- تحقق
SELECT s.name_ar AS school, COUNT(sl.id) AS locations
FROM schools s LEFT JOIN school_locations sl ON sl.school_id = s.id
GROUP BY s.id, s.name_ar;

-- ════════════════════════════════════════════════════════════════
-- 040: التكليف المبني على القسم
--   assigned_to_department: تكليف المهمة لقسم كامل (أي عضو في القسم
--   يستطيع تنفيذها) — مثل تكليف الفريق، لكن عبر profiles.department.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_to_department TEXT;
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_department ON tasks(assigned_to_department);

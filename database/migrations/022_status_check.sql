-- ============================================================
-- الترحيل 022: تحديث قيد CHECK على حالة المهمة
-- ============================================================
-- التاريخ: 2026-06-09
-- السبب: قيد tasks_status_check يسمح فقط بالحالات القديمة، فيرفض
--   "submitted" و"returned" الجديدتين (سير العمل). نحدّثه ليقبلها.
-- ============================================================

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;

ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('not_started', 'in_progress', 'submitted', 'returned', 'completed', 'delayed'));

-- التحقق
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'tasks'::regclass AND conname = 'tasks_status_check';

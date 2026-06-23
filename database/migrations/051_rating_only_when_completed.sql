-- ============================================================
-- الترحيل 051: التقييم لا يوجد إلا على المهام المنجزة
-- ============================================================
-- التاريخ: 2026-06-24
-- السبب: ظهرت مهام بحالة غير "completed" تحمل rating (بيانات اختبار
--   أُدخلت مباشرةً)، فظهرت "مقيّمة" لكنها "جارية" — عكس المنطق.
--   التقييم يُمنح حصراً عند الاعتماد (approve → completed)، وإعادة الفتح
--   تمسحه. مع الترحيل 050 (منجزة ⟹ مقيّمة) يصبح: مقيّمة ⟺ منجزة.
-- ملاحظة: شُغِّل عبر Supabase MCP بتاريخه — هذا الملف للتوثيق/التزامن.
-- ============================================================

-- 1) إصلاح البيانات: مسح التقييم من أي مهمة غير منجزة
UPDATE tasks
SET rating = NULL, rating_note = NULL, rated_at = NULL, updated_at = now()
WHERE status <> 'completed' AND rating IS NOT NULL AND deleted_at IS NULL;

-- 2) الحارس العكسي: rating لا يوجد إلا على completed
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_rating_only_when_completed;
ALTER TABLE tasks ADD CONSTRAINT tasks_rating_only_when_completed
  CHECK (rating IS NULL OR status = 'completed');

-- التحقق
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'tasks'::regclass AND conname = 'tasks_rating_only_when_completed';

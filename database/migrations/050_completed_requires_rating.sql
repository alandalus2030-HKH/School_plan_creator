-- ============================================================
-- الترحيل 050: المهمة المنجزة يجب أن تحمل تقييماً
-- ============================================================
-- التاريخ: 2026-06-23
-- السبب: ظهرت مهام بحالة "completed" بلا rating (بيانات اختبار/seed
--   أُدخلت مباشرةً دون المرور بمسار approve الذي يفرض التقييم 1-5).
--   هذا تناقض ظاهري (منجزة + لم تُقيَّم). نُصلح البيانات ثم نمنع تكراره.
-- ملاحظة: شُغِّل عبر Supabase MCP بتاريخه — هذا الملف للتوثيق/التزامن.
-- ============================================================

-- 1) إصلاح البيانات: إرجاع المهام المنجزة بلا تقييم إلى "لم تبدأ"
--    (لم تمرّ بسير العمل أصلاً: بلا انتقالات ولا أدلة)
UPDATE tasks
SET status = 'not_started',
    submitted_at = NULL, submitted_by = NULL,
    rated_at = NULL, rating = NULL, rating_note = NULL,
    return_note = NULL,
    updated_at = now()
WHERE status = 'completed' AND rating IS NULL AND deleted_at IS NULL;

-- 2) الحارس الدائم: لا مهمة "منجزة" بلا تقييم
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_completed_requires_rating;

ALTER TABLE tasks ADD CONSTRAINT tasks_completed_requires_rating
  CHECK (status <> 'completed' OR rating IS NOT NULL);

-- التحقق
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'tasks'::regclass AND conname = 'tasks_completed_requires_rating';

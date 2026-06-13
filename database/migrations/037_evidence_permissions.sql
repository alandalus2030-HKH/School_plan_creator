-- ════════════════════════════════════════════════════════════════
-- 037: صلاحيات الأدلة (إسناد افتراضي للأدوار القائمة)
--   manage_evidence: إضافة/تعديل/حذف الأدلة
--   review_evidence: اعتماد/رفض الأدلة
--   view_evidence:   خزانة الأدلة (مُنح school_admin في 036)
-- ════════════════════════════════════════════════════════════════

-- manage_evidence → مشرف المدرسة + مدير المهام + المكلّف (يرفع أدلته)
UPDATE roles SET permissions = permissions || '["manage_evidence"]'::jsonb
WHERE code IN ('school_admin', 'task_manager', 'task_assigned_employee')
  AND NOT (permissions ? 'manage_evidence');

-- review_evidence → مشرف المدرسة + المقيّم + مدير المهام
UPDATE roles SET permissions = permissions || '["review_evidence"]'::jsonb
WHERE code IN ('school_admin', 'task_evaluator', 'task_manager')
  AND NOT (permissions ? 'review_evidence');

-- view_evidence → إضافةً لمدير المهام والمقيّم (لرؤية الخزانة)
UPDATE roles SET permissions = permissions || '["view_evidence"]'::jsonb
WHERE code IN ('task_manager', 'task_evaluator')
  AND NOT (permissions ? 'view_evidence');

SELECT code, permissions FROM roles ORDER BY sort_order, code;

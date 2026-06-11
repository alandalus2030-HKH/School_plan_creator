-- ============================================================
-- الترحيل 025: تخزين طلب إعادة فتح المهمة المنجزة
-- ============================================================
-- التاريخ: 2026-06-11
-- الغرض: "طلب إعادة الفتح" كان إشعاراً فقط يتبخّر. نخزّنه على المهمة:
--   1) مشرف نظام المدرسة يرى الطلب المعلّق (من/السبب/متى) على صفحة المهمة
--   2) الطالب يرى "طلبك قيد الانتظار" — لا تكرار للطلبات
--   3) عند إعادة الفتح يولّد النظام عبارة آلية في سجل سير العمل:
--      «إعادة فتح بناءً على طلب المكلّف — سبب الطلب: ...»
--      وتُمسح أعمدة الطلب.
-- ============================================================

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reopen_requested_by UUID;         -- REFERENCES profiles(id)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reopen_requested_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reopen_request_note TEXT;

-- التحقق
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'tasks' AND column_name LIKE 'reopen%'
ORDER BY column_name;

-- ============================================================
-- الترحيل 019: نقاط الأوسمة (لنظام الترتيب التحفيزي)
-- ============================================================
-- التاريخ: 2026-06-09
-- لكل وسام عدد نقاط يُضاف لرصيد من يحصل عليه، وتُبنى عليه
-- لوحة ترتيب المستخدمين خلال فترة.
-- ============================================================

ALTER TABLE badges ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 10;

-- التحقق
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'badges' AND column_name = 'points';

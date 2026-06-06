-- ============================================================
-- الترحيل 009: محضر الاجتماع (notes)
-- ============================================================
-- التاريخ: 2026-06-07
-- إضافة عمود notes لتدوين محضر/قرارات الاجتماع
-- ============================================================

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS notes TEXT;

-- التحقق
SELECT column_name FROM information_schema.columns
WHERE table_name = 'meetings' AND column_name = 'notes';

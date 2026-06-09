-- ============================================================
-- الترحيل 020: موظف الشهر المُثبَّت يدوياً (للنمط الهجين)
-- ============================================================
-- التاريخ: 2026-06-09
-- منصة التتويج تلقائية بالنقاط، مع إمكانية أن يثبّت المدير
-- موظفاً يتصدّر المركز الأول يدوياً (تجاوز الاختيار التلقائي).
-- ============================================================

ALTER TABLE schools ADD COLUMN IF NOT EXISTS featured_employee_id UUID;  -- REFERENCES profiles(id)
ALTER TABLE schools ADD COLUMN IF NOT EXISTS featured_note        TEXT;

-- التحقق
SELECT column_name FROM information_schema.columns
WHERE table_name = 'schools' AND column_name IN ('featured_employee_id', 'featured_note')
ORDER BY column_name;

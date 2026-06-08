-- ============================================================
-- الترحيل 017: حقول بيانات المدرسة الإضافية + التخزين
-- ============================================================
-- التاريخ: 2026-06-08
-- لإدارة هوية المدرسة وبيانات الاتصال ورأسية/تذييل التقارير
-- ============================================================

ALTER TABLE schools ADD COLUMN IF NOT EXISTS address          TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS phone            TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS email            TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS principal_name   TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS ministry_number  TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS report_header    TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS report_footer    TEXT;

-- ============================================================
-- ⚠️ خطوة يدوية في Supabase Dashboard (ليست SQL):
-- ============================================================
-- 1. Storage → New bucket → الاسم: school-logos
-- 2. فعّل "Public bucket" (للقراءة العامة — لعرض الشعار في التقارير)
-- 3. (اختياري) سياسة الرفع للمستخدمين المسجّلين تُضبط من الواجهة
-- ============================================================

-- التحقق
SELECT column_name FROM information_schema.columns
WHERE table_name='schools'
  AND column_name IN ('address','phone','email','principal_name','ministry_number','report_header','report_footer')
ORDER BY column_name;

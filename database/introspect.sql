-- ============================================================
-- فحص القاعدة الحيّة — شغّله في Supabase SQL Editor والصق النتائج
-- يكشف ما لا يظهر في actual_schema.sql (قيود CHECK، سياسات RLS)
-- استعمله قبل: إضافة قيمة enum/status، أو تشخيص خطأ RLS/قيد.
-- ============================================================

-- 1) أعمدة جدول (غيّر 'tasks' للجدول المطلوب)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'tasks' ORDER BY ordinal_position;

-- 2) كل قيود CHECK (المصدر الخفي لأخطاء "violates check constraint")
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype = 'c' AND connamespace = 'public'::regnamespace
ORDER BY table_name, conname;

-- 3) سياسات RLS لكل الجداول (لتشخيص أخطاء 403/violates row-level security)
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 4) المفاتيح الأجنبية (لكشف العلاقات الغامضة مثل profiles→schools المزدوجة)
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype = 'f' AND connamespace = 'public'::regnamespace
ORDER BY table_name;

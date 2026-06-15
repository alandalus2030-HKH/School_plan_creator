-- 043_school_report_branding.sql
-- علامة التقارير الرسمية: صورتا توقيع المدير وختم المدرسة (تظهران في تذييل التقارير).
-- (اسم المدير principal_name ونصّا الرأسية/التذييل موجودة سابقاً.)
alter table schools add column if not exists signature_url text;
alter table schools add column if not exists stamp_url     text;

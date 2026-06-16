-- 044_security_hardening.sql
-- معالجة تحذيرات مدقّق أمان Supabase قبل الإطلاق (الأسبوع الثالث).

-- 1) تثبيت search_path للدوال SECURITY DEFINER (يمنع اختطاف search_path)
alter function public.handle_new_user() set search_path = public;
alter function public.has_permission(text) set search_path = public;

-- 2) منع تنفيذ دالة لقطات التجميع عبر RPC العام (تُشغَّل عبر pg_cron فقط بدور النظام)
revoke execute on function public.capture_plan_snapshots() from anon, authenticated;

-- ملاحظة: my_school_id()/has_permission()/my_perm() تبقى قابلة للتنفيذ لـ authenticated
-- لأنها تُستدعى داخل سياسات RLS — سحبها يكسر العزل. (تعيد بيانات المُستدعي نفسه فقط.)

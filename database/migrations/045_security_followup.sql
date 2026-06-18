-- 045_security_followup.sql
-- استكمال تحصين الأمان بعد فحص مدقّق Supabase (2026-06-19).
-- يُكمل الترحيل 044 الذي سحب التنفيذ من anon/authenticated فقط دون PUBLIC،
-- فبقيت الدالة قابلة للاستدعاء عبر RPC. (طُبِّق مباشرةً على الإنتاج عبر MCP
--  ويوثَّق هنا ليكون قابلاً لإعادة التطبيق لو أُعيد بناء القاعدة.)

-- 1) منع تنفيذ دالة لقطات التجميع نهائياً عبر RPC العام
--    (تبقى متاحة لـ postgres/service_role — pg_cron يشغّلها بدور النظام)
revoke execute on function public.capture_plan_snapshots() from public, anon, authenticated;

-- 2) إزالة سياسة السرد العامة على دلو الأدلة (Public Bucket Allows Listing)
--    الدلو عام والوصول للملفات عبر getPublicUrl لا يحتاج هذه السياسة؛
--    التطبيق لا يستخدم storage.list إطلاقاً — فإزالتها تمنع سرد كل الملفات
--    دون كسر عرض/طباعة الأدلة.
drop policy if exists view_evidence on storage.objects;

-- ملاحظة: يبقى بنداً واحداً إعدادياً في لوحة Supabase (لا SQL):
--   Authentication → Password Security → تفعيل "Leaked password protection" (HaveIBeenPwned).

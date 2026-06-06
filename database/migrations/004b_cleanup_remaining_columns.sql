-- ============================================================
-- الترحيل 004b: حذف الأعمدة الزائدة المتبقية
-- ============================================================
-- التاريخ: 2026-06-06
-- نُفِّذ فور اكتشافه — لا تأجيل للديون التقنية الصغيرة

-- tasks.sub_objective_id   → كان يشير لـ sub_objectives المحذوفة
-- meetings.teams_link      → مكرر مع meeting_url
-- meetings.meeting_date    → مكرر مع scheduled_at
-- profiles.role_id         → UUID FK غير مستخدم (التطبيق يستخدم role TEXT)
-- ============================================================

ALTER TABLE tasks    DROP COLUMN IF EXISTS sub_objective_id;
ALTER TABLE meetings DROP COLUMN IF EXISTS teams_link;
ALTER TABLE meetings DROP COLUMN IF EXISTS meeting_date;
ALTER TABLE profiles DROP COLUMN IF EXISTS role_id;

-- تحقق: يجب أن تُرجع 0 صفوف
SELECT column_name, table_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'tasks'    AND column_name = 'sub_objective_id') OR
    (table_name = 'meetings' AND column_name IN ('teams_link','meeting_date')) OR
    (table_name = 'profiles' AND column_name = 'role_id')
  );

-- ════════════════════════════════════════════════════════════════
-- 057 — تمكين حذف المدرسة الفارغة (تنظيف قيود المفاتيح الأجنبية)
-- ════════════════════════════════════════════════════════════════
-- المشكلة:
--   حذف مدرسة (حتى الفارغة من المستخدمين والخطط) يفشل برسالة Postgres خام:
--     update or delete on table "schools" violates foreign key constraint
--     "audit_logs_school_id_fkey" on table "audit_logs"
--   لأن ثلاثة جداول تشير إلى schools بسلوك NO ACTION فتحجب الحذف:
--     audit_logs · meetings · motivational_quotes
--   (بقية المراجع إمّا CASCADE تلقائياً — plans/teams/roles/badges/calendar/
--    locations/department_supervisors — أو محروسة في الـAPI مثل profiles.)
--
-- الإصلاح (يقتصر على رسوم المدرسة، يُفعَّل فقط عند حذف صفّ مدرسة):
--   • audit_logs.school_id        → SET NULL  (نُبقي الأثر الرقابي، نفصل المدرسة)
--   • meetings.school_id          → CASCADE   (الاجتماعات تابعة للمدرسة)
--   • motivational_quotes.school_id → CASCADE (الاقتباسات تابعة للمدرسة)
--
-- ملاحظة: meetings/motivational_quotes ليس لأبنائها (الحضور/الملاحظات) قيود
-- حاجبة (تتعاقب)، فالحذف المتعاقب آمن. والحارس الخادمي يضمن 0 مستخدم و0 خطة
-- نشطة قبل بلوغ هذه النقطة.
-- ════════════════════════════════════════════════════════════════

-- audit_logs → SET NULL
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_school_id_fkey;
ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_school_id_fkey
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL;

-- meetings → CASCADE
ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_school_id_fkey;
ALTER TABLE meetings
  ADD CONSTRAINT meetings_school_id_fkey
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;

-- motivational_quotes → CASCADE
ALTER TABLE motivational_quotes DROP CONSTRAINT IF EXISTS motivational_quotes_school_id_fkey;
ALTER TABLE motivational_quotes
  ADD CONSTRAINT motivational_quotes_school_id_fkey
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;

-- ── تحقّق ──
-- SELECT conname, confdeltype FROM pg_constraint
-- WHERE conname IN ('audit_logs_school_id_fkey','meetings_school_id_fkey','motivational_quotes_school_id_fkey');
-- (confdeltype: n=SET NULL, c=CASCADE)

-- ════════════════════════════════════════════════════════════════
-- 083 · «آخر تحديث» لأخوات الخطط: tasks · evidence · schools · profiles
--
-- الفحص قبل الكتابة (2026-10-07): الأربع **جامدةٌ كلّها** — لا صفّ
-- واحد تحرّك توقيته منذ أُنشئ النظام:
--     tasks 16 صفاً · evidence 1 · schools 2 · profiles 7 → صفرٌ في الكلّ.
-- وفي `tasks` خاصّةً تكتب الواجهة `updated_at` يدوياً في أربعة مواضع
-- (منفذ المهمة · الانتقال · شاشتان) — ولم يُجدِ: **ما يُكتب في الشاشات
-- يُنسى في شاشة**. ولذلك يُرفع إلى القاعدة حيث لا يُنسى.
--
-- والدالّة `set_updated_at` من ترحيل 082، وتُعاد هنا بـCREATE OR
-- REPLACE ليكون الملفّ قائماً بنفسه مهما كان ترتيب التشغيل.
--
-- التعارضات — فُحصت ولا شيء منها قائم:
--   • حارسا التجميد (053 · 073) يرفعان استثناءً على أيّ تعديل حين
--     تكون الخطة مجمّدة، ولا يقارنان حقلاً بحقل — فختم التوقيت لا
--     يُثير حارساً.
--   • لا مُشغِّل تحديثٍ آخر على هذه الجداول الأربعة.
--
-- تنبيه لمن يكتب ترحيلاً لاحقاً: تصحيحٌ جماعيّ للبيانات سيختم
-- `updated_at` على كل صفّ يمسّه. فإن لزم ألّا يُختم:
--     ALTER TABLE <جدول> DISABLE TRIGGER <اسم المُشغِّل>;  … ثم ENABLE.
-- ════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  /* تحديثٌ لا يُغيّر شيئاً ليس حدثاً */
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $fn$;

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tasks', 'evidence', 'schools', 'profiles'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_set_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t || '_set_updated_at', t);
  END LOOP;
END $do$;

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- التحقّق — يُشغَّل بعد الترحيل
-- ════════════════════════════════════════════════════════════════
-- SELECT 'المُشغِّلات الأربعة قائمة' AS الفحص,
--        (SELECT count(*) FROM pg_trigger
--          WHERE NOT tgisinternal
--            AND tgname IN ('tasks_set_updated_at','evidence_set_updated_at',
--                           'schools_set_updated_at','profiles_set_updated_at'))::text AS الفعلي,
--        '4' AS المتوقع
-- UNION ALL
-- SELECT 'ومُشغِّل الخطط (082) باقٍ',
--        (SELECT count(*) FROM pg_trigger
--          WHERE tgname = 'plans_set_updated_at' AND NOT tgisinternal)::text, '1'
-- UNION ALL
-- SELECT 'الدالّة واحدة لا تكرار',
--        (SELECT count(*) FROM pg_proc WHERE proname = 'set_updated_at')::text, '1';

-- اختبارٌ يتراجع عن نفسه:
-- BEGIN;
--   UPDATE schools SET name_ar = name_ar WHERE id = (SELECT id FROM schools LIMIT 1);
--   -- لا يتغيّر شيء ⇒ التوقيت لا يتحرّك (حارس NEW IS NOT DISTINCT FROM OLD)
--   UPDATE schools SET phone = COALESCE(phone,'') || ' ' WHERE id = (SELECT id FROM schools LIMIT 1);
--   SELECT name_ar, created_at, updated_at FROM schools WHERE id = (SELECT id FROM schools LIMIT 1);
-- ROLLBACK;

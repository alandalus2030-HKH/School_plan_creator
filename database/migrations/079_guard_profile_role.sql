-- ════════════════════════════════════════════════════════════════
-- 079: حارس دور المستخدم — لا يدخل القاعدةَ دورٌ لا وجود له
--
--   ── الداء ──
--   `profiles.role` نصٌّ حرّ بافتراض `'teacher'` (schema الأصلي)، ودورٌ
--   بهذا الاسم **أُزيل في الترحيل 055**. فكل مسار إدخال لا يُمرّر الدور
--   صراحةً يُنشئ حساباً بدورٍ معدوم: **بلا صلاحية واحدة**، ووسمُه في
--   الجدول يعرض الكود خاماً. ووقع ذلك في نموذج إضافة المستخدم ومنفذ
--   الدعوة معاً، ويقع في أيّ استيراد Excel لا يُطابق الأسماء.
--
--   ── العلاج: مفتاح أجنبيّ لا فحصٌ في الواجهة ──
--   الواجهة تُخطئ وتُنسى، والقاعدة لا تُنسى. و`roles.code` فريد والأدوار
--   عامّة (لا `school_id` لأيٍّ منها)، فالمفتاح الأجنبيّ يصحّ.
--   ON UPDATE CASCADE: تغيير كود دورٍ يتبعه مستخدموه.
--   ON DELETE RESTRICT: لا يُحذف دورٌ له مستخدمون — يُنقلون أولاً.
-- ════════════════════════════════════════════════════════════════

BEGIN;

/* (1) لا يُنفَّذ على بيانات فاسدة: يُوقَف الترحيل ويُسمّى الخلل */
DO $do$
DECLARE orphan int; samples text;
BEGIN
  SELECT count(*), string_agg(DISTINCT p.role, ' · ')
  INTO   orphan, samples
  FROM   profiles p
  WHERE  p.role IS NULL OR NOT EXISTS (SELECT 1 FROM roles r WHERE r.code = p.role);

  IF orphan > 0 THEN
    RAISE EXCEPTION
      'توقّف الترحيل: % حساباً بدورٍ لا وجود له (%). صحّح أدوارهم من صفحة المستخدمين ثم أعد التشغيل.',
      orphan, samples;
  END IF;
END $do$;

/* (2) الكود فريد — شرط المفتاح الأجنبيّ */
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'roles_code_unique' AND conrelid = 'roles'::regclass
  ) THEN
    ALTER TABLE roles ADD CONSTRAINT roles_code_unique UNIQUE (code);
  END IF;
END $do$;

/* (3) الحارس */
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_fk;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_fk
  FOREIGN KEY (role) REFERENCES roles(code)
  ON UPDATE CASCADE ON DELETE RESTRICT;

/* (4) الافتراض القديم 'teacher' يسقط — فدورٌ معدوم لا يصلح افتراضاً.
       والبديل `staff`: أقلّ الأدوار الحقيقية سلطةً. */
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'staff';

COMMENT ON COLUMN profiles.role IS
  'كود الدور — مقيَّد بمفتاح أجنبيّ إلى roles(code). الافتراض staff (أقلّ سلطةً).';

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- جدول التحقّق
-- ════════════════════════════════════════════════════════════════

WITH checks AS (
  SELECT 1 AS n, 'المفتاح الأجنبيّ على profiles.role' AS الفحص,
         (SELECT count(*)::text FROM pg_constraint
          WHERE conname = 'profiles_role_fk') AS النتيجة, '1' AS المتوقع
  UNION ALL SELECT 2, 'كود الدور فريد',
         (SELECT count(*)::text FROM pg_constraint WHERE conname = 'roles_code_unique'), '1'
  UNION ALL SELECT 3, 'الافتراض صار staff',
         (SELECT CASE WHEN column_default LIKE '%staff%' THEN 'نعم' ELSE 'لا — خلل' END
          FROM information_schema.columns
          WHERE table_name = 'profiles' AND column_name = 'role'), 'نعم'
  UNION ALL SELECT 4, 'حسابات بدورٍ لا وجود له',
         (SELECT count(*)::text FROM profiles p
          WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.code = p.role)), '0'
  UNION ALL SELECT 5, 'عدد الأدوار المعرَّفة',
         (SELECT count(*)::text FROM roles), '—'
)
SELECT n AS "#", الفحص, النتيجة, المتوقع,
       CASE WHEN المتوقع = '—' THEN '—'
            WHEN النتيجة = المتوقع THEN 'مطابق' ELSE 'خلل' END AS الحكم
FROM checks ORDER BY n;

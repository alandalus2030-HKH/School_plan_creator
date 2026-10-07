-- ════════════════════════════════════════════════════════════════
-- 082 · عمود «آخر تحديث» للخطط يُملأ في القاعدة
--
-- العلّة (رُصدت 2026-10-07): `plans.updated_at` لا يحرسه شيء — لا
-- مُشغِّلٌ في القاعدة ولا سطرٌ في الواجهة. فبقي عمودٌ اسمه «آخر
-- تحديث» يحمل تاريخ **الإنشاء** إلى الأبد. ظهر حين أُنقصت خطةٌ من
-- خمسة مستويات إلى أربعة فلم يتحرّك العمود.
--
-- والقاعدة التي نعمل بها: **ما لا يُشتقّ يُحرَس في القاعدة**. فتوقيت
-- التحديث ليس رأياً للواجهة تكتبه إن تذكّرت — إنما واقعةٌ تُسجّل حيث
-- تقع. ولذلك مُشغِّلٌ لا سطرٌ في كل شاشة: الشاشة تُنسى، والمُشغِّل لا.
--
-- والدالّة عامّة ليُعاد استعمالها لجداول أخرى عند الحاجة
-- (tasks · evidence · schools · profiles تحمل العمود نفسه، وتُعالَج
--  كلٌّ في وقتها لئلّا يتّسع أثر ترحيلٍ واحد).
--
-- ملاحظة: الواجهة تكتب `updated_at` يدوياً في أربعة مواضع من المهام
-- (منفذ المهمة · الانتقال · شاشتان) — والمُشغِّل هنا على `plans`
-- وحدها، فلا يتعارض معها.
-- ════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  /* لا يُغيَّر الصفّ إن لم يتغيّر شيء فعلاً: تحديثٌ بلا فرق لا يُعدّ حدثاً */
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $fn$;

COMMENT ON FUNCTION set_updated_at IS
  'يملأ updated_at عند كل تعديل فعليّ — دالّة عامّة تُعلَّق على ما يحتاجها';

DROP TRIGGER IF EXISTS plans_set_updated_at ON plans;
CREATE TRIGGER plans_set_updated_at
  BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- التحقّق — يُشغَّل بعد الترحيل
-- ════════════════════════════════════════════════════════════════
-- SELECT 'المُشغِّل قائم' AS الفحص,
--        (SELECT count(*) FROM pg_trigger
--          WHERE tgname = 'plans_set_updated_at' AND NOT tgisinternal)::text AS الفعلي, '1' AS المتوقع
-- UNION ALL
-- SELECT 'الدالّة قائمة',
--        (SELECT count(*) FROM pg_proc WHERE proname = 'set_updated_at')::text, '1'
-- UNION ALL
-- SELECT 'خطط «آخر تحديث» فيها = الإنشاء (أثر العلّة القديمة)',
--        (SELECT count(*) FROM plans WHERE updated_at = created_at)::text, NULL;

-- اختبارٌ يتراجع عن نفسه — يُثبت عمل المُشغِّل بلا أثر:
-- BEGIN;
--   UPDATE plans SET name_ar = name_ar || ' ' WHERE id = '<معرّف خطة>';
--   SELECT updated_at FROM plans WHERE id = '<معرّف خطة>';   -- يجب أن يكون الآن
-- ROLLBACK;

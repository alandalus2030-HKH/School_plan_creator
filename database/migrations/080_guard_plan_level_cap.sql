-- ════════════════════════════════════════════════════════════════
-- 080 · سقف عمق الخطة: أربعة مستويات
--
-- القرار (2026-10-07): تُبنى الخطط حتى أربعة مستويات، ويبقى
-- الاختيار بين اثنين وثلاثة وأربعة. **سقفٌ لا قفل.**
--
-- العلّة: المهمّة لا تُعلَّق إلا على العقدة الأعمق، فكلّ مستوىً
-- زائد يُجبر كلّ فرعٍ على عمقه — وقد ظهر أثره حين عُمِّقت خطةٌ بعد
-- إنشائها فغابت مهامّ المستوى الرابع عن شاشة البناء (موجودةً في
-- القاعدة وفي «كل المهام»، مخفيّةً هناك وحدها). والمستوى الخامس
-- لم يكن يضيف إسناداً: الهدف المستمدّ من مؤشّر الإطار يُسنِد إلى
-- المؤشّر (284) وهو في المستوى الرابع نفسه.
--
-- وقوالب الوثيقة §4.1 كلّها أربعةٌ فأقلّ: الاستراتيجية مستويان ·
-- التشغيلية ثلاثة · التحسين أربعة · الأقسام واللجان ثلاثة. و«العمق
-- المتغيّر لكل فرع» (§1) مؤجَّلٌ لا منقوض.
--
-- ⚠ الحارس يمنع **الإدخال والتحديث** فوق الأربعة، و**لا يمسّ
--   الصفوف القائمة**: خطّةٌ أُنشئت بخمسة تبقى تعمل، ولا يُعاد
--   كتابة بياناتها. ولو حُرّرت لاحقاً لزمها النزول إلى أربعة —
--   وحارس 078 يمنع النزول دون أعمق عقدة فيها.
--
-- متطلّب: 078 (حارس إنقاص العمق).
-- ════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION trg_guard_plan_level_cap() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_cap int := 4;
BEGIN
  IF NEW.level_count IS NULL THEN RETURN NEW; END IF;

  /* التحديث: لا يُعترض إلّا على **زيادةٍ** فوق السقف. فصفٌّ قديم
     بخمسة يُحرَّر اسمه أو عامه بلا اعتراض ما دام العدد لم يرتفع. */
  IF TG_OP = 'UPDATE' AND NEW.level_count <= COALESCE(OLD.level_count, NEW.level_count) THEN
    RETURN NEW;
  END IF;

  IF NEW.level_count > v_cap THEN
    RAISE EXCEPTION
      'سقف عمق الخطة % مستويات — وقد طُلب %. والعمق المتغيّر لكل فرع مؤجَّل حتى تُبنى قوالب الخطط.',
      v_cap, NEW.level_count
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.level_count < 2 THEN
    RAISE EXCEPTION 'أقلّ عمقٍ للخطة مستويان — وقد طُلب %.', NEW.level_count
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS guard_plan_level_cap ON plans;
CREATE TRIGGER guard_plan_level_cap
  BEFORE INSERT OR UPDATE OF level_count ON plans
  FOR EACH ROW EXECUTE FUNCTION trg_guard_plan_level_cap();

COMMENT ON FUNCTION trg_guard_plan_level_cap IS
  'سقف عمق الخطة أربعة مستويات (قرار 2026-10-07) — لا يمسّ الصفوف القائمة';

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- التحقّق — يُشغَّل بعد الترحيل
-- ════════════════════════════════════════════════════════════════
-- SELECT 'الحارس قائم' AS t,
--        (SELECT count(*) FROM pg_trigger
--          WHERE tgname = 'guard_plan_level_cap' AND NOT tgisinternal) AS actual, 1 AS expected
-- UNION ALL
-- SELECT 'خطط فوق السقف (تبقى تعمل)',
--        (SELECT count(*) FROM plans WHERE level_count > 4), NULL;

-- ════════════════════════════════════════════════════════════════
-- 081 · إصلاح حارس العمق: لا يَعُدّ المحذوف ناعماً
--
-- العلّة (خطأ في 078): الحارس كان يقرأ
--     FROM plan_nodes WHERE plan_id = NEW.id
-- بلا `deleted_at IS NULL`. والحذف في هذا النظام **ناعم** — فالعقدة
-- المحذوفة تبقى صفّاً في الجدول، وسياسة القراءة (028) تُخفيها عن
-- المستخدم بينما يراها الحارس حيّة.
--
-- فينغلق الطوق: يقول الحارس «احذف العقد الأعمق من شاشة البناء أولاً»،
-- والمستخدم قد حذفها، **ولا سبيل إلى إرضائه أبداً**. وقع ذلك فعلاً
-- في 2026-10-07: حُذفت عقدة المستوى الخامس، ورُفض إنقاص الخطة إلى
-- أربعة ستّ مرّات متتالية.
--
-- والإصلاح شرطٌ واحد في موضعين (الأقصى والعدّ).
--
-- متطلّب: 078.
-- ════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION trg_guard_plan_level_count() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_depth int;
  v_nodes int;
BEGIN
  IF NEW.level_count IS NULL OR NEW.level_count >= COALESCE(OLD.level_count, 0) THEN
    RETURN NEW;                       -- زيادة أو بلا تغيير
  END IF;

  /* العقد الحيّة وحدها: الحذف ناعم، والمحذوف لا يُحرَس به */
  SELECT COALESCE(max(level_num), 0), count(*)
  INTO   v_depth, v_nodes
  FROM   plan_nodes
  WHERE  plan_id = NEW.id
    AND  deleted_at IS NULL;

  IF v_nodes = 0 THEN RETURN NEW; END IF;   -- خطة لم تُبنَ بعد

  IF NEW.level_count < v_depth THEN
    RAISE EXCEPTION
      'في الخطة عقدٌ في المستوى %. إنقاص عدد المستويات إلى % يُخفيها وما تحتها من مهامّ وأدلة — احذف العقد الأعمق من شاشة البناء أولاً.',
      v_depth, NEW.level_count
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $fn$;

COMMENT ON FUNCTION trg_guard_plan_level_count IS
  'حارس إنقاص عمق الخطة (078) — يَعُدّ العقد الحيّة وحدها بعد إصلاح 081';

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- التحقّق — يُشغَّل بعد الترحيل
-- ════════════════════════════════════════════════════════════════
-- SELECT 'الشرط دخل الدالّة' AS الفحص,
--        (SELECT count(*) FROM pg_proc
--          WHERE proname = 'trg_guard_plan_level_count'
--            AND prosrc LIKE '%deleted_at IS NULL%')::text AS الفعلي, '1' AS المتوقع
-- UNION ALL
-- SELECT 'الحارس ما يزال معلَّقاً',
--        (SELECT count(*) FROM pg_trigger
--          WHERE tgname = 'guard_plan_level_count' AND NOT tgisinternal)::text, '1'
-- UNION ALL
-- SELECT 'أعمق عقدة حيّة في الخطة التجريبية',
--        (SELECT COALESCE(max(level_num), 0) FROM plan_nodes
--          WHERE plan_id = '51ba69d4-d10c-4660-b0cc-99e387329bd2'
--            AND deleted_at IS NULL)::text, '4';

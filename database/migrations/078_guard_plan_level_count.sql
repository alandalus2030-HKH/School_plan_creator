-- ════════════════════════════════════════════════════════════════
-- 078: حارس عمق الخطة — لا ينزل level_count دون أعمق عقدة قائمة
--
--   ── المشكلة ──
--   `plans.level_count` ليس وصفاً بل **حدّ عرض**: شاشة البناء ترسم
--   الأعمدة بحلقةٍ تقف عنده. فإنقاصه على خطةٍ مبنيّة لا يحذف شيئاً —
--   **بل يُخفي العقد الأعمق وما تحتها من مهامّ وأدلة**، وهي تبقى تعمل:
--   تُحتسب في النِسب، ومستخدمون مكلَّفون بها، ولا تجدها في الشجرة.
--   وخسارةٌ صامتةٌ أخطر من خسارةٍ تُعلن.
--
--   وتقليصُه يطال **المستوى الأعمق دائماً** — وهو مستوى «الهدف»، وهو
--   وحده حامل المهام (المهمّة لا تُعلَّق إلا على العقدة الأعمق).
--
--   ── لماذا في القاعدة لا في النموذج وحده ──
--   الخطط تُحدَّث **من المتصفّح مباشرةً** عبر RLS، فأيّ فحصٍ في النموذج
--   يتجاوزه من فتح أدوات المطوّر. والحراسة ثلاث طبقات، وهذه الثالثة.
--
--   ── ما يبقى مسموحاً ──
--   • تعديل الأسماء (`level_names`) — دائماً، فهي عناوين أعمدة.
--   • زيادة العدد — دائماً، تُضيف عموداً فارغاً.
--   • إنقاصه إلى حدّ أعمق عقدة — ومن أراد أبعد، حذف العقد أولاً من
--     شاشة البناء، فيصير الحذف فعلاً صريحاً يُرى ويُوافَق عليه.
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

  SELECT COALESCE(max(level_num), 0), count(*)
  INTO   v_depth, v_nodes
  FROM   plan_nodes WHERE plan_id = NEW.id;

  IF v_nodes = 0 THEN RETURN NEW; END IF;   -- خطة لم تُبنَ بعد

  IF NEW.level_count < v_depth THEN
    RAISE EXCEPTION
      'في الخطة عقدٌ في المستوى %. إنقاص عدد المستويات إلى % يُخفيها وما تحتها من مهامّ وأدلة — احذف العقد الأعمق من شاشة البناء أولاً.',
      v_depth, NEW.level_count
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS guard_plan_level_count ON plans;
CREATE TRIGGER guard_plan_level_count BEFORE UPDATE OF level_count ON plans
  FOR EACH ROW EXECUTE FUNCTION trg_guard_plan_level_count();

COMMENT ON FUNCTION trg_guard_plan_level_count IS
  'لا ينزل plans.level_count دون أعمق plan_nodes.level_num — فالإنقاص يُخفي ولا يحذف.';

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- جدول التحقّق
-- ════════════════════════════════════════════════════════════════

WITH checks AS (
  SELECT 1 AS n, 'المُشغّل مربوط بـplans' AS الفحص,
         (SELECT count(*)::text FROM pg_trigger
          WHERE tgname = 'guard_plan_level_count' AND NOT tgisinternal) AS النتيجة, '1' AS المتوقع
  UNION ALL SELECT 2, 'خطط عدد مستوياتها أقلّ من أعمق عقدة (خلل قائم قبل الحارس)',
         (SELECT count(*)::text FROM plans p
          WHERE p.level_count < (SELECT COALESCE(max(n.level_num), 0)
                                 FROM plan_nodes n WHERE n.plan_id = p.id)), '0'
)
SELECT n AS "#", الفحص, النتيجة, المتوقع,
       CASE WHEN النتيجة = المتوقع THEN 'مطابق' ELSE 'خلل' END AS الحكم
FROM checks ORDER BY n;

-- ════ خريطة العمق لكل خطة (للعين) ════
-- SELECT p.name_ar AS الخطة, p.level_count AS "المستويات المعلنة",
--        COALESCE(max(n.level_num), 0) AS "أعمق عقدة",
--        count(DISTINCT t.id) AS المهام
-- FROM plans p
-- LEFT JOIN plan_nodes n ON n.plan_id = p.id
-- LEFT JOIN tasks t ON t.node_id = n.id
-- GROUP BY p.id, p.name_ar, p.level_count ORDER BY p.name_ar;

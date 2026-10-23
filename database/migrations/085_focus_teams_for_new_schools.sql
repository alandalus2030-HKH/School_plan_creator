-- ════════════════════════════════════════════════════════════════
-- 085 · فرق التركيز لكل مدرسة — بذرةٌ تلحق، ومُشغِّلٌ يَلحق بما يأتي
--
-- ⚠ تصحيحٌ لاحق (2026-10-23): **التشخيص الذي وُلد منه هذا الترحيل كان
--    خاطئاً، وشقُّ اللحاق أدناه لم يُدرج صفّاً واحداً.**
--    قرأتُ يوم كتابته أن مدرسة الرازي بلا فرق، والحقيقة أن فرقها
--    أُنشئت 2026-10-08 وأعضاءها أُسندوا 10-09 (يشهد به
--    `focus_teams.created_at` و`focus_team_members.added_at`).
--    والشاشة الفارغة التي رُصدت يومها سببها أن الصفحة ومنفذها رُفعا
--    قبل دقائق، فسبقت الفتحةُ اكتمالَ النشر فعاد الطلب بلا بيانات.
--    **ويبقى المُشغِّل أدناه نافعاً وصحيحاً** — فالبذرة الأصلية (074)
--    تمرّ مرّةً ولا تُطعم ما يأتي بعدها، والمُشغِّل يسدّ ذلك لكل
--    مدرسة تُنشأ مستقبلاً. والدرس في CLAUDE.md: ما يُبنى عليه قرار
--    يُقرأ مرّتين بشكلين، وإن خالف الرقمُ ما يراه المستخدم على شاشته
--    فالشاشة أصدق.
--
-- العلّة كما رُصدت وقتها (وهي غير دقيقة — انظر التصحيح أعلاه): بذرة
-- 074 بذرت الفرق الخمسة **للمدارس القائمة يوم شُغّلت** (30 سبتمبر)،
-- ومدرسةٌ أُنشئت بعدها فُتحت لها شاشة فرق التركيز **فارغة**.
--
-- وهي من أسرةٍ معروفة عندنا: **بذرةٌ تمرّ مرّةً ولا حارس يُطعم ما يأتي
-- بعدها**. فالعلاج شقّان لا شقّ واحد:
--   (1) لحاقٌ بما مضى — لكل مدرسة ينقصها شيء.
--   (2) مُشغِّل على `schools` يبذرها **لحظة الإنشاء** — فلا تتكرّر
--       العلّة ولو أُنشئت عشرون مدرسة، ولا يحتاج مسارُ الإنشاء في
--       الكود أن يتذكّر شيئاً.
--
-- والفرق تُربط بـ`standard_code` ('1'..'5') لا بمعرّف عقدة — فالعقد
-- تتبدّل بين إصدارات الإطار والرموز لا تتبدّل (074).
--
-- متطلّب: 074.
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ── (1) اللحاق: الفرق الناقصة لكل مدرسة ──────────────────────────
INSERT INTO focus_teams (school_id, standard_code, name_ar, sort_order)
SELECT s.id, fn.code, fn.name_ar, fn.code::int
FROM   schools s
CROSS JOIN (
  SELECT fn.code, fn.name_ar
  FROM   framework_nodes fn
  JOIN   frameworks f ON f.id = fn.framework_id
  WHERE  f.status = 'active' AND fn.level = 1
) fn
ON CONFLICT (school_id, standard_code) DO NOTHING;

-- ── (2) المُشغِّل: كل مدرسة جديدة تولد بفرقها ────────────────────
CREATE OR REPLACE FUNCTION trg_seed_focus_teams() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  INSERT INTO focus_teams (school_id, standard_code, name_ar, sort_order)
  SELECT NEW.id, fn.code, fn.name_ar, fn.code::int
  FROM (
    SELECT fn.code, fn.name_ar
    FROM   framework_nodes fn
    JOIN   frameworks f ON f.id = fn.framework_id
    WHERE  f.status = 'active' AND fn.level = 1
  ) fn
  ON CONFLICT (school_id, standard_code) DO NOTHING;
  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS seed_focus_teams ON schools;
CREATE TRIGGER seed_focus_teams
  AFTER INSERT ON schools
  FOR EACH ROW EXECUTE FUNCTION trg_seed_focus_teams();

COMMENT ON FUNCTION trg_seed_focus_teams IS
  'كل مدرسة جديدة تولد بفرق تركيزها الخمسة — علاج بذرة 074 التي مرّت مرّةً (085)';

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- التحقّق — يُشغَّل بعد الترحيل
-- ════════════════════════════════════════════════════════════════
-- SELECT 'مدارس بلا فرق' AS الفحص,
--        (SELECT count(*) FROM schools s
--          WHERE NOT EXISTS (SELECT 1 FROM focus_teams t WHERE t.school_id = s.id))::text AS الفعلي,
--        '0' AS المتوقع
-- UNION ALL SELECT 'المُشغِّل قائم',
--        (SELECT count(*) FROM pg_trigger
--          WHERE tgname = 'seed_focus_teams' AND NOT tgisinternal)::text, '1'
-- UNION ALL SELECT 'فرقٌ لكل مدرسة (المدارس × 5)',
--        (SELECT count(*) FROM focus_teams)::text,
--        (SELECT (count(*) * 5)::text FROM schools);

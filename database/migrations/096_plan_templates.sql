-- ════════════════════════════════════════════════════════════════
-- 096 · قوالب الخطط — مسمّيات المستويات وسياسة الإسناد (الوثيقة 4.1)
--
-- ── النصّ ──
-- «مسمّيات المستويات تختلف بين المدارس، **والمرونة مطلب**. فالقالب
--  يحمل ثلاثة أشياء: **مسمّيات مستوياته · سياسة عمقه (ثابت أو متغيّر)
--  · سياسة إسناده (إجباري · اختياري · بلا)**» (4.1).
--
-- وهذا الجدول يحلّ محلّ `LEVEL_PRESETS` في `src/lib/planLevels.ts` —
-- وهو يصف نفسه هناك بأنه **انتقاليّ** حتى تُبنى القوالب.
--
-- ── ولماذا مستوى الإطار عمودٌ لا مطابقةُ اسم ──
-- كان `frameworkLevelOf` يستنتج مستوى الإطار **بمطابقة اسم المستوى**
-- بـ«المعيار الرئيس»/«الجانب»/«المعيار الفرعي» حرفياً. فمدرسةٌ تسمّي
-- مستواها «مجالات التحسين» — وهو اسم الوثيقة نفسه لقالب التحسين —
-- **يُطفأ عندها منتقي الإطار صامتاً**. فصار التقابل **مُعلَناً** في
-- `framework_levels`: لكل مستوىً مستواه من الإطار أو NULL لمستوىً حرّ.
--
-- ── وسياسة العمق: ثابتٌ وحده اليوم ──
-- «سقف العمق: أربعة مستويات (قرار 7 أكتوبر 2026)… **سقفٌ لا قفل**»،
-- و«**العمق المتغيّر لكل فرع مؤجَّلٌ لا منقوض**: محلّه الطبيعيّ المهامّ
-- الدورية لا أعماق الخطط» (4.1). فالعمود قائم وقيدُه يقبل «ثابتاً»
-- وحده — حارسٌ **يقول لماذا** بدل صمتٍ يُنسي القرار.
--
-- ── والقالب يُنسَخ إلى الخطة عند إنشائها ولا يُقرأ منه بعدها ──
-- وإلّا تبدّل هيكلُ خطّةٍ قيد البناء لأن أحداً عدّل القالب في
-- الإعدادات. فالقالب **مصدرٌ عند الميلاد**، و`plans.template_id`
-- نسبٌ لا ارتباطٌ حيّ.
--
-- متطلّبات: 080 (حارس سقف العمق) · 078 (حارس خفض العمق).
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ── (1) الجدول ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE
                DEFAULT my_school_id(),
  code          TEXT,                       -- نسبُ القالب المبذور، وNULL لما تُنشئه المدرسة
  name_ar       TEXT NOT NULL,

  -- مسمّيات المستويات: اثنان إلى أربعة — «سقفٌ لا قفل» (4.1)
  level_names   TEXT[] NOT NULL,
  -- تقابلُ كل مستوىً مع الإطار — NULL لمستوىً حرّ
  framework_levels INT[] NOT NULL DEFAULT '{}',

  -- سياسة الإسناد (4.1)
  anchor_policy TEXT NOT NULL DEFAULT 'optional'
                CHECK (anchor_policy IN ('required','optional','none')),
  anchor_level  INT,                        -- أيّ مستوىً يُسنَد — NULL مع «بلا»

  -- سياسة العمق: «ثابت أو متغيّر» (4.1) — والمتغيّر مؤجَّل لا منقوض
  depth_policy  TEXT NOT NULL DEFAULT 'fixed'
                CHECK (depth_policy = 'fixed'),

  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    INT NOT NULL DEFAULT 0,
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ,

  CONSTRAINT plan_templates_depth
    CHECK (array_length(level_names, 1) BETWEEN 2 AND 4),
  CONSTRAINT plan_templates_fw_len
    CHECK (array_length(framework_levels, 1) IS NULL
        OR array_length(framework_levels, 1) = array_length(level_names, 1)),
  -- «بلا إسناد» ⇔ لا مستوى إسناد: شرطٌ في الاتجاهين فلا تبقى قيمةٌ يتيمة
  CONSTRAINT plan_templates_anchor_level
    CHECK ((anchor_policy = 'none') = (anchor_level IS NULL)),
  CONSTRAINT plan_templates_anchor_range
    CHECK (anchor_level IS NULL
        OR anchor_level BETWEEN 1 AND array_length(level_names, 1))
);

CREATE UNIQUE INDEX IF NOT EXISTS plan_templates_name_unique
  ON plan_templates (school_id, name_ar) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_plan_templates_school
  ON plan_templates (school_id, is_active) WHERE deleted_at IS NULL;

COMMENT ON TABLE plan_templates IS
  'قالب خطة: مسمّيات مستوياته · تقابلها مع الإطار · سياسة إسناده (4.1)';
COMMENT ON COLUMN plan_templates.framework_levels IS
  'مستوى الإطار المقابل لكل مستوىً — مُعلَنٌ لا مُستنتَجٌ من الاسم (NULL = مستوىً حرّ)';
COMMENT ON COLUMN plan_templates.depth_policy IS
  'ثابتٌ وحده اليوم — «والعمق المتغيّر مؤجَّلٌ لا منقوض» (4.1)';

-- ── (2) نسبُ الخطة إلى قالبها، وما نُسخ منه ─────────────────────
-- يُنسَخ عند الميلاد ولا يُقرأ من القالب بعده — فلا يتبدّل هيكلُ خطّةٍ
-- قيد البناء لأن أحداً عدّل القالب.
ALTER TABLE plans ADD COLUMN IF NOT EXISTS template_id UUID
  REFERENCES plan_templates(id) ON DELETE SET NULL;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS framework_levels INT[] NOT NULL DEFAULT '{}';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS anchor_policy TEXT NOT NULL DEFAULT 'optional'
  CHECK (anchor_policy IN ('required','optional','none'));
ALTER TABLE plans ADD COLUMN IF NOT EXISTS anchor_level INT;

COMMENT ON COLUMN plans.template_id IS
  'القالب الذي وُلدت منه — نسبٌ لا ارتباطٌ حيّ (4.1)';
COMMENT ON COLUMN plans.framework_levels IS
  'منسوخٌ من القالب — وفارغٌ في الخطط التي سبقت 096، فتُقرأ بمطابقة الاسم كما كانت';

-- ── (3) بذرةُ أنواع الوثيقة الخمسة لكل مدرسة ────────────────────
-- «جداول تشغيل: مهام · مسؤول · استحقاق · تحقّق» — وثلاثتها الأخيرة
-- **حقولُ مهمّةٍ قائمة** في `tasks` لا مستوياتُ هرم، فلم يبقَ منها
-- للهرم إلا المهامّ وحاويها. وهو أقلُّ القوالب يقيناً — وموضعُه
-- شاشةُ القوالب لتُصحّحه المدرسة بمفرداتها.
INSERT INTO plan_templates
  (school_id, code, name_ar, level_names, framework_levels,
   anchor_policy, anchor_level, sort_order)
SELECT s.id, v.code, v.nm, v.lv, v.fw, v.pol, v.al, v.ord
FROM schools s
CROSS JOIN (VALUES
  ('strategic',   'خطة استراتيجية (خمس سنوات)',
     ARRAY['هدف استراتيجي','هدف عام'],                        ARRAY[0,0],
     'optional', 2, 1),
  ('operational', 'خطة تشغيلية سنوية',
     ARRAY['هدف عام','هدف تشغيلي'],                           ARRAY[0,0],
     'optional', 1, 2),
  ('improvement', 'خطة تحسين',
     ARRAY['المعيار الرئيس','الجانب','مجالات التحسين','إجراءات'],
     ARRAY[1,2,3,0],
     'required', 3, 3),
  ('department',  'خطة قسمٍ أو لجنة',
     ARRAY['هدف عام','هدف تشغيلي','إجراءات'],                  ARRAY[0,0,0],
     'optional', 1, 4),
  ('schedule',    'جدول تشغيل',
     ARRAY['مجال العمل','مهمّة تشغيلية'],                      ARRAY[0,0],
     'none', NULL, 5)
) AS v(code, nm, lv, fw, pol, al, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM plan_templates t
   WHERE t.school_id = s.id AND t.name_ar = v.nm AND t.deleted_at IS NULL
);

-- `framework_levels` يُخزَّن بالأصفار بدل NULL داخل المصفوفة (فمصفوفة
-- INT[] تقبل NULL لكن قراءتها في الواجهة أوضح بصفر = مستوىً حرّ).

-- ── (4) العزل ───────────────────────────────────────────────────
ALTER TABLE plan_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plan_templates_select ON plan_templates;
CREATE POLICY plan_templates_select ON plan_templates
  FOR SELECT USING (school_id = my_school_id());

-- ── (5) ختمُ التعديل ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_plan_templates_touch() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END; $fn$;

DROP TRIGGER IF EXISTS plan_templates_touch ON plan_templates;
CREATE TRIGGER plan_templates_touch BEFORE UPDATE ON plan_templates
  FOR EACH ROW EXECUTE FUNCTION trg_plan_templates_touch();

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- التحقّق — انسخه وحده في محرّر SQL بعد تشغيل الترحيل
-- ════════════════════════════════════════════════════════════════
-- SELECT 'قوالبُ كل مدرسة' AS الفحص,
--        (SELECT count(*)::text FROM plan_templates WHERE deleted_at IS NULL) AS الفعلي,
--        '5 × عدد المدارس' AS المتوقع
-- UNION ALL SELECT 'وعدد المدارس', (SELECT count(*)::text FROM schools), 'للمقارنة'
-- UNION ALL SELECT 'ولا قالبَ يتجاوز أربعة مستويات',
--        (SELECT count(*)::text FROM plan_templates
--          WHERE array_length(level_names,1) > 4), '0'
-- UNION ALL SELECT 'وخطةُ التحسين وحدها إسنادها إجباريّ',
--        (SELECT count(DISTINCT code)::text FROM plan_templates
--          WHERE anchor_policy = 'required'), '1'
-- UNION ALL SELECT 'وتقابلُ الإطار مُعلَن في قالب التحسين',
--        (SELECT framework_levels::text FROM plan_templates
--          WHERE code = 'improvement' LIMIT 1), '{1,2,3,0}'
-- UNION ALL SELECT 'وأعمدةُ الخطة الجديدة',
--        (SELECT count(*)::text FROM information_schema.columns
--          WHERE table_name = 'plans'
--            AND column_name IN ('template_id','framework_levels','anchor_policy','anchor_level')),
--        '4'
-- UNION ALL SELECT 'والخطط القائمة لم تتبدّل',
--        (SELECT count(*)::text FROM plans WHERE template_id IS NOT NULL), '0';

-- ════════════════════════════════════════════════════════════════
-- 093 · المهامّ الدورية — الممارسة المؤسسية لا المشروع
--
-- المرجع: الوثيقة 5 (المهام الدورية) · 5.1 (كيف تعمل) · 5.2 (التوابع
-- وعلاجاتها) · 5.3 (ثلاث حالات في التغطية) · 3.8 (سياسة نسبة العام)
-- · 14‑ب (نموذج البيانات).
--
-- ── لماذا كيانٌ ثالث غير المهمّة والدليل ──
-- «أكثر ما يشهد لمؤشرات الإطار **ليس مشاريع تبدأ وتنتهي، بل ممارسات
--  مؤسسية مستمرّة**: اجتماع مجلس الأمناء الفصلي · تحليل نتائج
--  التقييمات بعد كل فصل… تتكرّر بانتظام، وتُنتج أدلّتها في كل دورة،
--  وتخدم المؤشرات نفسها كل مرّة.»
-- «تُسنَد مرّةً وتُثمر سنوات… فترث ثمانية عشر دليلاً عبر ستّ سنوات
--  إسنادها — بلا تكرار ولا اجتهاد من الرافع.»
--
-- ── وثلاثةُ توابع تمسّ ما هو قائم، وعلاجها في بنية الجداول لا في كود ──
--
-- (1) **فساد نسبة إنجاز الخطة** — «الأخطر»: «المهمة الدورية لا تنتهي
--     أبداً، فتبقى الخطة دون 100٪ إلى الأبد — أو «تكتمل» بإغلاق دورة
--     واحدة». والعلاج: «**لا تُحتسب في نسبة إنجاز الخطة**».
--     وهو هنا **بنيويّ لا شرطيّ**: الدورات ليست صفوفاً في `tasks`،
--     فلا يراها أيُّ حسابٍ للإنجاز أصلاً — ولا يلزم استثناءٌ في كل
--     استعلام يُنسى في واحد منها.
--
-- (2) **التجميد يوقف الممارسة**: «مُشغّل التجميد يمنع التعديل على عقد
--     الخطة المجمّدة، فتتوقّف دورات المهمة **وهي مستمرّة في الواقع**».
--     والعلاج: «الدورات تعيش في **جدول مستقلّ تملكه المهمة الدورية**،
--     والخطة **تشير إليه ولا تحتويه** — وهو المبدأ الحاكم نفسه» (§1).
--     فـ`recurring_task_cycles` **بلا مفتاحٍ إلى الخطط**، و`plan_node_recurring`
--     إشارةٌ محضة: حذفها لا يمسّ دورةً واحدة.
--
-- (3) **موت المهمة بمغادرة صاحبها**: «الممارسة مؤسسية، وإسنادها لشخصٍ
--     بعينه يقتلها عند رحيله». والعلاج: «تُسنَد إلى **منصب أو قسم**».
--     فلا عمود لشخصٍ في هذا الجدول **أصلاً** — لا عموداً يُترك فارغاً،
--     بل غياباً يمنع الخطأ.
--
-- ── والامتثال الشكليّ: ثلاث حالات لا اثنتان (5.3) ──
--   دورة نُفِّذت ووُثِّقت        → سليمة
--   دورة لم تُنفَّذ **بمبرّر مسجَّل** → مقبولة، والمبرّر يقرؤه المقيّم
--   دورة مطلوبة **أُهملت**       → خلل، **وهذه وحدها تُعدّ فجوة**
-- «فالطلب الآليّ يضغط لرفع «أيّ شيء» ليُغلق ⇒ مخزن يمتلئ بأدلة بلا
--  قيمة» — فجعلُ «لم تُنفَّذ» إجابةً **مشروعة** هو ما يحمي المخزن.
--
-- متطلّبات: 073 · 084 · 088 · 090 (طابور «أدلة مطلوبة» مصبُّ الدورات).
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ── (1) التعريف — يُكتب مرّةً في الإعدادات ──────────────────────
CREATE TABLE IF NOT EXISTS recurring_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE
                DEFAULT my_school_id(),
  name_ar       TEXT NOT NULL,
  description   TEXT,

  -- «الدورية (أسبوعية · فصلية · سنوية)» — والشهرية مذكورة في 5.2
  frequency     TEXT NOT NULL CHECK (frequency IN ('weekly','monthly','termly','annual')),

  -- «المُسنَد إليه **منصباً أو قسماً لا شخصاً**» (5.1 · 5.2)
  assigned_department TEXT,
  assigned_job_title  TEXT,
  CONSTRAINT recurring_assignee_required
    CHECK (assigned_department IS NOT NULL OR assigned_job_title IS NOT NULL),

  expected_evidence_type TEXT,          -- «نوع الدليل المتوقَّع»

  -- «سياسة نسبة العام (المنصرم / القادم / بالتاريخ)» (3.8 · 14‑ب)
  year_policy   TEXT NOT NULL DEFAULT 'by_date'
                CHECK (year_policy IN ('previous','next','by_date')),

  -- كم يوماً قبل الاستحقاق يُفتح الطلب — فالدورة تُطلب قبل موعدها لا بعده
  lead_days     INT NOT NULL DEFAULT 7 CHECK (lead_days BETWEEN 0 AND 120),

  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  starts_on     DATE,
  ends_on       DATE,
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_recurring_school
  ON recurring_tasks (school_id, is_active) WHERE deleted_at IS NULL;

COMMENT ON TABLE recurring_tasks IS
  'ممارسة مؤسسية متكرّرة تُسنَد مرّةً وتُثمر سنوات — نظيرُ «الضوابط» بلفظ المدرسة (5)';
COMMENT ON COLUMN recurring_tasks.assigned_job_title IS
  'منصبٌ لا شخص: «إسنادها لشخصٍ بعينه يقتلها عند رحيله» (5.2)';
COMMENT ON COLUMN recurring_tasks.year_policy IS
  'نسبة عام الدورة: المنصرم · القادم · بتاريخ الاستحقاق — «العام المنسوب حكمٌ لا تاريخ» (3.8)';

-- ── (2) مراسيها في الإطار — تُسنَد مرّةً فترثها كل أدلّتها ───────
CREATE TABLE IF NOT EXISTS recurring_task_anchors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_task_id UUID NOT NULL REFERENCES recurring_tasks(id) ON DELETE CASCADE,
  framework_node_id UUID NOT NULL REFERENCES framework_nodes(id) ON DELETE RESTRICT,
  -- مخصوصة على مؤشّر · ضمنية على معيار فرعي كامل (3.3)
  kind          TEXT NOT NULL DEFAULT 'specific' CHECK (kind IN ('specific','implicit')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (recurring_task_id, framework_node_id)
);

CREATE INDEX IF NOT EXISTS idx_recurring_anchors_node
  ON recurring_task_anchors (framework_node_id);

COMMENT ON TABLE recurring_task_anchors IS
  'المرساة تُكتب مرّةً في التعريف — «أوّل ما يمرّ على جدول التحويل عند تفعيل إصدار جديد» (5.2)';

-- ── (3) الدورات — **جدولٌ تملكه المهمّة لا الخطة** ──────────────
-- ولاحظ: **لا مفتاح إلى `plans` ولا إلى `plan_nodes` هنا**. وهذا
-- الغياب هو العلاج، لا سهوٌ: «الدورات تعيش في جدول مستقلّ تملكه
-- المهمة الدورية، والخطة تشير إليه ولا تحتويه» (5.2).
CREATE TABLE IF NOT EXISTS recurring_task_cycles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_task_id UUID NOT NULL REFERENCES recurring_tasks(id) ON DELETE CASCADE,
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,

  period_label  TEXT NOT NULL,          -- «أكتوبر 2026» · «الفصل الأول 2026-2027»
  period_start  DATE,
  due_date      DATE NOT NULL,
  -- العام المنسوب يُحسب بالسياسة **عند الفتح** ويُثبَّت، فهو حكمٌ لا اشتقاق (3.8)
  academic_year TEXT NOT NULL,

  -- ثلاث حالات في التغطية لا اثنتان (5.3) — و`open` طورُ الانتظار لا حكم
  status        TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','documented','skipped','neglected')),
  -- «لم تُنفَّذ هذه الدورة — والسبب…» إجابةٌ **مشروعة تُسجَّل**
  justification TEXT,
  evidence_id   UUID REFERENCES evidence(id) ON DELETE SET NULL,
  -- ومصبُّها طابور «أدلة مطلوبة» (م1‑10) لا محرّكٌ ثانٍ (5.1)
  request_id    UUID REFERENCES evidence_requests(id) ON DELETE SET NULL,

  opened_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at     TIMESTAMPTZ,
  closed_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (recurring_task_id, period_label)
);

CREATE INDEX IF NOT EXISTS idx_cycles_due
  ON recurring_task_cycles (school_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_cycles_task
  ON recurring_task_cycles (recurring_task_id, due_date DESC);

COMMENT ON TABLE recurring_task_cycles IS
  'دورةٌ بموعدها وحالتها الثلاثية — جدولٌ مستقلّ لا تملكه الخطة فلا يوقفه تجميدها (5.2)';
COMMENT ON COLUMN recurring_task_cycles.justification IS
  'مبرّر عدم التنفيذ — «جزء من السجل يقرؤه المقيّم»، وهو ما يحمي المخزن من الامتثال الشكليّ (5.2 · 5.3)';

-- ── (4) إشارة الخطة — إشارةٌ لا احتواء ──────────────────────────
CREATE TABLE IF NOT EXISTS plan_node_recurring (
  plan_node_id      UUID NOT NULL REFERENCES plan_nodes(id) ON DELETE CASCADE,
  recurring_task_id UUID NOT NULL REFERENCES recurring_tasks(id) ON DELETE CASCADE,
  linked_by         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (plan_node_id, recurring_task_id)
);

COMMENT ON TABLE plan_node_recurring IS
  'إشارةُ عقدة خطةٍ إلى مهمّة دورية قائمة — **إشارة لا احتواء**، ولا تدخل نسبة إنجاز الخطة (5.2 · 14‑ب)';

-- ── (5) العزل ───────────────────────────────────────────────────
ALTER TABLE recurring_tasks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_task_anchors ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_task_cycles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_node_recurring    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recurring_tasks_school ON recurring_tasks;
CREATE POLICY recurring_tasks_school ON recurring_tasks FOR ALL
  USING (school_id = my_school_id()) WITH CHECK (school_id = my_school_id());

DROP POLICY IF EXISTS recurring_cycles_school ON recurring_task_cycles;
CREATE POLICY recurring_cycles_school ON recurring_task_cycles FOR ALL
  USING (school_id = my_school_id()) WITH CHECK (school_id = my_school_id());

DROP POLICY IF EXISTS recurring_anchors_school ON recurring_task_anchors;
CREATE POLICY recurring_anchors_school ON recurring_task_anchors FOR ALL
  USING (EXISTS (SELECT 1 FROM recurring_tasks t
                 WHERE t.id = recurring_task_anchors.recurring_task_id
                   AND t.school_id = my_school_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM recurring_tasks t
                 WHERE t.id = recurring_task_anchors.recurring_task_id
                   AND t.school_id = my_school_id()));

DROP POLICY IF EXISTS plan_node_recurring_school ON plan_node_recurring;
CREATE POLICY plan_node_recurring_school ON plan_node_recurring FOR ALL
  USING (EXISTS (SELECT 1 FROM recurring_tasks t
                 WHERE t.id = plan_node_recurring.recurring_task_id
                   AND t.school_id = my_school_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM recurring_tasks t
                 WHERE t.id = plan_node_recurring.recurring_task_id
                   AND t.school_id = my_school_id()));

-- ── (6) العام المنسوب بالسياسة — دالّةٌ واحدة لا حسابٌ متفرّق ───
-- والعام الدراسي يبدأ في أغسطس كما في `src/lib/dates.ts` — مصدرٌ واحد
-- للقاعدة وللواجهة، فلا يتفرّقان.
CREATE OR REPLACE FUNCTION academic_year_of(p_date date)
RETURNS text LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN EXTRACT(MONTH FROM p_date) >= 8
              THEN EXTRACT(YEAR FROM p_date)::int
              ELSE EXTRACT(YEAR FROM p_date)::int - 1 END::text
         || '-' ||
         CASE WHEN EXTRACT(MONTH FROM p_date) >= 8
              THEN EXTRACT(YEAR FROM p_date)::int + 1
              ELSE EXTRACT(YEAR FROM p_date)::int END::text;
$fn$;

CREATE OR REPLACE FUNCTION recurring_cycle_year(p_policy text, p_due date)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  v_base text := academic_year_of(p_due);
  v_from int  := split_part(v_base, '-', 1)::int;
BEGIN
  /* «العام المنسوب حكمٌ لا تاريخ» (3.8): تقريرٌ يُكتب في سبتمبر 2026
     عن عمل العام الماضي يُنسب إلى 2025-2026 لا إلى عامه، وخطّةٌ
     تُعدّ في يونيو لعامٍ قادم تُنسب إلى القادم. */
  IF p_policy = 'previous' THEN
    RETURN (v_from - 1)::text || '-' || v_from::text;
  ELSIF p_policy = 'next' THEN
    RETURN (v_from + 1)::text || '-' || (v_from + 2)::text;
  END IF;
  RETURN v_base;
END; $fn$;

COMMENT ON FUNCTION recurring_cycle_year IS
  'عام الدورة بسياستها — يُثبَّت عند الفتح فلا يتبدّل بعدها (3.8 · 14‑ب)';

-- ── (7) حارس إغلاق الدورة ───────────────────────────────────────
-- «دورة نُفِّذت **ووُثِّقت**» سليمة — والتوثيق دليلٌ **مقبول**، لا ملفٌّ
-- رُفع. وهو حكم م1‑10 نفسه: «ولو أُغلق الطلب بمجرّد الرفع لأمكن
-- إغلاقه بملفّ مرفوض، فتظهر التغطية مكتملةً والفجوة قائمة» (3.1).
-- و«لم تُنفَّذ» لا تمرّ بلا مبرّر، وإلّا صارت باباً للتهرّب لا للصدق.
CREATE OR REPLACE FUNCTION trg_cycle_close_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_status text;
BEGIN
  IF NEW.status = 'documented' AND COALESCE(OLD.status,'') <> 'documented' THEN
    IF NEW.evidence_id IS NULL THEN
      RAISE EXCEPTION 'دورةٌ «وُثّقت» بلا دليل — والتوثيق دليلٌ مقبول لا دعوى (5.3).'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT status INTO v_status FROM evidence WHERE id = NEW.evidence_id;
    IF COALESCE(v_status,'') <> 'accepted' THEN
      RAISE EXCEPTION 'دليل الدورة حاله «%» لا «مقبول» — فلا تُحتسب موثّقةً بعد (5.3 · 3.1).',
        COALESCE(v_status, 'غير موجود') USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.status = 'skipped' AND COALESCE(btrim(NEW.justification), '') = '' THEN
    RAISE EXCEPTION 'الدورة غير المنفَّذة تلزمها مبرّرٌ مسجَّل — «والمبرّر جزء من السجل يقرؤه المقيّم» (5.3).'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IN ('documented','skipped','neglected') AND NEW.closed_at IS NULL THEN
    NEW.closed_at := NOW();
  ELSIF NEW.status = 'open' THEN
    NEW.closed_at := NULL; NEW.closed_by := NULL;
  END IF;
  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS cycle_close_guard ON recurring_task_cycles;
CREATE TRIGGER cycle_close_guard
  BEFORE INSERT OR UPDATE ON recurring_task_cycles
  FOR EACH ROW EXECUTE FUNCTION trg_cycle_close_guard();

-- ── (8) ودليلُ الدورة إن سقط حكمه رجعت الدورة مفتوحة ───────────
-- بنمط 090: من القاعدة لا من منفذٍ واحد، فيلحق كل مسارٍ يرفض أو يُعيد
-- الفتح — ومنه أدوات المشرف.
CREATE OR REPLACE FUNCTION trg_cycle_follow_evidence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.status IN ('rejected','pending') AND OLD.status = 'accepted' THEN
    UPDATE recurring_task_cycles
       SET status = 'open', closed_at = NULL, closed_by = NULL
     WHERE evidence_id = NEW.id AND status = 'documented';
  ELSIF NEW.status = 'rejected' AND OLD.status = 'pending' THEN
    UPDATE recurring_task_cycles
       SET status = 'open', closed_at = NULL
     WHERE evidence_id = NEW.id AND status <> 'documented';
  END IF;
  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS cycle_follow_evidence ON evidence;
CREATE TRIGGER cycle_follow_evidence
  AFTER UPDATE OF status ON evidence
  FOR EACH ROW EXECUTE FUNCTION trg_cycle_follow_evidence();

-- ── (9) ختم `updated_at` (نمط 082) ──────────────────────────────
DROP TRIGGER IF EXISTS set_updated_at_recurring ON recurring_tasks;
CREATE TRIGGER set_updated_at_recurring
  BEFORE UPDATE ON recurring_tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- التحقّق — يُشغَّل بعد الترحيل
-- ════════════════════════════════════════════════════════════════
-- SELECT 'الجداول الأربعة' AS الفحص,
--        (SELECT count(*) FROM information_schema.tables WHERE table_name IN
--          ('recurring_tasks','recurring_task_anchors','recurring_task_cycles','plan_node_recurring'))::text
--        AS الفعلي, '4' AS المتوقع
-- UNION ALL SELECT 'لا عمود لشخصٍ في التعريف (منصبٌ أو قسم)',
--        (SELECT count(*) FROM information_schema.columns
--          WHERE table_name='recurring_tasks' AND column_name LIKE '%user_id%')::text, '0'
-- UNION ALL SELECT 'ولا مفتاح من الدورات إلى الخطط',
--        (SELECT count(*) FROM information_schema.columns
--          WHERE table_name='recurring_task_cycles'
--            AND column_name IN ('plan_id','plan_node_id'))::text, '0'
-- UNION ALL SELECT 'الحرّاس الثلاثة',
--        (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN
--          ('cycle_close_guard','cycle_follow_evidence','set_updated_at_recurring'))::text, '3'
-- UNION ALL SELECT 'سياسات العزل الأربع',
--        (SELECT count(*) FROM pg_policies WHERE policyname IN
--          ('recurring_tasks_school','recurring_cycles_school',
--           'recurring_anchors_school','plan_node_recurring_school'))::text, '4'
-- UNION ALL SELECT 'سياسة العام: بالتاريخ لدورةٍ تستحقّ 2026-10-15',
--        recurring_cycle_year('by_date', DATE '2026-10-15'), '2026-2027'
-- UNION ALL SELECT 'وبسياسة المنصرم',
--        recurring_cycle_year('previous', DATE '2026-10-15'), '2025-2026'
-- UNION ALL SELECT 'وبسياسة القادم',
--        recurring_cycle_year('next', DATE '2026-10-15'), '2027-2028';

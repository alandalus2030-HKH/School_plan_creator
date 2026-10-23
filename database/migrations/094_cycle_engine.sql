-- ════════════════════════════════════════════════════════════════
-- 094 · محرّك الدورات — وصلُها بطابور «أدلة مطلوبة»
--
-- المرجع: الوثيقة 5.1 (كيف تعمل) · 5.2 (التوابع) · 5.3 (ثلاث حالات)
-- · 3.1 (طلب الدليل الموجَّه).
--
-- ── ما يفعله ──
-- «٣ النظام **يفتح دورةً في موعدها ويطلب دليلها عبر طابور «أدلة
--  مطلوبة»** — والطلب يحمل مرساته ونوع دليله سلفاً.
--  ٤ الدليل **يرث الإسناد فور رفعه**، ويمضي في دورة الفرز والقبول
--  المعتادة» (5.1).
-- فلا محرّك طلباتٍ ثانياً: المصبّ هو طابور م1‑10 نفسه.
--
-- ── والعقبة التي عالجها هذا الترحيل ──
-- طلبُ م1‑10 بُني على `assigned_to` **شخصاً** (NOT NULL)، وهو صحيحٌ
-- لقناته: «فريق التركيز يطلب دليلاً ناقصاً **من موظّف**» (3.1).
-- لكنّ المهمّة الدورية «تُسنَد إلى **منصب أو قسم** لا شخصاً» (5.2) —
-- «فالممارسة مؤسسية، وإسنادها لشخصٍ بعينه يقتلها عند رحيله».
--
-- فالطابور الواحد صار يحمل وجهتين: **شخصاً** أو **قسماً/منصباً**،
-- بقيدٍ يمنع الطلب بلا وجهة. ولم أُنشئ طابوراً ثانياً للدورات، لأن
-- الوثيقة تجعله واحداً صريحاً، ولأن شاشتين لمفهوم واحد خطأٌ وقعنا
-- فيه قبلاً وصحّحناه (م1‑3ب).
--
-- ── وطوفان الإشعارات (5.2) ──
-- «ستّون مهمة بعضها شهريّ = مئات الطلبات سنوياً فوق مهام الخطط
--  ⇒ يتجاهلها الناس». والعلاج: «**طابور واحد لا إشعار لكل دورة** ·
--  تجميع أسبوعي». فالمحرّك هنا **لا يُشعر أحداً**: يفتح ويُسجّل،
--  والتجميع الأسبوعي في `/api/cron/requests-digest`.
--
-- متطلّبات: 090 (الطلب) · 093 (المهامّ الدورية).
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ── (1) الطابور يحمل وجهتين ─────────────────────────────────────
ALTER TABLE evidence_requests ALTER COLUMN assigned_to DROP NOT NULL;
ALTER TABLE evidence_requests ADD COLUMN IF NOT EXISTS assigned_department TEXT;
ALTER TABLE evidence_requests ADD COLUMN IF NOT EXISTS assigned_job_title  TEXT;

ALTER TABLE evidence_requests DROP CONSTRAINT IF EXISTS evidence_requests_target;
ALTER TABLE evidence_requests ADD CONSTRAINT evidence_requests_target CHECK (
  assigned_to IS NOT NULL
  OR assigned_department IS NOT NULL
  OR assigned_job_title  IS NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ev_requests_dept
  ON evidence_requests (school_id, assigned_department) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ev_requests_job
  ON evidence_requests (school_id, assigned_job_title) WHERE deleted_at IS NULL;

COMMENT ON COLUMN evidence_requests.assigned_department IS
  'وجهةٌ مؤسسية بدل شخص — لطلبات الدورات، «فإسنادها لشخصٍ بعينه يقتلها عند رحيله» (5.2)';

-- ── (2) دورة الطلب تُغلق دورة المهمّة ───────────────────────────
-- والإغلاق بالقبول لا بالرفع، فحارس 093 يشترط دليلاً **مقبولاً**،
-- وحارس 090 يشترطه للطلب — فالحكمان يتوافقان ولا يتسابقان.
CREATE OR REPLACE FUNCTION trg_cycle_from_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.status = 'closed' AND COALESCE(OLD.status,'') <> 'closed' THEN
    UPDATE recurring_task_cycles
       SET status = 'documented', evidence_id = NEW.evidence_id
     WHERE request_id = NEW.id AND status <> 'documented';
  END IF;
  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS cycle_from_request ON evidence_requests;
CREATE TRIGGER cycle_from_request
  AFTER UPDATE OF status ON evidence_requests
  FOR EACH ROW EXECUTE FUNCTION trg_cycle_from_request();

-- ── (3) «الدليل يرث الإسناد فور رفعه» (5.1‑4) ───────────────────
-- مراسي المهمّة الدورية تُنسخ على دليل دورتها عند إنشائه. والنسخ في
-- القاعدة لا في المنفذ: فأيُّ مسارٍ رفع دليلاً لطلب دورةٍ يرث — ولو
-- جاء من رفعٍ جماعيّ أو من أداةٍ تُبنى غداً.
-- و`ON CONFLICT DO NOTHING` لأن المنفذ يُدرج مرساة الطلب أيضاً، فلا
-- يتعارك الاثنان على `UNIQUE (evidence_id, framework_node_id)`.
CREATE OR REPLACE FUNCTION trg_inherit_recurring_anchors() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_task uuid;
BEGIN
  IF NEW.request_id IS NULL THEN RETURN NEW; END IF;

  SELECT c.recurring_task_id INTO v_task
  FROM recurring_task_cycles c WHERE c.request_id = NEW.request_id LIMIT 1;
  IF v_task IS NULL THEN RETURN NEW; END IF;

  INSERT INTO evidence_anchors
    (evidence_id, framework_node_id, kind, confirm_status, assigned_by)
  SELECT NEW.id, a.framework_node_id, a.kind, 'confirmed', NEW.uploaded_by
  FROM recurring_task_anchors a
  WHERE a.recurring_task_id = v_task
  ON CONFLICT (evidence_id, framework_node_id) DO NOTHING;

  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS inherit_recurring_anchors ON evidence;
CREATE TRIGGER inherit_recurring_anchors
  AFTER INSERT ON evidence
  FOR EACH ROW EXECUTE FUNCTION trg_inherit_recurring_anchors();

-- ── (4) فتحُ الدورة — دالّةٌ واحدة يدعوها الجدولُ الزمنيّ ───────
-- والفتح لا يُشعر أحداً: «طابور واحد **لا إشعار لكل دورة**» (5.2).
--
-- ولمّا تُفتح الدورة يُثبَّت عامها بسياستها (3.8)، ويُنشأ طلبها حاملاً
-- **مرساته ونوع دليله سلفاً** — «فلا يُسأل الرافع عن شيء» (5.4).
CREATE OR REPLACE FUNCTION open_due_recurring_cycles(p_today date DEFAULT CURRENT_DATE)
RETURNS TABLE (cycle_id uuid, task_name text, period text, due date)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  t           record;
  v_due       date;
  v_start     date;
  v_label     text;
  v_year      text;
  v_cycle     uuid;
  v_request   uuid;
  v_sub       uuid;
  v_inds      uuid[];
BEGIN
  FOR t IN
    SELECT * FROM recurring_tasks
    WHERE is_active AND deleted_at IS NULL
      AND (starts_on IS NULL OR starts_on <= p_today)
      AND (ends_on   IS NULL OR ends_on   >= p_today)
  LOOP
    /* موعد الدورة الجارية ووسمها — من الدورية نفسها */
    IF t.frequency = 'weekly' THEN
      v_start := date_trunc('week', p_today)::date;
      v_due   := v_start + 6;
      v_label := 'أسبوع ' || to_char(v_start, 'YYYY-MM-DD');
    ELSIF t.frequency = 'monthly' THEN
      v_start := date_trunc('month', p_today)::date;
      v_due   := (v_start + INTERVAL '1 month - 1 day')::date;
      v_label := to_char(v_start, 'YYYY-MM');
    ELSIF t.frequency = 'termly' THEN
      /* ثلاثة فصول: أغسطس←نوفمبر · ديسمبر←مارس · أبريل←يوليو */
      IF EXTRACT(MONTH FROM p_today) BETWEEN 8 AND 11 THEN
        v_start := make_date(EXTRACT(YEAR FROM p_today)::int, 8, 1);
        v_due   := make_date(EXTRACT(YEAR FROM p_today)::int, 11, 30);
        v_label := 'الفصل الأول ' || academic_year_of(p_today);
      ELSIF EXTRACT(MONTH FROM p_today) = 12 OR EXTRACT(MONTH FROM p_today) <= 3 THEN
        v_start := make_date(split_part(academic_year_of(p_today), '-', 1)::int, 12, 1);
        v_due   := make_date(split_part(academic_year_of(p_today), '-', 2)::int, 3, 31);
        v_label := 'الفصل الثاني ' || academic_year_of(p_today);
      ELSE
        v_start := make_date(EXTRACT(YEAR FROM p_today)::int, 4, 1);
        v_due   := make_date(EXTRACT(YEAR FROM p_today)::int, 7, 31);
        v_label := 'الفصل الثالث ' || academic_year_of(p_today);
      END IF;
    ELSE   -- annual
      v_start := make_date(split_part(academic_year_of(p_today), '-', 1)::int, 8, 1);
      v_due   := make_date(split_part(academic_year_of(p_today), '-', 2)::int, 6, 30);
      v_label := 'العام ' || academic_year_of(p_today);
    END IF;

    /* «يُطلب قبل موعده لا بعده» — ما لم تَحِن مهلة التقديم يُترك */
    CONTINUE WHEN p_today < v_due - t.lead_days;
    /* ولا تُفتح مرّتين: `UNIQUE (recurring_task_id, period_label)` */
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM recurring_task_cycles c
      WHERE c.recurring_task_id = t.id AND c.period_label = v_label);

    v_year := recurring_cycle_year(t.year_policy, v_due);

    /* مرساة الطلب: المعيار الفرعي أوّلاً، ومؤشراته إن كانت مخصوصة.
       وبقيّة المراسي ترثها الأدلة بمُشغِّل (3) — فالطلب يحمل واحدة
       والدليل يحمل الكلّ. */
    SELECT n.id INTO v_sub
    FROM recurring_task_anchors a JOIN framework_nodes n ON n.id = a.framework_node_id
    WHERE a.recurring_task_id = t.id AND n.level = 3 LIMIT 1;

    IF v_sub IS NULL THEN
      /* لا معيارَ فرعيّ مباشر: يُشتقّ من أوّل مؤشّر بكوده */
      SELECT p.id, array_agg(n.id) INTO v_sub, v_inds
      FROM recurring_task_anchors a
      JOIN framework_nodes n ON n.id = a.framework_node_id
      JOIN framework_nodes p ON p.code = split_part(n.code, '.', 1) || '.' ||
                                         split_part(n.code, '.', 2) || '.' ||
                                         split_part(n.code, '.', 3)
                            AND p.framework_id = n.framework_id
      WHERE a.recurring_task_id = t.id AND n.level = 4
      GROUP BY p.id LIMIT 1;
    ELSE
      SELECT array_agg(n.id) INTO v_inds
      FROM recurring_task_anchors a JOIN framework_nodes n ON n.id = a.framework_node_id
      WHERE a.recurring_task_id = t.id AND n.level = 4;
    END IF;

    CONTINUE WHEN v_sub IS NULL;   -- مهمّةٌ بلا مرساةٍ صالحة: تُترك ويُنبَّه عليها في الشاشة

    INSERT INTO evidence_requests (
      school_id, requested_by, assigned_to, assigned_department, assigned_job_title,
      sub_node_id, indicator_ids, what_is_asked, expected_type, academic_year,
      due_date, status
    ) VALUES (
      t.school_id, t.created_by, NULL, t.assigned_department, t.assigned_job_title,
      v_sub, COALESCE(v_inds, '{}'::uuid[]),
      t.name_ar || ' — ' || v_label,
      t.expected_evidence_type, v_year, v_due, 'open'
    ) RETURNING id INTO v_request;

    INSERT INTO recurring_task_cycles (
      recurring_task_id, school_id, period_label, period_start, due_date,
      academic_year, status, request_id
    ) VALUES (
      t.id, t.school_id, v_label, v_start, v_due, v_year, 'open', v_request
    ) RETURNING id INTO v_cycle;

    cycle_id := v_cycle; task_name := t.name_ar; period := v_label; due := v_due;
    RETURN NEXT;
  END LOOP;
END; $fn$;

REVOKE ALL ON FUNCTION open_due_recurring_cycles(date) FROM PUBLIC;

COMMENT ON FUNCTION open_due_recurring_cycles IS
  'يفتح دورات اليوم ويطلب أدلّتها عبر طابور «أدلة مطلوبة» — بلا إشعارٍ لكل دورة (5.1 · 5.2)';

-- ── (5) وما مضى موعده بلا دليلٍ ولا مبرّر: أُهمل ────────────────
-- «دورة مطلوبة أُهملت → خلل، **وهذه وحدها تُعدّ فجوة**» (5.3).
-- وبغير هذا الوسم لا تصير فجوةٌ فجوةً أبداً، فيبقى كل شيء «مفتوحاً»
-- إلى الأبد — وهو ستْرٌ للخلل لا إنصافٌ للمدرسة.
-- ومهلةُ سماحٍ أربعة عشر يوماً بعد الاستحقاق، **والوسم يُنقَض**: دليلٌ
-- يُقبل بعده يُعيدها موثّقة، ومبرّرٌ يُسجَّل يُعيدها مقبولة.
CREATE OR REPLACE FUNCTION mark_neglected_cycles(p_grace int DEFAULT 14)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_n int;
BEGIN
  WITH upd AS (
    UPDATE recurring_task_cycles c
       SET status = 'neglected'
     WHERE c.status = 'open'
       AND c.due_date < CURRENT_DATE - p_grace
       AND NOT EXISTS (
         SELECT 1 FROM evidence e
         WHERE e.id = c.evidence_id AND e.status = 'accepted')
    RETURNING 1)
  SELECT count(*) INTO v_n FROM upd;
  RETURN v_n;
END; $fn$;

REVOKE ALL ON FUNCTION mark_neglected_cycles(int) FROM PUBLIC;

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- التحقّق — يُشغَّل بعد الترحيل
-- ════════════════════════════════════════════════════════════════
-- SELECT 'الطلب يحمل وجهتين' AS الفحص,
--        (SELECT count(*) FROM information_schema.columns
--          WHERE table_name='evidence_requests'
--            AND column_name IN ('assigned_department','assigned_job_title'))::text AS الفعلي, '2' AS المتوقع
-- UNION ALL SELECT 'ولا طلبَ بلا وجهة',
--        (SELECT count(*) FROM pg_constraint WHERE conname='evidence_requests_target')::text, '1'
-- UNION ALL SELECT 'و`assigned_to` صار يقبل الفراغ',
--        (SELECT is_nullable FROM information_schema.columns
--          WHERE table_name='evidence_requests' AND column_name='assigned_to'), 'YES'
-- UNION ALL SELECT 'مُشغِّلا الوصل والتوريث',
--        (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN
--          ('cycle_from_request','inherit_recurring_anchors'))::text, '2'
-- UNION ALL SELECT 'دالّتا المحرّك',
--        (SELECT count(*) FROM pg_proc WHERE proname IN
--          ('open_due_recurring_cycles','mark_neglected_cycles'))::text, '2'
-- ⚠️ والسطر التالي **ليس فحصاً جافّاً**: نداءُ الدالّة يفتح الدورات فعلاً
-- ويُنشئ طلباتها. شغّله حين تريد الفتح، لا للتحقّق.
-- UNION ALL SELECT 'دورات فُتحت الآن (لها أثر!)',
--        (SELECT count(*)::text FROM open_due_recurring_cycles()), NULL;

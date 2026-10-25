-- ════════════════════════════════════════════════════════════════
-- 095 · دوريةٌ خامسة: «نصف فصلية» — شهران، ستّ دورات في العام
--
-- الوثيقة في 5.1 تعدّ الدورية «أسبوعية · فصلية · سنوية»، وهي أمثلةٌ
-- في قوسٍ لا حصر: 5.2 نفسها تقول «ستّون مهمة **بعضها شهريّ**». فلا
-- تعارض — والشهرية مبنيّة في 093 على هذا الفهم.
--
-- وموضعُها بين الشهرية والفصلية: الفصل أربعة أشهر، ونصفه شهران.
-- فالفصول الثلاثة تصير ستّة أنصاف:
--   أغسطس←سبتمبر · أكتوبر←نوفمبر · ديسمبر←يناير
--   فبراير←مارس  · أبريل←مايو    · يونيو←يوليو
--
-- ووسمُها يحمل فصلَها ونصفَه معاً — «الفصل الأول · النصف الثاني
-- 2026-2027» — ليُقرأ في سجلّ المقيّم بلا تأويل، وليبقى **فريداً**
-- تحت `UNIQUE (recurring_task_id, period_label)` فلا تُفتح الدورة
-- مرّتين.
--
-- ولا يُمَسّ من محرّك 094 غيرُ فرعٍ واحد مضاف: الدالّة منسوخةٌ منه
-- حرفياً وما عدا الفرعَ كما استقرّ هناك.
-- ════════════════════════════════════════════════════════════════

-- ── (1) القيد يتّسع لها ─────────────────────────────────────────
ALTER TABLE recurring_tasks DROP CONSTRAINT IF EXISTS recurring_tasks_frequency_check;
ALTER TABLE recurring_tasks DROP CONSTRAINT IF EXISTS recurring_frequency_allowed;
ALTER TABLE recurring_tasks ADD CONSTRAINT recurring_frequency_allowed
  CHECK (frequency IN ('weekly','monthly','semi_termly','termly','annual'));

COMMENT ON COLUMN recurring_tasks.frequency IS
  'دورية الممارسة: أسبوعية · شهرية · نصف فصلية (شهران) · فصلية · سنوية (5.1)';

-- ── (2) المحرّك يعرف موعدها ووسمها ──────────────────────────────
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
  v_ay        text;
  v_ay1       int;
  v_ay2       int;
  v_m         int;
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
    ELSIF t.frequency = 'semi_termly' THEN
      /* ستّة أنصاف، شهران لكلٍّ — والسنة الميلادية تُؤخذ من العام
         الدراسي لا من تاريخ اليوم، وإلّا انفصل ديسمبر عن يناير
         وهما نصفٌ واحد. */
      v_ay  := academic_year_of(p_today);
      v_ay1 := split_part(v_ay, '-', 1)::int;
      v_ay2 := split_part(v_ay, '-', 2)::int;
      v_m   := EXTRACT(MONTH FROM p_today)::int;

      IF v_m IN (8, 9) THEN
        v_start := make_date(v_ay1, 8, 1);
        v_due   := make_date(v_ay1, 9, 30);
        v_label := 'الفصل الأول · النصف الأول ' || v_ay;
      ELSIF v_m IN (10, 11) THEN
        v_start := make_date(v_ay1, 10, 1);
        v_due   := make_date(v_ay1, 11, 30);
        v_label := 'الفصل الأول · النصف الثاني ' || v_ay;
      ELSIF v_m IN (12, 1) THEN
        v_start := make_date(v_ay1, 12, 1);
        v_due   := make_date(v_ay2, 1, 31);
        v_label := 'الفصل الثاني · النصف الأول ' || v_ay;
      ELSIF v_m IN (2, 3) THEN
        v_start := make_date(v_ay2, 2, 1);
        v_due   := make_date(v_ay2, 3, 31);
        v_label := 'الفصل الثاني · النصف الثاني ' || v_ay;
      ELSIF v_m IN (4, 5) THEN
        v_start := make_date(v_ay2, 4, 1);
        v_due   := make_date(v_ay2, 5, 31);
        v_label := 'الفصل الثالث · النصف الأول ' || v_ay;
      ELSE   -- 6, 7
        v_start := make_date(v_ay2, 6, 1);
        v_due   := make_date(v_ay2, 7, 31);
        v_label := 'الفصل الثالث · النصف الثاني ' || v_ay;
      END IF;

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
  'يفتح دورات المهامّ المستحقّة ويُنشئ طلباتها — خمس دوريات، والطلب يحمل مرساته سلفاً (5.1 · 5.4)';

-- ════════════════════════════════════════════════════════════════
-- التحقّق — انسخه وحده في محرّر SQL بعد تشغيل الترحيل
-- ════════════════════════════════════════════════════════════════
-- SELECT 'القيد يقبل الخمس' AS الفحص,
--        (SELECT count(*)::text FROM pg_constraint
--          WHERE conname = 'recurring_frequency_allowed') AS الفعلي,
--        '1' AS المتوقع
-- UNION ALL SELECT 'ونصفُ الفصل شهران لا أربعة',
--        (make_date(2026,9,30) - make_date(2026,8,1) + 1)::text, '61'
-- UNION ALL SELECT 'وديسمبر ويناير نصفٌ واحد بعامٍ واحد',
--        academic_year_of(DATE '2027-01-15'), '2026-2027'
-- UNION ALL SELECT 'ولا دورية سادسة',
--        (SELECT count(DISTINCT frequency)::text FROM recurring_tasks), '≤ 5';

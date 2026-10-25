-- ════════════════════════════════════════════════════════════════
-- 095 · فصول العام الدراسي تُعرَّف في التقويم — لا تُثبَّت في الكود
--
-- ── لماذا ──
-- كان محرّك الدورات (094) يحمل الفصول مكتوبةً فيه: أغسطس←نوفمبر ·
-- ديسمبر←مارس · أبريل←يوليو. **وهي تختلف من مدرسة إلى مدرسة**، بل
-- من عامٍ إلى عام في المدرسة الواحدة. فكلُّ دورةٍ تُفتح بتاريخٍ لا
-- يطابق واقع المدرسة هي **طلبٌ في غير وقته** — والطلب في غير وقته
-- يُدرَّب الناس على تجاهل الطابور، وهو ما تحذّر منه 5.2.
--
-- والوثيقة صامتة عن حدود الفصول (فُحص 5 و3.8 و15.1)، فهذه فجوةٌ
-- تُسدّ لا قرارٌ يُخالَف.
--
-- ── والقائم يُبنى عليه ──
-- `school_calendar` (042) يحمل **أحداثاً مسمّاة** (عطلة · اختبار)،
-- ولا يعرف أين يبدأ الفصل وأين ينتهي. فهذا الجدول طبقةٌ فوقه في
-- الشاشة نفسها، لا شاشةٌ ثانية.
--
-- ── وحدُّ العام الدراسي لم يُمَسّ ──
-- `academic_year_of()` يبقى على أغسطس كما هو (قرار المستخدم). فلا
-- يتبدّل العام المنسوب لدليلٍ ولا لخطّةٍ قائمة بهذا الترحيل.
--
-- ── ومهمّةٌ في مدرسةٍ بلا فصول: يتوقّف المحرّك ──
-- لا تُفتح دورة، ويظهر التنبيه في شاشة المهامّ الدورية. **والصمت
-- لا يستر شيئاً**: فجوةٌ ظاهرة خيرٌ من دورةٍ بتاريخٍ مخترَع.
-- ════════════════════════════════════════════════════════════════

-- ── (1) الدورية الخامسة: «نصف فصلية» ────────────────────────────
-- الفصل نصفان، وحدُّهما `mid_date` **تُدخله المدرسة صريحاً** لا
-- يُحسب من منتصف المدّة — فنصف الفصل الفعليّ لا يقع في منتصفه.
ALTER TABLE recurring_tasks DROP CONSTRAINT IF EXISTS recurring_tasks_frequency_check;
ALTER TABLE recurring_tasks DROP CONSTRAINT IF EXISTS recurring_frequency_allowed;
ALTER TABLE recurring_tasks ADD CONSTRAINT recurring_frequency_allowed
  CHECK (frequency IN ('weekly','monthly','semi_termly','termly','annual'));

COMMENT ON COLUMN recurring_tasks.frequency IS
  'دورية الممارسة: أسبوعية · شهرية · نصف فصلية · فصلية · سنوية — وحدودها من تقويم المدرسة (5.1)';

-- ── (2) فصول العام الدراسي لكل مدرسة ────────────────────────────
CREATE TABLE IF NOT EXISTS academic_terms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL,                 -- '2026-2027'
  term_no       INT  NOT NULL CHECK (term_no BETWEEN 1 AND 6),
  name_ar       TEXT NOT NULL,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  -- آخر يومٍ في النصف الأول — والثاني يبدأ في اليوم الذي يليه
  mid_date      DATE,
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT academic_terms_span  CHECK (end_date >= start_date),
  CONSTRAINT academic_terms_mid   CHECK (mid_date IS NULL
                                     OR (mid_date >= start_date AND mid_date < end_date)),
  CONSTRAINT academic_terms_unique UNIQUE (school_id, academic_year, term_no)
);

CREATE INDEX IF NOT EXISTS idx_terms_lookup
  ON academic_terms (school_id, academic_year, start_date, end_date);

COMMENT ON TABLE academic_terms IS
  'فصول العام الدراسي كما تُعرّفها المدرسة — مصدرُ كل تاريخٍ فصليّ في النظام';
COMMENT ON COLUMN academic_terms.mid_date IS
  'آخر يوم في النصف الأول — تُدخله المدرسة، ولا يُحسب من منتصف المدّة';

-- والفصول لا تتداخل: يومٌ واحد لا يقع في فصلين
CREATE OR REPLACE FUNCTION trg_terms_no_overlap() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1 FROM academic_terms a
     WHERE a.school_id = NEW.school_id
       AND a.academic_year = NEW.academic_year
       AND a.id <> NEW.id
       AND NEW.start_date <= a.end_date
       AND NEW.end_date   >= a.start_date
  ) THEN
    RAISE EXCEPTION 'الفصل «%» يتداخل مع فصلٍ آخر في العام نفسه — ويومٌ واحد لا يقع في فصلين.',
      NEW.name_ar USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS terms_no_overlap ON academic_terms;
CREATE TRIGGER terms_no_overlap BEFORE INSERT OR UPDATE ON academic_terms
  FOR EACH ROW EXECUTE FUNCTION trg_terms_no_overlap();

ALTER TABLE academic_terms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS academic_terms_select ON academic_terms;
CREATE POLICY academic_terms_select ON academic_terms
  FOR SELECT USING (school_id = my_school_id());

-- ── (3) بذرةٌ تُصحَّح لا تُفرَض ──────────────────────────────────
-- الفصول الثلاثة التي كانت مكتوبةً في 094 تُنقل صفوفاً **قابلةً
-- للتحرير** للعام الجاري، فلا ينقطع شيء على المدارس القائمة —
-- وتُصحّحها كلُّ مدرسة بما يطابق تقويمها.
-- ونهاية الفصل الثالث هنا **30 يونيو** موافقةً لحدّ العام الدراسي
-- في `lib/dates.ts`، لا 31 يوليو كما كانت في فرع «الفصلية» — وكان
-- الفرعان في 094 يختلفان في هذا الحدّ.
INSERT INTO academic_terms (school_id, academic_year, term_no, name_ar, start_date, end_date, mid_date)
SELECT s.id, v.ay, v.n, v.nm, v.sd, v.ed, v.md
FROM schools s
CROSS JOIN LATERAL (
  SELECT academic_year_of(CURRENT_DATE) AS ay,
         split_part(academic_year_of(CURRENT_DATE), '-', 1)::int AS y1,
         split_part(academic_year_of(CURRENT_DATE), '-', 2)::int AS y2
) y
CROSS JOIN LATERAL (VALUES
  (y.ay, 1, 'الفصل الأول',  make_date(y.y1, 8,  1), make_date(y.y1, 11, 30), make_date(y.y1, 9,  30)),
  (y.ay, 2, 'الفصل الثاني', make_date(y.y1, 12, 1), make_date(y.y2, 3,  31), make_date(y.y2, 1,  31)),
  (y.ay, 3, 'الفصل الثالث', make_date(y.y2, 4,  1), make_date(y.y2, 6,  30), make_date(y.y2, 5,  31))
) AS v(ay, n, nm, sd, ed, md)
ON CONFLICT ON CONSTRAINT academic_terms_unique DO NOTHING;

-- ── (4) المحرّك يقرأ التقويم ─────────────────────────────────────
-- ولا يُمَسّ من دالّة 094 غيرُ كتلة حساب الموعد والوسم.
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
  v_term      academic_terms%ROWTYPE;
  v_skip      boolean;
BEGIN
  FOR t IN
    SELECT * FROM recurring_tasks
    WHERE is_active AND deleted_at IS NULL
      AND (starts_on IS NULL OR starts_on <= p_today)
      AND (ends_on   IS NULL OR ends_on   >= p_today)
  LOOP
    /* موعد الدورة الجارية ووسمها — من دورية المهمّة **وتقويم مدرستها**.
       فلا تاريخَ فصلٍ مكتوبٌ هنا: الفصول تُعرَّف في «الإعدادات ←
       التقويم المدرسي»، وتختلف من مدرسة إلى مدرسة ومن عامٍ إلى عام. */
    v_ay   := academic_year_of(p_today);
    v_skip := FALSE;

    IF t.frequency = 'weekly' THEN
      v_start := date_trunc('week', p_today)::date;
      v_due   := v_start + 6;
      v_label := 'أسبوع ' || to_char(v_start, 'YYYY-MM-DD');

    ELSIF t.frequency = 'monthly' THEN
      v_start := date_trunc('month', p_today)::date;
      v_due   := (v_start + INTERVAL '1 month - 1 day')::date;
      v_label := to_char(v_start, 'YYYY-MM');

    ELSIF t.frequency = 'annual' THEN
      /* العام من أوّل فصولِ المدرسة إلى آخرها — لا من شهرٍ مفترَض */
      SELECT min(a.start_date), max(a.end_date) INTO v_start, v_due
        FROM academic_terms a
       WHERE a.school_id = t.school_id AND a.academic_year = v_ay;
      IF v_start IS NULL THEN
        v_skip := TRUE;                     -- لا فصولَ مُعرَّفة لهذا العام
      ELSE
        v_label := 'العام ' || v_ay;
      END IF;

    ELSE
      /* الفصلية ونصفُها: الفصل الذي يقع فيه اليوم */
      SELECT * INTO v_term FROM academic_terms a
       WHERE a.school_id = t.school_id
         AND a.academic_year = v_ay
         AND p_today BETWEEN a.start_date AND a.end_date
       ORDER BY a.term_no LIMIT 1;

      IF v_term.id IS NULL THEN
        v_skip := TRUE;                     -- يومٌ خارج الفصول: عطلةٌ أو تقويمٌ ناقص
      ELSIF t.frequency = 'termly' THEN
        v_start := v_term.start_date;
        v_due   := v_term.end_date;
        v_label := v_term.name_ar || ' ' || v_ay;
      ELSE   -- semi_termly
        IF v_term.mid_date IS NULL THEN
          v_skip := TRUE;                   -- فصلٌ بلا نصفٍ محدَّد
        ELSIF p_today <= v_term.mid_date THEN
          v_start := v_term.start_date;
          v_due   := v_term.mid_date;
          v_label := v_term.name_ar || ' · النصف الأول ' || v_ay;
        ELSE
          v_start := v_term.mid_date + 1;
          v_due   := v_term.end_date;
          v_label := v_term.name_ar || ' · النصف الثاني ' || v_ay;
        END IF;
      END IF;
    END IF;

    /* تقويمٌ ناقص لا يُخترع له تاريخ — والشاشة تنبّه عليه */
    CONTINUE WHEN v_skip;

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
  'يفتح دورات المهامّ المستحقّة من تقويم المدرسة — ولا يخترع تاريخاً عند نقصه (5.1 · 5.4)';

-- ════════════════════════════════════════════════════════════════
-- التحقّق — انسخه وحده في محرّر SQL بعد تشغيل الترحيل
-- ════════════════════════════════════════════════════════════════
-- SELECT 'فصول العام الجاري لمدرستك' AS الفحص,
--        (SELECT count(*)::text FROM academic_terms
--          WHERE academic_year = academic_year_of(CURRENT_DATE)
--            AND school_id = (SELECT id FROM schools ORDER BY created_at LIMIT 1)) AS الفعلي,
--        '3' AS المتوقع
-- UNION ALL SELECT 'والقيد يقبل الدوريات الخمس',
--        (SELECT count(*)::text FROM pg_constraint
--          WHERE conname = 'recurring_frequency_allowed'), '1'
-- UNION ALL SELECT 'ونصفُ كل فصلٍ مُدخَل',
--        (SELECT count(*)::text FROM academic_terms
--          WHERE mid_date IS NOT NULL
--            AND academic_year = academic_year_of(CURRENT_DATE)), '3 لكل مدرسة'
-- UNION ALL SELECT 'ولا فصلين يتداخلان',
--        (SELECT count(*)::text FROM academic_terms a JOIN academic_terms b
--           ON a.school_id = b.school_id AND a.academic_year = b.academic_year
--          AND a.id <> b.id AND a.start_date <= b.end_date AND a.end_date >= b.start_date),
--        '0';

-- ── اختبار المحرّك بلا تقويم (يُعاد بعده الصفّ) ──
-- BEGIN;
--   DELETE FROM academic_terms WHERE academic_year = academic_year_of(CURRENT_DATE);
--   SELECT count(*) AS "دورات بلا تقويم — المتوقع 0" FROM open_due_recurring_cycles();
-- ROLLBACK;

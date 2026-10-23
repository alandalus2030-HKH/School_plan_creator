-- ════════════════════════════════════════════════════════════════
-- 088 · حرّاس الإسناد: لا دليلَ تائه، ولا قبولَ بمرساةٍ فضفاضة
--
-- المرجع: الوثيقة 3.3 (الإسناد: ما يغطّيه الدليل) · 3.2 (المالك
-- الواحد والمراسي الواردة) · 3.5 (وسم الدوام).
--
-- (1) **لا يُحذف آخر إسناد** (3.3 نصّاً): «الدليل بلا مرساة دليلٌ
--     تائه، فإمّا تبقى له مرساة وإمّا يعود مسوّدة خارج المخزن».
--     والحارس في القاعدة لا في الشاشة — فالمسارات تتعدّد والقاعدة
--     واحدة (الطبقة الثالثة من حراستنا المعتادة).
--
-- (2) **القبول يشترط مرساةً دالّة**: اليوم يكفي وجود أيّ مرساة ولو
--     على معيارٍ رئيس. والإسناد الموروث (077) يصعد سلسلة العقد إلى
--     **أقرب** إسناد، فقد يقف عند المستوى الأول — فيصير الدليل
--     «مُسنَداً» شكلاً وتائهاً فعلاً. والوثيقة: «دليلٌ لا يقول لأيّ
--     مؤشّر يشهد **لا يدخل التغطية ولا يخدم السرد**».
--     فيُشترط عند القبول مرساةٌ **مؤكَّدة** على **معيار فرعي (ضمنيّة)
--     أو مؤشّر (مخصوصة)**. وما قُبل قبل اليوم لا يُمسّ.
--
-- (3) **المرساة الواردة لا تُحتسب قبل تأكيدها** (3.2): يُضاف فهرسٌ
--     يخدم عدّ التغطية المؤكَّدة وحدها.
--
-- متطلّبات: 073 (الجدول والأعمدة) · 084 (مُشغِّل القبول).
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ── (1) لا يُحذف آخر إسناد ───────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_keep_last_anchor() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_left int;
  v_alive boolean;
BEGIN
  /* دليلٌ محذوف أو ذاهب مع الحذف المتسلسل: لا حراسة */
  SELECT (deleted_at IS NULL) INTO v_alive FROM evidence WHERE id = OLD.evidence_id;
  IF v_alive IS NULL OR v_alive = false THEN RETURN OLD; END IF;

  SELECT count(*) INTO v_left
  FROM   evidence_anchors a
  WHERE  a.evidence_id = OLD.evidence_id AND a.id <> OLD.id;

  IF v_left = 0 THEN
    RAISE EXCEPTION 'لا يُحذف آخر إسناد — الدليل بلا مرساة دليلٌ تائه (3.3). أضِف مرساةً بديلة أوّلاً.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END; $fn$;

DROP TRIGGER IF EXISTS keep_last_anchor ON evidence_anchors;
CREATE TRIGGER keep_last_anchor
  BEFORE DELETE ON evidence_anchors
  FOR EACH ROW EXECUTE FUNCTION trg_keep_last_anchor();

COMMENT ON FUNCTION trg_keep_last_anchor IS
  'لا يُحذف آخر إسناد لدليلٍ حيّ (3.3) — والحذف المتسلسل مع الدليل مستثنى';

-- ── (2) القبول يشترط مرساةً دالّة ومؤكَّدة ───────────────────────
-- يُعاد تعريف مُشغِّل 084 بشرطٍ أدقّ في موضع المرساة وحده.
CREATE OR REPLACE FUNCTION trg_evidence_on_accept() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_year int;
  v_no   int;
BEGIN
  IF NEW.status IS DISTINCT FROM 'accepted' OR OLD.status = 'accepted' THEN
    RETURN NEW;
  END IF;

  /* التقييم الذاتي ممنوع في كل القنوات — لا من رفع الدليل يقبله (3.2) */
  IF NEW.reviewed_by IS NOT NULL AND NEW.reviewed_by = COALESCE(NEW.uploaded_by, OLD.uploaded_by) THEN
    RAISE EXCEPTION 'لا يقبل الدليلَ من رفعه — القبول لعضو فريق التركيز.'
      USING ERRCODE = 'check_violation';
  END IF;

  /* لا قبول بمرساةٍ فضفاضة: المطلوب معيارٌ فرعي (ضمنيّة) أو مؤشّر
     (مخصوصة)، **مؤكَّدةً** — فالواردة لا تُحتسب قبل تأكيدها (3.2) */
  IF NOT EXISTS (
    SELECT 1 FROM evidence_anchors a
    JOIN   framework_nodes n ON n.id = a.framework_node_id
    WHERE  a.evidence_id = NEW.id
      AND  a.confirm_status = 'confirmed'
      AND  n.level IN (3, 4)
  ) THEN
    RAISE EXCEPTION 'لا يُقبل دليلٌ بلا مرساةٍ دالّة — حدِّد ما يغطّيه: مؤشّراً بعينه أو المعيار الفرعي كاملاً (3.3).'
      USING ERRCODE = 'check_violation';
  END IF;

  /* ولا بلا عامٍ منسوب: عليه تقوم العدسة الطولية (3.6.1) */
  IF NEW.academic_year IS NULL OR NEW.academic_year !~ '^\d{4}-\d{4}$' THEN
    RAISE EXCEPTION 'لا يُقبل دليلٌ بلا عامٍ منسوب — العام يمنع القبول.'
      USING ERRCODE = 'check_violation';
  END IF;

  /* الهويّة الثابتة: تُمنح مرّةً ولا تتغيّر — فإن كانت فلا تُمسّ (3.4) */
  IF NEW.code IS NULL THEN
    v_year := EXTRACT(YEAR FROM now())::int;
    INSERT INTO evidence_code_counters (school_id, year, last_no)
    VALUES (NEW.school_id, v_year, 1)
    ON CONFLICT (school_id, year) DO UPDATE SET last_no = evidence_code_counters.last_no + 1
    RETURNING last_no INTO v_no;

    NEW.code := 'E-' || v_year::text || '-' || lpad(v_no::text, 4, '0');
  END IF;

  RETURN NEW;
END; $fn$;

-- ── (3) فهرسٌ لعدّ التغطية المؤكَّدة ─────────────────────────────
DROP INDEX IF EXISTS idx_anchors_confirmed;
CREATE INDEX idx_anchors_confirmed
  ON evidence_anchors (framework_node_id, kind)
  WHERE confirm_status = 'confirmed';

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- التحقّق — يُشغَّل بعد الترحيل
-- ════════════════════════════════════════════════════════════════
-- SELECT 'حارس آخر إسناد' AS الفحص,
--        (SELECT count(*) FROM pg_trigger
--          WHERE tgname = 'keep_last_anchor' AND NOT tgisinternal)::text AS الفعلي, '1' AS المتوقع
-- UNION ALL SELECT 'شرط المرساة الدالّة في مُشغِّل القبول',
--        (SELECT count(*) FROM pg_proc
--          WHERE proname = 'trg_evidence_on_accept' AND prosrc LIKE '%n.level IN (3, 4)%')::text, '1'
-- UNION ALL SELECT 'فهرس التغطية المؤكَّدة',
--        (SELECT count(*) FROM pg_indexes WHERE indexname = 'idx_anchors_confirmed')::text, '1'
-- UNION ALL SELECT 'أدلة معلّقة بلا مرساة دالّة (ستُمنع حتى تُسنَد)',
--        (SELECT count(*) FROM evidence e
--          WHERE e.status = 'pending' AND e.deleted_at IS NULL
--            AND NOT EXISTS (SELECT 1 FROM evidence_anchors a
--                            JOIN framework_nodes n ON n.id = a.framework_node_id
--                            WHERE a.evidence_id = e.id AND a.confirm_status = 'confirmed'
--                              AND n.level IN (3,4)))::text, NULL;

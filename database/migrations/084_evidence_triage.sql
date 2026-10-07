-- ════════════════════════════════════════════════════════════════
-- 084 · طابور الفرز: أسباب الرفض · الهويّة الثابتة · حارس التقييم الذاتي
--
-- المرجع: الوثيقة المعمارية 3.2 (دورة حياة الدليل) · 3.3 (الإسناد) ·
--         3.4 (الهويّة الثابتة) · 3.6 (شاشة الفرز السريعة).
--
-- (1) أسباب الرفض — قائمة مغلقة لتُحلَّل (3.2).
--     ⚠ درس 075: `dropdown_options` جدولٌ مشترك — فُحصت فئاته الثماني
--       القائمة قبل البذر (department · education_level · evidence_reason ·
--       evidence_type · job_title · marital_status · nationality ·
--       plan_type)، وليس فيها `evidence_reject_reason`. والبذر محروس.
--
-- (2) `reject_reason_code` عمودٌ مستقلّ عن `review_note`: الأوّل يُحلَّل
--     (كم دليلاً رُفض لعدم المطابقة؟)، والثاني نصٌّ حرّ لـ«أخرى» وللشرح.
--
-- (3) الهويّة الثابتة E-YYYY-NNNN تُمنح **عند القبول ولا تتغيّر أبداً**
--     (3.4). والسنة سنةُ القبول، والعدّاد لكل مدرسة وسنة على حدة.
--     والعمود `code` وفهرسه الفريد قائمان منذ 073 — هنا يُملآن.
--
-- (4) حارس التقييم الذاتي — الطبقة الثالثة. والمنفذ يمنع قبله، لكنّ
--     ثغرةً كانت قائمة: الحارس في الكود مبنيّ على **المكلَّف بالمهمّة**،
--     ودليل القناة المباشرة بلا مهمّة — فلا مانع يمنع رافعه من قبوله
--     بنفسه. وهنا يُمنع في القاعدة لكل القنوات.
--
-- متطلّبات: 073 (الأعمدة والفهرس) · 074 (الفرق والصلاحيات).
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ── (1) أسباب الرفض ──────────────────────────────────────────────
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM dropdown_options WHERE category = 'evidence_reject_reason') THEN
    RAISE NOTICE 'الفئة evidence_reject_reason موجودة — لم تُبذر ثانية';
  ELSE
    INSERT INTO dropdown_options (category, value, sort_order, is_active)
    VALUES ('evidence_reject_reason', 'غير مطابق للمؤشّر', 1, true),
           ('evidence_reject_reason', 'غير مقروء',          2, true),
           ('evidence_reject_reason', 'ناقص التوثيق',       3, true),
           ('evidence_reject_reason', 'مكرّر',               4, true),
           ('evidence_reject_reason', 'خارج الفترة',        5, true),
           ('evidence_reject_reason', 'أخرى',               6, true);
  END IF;
END $do$;

-- ── (2) عمود سبب الرفض المصنَّف ──────────────────────────────────
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS reject_reason_code TEXT;
COMMENT ON COLUMN evidence.reject_reason_code IS
  'سبب الرفض من قائمة مغلقة (3.2) — للتحليل؛ والنصّ الحرّ في review_note';

-- ── (3) فهرس الطابور ─────────────────────────────────────────────
-- الطابور: أدلة المدرسة المعلّقة، مرتّبةً بالأقدم، مرشّحةً بالفريق.
DROP INDEX IF EXISTS idx_evidence_triage_queue;
CREATE INDEX idx_evidence_triage_queue
  ON evidence (school_id, owner_team_id, created_at)
  WHERE status = 'pending' AND deleted_at IS NULL;

-- ── (4) عدّاد الهويّة الثابتة ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS evidence_code_counters (
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  year      INT  NOT NULL,
  last_no   INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (school_id, year)
);

COMMENT ON TABLE evidence_code_counters IS
  'عدّاد الهويّة الثابتة لكل مدرسة وسنة — لا يُنقَص ولا يُعاد استعماله (3.4)';

ALTER TABLE evidence_code_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS evidence_code_counters_read ON evidence_code_counters;
CREATE POLICY evidence_code_counters_read ON evidence_code_counters
  FOR SELECT USING (school_id = my_school_id());
-- لا سياسة كتابة: يكتبه المُشغِّل وحده (SECURITY DEFINER)

-- ── (5) المُشغِّل: الهويّة عند القبول · ومنع التقييم الذاتي ───────
CREATE OR REPLACE FUNCTION trg_evidence_on_accept() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_year int;
  v_no   int;
BEGIN
  /* يَعمل عند الانتقال إلى «مقبول» وحده */
  IF NEW.status IS DISTINCT FROM 'accepted' OR OLD.status = 'accepted' THEN
    RETURN NEW;
  END IF;

  /* التقييم الذاتي ممنوع في كل القنوات — لا من رفع الدليل يقبله (3.2) */
  IF NEW.reviewed_by IS NOT NULL AND NEW.reviewed_by = COALESCE(NEW.uploaded_by, OLD.uploaded_by) THEN
    RAISE EXCEPTION 'لا يقبل الدليلَ من رفعه — القبول لعضو فريق التركيز.'
      USING ERRCODE = 'check_violation';
  END IF;

  /* لا قبول بلا مرساة: دليلٌ بلا مرساة دليلٌ تائه (3.3) */
  IF NOT EXISTS (SELECT 1 FROM evidence_anchors a WHERE a.evidence_id = NEW.id) THEN
    RAISE EXCEPTION 'لا يُقبل دليلٌ بلا مرساة — حدِّد المعيار الذي يغطّيه أولاً.'
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

DROP TRIGGER IF EXISTS evidence_on_accept ON evidence;
CREATE TRIGGER evidence_on_accept
  BEFORE UPDATE OF status ON evidence
  FOR EACH ROW EXECUTE FUNCTION trg_evidence_on_accept();

COMMENT ON FUNCTION trg_evidence_on_accept IS
  'عند القبول: يمنع التقييم الذاتي · ويشترط المرساة والعام · ويمنح E-YYYY-NNNN (3.2 · 3.3 · 3.4)';

-- ── (6) الهويّة لا تُغيَّر بعد منحها ─────────────────────────────
CREATE OR REPLACE FUNCTION trg_evidence_code_immutable() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF OLD.code IS NOT NULL AND NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'الهويّة الثابتة لا تتغيّر: % (3.4)', OLD.code
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS evidence_code_immutable ON evidence;
CREATE TRIGGER evidence_code_immutable
  BEFORE UPDATE OF code ON evidence
  FOR EACH ROW EXECUTE FUNCTION trg_evidence_code_immutable();

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- التحقّق — يُشغَّل بعد الترحيل
-- ════════════════════════════════════════════════════════════════
-- SELECT 'أسباب الرفض الستّة' AS الفحص,
--        (SELECT count(*) FROM dropdown_options
--          WHERE category = 'evidence_reject_reason' AND is_active)::text AS الفعلي, '6' AS المتوقع
-- UNION ALL SELECT 'عمود reject_reason_code',
--        (SELECT count(*) FROM information_schema.columns
--          WHERE table_name='evidence' AND column_name='reject_reason_code')::text, '1'
-- UNION ALL SELECT 'فهرس الطابور',
--        (SELECT count(*) FROM pg_indexes WHERE indexname='idx_evidence_triage_queue')::text, '1'
-- UNION ALL SELECT 'جدول العدّاد',
--        (SELECT count(*) FROM information_schema.tables
--          WHERE table_name='evidence_code_counters')::text, '1'
-- UNION ALL SELECT 'مُشغِّلا القبول والهويّة',
--        (SELECT count(*) FROM pg_trigger
--          WHERE NOT tgisinternal
--            AND tgname IN ('evidence_on_accept','evidence_code_immutable'))::text, '2'
-- UNION ALL SELECT 'أدلة مقبولة بلا هويّة (قبل اليوم)',
--        (SELECT count(*) FROM evidence
--          WHERE status='accepted' AND code IS NULL AND deleted_at IS NULL)::text, '—';

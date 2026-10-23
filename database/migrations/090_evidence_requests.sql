-- ════════════════════════════════════════════════════════════════
-- 090 · طلب الدليل الموجَّه — القناة الثالثة
--
-- المرجع: الوثيقة 3.1 (القنوات الأربع · حياة الطلب) · 14‑أ
-- (`evidence_requests`) · 10 (الأدوار).
--
-- ── لماذا سجلٌّ مستقلّ لا صفٌّ في `tasks` ──
-- «ولا يُستعمل جدول المهامّ لهذا: مهام الخطط تخضع لمُشغّل التجميد
--  ولإشعارات التأخير ولعدّادات الإنجاز. **سجلٌّ خفيف مستقلّ**، وتجربة
--  مستخدم واحدة» (3.1). فطلبُ دليلٍ لو صار مهمّةً دخل نسبة إنجاز
-- الخطة وتجمّد بتجميدها — وهو ليس من الخطة أصلاً.
--
-- ── وقيمته: نقل عبء الدقّة إلى من يملكها ──
-- «منسّق الجودة — وهو من يعرف الإطار — يحدّد المؤشّر عند الطلب، فينتقل
--  عبء الدقّة إلى من يملكها، **ويُرفع عن المعلّم تماماً**» (3.1).
-- فالمرساة تُولد مع الطلب، والموظّف **يرفع الملفّ فقط**.
--
-- ── والحالات ثلاث، ويُغلق بالقبول لا بالرفع ──
--   open      مفتوح — يظهر في «أدلة مطلوبة» حتى المهلة
--   in_review قيد التقييم — يخرج من قائمة المكلَّف **ولا يُحتسب مسدوداً**
--   closed    مغلق — **وعندها وحدها تُحتسب الفجوة مسدودة**
-- «ولو أُغلق الطلب بمجرّد الرفع لأمكن إغلاقه بملفّ مرفوض، فتظهر
--  التغطية مكتملةً والفجوة قائمة — **وفجوةٌ مستورة أسوأ من فجوة
--  ظاهرة**، لأن الأولى تُكتشف عند زيارة المقيّم لا قبلها» (3.1).
-- وهذا نصُّ حارسِ (4) أدناه.
--
-- ── ولا حالةَ «أُلغي» ──
-- الوثيقة تنصّ على ثلاث، فطلبٌ أُرسل خطأً **يُحذف حذفاً ناعماً**
-- (`deleted_at`) ولا يُخترع له طورٌ رابع في دورة الحياة: الملغى
-- لم يكن، والمغلق سدّ فجوة — وخلطهما يُفسد كل عدٍّ للفجوات.
--
-- متطلّبات: 073 (`evidence.source` يقبل `request` أصلاً) · 084 · 088.
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ── (1) الطلب ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evidence_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE
                DEFAULT my_school_id(),
  -- الطالب: منسّق الجودة أو عضو فريق تركيز (10)
  requested_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- المكلَّف: موظّف واحد بعينه — «تلبية أدلة مطلوبة» (10)
  assigned_to   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- ── المرساة تُولد مع الطلب (3.1) ──
  sub_node_id   UUID NOT NULL REFERENCES framework_nodes(id) ON DELETE RESTRICT,
  -- المؤشرات المطلوبة؛ فراغُها يعني «المعيار الفرعي كاملاً» (3.3)
  indicator_ids UUID[] NOT NULL DEFAULT '{}',

  what_is_asked TEXT NOT NULL,            -- ما المطلوب بالضبط — بنصّ الطالب
  expected_type TEXT,                     -- نوع الدليل المتوقَّع (استرشاديّ)
  academic_year TEXT,                     -- العام المنسوب المطلوب (3.8)
  due_date      DATE,                     -- المهلة

  status        TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'in_review', 'closed')),
  evidence_id   UUID REFERENCES evidence(id) ON DELETE SET NULL,  -- محاولةُ التلبية الجارية
  attempts      INT  NOT NULL DEFAULT 0,  -- كم مرّةً رُفع له دليل
  last_reject   TEXT,                     -- سبب آخر رفض — يُعرَض للمكلَّف (3.1)
  -- ولمّا يُقبل دليلٌ بمرساةٍ غير المطلوبة: الدليل يُحفظ والطلب يبقى مفتوحاً (3.1)
  diverted_note TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at     TIMESTAMPTZ,
  deleted_at    TIMESTAMPTZ               -- طلبٌ أُرسل خطأً: يُحذف ولا يُغلق
);

CREATE INDEX IF NOT EXISTS idx_ev_requests_mine
  ON evidence_requests (assigned_to, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ev_requests_school
  ON evidence_requests (school_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ev_requests_node
  ON evidence_requests (sub_node_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE evidence_requests IS
  'طلب دليل موجَّه — سجلٌّ خفيف مستقلّ عن المهامّ، يُغلق بالقبول لا بالرفع (3.1)';
COMMENT ON COLUMN evidence_requests.indicator_ids IS
  'المؤشرات المطلوبة؛ وفراغها «يغطّي المعيار الفرعي كاملاً» — تغطيةٌ ضمنية (3.3)';
COMMENT ON COLUMN evidence_requests.diverted_note IS
  'دليلٌ سليم قُبل في غير موضع الطلب — «ولا يُهدر عملٌ صحيح لأن طالبه أخطأ في التوجيه» (3.1)';

-- ── (2) أثر الطلب على الدليل ────────────────────────────────────
-- `source='request'` مقبولٌ في قيد 073 أصلاً — وهذا هو الرابط.
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS request_id UUID
  REFERENCES evidence_requests(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_evidence_request ON evidence (request_id)
  WHERE request_id IS NOT NULL;
COMMENT ON COLUMN evidence.request_id IS
  'الطلب الموجَّه الذي لُبّي بهذا الدليل — و`source` يبقى `request` (3.1)';

-- ── (3) العزل ───────────────────────────────────────────────────
ALTER TABLE evidence_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS evidence_requests_school ON evidence_requests;
CREATE POLICY evidence_requests_school ON evidence_requests FOR ALL
  USING (school_id = my_school_id()) WITH CHECK (school_id = my_school_id());

-- ── (4) الحاجز: لا يُغلق طلبٌ بغير دليلٍ مقبول ──────────────────
-- الطبقة الثالثة لقاعدة «يُغلق بالقبول لا بالرفع». والمنفذ يحكم أوّلاً،
-- وهذا يمنع ما يأتي من أيّ مسارٍ آخر — نصّ 3.1 حرفياً: «ولو أُغلق
-- الطلب بمجرّد الرفع لأمكن إغلاقه بملفّ مرفوض، فتظهر التغطية مكتملةً
-- والفجوة قائمة».
CREATE OR REPLACE FUNCTION trg_request_close_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_status text;
BEGIN
  IF NEW.status = 'closed' AND COALESCE(OLD.status, '') <> 'closed' THEN
    IF NEW.evidence_id IS NULL THEN
      RAISE EXCEPTION 'لا يُغلق الطلب بغير دليل — والإغلاق بالقبول لا بالرفع (3.1).'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT status INTO v_status FROM evidence WHERE id = NEW.evidence_id;
    IF COALESCE(v_status, '') <> 'accepted' THEN
      RAISE EXCEPTION 'دليل الطلب حاله «%» لا «مقبول» — وفجوةٌ مستورة أسوأ من فجوة ظاهرة (3.1).',
        COALESCE(v_status, 'غير موجود') USING ERRCODE = 'check_violation';
    END IF;
    NEW.closed_at := NOW();
  END IF;

  IF NEW.status <> 'closed' THEN NEW.closed_at := NULL; END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS request_close_guard ON evidence_requests;
CREATE TRIGGER request_close_guard
  BEFORE INSERT OR UPDATE ON evidence_requests
  FOR EACH ROW EXECUTE FUNCTION trg_request_close_guard();

-- ── (5) ورفضُ الدليل يُعيد طلبه مفتوحاً ─────────────────────────
-- «رُفض الدليل → يعود مفتوحاً إلى المكلَّف ومعه سبب الرفض» (3.1).
-- والمنفذ يفعلها، وهذا يحرسها من أيّ مسارٍ ينسى: رفضٌ من أدوات المشرف
-- أو إعادة فتحٍ لدليلٍ مقبول — كلّها تُعيد الفجوة ظاهرة.
CREATE OR REPLACE FUNCTION trg_request_follow_evidence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.request_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.status = 'rejected' AND COALESCE(OLD.status, '') <> 'rejected' THEN
    UPDATE evidence_requests
       SET status = 'open', last_reject = NEW.reject_reason_code, updated_at = NOW()
     WHERE id = NEW.request_id AND status <> 'closed';
  ELSIF NEW.status = 'pending' AND OLD.status = 'accepted' THEN
    /* إعادة فتح الدليل المقبول (3.2) تُعيد طلبه إلى «قيد التقييم»:
       الفجوة لم تعد مسدودة، ولا تُعاد على المكلَّف لأنه رفع ما عليه. */
    UPDATE evidence_requests
       SET status = 'in_review', closed_at = NULL, updated_at = NOW()
     WHERE id = NEW.request_id;
  END IF;
  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS request_follow_evidence ON evidence;
CREATE TRIGGER request_follow_evidence
  AFTER UPDATE OF status ON evidence
  FOR EACH ROW EXECUTE FUNCTION trg_request_follow_evidence();

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- التحقّق — يُشغَّل بعد الترحيل
-- ════════════════════════════════════════════════════════════════
-- SELECT 'جدول الطلبات' AS الفحص,
--        (SELECT count(*) FROM information_schema.tables WHERE table_name='evidence_requests')::text AS الفعلي, '1' AS المتوقع
-- UNION ALL SELECT 'عمود evidence.request_id',
--        (SELECT count(*) FROM information_schema.columns
--          WHERE table_name='evidence' AND column_name='request_id')::text, '1'
-- UNION ALL SELECT 'حارس الإغلاق',
--        (SELECT count(*) FROM pg_trigger WHERE tgname='request_close_guard' AND NOT tgisinternal)::text, '1'
-- UNION ALL SELECT 'حارس تتبُّع الدليل',
--        (SELECT count(*) FROM pg_trigger WHERE tgname='request_follow_evidence' AND NOT tgisinternal)::text, '1'
-- UNION ALL SELECT 'سياسة العزل',
--        (SELECT count(*) FROM pg_policies WHERE policyname='evidence_requests_school')::text, '1';

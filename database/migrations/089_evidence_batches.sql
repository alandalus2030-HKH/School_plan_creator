-- ════════════════════════════════════════════════════════════════
-- 089 · الرفع الجماعي: الدفعة وورقة التهيئة
--
-- المرجع: الوثيقة 3.6.1 (من المجلّد إلى المخزن) · 3.8 (العام المنسوب)
-- · 14‑أ (`evidence_batches`).
--
-- ── لماذا جدولٌ وسيط ولا تُنشأ الأدلة فوراً ──
-- «دفعة قيد التهيئة — **لا تدخل المخزن ولا تظهر في طابور أيّ فريق**».
-- فلو أنشأنا صفوف `evidence` عند الابتلاع لدخلت المخزن والطوابير
-- والعدّادات ناقصةَ الحقول، ولاحتجنا حالةً رابعة تُستثنى في كل
-- استعلام. والوسيط يُبقي المخزن نظيفاً: لا شيء فيه إلا ما اكتمل.
--
-- ── والدفعة أسلوب إدخال لا قناة ──
-- «الدليل المرفوع في دفعة مصدره **رفع مباشر**، والدفعة لا تظهر في
--  `source`». فـ`evidence.batch_id` (قائم منذ 073) أثرٌ يُتتبَّع به،
-- و`source` يبقى `direct`.
--
-- ── والملفّ = دليل، والدمج قبل القبول ──
-- «كل ملفّ في الدفعة دليلٌ مستقلّ افتراضاً… ولشاشة المراجعة زرّ «ادمج
--  المحدَّد في دليل واحد»… **والدمج قبل القبول حتماً**: الرقم الثابت
--  يُمنح عند القبول ولا يتغيّر، فدمجٌ بعده يُبطل رقماً منشوراً في
--  تقرير». فالدمج هنا `merge_group` في الوسيط، ويُحسم قبل أن يوجد رقم.
--
-- متطلّبات: 073 (`evidence.batch_id`) · 084 · 088.
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ── (1) الدفعة ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evidence_batches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at     TIMESTAMPTZ,
  -- staging = قيد التهيئة (خارج المخزن) · sent = أُرسلت فصارت أدلة · discarded = أُهملت
  status      TEXT NOT NULL DEFAULT 'staging'
              CHECK (status IN ('staging', 'sent', 'discarded')),
  -- «افتراض الدفعة»: هذه كلّها من 2022-2023 — يُختار عند البدء ويُستثنى منه ما يُخالفه (3.6.1)
  year_default TEXT,
  reason_code  TEXT,                      -- السبب المصنَّف للدفعة كلّها (3.2)
  note         TEXT
);

COMMENT ON TABLE evidence_batches IS
  'دفعة رفعٍ جماعيّ قيد التهيئة — لا تدخل المخزن ولا طوابير الفرق قبل اكتمال الحقول المانعة (3.6.1)';

-- ── (2) صفوف ورقة التهيئة — صفُّها ملفّ ─────────────────────────
CREATE TABLE IF NOT EXISTS evidence_batch_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id      UUID NOT NULL REFERENCES evidence_batches(id) ON DELETE CASCADE,
  order_num     INT  NOT NULL DEFAULT 1,
  file_name     TEXT NOT NULL,
  file_url      TEXT NOT NULL,
  file_type     TEXT,
  file_size     BIGINT,
  content_hash  TEXT NOT NULL,            -- البصمة تُحسب في الابتلاع (11)
  -- أعمدة ورقة التهيئة
  academic_year TEXT,                     -- مانع
  document_date DATE,
  evidence_type TEXT,
  sub_node_id   UUID REFERENCES framework_nodes(id) ON DELETE RESTRICT,  -- مانع
  name_override TEXT,                     -- اسم الدليل إن خالف اسم الملفّ
  -- الدمج: ملفّات مجموعةٍ واحدة تصير دليلاً واحداً (3.6.1)
  merge_group   INT,
  -- المكرّر يُسقَط «قبل أن يُتعب أحداً» — ويُحفظ أثره لا يُمحى
  dup_of        UUID REFERENCES evidence_files(id) ON DELETE SET NULL,
  dropped       BOOLEAN NOT NULL DEFAULT FALSE,
  evidence_id   UUID REFERENCES evidence(id) ON DELETE SET NULL,  -- يُملأ عند الإرسال
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_batch_items_batch ON evidence_batch_items (batch_id, order_num);
CREATE INDEX IF NOT EXISTS idx_batch_items_hash  ON evidence_batch_items (content_hash);

COMMENT ON COLUMN evidence_batch_items.merge_group IS
  'ملفّات المجموعة الواحدة تصير دليلاً واحداً — والدمج قبل القبول حتماً (3.6.1 · 3.4)';
COMMENT ON COLUMN evidence_batch_items.dup_of IS
  'مكرّرٌ كُشف بالبصمة — يُعرَض ويُسقَط، ولا يُمحى أثره (11)';

-- ── (3) العزل: الدفعة تتبع مدرستها ──────────────────────────────
ALTER TABLE evidence_batches      ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_batch_items  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS evidence_batches_school ON evidence_batches;
CREATE POLICY evidence_batches_school ON evidence_batches FOR ALL
  USING (school_id = my_school_id()) WITH CHECK (school_id = my_school_id());

DROP POLICY IF EXISTS evidence_batch_items_school ON evidence_batch_items;
CREATE POLICY evidence_batch_items_school ON evidence_batch_items FOR ALL
  USING (EXISTS (SELECT 1 FROM evidence_batches b
                 WHERE b.id = evidence_batch_items.batch_id AND b.school_id = my_school_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM evidence_batches b
                 WHERE b.id = evidence_batch_items.batch_id AND b.school_id = my_school_id()));

-- ── (4) الحاجز: لا تُرسَل دفعةٌ ناقصة الحقول المانعة ────────────
-- «فالتهيئة تطالب باثنين وتتسامح في الباقي، والدفعة لا تُرسَل حتى
--  يكتملا. وبغير هذا الحاجز ينهمر مئتا صفّ ناقص على خمسة فرق،
--  فتُشلّ شاشة الفرز التي بُنيت أصلاً لتسريعها» (3.6.1).
CREATE OR REPLACE FUNCTION trg_batch_send_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_bad  int;
  v_rows int;
BEGIN
  IF NEW.status IS DISTINCT FROM 'sent' OR OLD.status = 'sent' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_rows FROM evidence_batch_items
  WHERE batch_id = NEW.id AND NOT dropped;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'لا صفوف في الدفعة — أضِف ملفّات أو أهملها.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_bad FROM evidence_batch_items
  WHERE batch_id = NEW.id AND NOT dropped
    AND (sub_node_id IS NULL OR academic_year IS NULL OR academic_year !~ '^\d{4}-\d{4}$');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'في الدفعة % صفّاً ناقص المعيار الفرعي أو العام — وهما الحقلان المانعان (3.6.1).', v_bad
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.sent_at := NOW();
  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS batch_send_guard ON evidence_batches;
CREATE TRIGGER batch_send_guard
  BEFORE UPDATE OF status ON evidence_batches
  FOR EACH ROW EXECUTE FUNCTION trg_batch_send_guard();

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- التحقّق — يُشغَّل بعد الترحيل
-- ════════════════════════════════════════════════════════════════
-- SELECT 'جدول الدفعات' AS الفحص,
--        (SELECT count(*) FROM information_schema.tables WHERE table_name='evidence_batches')::text AS الفعلي, '1' AS المتوقع
-- UNION ALL SELECT 'جدول صفوف التهيئة',
--        (SELECT count(*) FROM information_schema.tables WHERE table_name='evidence_batch_items')::text, '1'
-- UNION ALL SELECT 'حاجز الإرسال',
--        (SELECT count(*) FROM pg_trigger WHERE tgname='batch_send_guard' AND NOT tgisinternal)::text, '1'
-- UNION ALL SELECT 'سياستا العزل',
--        (SELECT count(*) FROM pg_policies
--          WHERE policyname IN ('evidence_batches_school','evidence_batch_items_school'))::text, '2'
-- UNION ALL SELECT 'عمود evidence.batch_id (من 073)',
--        (SELECT count(*) FROM information_schema.columns
--          WHERE table_name='evidence' AND column_name='batch_id')::text, '1';

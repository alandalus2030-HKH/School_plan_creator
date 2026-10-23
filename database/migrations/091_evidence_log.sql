-- ════════════════════════════════════════════════════════════════
-- 091 · سجلّ الدليل — `evidence_assignments`
--
-- المرجع: الوثيقة 9.3 (سجلّ الدليل · ما يخرج وما يبقى) · 11 (المصداقية)
-- · 14‑أ (`evidence_assignments`) · 10 (المقيّم الخارجي قراءةً).
--
-- ── ما هو ──
-- «سجلٌّ **لا يُحرَّر** لكل دليل مقبول: من رفعه ومتى · من قبله ومتى ·
--  **وما تغيّر فيه بعد القبول**. والفهرس يقول ماذا عندك، ومصفوفة
--  التغطية تقول أين يقع، **وهذا يقول كيف صار إلى هنا**.»
--
-- وقيمته أنه يجيب سؤال المقيّم الحقيقيّ: «أهذا معاصرٌ للعمل أم صُنع قبل
-- الزيارة؟» — «فتاريخ الرفع غير تاريخ الوثيقة · والرافع غير القابل
-- فيُرى منع التقييم الذاتي **ولا يُدَّعى**». و«البصمة تُثبت الثبات لا
-- الصدق… والذي يجيب عن التاريخ **سجلّ الدليل** لا البصمة» (11).
--
-- ── ولماذا تكتبه القاعدة لا المنافذ ──
-- الدرس المُكلّف في CLAUDE.md: ما يُحرَس في الكود وحده يفلت من مسارٍ
-- آخر. وسجلٌّ يكتبه كل منفذٍ بنفسه ينقصه ما نسيه منفذ — وأدوات المشرف
-- تُعدّل بـSQL مباشرةً فلا تمرّ بمنفذٍ أصلاً. فالمُشغِّلات تكتب
-- **الواقعة** دائماً، و**النسبةُ** (الفاعل والسبب) تأتي من ختمٍ
-- يضعه المنفذ: فإن نسيه منفذٌ بقيت الواقعة مسجَّلةً مجهولةَ الفاعل —
-- **ولا تضيع**. وهذا أسلم من العكس.
--
-- ── ولا يُحرَّر ولا يُحذف ──
-- حارسٌ يرفض UPDATE وDELETE على الجدول. ويُستثنى الحذف المتسلسل مع
-- الدليل نفسه (تفريغ مدرسةٍ قبل الإطلاق — 16)، بنمط 088: إن لم يبق
-- الدليل فلا شيء يُحرَس.
--
-- ── وما يخرج للمقيّم وما يبقى داخلياً (9.3) ──
-- «القاعدة: يخرج ما يخصّ **الدليل المقبول**، ولا يخرج ما يخصّ
--  **المداولة**.» فالتصنيف صفةُ نوع الواقعة لا عمودٌ يُخزَّن — وهو
-- محسوبٌ في `src/lib/evidenceLog.ts` مصدراً واحداً، عملاً بقاعدة
-- «المحسوب لا يُخزَّن» (14).
--
-- متطلّبات: 073 · 084 · 088 · 090.
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ── (1) ختمُ آخر تغيير على الدليل ───────────────────────────────
-- عمودان لا يُقرآن للعرض: المُشغِّل ينسخهما إلى السجلّ ثمّ يُفرغ السبب.
-- و`reviewed_by` لا يكفي: عند إعادة الفتح يُمسح (فيصير المجهول قاعدةً
-- لا استثناء)، والمنفذ القديم لا يملأه أصلاً في تعديل الحقول.
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS changed_by    UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS change_reason TEXT;
COMMENT ON COLUMN evidence.changed_by IS
  'فاعل آخر تغيير — ختمٌ يضعه المنفذ لينسبه سجلّ الدليل (9.3)، لا حالةٌ تُعرَض';
COMMENT ON COLUMN evidence.change_reason IS
  'سبب آخر تغيير — يُنسخ إلى السجلّ ثم يُفرغ، فلا يشيخ على الصفّ';

-- ── (2) السجلّ ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evidence_assignments (
  id          BIGSERIAL PRIMARY KEY,
  evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- الواقعة: ما جرى للدليل
  event       TEXT NOT NULL CHECK (event IN (
                'uploaded',            -- رُفع — ومعه قناته
                'accepted',            -- قُبل — وعندها يُمنح الرقم الثابت
                'rejected',            -- رُفض بسببٍ مصنَّف (داخليّ 9.3)
                'reopened',            -- نُقض الحكم بسببٍ مكتوب
                'edited_after_accept', -- تغيّر فيه بعد القبول (يخرج للمقيّم)
                'anchor_added',        -- أُسند إلى بندٍ من الإطار
                'anchor_removed',
                'anchor_confirmed',    -- أكّد الفريق المستقبِل مرساةً واردة
                'anchor_declined',
                'fixity_alert'         -- بصمةٌ تبدّلت أو ملفٌّ فُقد (11)
              )),
  actor_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,  -- NULL = مجهولُ النسبة لا مجهولُ الواقعة
  from_status TEXT,
  to_status   TEXT,
  reason_code TEXT,                    -- من القائمة المغلقة حيث توجد
  reason_text TEXT,                    -- النصّ الحرّ: سبب إعادة الفتح مثلاً
  node_id     UUID REFERENCES framework_nodes(id) ON DELETE SET NULL,  -- لوقائع المراسي
  detail      JSONB                    -- ما يخصّ الواقعة وحدها (الحقل المتغيّر · الملفّ)
);

CREATE INDEX IF NOT EXISTS idx_ev_log_evidence ON evidence_assignments (evidence_id, at);
CREATE INDEX IF NOT EXISTS idx_ev_log_school   ON evidence_assignments (school_id, at DESC);

COMMENT ON TABLE evidence_assignments IS
  'سجلّ الدليل — لا يُحرَّر ولا يُحذف: كيف صار الدليل إلى هنا (9.3 · 11)';

-- ── (3) العزل ───────────────────────────────────────────────────
ALTER TABLE evidence_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS evidence_log_school ON evidence_assignments;
CREATE POLICY evidence_log_school ON evidence_assignments FOR SELECT
  USING (school_id = my_school_id());
-- ولا سياسة كتابةٍ لأحد: المُشغِّلات وحدها تكتب (SECURITY DEFINER).

-- ── (4) لا يُحرَّر ولا يُحذف ────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_evidence_log_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_exists boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'سجلّ الدليل لا يُحرَّر — «سجلٌّ لا يُحرَّر» (9.3).'
      USING ERRCODE = 'check_violation';
  END IF;
  /* الحذف المتسلسل مع الدليل مستثنى (نمط 088): إن ذهب الدليل فلا شيء يُحرَس */
  SELECT EXISTS (SELECT 1 FROM evidence WHERE id = OLD.evidence_id) INTO v_exists;
  IF v_exists THEN
    RAISE EXCEPTION 'سجلّ الدليل لا يُحذف — وهو ما يحوّل الملفّ من ادّعاء إلى بيّنة (9.3).'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END; $fn$;

DROP TRIGGER IF EXISTS evidence_log_immutable ON evidence_assignments;
CREATE TRIGGER evidence_log_immutable
  BEFORE UPDATE OR DELETE ON evidence_assignments
  FOR EACH ROW EXECUTE FUNCTION trg_evidence_log_immutable();

-- ── (5) الكتابة: وقائع الدليل نفسه ──────────────────────────────
CREATE OR REPLACE FUNCTION trg_evidence_log_evidence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_actor  uuid;
  v_fields text[] := '{}';
BEGIN
  /* دليلٌ بلا مدرسة (مسارٌ قديم لم يملأ العمود) لا يُسجَّل ولا يُسقِط
     الرفع: درس «قيد NOT NULL يكسر كل مسار إدخال لا يذكره». والواقعة
     تُستدرك ببذرٍ لاحق، والرفع لا يُحبَس على سجلٍّ. */
  IF COALESCE(NEW.school_id, OLD.school_id) IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO evidence_assignments
      (evidence_id, school_id, event, actor_id, to_status, detail)
    VALUES (NEW.id, NEW.school_id, 'uploaded',
            COALESCE(NEW.uploaded_by, NEW.changed_by), NEW.status,
            jsonb_build_object('source', NEW.source, 'academic_year', NEW.academic_year,
                               'document_date', NEW.document_date));
    RETURN NEW;
  END IF;

  /* الفاعل: ختم المنفذ أوّلاً، ثمّ المقيّم — ولا يُفترض أحد */
  v_actor := COALESCE(NEW.changed_by, NEW.reviewed_by);

  -- ٥‑أ · تحوّل الحال
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO evidence_assignments
      (evidence_id, school_id, event, actor_id, from_status, to_status,
       reason_code, reason_text, detail)
    VALUES (
      NEW.id, NEW.school_id,
      CASE WHEN NEW.status = 'accepted' THEN 'accepted'
           WHEN NEW.status = 'rejected' THEN 'rejected'
           ELSE 'reopened' END,
      v_actor, OLD.status, NEW.status,
      CASE WHEN NEW.status = 'rejected' THEN NEW.reject_reason_code ELSE NULL END,
      COALESCE(NEW.change_reason,
               CASE WHEN NEW.status = 'rejected' THEN NEW.review_note ELSE NULL END),
      CASE WHEN NEW.status = 'accepted'
           THEN jsonb_build_object('code', NEW.code, 'permanence', NEW.permanence)
           ELSE NULL END);
  END IF;

  -- ٥‑ب · «وما تغيّر فيه بعد القبول» (9.3) — ويخرج في حزمة المقيّم
  IF OLD.status = 'accepted' AND NEW.status = 'accepted' THEN
    IF NEW.academic_year IS DISTINCT FROM OLD.academic_year THEN v_fields := v_fields || 'academic_year'; END IF;
    IF NEW.document_date IS DISTINCT FROM OLD.document_date THEN v_fields := v_fields || 'document_date'; END IF;
    IF NEW.name          IS DISTINCT FROM OLD.name          THEN v_fields := v_fields || 'name'; END IF;
    IF NEW.permanence    IS DISTINCT FROM OLD.permanence    THEN v_fields := v_fields || 'permanence'; END IF;
    IF NEW.evidence_type IS DISTINCT FROM OLD.evidence_type THEN v_fields := v_fields || 'evidence_type'; END IF;
    IF NEW.owner_team_id IS DISTINCT FROM OLD.owner_team_id THEN v_fields := v_fields || 'owner_team_id'; END IF;

    IF array_length(v_fields, 1) > 0 THEN
      INSERT INTO evidence_assignments
        (evidence_id, school_id, event, actor_id, reason_text, detail)
      VALUES (NEW.id, NEW.school_id, 'edited_after_accept', v_actor, NEW.change_reason,
              jsonb_build_object('fields', to_jsonb(v_fields)));
    END IF;
  END IF;

  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS evidence_log_write ON evidence;
CREATE TRIGGER evidence_log_write
  AFTER INSERT OR UPDATE ON evidence
  FOR EACH ROW EXECUTE FUNCTION trg_evidence_log_evidence();

-- وختم السبب يُفرَغ بعد نسخه، فلا يشيخ على الصفّ ويُنسب إلى تغييرٍ تالٍ
CREATE OR REPLACE FUNCTION trg_evidence_clear_stamp() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.change_reason IS NOT NULL THEN
    UPDATE evidence SET change_reason = NULL WHERE id = NEW.id;
  END IF;
  RETURN NULL;
END; $fn$;

DROP TRIGGER IF EXISTS evidence_clear_stamp ON evidence;
CREATE TRIGGER evidence_clear_stamp
  AFTER INSERT OR UPDATE OF change_reason ON evidence
  FOR EACH ROW WHEN (pg_trigger_depth() = 1)
  EXECUTE FUNCTION trg_evidence_clear_stamp();

-- ── (6) الكتابة: وقائع الإسناد ──────────────────────────────────
-- «تعديلات الإسناد بعد القبول وأسبابها» تخرج في حزمة المقيّم (9.3) —
-- فهي أصدق ما يُقال عن تغطيةٍ تبدّلت.
CREATE OR REPLACE FUNCTION trg_evidence_log_anchor() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_school uuid;
  v_alive  boolean;
  v_evid   uuid;
BEGIN
  v_evid := COALESCE(NEW.evidence_id, OLD.evidence_id);
  SELECT school_id, (deleted_at IS NULL) INTO v_school, v_alive FROM evidence WHERE id = v_evid;
  /* ذاهبٌ مع الحذف المتسلسل: لا واقعة تُسجَّل على ميّت */
  IF v_school IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO evidence_assignments (evidence_id, school_id, event, actor_id, node_id, detail)
    VALUES (NEW.evidence_id, v_school, 'anchor_added', NEW.assigned_by, NEW.framework_node_id,
            jsonb_build_object('kind', NEW.kind, 'confirm_status', NEW.confirm_status));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO evidence_assignments (evidence_id, school_id, event, actor_id, node_id, detail)
    VALUES (OLD.evidence_id, v_school, 'anchor_removed', NULL, OLD.framework_node_id,
            jsonb_build_object('kind', OLD.kind));
  ELSIF NEW.confirm_status IS DISTINCT FROM OLD.confirm_status
        AND NEW.confirm_status IN ('confirmed', 'declined') THEN
    INSERT INTO evidence_assignments (evidence_id, school_id, event, actor_id, node_id)
    VALUES (NEW.evidence_id, v_school,
            CASE WHEN NEW.confirm_status = 'confirmed' THEN 'anchor_confirmed' ELSE 'anchor_declined' END,
            NEW.confirmed_by, NEW.framework_node_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END; $fn$;

DROP TRIGGER IF EXISTS evidence_log_anchor ON evidence_anchors;
CREATE TRIGGER evidence_log_anchor
  AFTER INSERT OR UPDATE OR DELETE ON evidence_anchors
  FOR EACH ROW EXECUTE FUNCTION trg_evidence_log_anchor();

-- ── (7) الكتابة: جرس البصمة ─────────────────────────────────────
-- «والقيمة أن يُكتشف التلف **قبل أن تُطلب الأدلة، لا يوم الزيارة**» (11).
-- ولا يُسجَّل إلا الانتقال إلى حالٍ سيّئة: الفحص السنويّ يمرّ على كل
-- ملفّ، فتسجيل «سليم» في كل مرّة يغرق السجلّ بما لا يُقرأ.
CREATE OR REPLACE FUNCTION trg_evidence_log_fixity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_school uuid;
BEGIN
  IF NEW.fixity_status NOT IN ('mismatch', 'missing')
     OR NEW.fixity_status IS NOT DISTINCT FROM OLD.fixity_status THEN
    RETURN NEW;
  END IF;
  SELECT school_id INTO v_school FROM evidence WHERE id = NEW.evidence_id;
  IF v_school IS NULL THEN RETURN NEW; END IF;

  INSERT INTO evidence_assignments (evidence_id, school_id, event, detail)
  VALUES (NEW.evidence_id, v_school, 'fixity_alert',
          jsonb_build_object('file', NEW.name, 'state', NEW.fixity_status));
  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS evidence_log_fixity ON evidence_files;
CREATE TRIGGER evidence_log_fixity
  AFTER UPDATE OF fixity_status ON evidence_files
  FOR EACH ROW EXECUTE FUNCTION trg_evidence_log_fixity();

-- ── (8) ما مضى: بذرُ واقعة الرفع لما في المخزن ─────────────────
-- السجلّ يبدأ من اليوم، وأدلةُ أمس بلا تاريخٍ لرفعها — فتظهر بلا أصل.
-- فتُبذر لكلٍّ واقعة «رُفع» من `created_at` و`uploaded_by` المحفوظين،
-- و«قُبل» من `reviewed_at` و`reviewed_by` حيث وُجدا. وما لا أثر له
-- لا يُخترع: المجهول يبقى مجهولاً.
INSERT INTO evidence_assignments (evidence_id, school_id, at, event, actor_id, to_status, detail)
SELECT e.id, e.school_id, e.created_at, 'uploaded', e.uploaded_by, 'pending',
       jsonb_build_object('source', e.source, 'backfilled', true)
FROM evidence e
WHERE e.school_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM evidence_assignments l
                  WHERE l.evidence_id = e.id AND l.event = 'uploaded');

INSERT INTO evidence_assignments (evidence_id, school_id, at, event, actor_id, from_status, to_status, detail)
SELECT e.id, e.school_id, e.reviewed_at, 'accepted', e.reviewed_by, 'pending', 'accepted',
       jsonb_build_object('code', e.code, 'backfilled', true)
FROM evidence e
WHERE e.school_id IS NOT NULL AND e.status = 'accepted' AND e.reviewed_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM evidence_assignments l
                  WHERE l.evidence_id = e.id AND l.event = 'accepted');

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- التحقّق — يُشغَّل بعد الترحيل
-- ════════════════════════════════════════════════════════════════
-- SELECT 'جدول السجلّ' AS الفحص,
--        (SELECT count(*) FROM information_schema.tables
--          WHERE table_name='evidence_assignments')::text AS الفعلي, '1' AS المتوقع
-- UNION ALL SELECT 'حارس عدم التحرير',
--        (SELECT count(*) FROM pg_trigger WHERE tgname='evidence_log_immutable' AND NOT tgisinternal)::text, '1'
-- UNION ALL SELECT 'كاتبات السجلّ الأربع',
--        (SELECT count(*) FROM pg_trigger
--          WHERE tgname IN ('evidence_log_write','evidence_log_anchor','evidence_log_fixity','evidence_clear_stamp')
--            AND NOT tgisinternal)::text, '4'
-- UNION ALL SELECT 'ختم آخر تغيير',
--        (SELECT count(*) FROM information_schema.columns
--          WHERE table_name='evidence' AND column_name IN ('changed_by','change_reason'))::text, '2'
-- UNION ALL SELECT 'سياسة القراءة',
--        (SELECT count(*) FROM pg_policies WHERE policyname='evidence_log_school')::text, '1'
-- UNION ALL SELECT 'وقائعُ بُذرت لما في المخزن',
--        (SELECT count(*) FROM evidence_assignments
--          WHERE detail->>'backfilled' = 'true')::text, NULL;

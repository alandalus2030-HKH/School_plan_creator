-- ════════════════════════════════════════════════════════════════
-- 073: أساس مخزن الأدلة — م1‑1 من خطة مسار الاعتماد
--
--   المرجع: docs/QNSA_ACCREDITATION_ARCHITECTURE.html (معتمدة 2026-09-30)
--   الأقسام: 3.1 القنوات · 3.3 الإسناد · 3.4 الترقيم · 3.5 الدوام ·
--            3.8 العام المنسوب · 11 البصمة · 14‑أ نموذج البيانات
--
--   ── لماذا هذا الترحيل أمنيّ لا إنشائيّ ──
--   الدليل اليوم لا يوجد إلا معلّقاً بمهمّة (task_id NOT NULL)، وعزل
--   المدرسة كلّه يمرّ عبر سلسلة: دليل ← مهمة ← عقدة ← خطة ← مدرسة.
--   والقناة المباشرة تُنتج دليلاً **بلا مهمّة** — فينقطع المسار وتسقط
--   الحراسة. فالمطلوب مسارٌ مباشر: evidence.school_id.
--
--   ── ما يبقى على حاله ──
--   • لا سطر كود في التطبيق: أدلة المهام يبقى لها task_id فتعمل الشاشات.
--   • evidence_number (الترقيم الهرميّ داخل المهمة) لا يُمسّ — وهو غير
--     code (الهويّة الثابتة E-YYYY-NNNN التي تُمنح عند القبول).
--   • evidence_type (ترحيل 021) هو «نوع الدليل» — لا عمود جديد له.
--   • evidence_links (الاستشهاد) يبقى على مساره القديم — موضعه لاحقاً.
--   • كل قيد قائم محفوظ: manage_evidence · منع تعديل المقبول ·
--     قفل المهمة المرفوعة/المنجزة — لكنّ الأخير يسري **حين توجد مهمة**.
--
--   ── التراجع ──
--   database/migrations/073_rollback.sql يعيد سياسات 038+039+049.
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════
-- (1) أعمدة evidence
-- ════════════════════════════════════════════════════════════════

ALTER TABLE evidence ADD COLUMN IF NOT EXISTS school_id       UUID REFERENCES schools(id) ON DELETE CASCADE;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS source          TEXT NOT NULL DEFAULT 'plan';
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS reason_code     TEXT;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS academic_year   TEXT;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS document_date   DATE;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS permanence      TEXT NOT NULL DEFAULT 'period';
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS last_reviewed_at DATE;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS owner_team_id   UUID;   -- يُربط بـ focus_teams في م1‑2
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS batch_id        UUID;   -- يُربط بـ evidence_batches في م1‑9
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS code            TEXT;   -- الهويّة الثابتة، تُمنح عند القبول

COMMENT ON COLUMN evidence.school_id     IS 'مسار عزل المدرسة المباشر — لا يمرّ عبر المهمة (3.1)';
COMMENT ON COLUMN evidence.source        IS 'قناة الدخول: plan|direct|request|recurring — تُسجَّل مرّةً ولا تتبدّل (3.4)';
COMMENT ON COLUMN evidence.reason_code   IS 'سبب الرفع خارج خطة — قيمه من dropdown_options لاحقاً (م1‑3)';
COMMENT ON COLUMN evidence.academic_year IS 'العام المنسوب «2026-2027» — حكمٌ لا اشتقاق (3.8)';
COMMENT ON COLUMN evidence.permanence    IS 'period=دليل فترة ينتهي بدورته · permanent=وثيقة دائمة تعبر الدورات (3.5)';
COMMENT ON COLUMN evidence.code          IS 'E-YYYY-NNNN بسنة القبول — هويّة لا تتغيّر أبداً (3.4). غير evidence_number';

-- قيود القيم (لا تُطبَّق على البيانات القائمة إلا بعد تعبئتها أدناه)
ALTER TABLE evidence DROP CONSTRAINT IF EXISTS evidence_source_check;
ALTER TABLE evidence ADD  CONSTRAINT evidence_source_check
  CHECK (source IN ('plan','direct','request','recurring'));

ALTER TABLE evidence DROP CONSTRAINT IF EXISTS evidence_permanence_check;
ALTER TABLE evidence ADD  CONSTRAINT evidence_permanence_check
  CHECK (permanence IN ('period','permanent'));

-- صيغة العام الدراسي «2026-2027» — حارسٌ خفيف يمنع 2026 أو 26-27
ALTER TABLE evidence DROP CONSTRAINT IF EXISTS evidence_academic_year_check;
ALTER TABLE evidence ADD  CONSTRAINT evidence_academic_year_check
  CHECK (academic_year IS NULL OR academic_year ~ '^\d{4}-\d{4}$');

-- ════════════════════════════════════════════════════════════════
-- (2) تعبئة school_id من مسار المهمة ثم إلزامه
--     (لا أيتام: evidence.task_id له ON DELETE CASCADE)
-- ════════════════════════════════════════════════════════════════

UPDATE evidence e
SET    school_id = p.school_id
FROM   tasks t
JOIN   plan_nodes n ON n.id = t.node_id
JOIN   plans p      ON p.id = n.plan_id
WHERE  t.id = e.task_id
  AND  e.school_id IS DISTINCT FROM p.school_id;

-- أيّ صفّ بقي بلا مدرسة يُوقف الترحيل — لا نُلزم عموداً فيه فراغ
DO $do$
DECLARE orphan int;
BEGIN
  SELECT count(*) INTO orphan FROM evidence WHERE school_id IS NULL;
  IF orphan > 0 THEN
    RAISE EXCEPTION 'توقّف الترحيل: % دليلاً بلا school_id — افحصها قبل المتابعة', orphan;
  END IF;
END $do$;

ALTER TABLE evidence ALTER COLUMN school_id SET NOT NULL;

-- ════════════════════════════════════════════════════════════════
-- (3) task_id يصير اختيارياً — وهو ما يفتح القناة المباشرة
-- ════════════════════════════════════════════════════════════════

ALTER TABLE evidence ALTER COLUMN task_id DROP NOT NULL;

-- الهويّة الثابتة فريدة داخل المدرسة (وتُمنح عند القبول فقط، فالفراغ مسموح)
DROP INDEX IF EXISTS idx_evidence_code_unique;
CREATE UNIQUE INDEX idx_evidence_code_unique
  ON evidence(school_id, code) WHERE code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_evidence_school      ON evidence(school_id);
CREATE INDEX IF NOT EXISTS idx_evidence_school_year ON evidence(school_id, academic_year);
CREATE INDEX IF NOT EXISTS idx_evidence_source      ON evidence(school_id, source);

-- ════════════════════════════════════════════════════════════════
-- (4) بصمة المحتوى — على الملفّ لا على الدليل
--     الدليل الواحد يحمل ملفّات، والبصمة تخصّ بايتات كل ملفّ (11)
-- ════════════════════════════════════════════════════════════════

ALTER TABLE evidence_files ADD COLUMN IF NOT EXISTS content_hash   TEXT;
ALTER TABLE evidence_files ADD COLUMN IF NOT EXISTS last_fixity_at TIMESTAMPTZ;
ALTER TABLE evidence_files ADD COLUMN IF NOT EXISTS fixity_status  TEXT;

COMMENT ON COLUMN evidence_files.content_hash   IS 'SHA-256 بالست عشري — يحسبها الخادم وهي المعتمدة (11)';
COMMENT ON COLUMN evidence_files.last_fixity_at IS 'آخر فحص دوريّ لسلامة الملفّ — fixity check';

ALTER TABLE evidence_files DROP CONSTRAINT IF EXISTS evidence_files_fixity_status_check;
ALTER TABLE evidence_files ADD  CONSTRAINT evidence_files_fixity_status_check
  CHECK (fixity_status IS NULL OR fixity_status IN ('ok','mismatch','missing'));

-- كشف التكرار داخل المدرسة الواحدة (لا قيد فريد — التكرار يُعرَض لا يُمنع)
CREATE INDEX IF NOT EXISTS idx_evidence_files_hash ON evidence_files(content_hash);

-- ════════════════════════════════════════════════════════════════
-- (5) evidence_anchors — مراسي الدليل في الإطار (3.3)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS evidence_anchors (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id       UUID NOT NULL REFERENCES evidence(id)        ON DELETE CASCADE,
  framework_node_id UUID NOT NULL REFERENCES framework_nodes(id) ON DELETE RESTRICT,
  -- specific = مخصوص بمؤشّر · implicit = تغطية ضمنية للمعيار الفرعي كاملاً
  kind              TEXT NOT NULL DEFAULT 'specific'
                    CHECK (kind IN ('specific','implicit')),
  -- المرساة الواردة على فريق آخر لا تُحتسب في التغطية قبل تأكيدها (3.2)
  confirm_status    TEXT NOT NULL DEFAULT 'confirmed'
                    CHECK (confirm_status IN ('pending','confirmed','declined')),
  assigned_by       UUID REFERENCES profiles(id),
  assigned_at       TIMESTAMPTZ DEFAULT NOW(),
  confirmed_by      UUID REFERENCES profiles(id),
  confirmed_at      TIMESTAMPTZ,
  note              TEXT,
  UNIQUE (evidence_id, framework_node_id)
);

COMMENT ON TABLE  evidence_anchors IS 'ما يغطّيه الدليل من الإطار — بالمعرّف الثابت لا بالكود النصّي (3.3)';
COMMENT ON COLUMN evidence_anchors.confirm_status IS 'pending للمرساة الواردة على فريق آخر — ولا تُحتسب قبل confirmed (3.2)';

CREATE INDEX IF NOT EXISTS idx_anchors_evidence ON evidence_anchors(evidence_id);
-- الفهرس العكسيّ: من عقدة الإطار إلى أدلّتها — أساس مصفوفة التغطية
CREATE INDEX IF NOT EXISTS idx_anchors_node     ON evidence_anchors(framework_node_id, confirm_status);

ALTER TABLE evidence_anchors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anchors_select" ON evidence_anchors;
CREATE POLICY "anchors_select" ON evidence_anchors FOR SELECT
USING (EXISTS (
  SELECT 1 FROM evidence e
  WHERE e.id = evidence_anchors.evidence_id AND e.school_id = my_school_id()
));

DROP POLICY IF EXISTS "anchors_write" ON evidence_anchors;
CREATE POLICY "anchors_write" ON evidence_anchors FOR ALL
USING (has_permission('manage_evidence') AND EXISTS (
  SELECT 1 FROM evidence e
  WHERE e.id = evidence_anchors.evidence_id AND e.school_id = my_school_id()
))
WITH CHECK (has_permission('manage_evidence') AND EXISTS (
  SELECT 1 FROM evidence e
  WHERE e.id = evidence_anchors.evidence_id AND e.school_id = my_school_id()
));

-- ════════════════════════════════════════════════════════════════
-- (6) إعادة كتابة سياسات evidence على المسار المباشر
--     الشرط الجديد **أضيق** لا أوسع: school_id = my_school_id()
--     وقفل المهمة يسري حين توجد مهمة فقط.
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "evidence_school_select" ON evidence;
CREATE POLICY "evidence_school_select" ON evidence FOR SELECT
USING (school_id = my_school_id());

DROP POLICY IF EXISTS "evidence_school_insert" ON evidence;
CREATE POLICY "evidence_school_insert" ON evidence FOR INSERT
WITH CHECK (
  has_permission('manage_evidence')
  AND school_id = my_school_id()
  AND (
    task_id IS NULL OR EXISTS (
      SELECT 1 FROM tasks t JOIN plan_nodes pn ON pn.id = t.node_id JOIN plans p ON p.id = pn.plan_id
      WHERE t.id = evidence.task_id
        AND p.school_id = my_school_id()
        AND t.status NOT IN ('completed','submitted')
    )
  )
);

DROP POLICY IF EXISTS "evidence_school_update" ON evidence;
CREATE POLICY "evidence_school_update" ON evidence FOR UPDATE
USING (
  has_permission('manage_evidence')
  AND school_id = my_school_id()
  AND status <> 'accepted'                      -- المقبول سجلّ موثّق (039)
  AND (
    task_id IS NULL OR EXISTS (
      SELECT 1 FROM tasks t JOIN plan_nodes pn ON pn.id = t.node_id JOIN plans p ON p.id = pn.plan_id
      WHERE t.id = evidence.task_id
        AND p.school_id = my_school_id()
        AND t.status NOT IN ('completed','submitted')
    )
  )
)
WITH CHECK (
  has_permission('manage_evidence')
  AND school_id = my_school_id()
  AND (
    task_id IS NULL OR EXISTS (
      SELECT 1 FROM tasks t JOIN plan_nodes pn ON pn.id = t.node_id JOIN plans p ON p.id = pn.plan_id
      WHERE t.id = evidence.task_id
        AND p.school_id = my_school_id()
        AND t.status NOT IN ('completed','submitted')
    )
  )
);

DROP POLICY IF EXISTS "evidence_school_delete" ON evidence;
CREATE POLICY "evidence_school_delete" ON evidence FOR DELETE
USING (
  has_permission('manage_evidence')
  AND school_id = my_school_id()
  AND status <> 'accepted'
  AND (
    task_id IS NULL OR EXISTS (
      SELECT 1 FROM tasks t JOIN plan_nodes pn ON pn.id = t.node_id JOIN plans p ON p.id = pn.plan_id
      WHERE t.id = evidence.task_id
        AND p.school_id = my_school_id()
        AND t.status NOT IN ('completed','submitted')
    )
  )
);

-- ════ evidence_files: العزل عبر evidence.school_id مباشرةً ════

DROP POLICY IF EXISTS "evidence_files_select" ON evidence_files;
CREATE POLICY "evidence_files_select" ON evidence_files FOR SELECT
USING (EXISTS (
  SELECT 1 FROM evidence e
  WHERE e.id = evidence_files.evidence_id AND e.school_id = my_school_id()
));

DROP POLICY IF EXISTS "evidence_files_write" ON evidence_files;
CREATE POLICY "evidence_files_write" ON evidence_files FOR ALL
USING (has_permission('manage_evidence') AND EXISTS (
  SELECT 1 FROM evidence e
  WHERE e.id = evidence_files.evidence_id AND e.school_id = my_school_id()
))
WITH CHECK (has_permission('manage_evidence') AND EXISTS (
  SELECT 1 FROM evidence e
  WHERE e.id = evidence_files.evidence_id AND e.school_id = my_school_id()
));

-- ════════════════════════════════════════════════════════════════
-- (7) تحصين مُشغّل تجميد الخطة (053)
--     كان يعتمد على أن is_plan_frozen(NULL) لا ترفع خطأً — وهو سكوتٌ
--     لا ضمان. الآن: دليلٌ بلا مهمّة لا تملكه خطة، فلا يُجمَّد.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION trg_freeze_evidence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE pid uuid; tid uuid;
BEGIN
  tid := COALESCE(NEW.task_id, OLD.task_id);
  IF tid IS NULL THEN
    RETURN COALESCE(NEW, OLD);          -- دليل القناة المباشرة: لا خطة تملكه
  END IF;
  SELECT n.plan_id INTO pid FROM tasks t JOIN plan_nodes n ON n.id = t.node_id
  WHERE t.id = tid;
  IF pid IS NOT NULL AND is_plan_frozen(pid) THEN
    RAISE EXCEPTION 'الخطة مجمّدة — لا يمكن تعديل أدلتها';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $fn$;

-- ════════════════════════════════════════════════════════════════
-- (8) التدقيق: حلّ المدرسة لـ evidence_files عبر evidence.school_id
--     (evidence نفسه صار يحمل school_id فتحلّه الدالة مباشرةً)
-- ════════════════════════════════════════════════════════════════

DO $do$
BEGIN
  -- ربط المُحفِّز بالجدول الجديد على نمط 059
  EXECUTE 'DROP TRIGGER IF EXISTS zz_audit ON evidence_anchors';
  EXECUTE 'CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE OR DELETE ON evidence_anchors
           FOR EACH ROW EXECUTE FUNCTION audit_row_change()';
END $do$;

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- جدول التحقّق — شغّله بعد الترحيل (محرّر SQL يعرض نتيجة آخر أمر فقط)
-- ════════════════════════════════════════════════════════════════

WITH checks AS (
  SELECT 1 AS n, 'أدلة بلا school_id' AS الفحص,
         (SELECT count(*)::text FROM evidence WHERE school_id IS NULL) AS النتيجة, '0' AS المتوقع
  UNION ALL SELECT 2, 'school_id مخالف لمدرسة خطة المهمة',
         (SELECT count(*)::text FROM evidence e
          JOIN tasks t ON t.id = e.task_id
          JOIN plan_nodes n ON n.id = t.node_id
          JOIN plans p ON p.id = n.plan_id
          WHERE e.school_id <> p.school_id), '0'
  UNION ALL SELECT 3, 'task_id صار اختيارياً',
         (SELECT is_nullable FROM information_schema.columns
          WHERE table_name='evidence' AND column_name='task_id'), 'YES'
  UNION ALL SELECT 4, 'الأعمدة الجديدة في evidence',
         (SELECT count(*)::text FROM information_schema.columns
          WHERE table_name='evidence' AND column_name IN
          ('school_id','source','reason_code','academic_year','document_date',
           'permanence','last_reviewed_at','owner_team_id','batch_id','code')), '10'
  UNION ALL SELECT 5, 'أعمدة البصمة في evidence_files',
         (SELECT count(*)::text FROM information_schema.columns
          WHERE table_name='evidence_files' AND column_name IN
          ('content_hash','last_fixity_at','fixity_status')), '3'
  UNION ALL SELECT 6, 'evidence_anchors موجود وRLS مفعّل',
         (SELECT COALESCE(CASE WHEN relrowsecurity THEN 'نعم' ELSE 'لا — خلل' END,'مفقود')
          FROM pg_class WHERE relname='evidence_anchors'), 'نعم'
  UNION ALL SELECT 7, 'سياسات evidence',
         (SELECT count(*)::text FROM pg_policies WHERE tablename='evidence'), '4'
  UNION ALL SELECT 8, 'سياسات evidence_anchors',
         (SELECT count(*)::text FROM pg_policies WHERE tablename='evidence_anchors'), '2'
  UNION ALL SELECT 9, 'فهرس الهويّة الثابتة UNIQUE(school_id, code)',
         (SELECT CASE WHEN count(*)=1 THEN 'موجود' ELSE 'مفقود' END
          FROM pg_indexes WHERE indexname='idx_evidence_code_unique'), 'موجود'
  UNION ALL SELECT 10, 'إجمالي الأدلة (للمقارنة بما قبل الترحيل)',
         (SELECT count(*)::text FROM evidence), 'لم يتغيّر'
)
SELECT n AS "#", الفحص, النتيجة, المتوقع,
       CASE WHEN المتوقع IN ('لم يتغيّر') THEN '—'
            WHEN النتيجة = المتوقع THEN 'مطابق' ELSE 'خلل' END AS الحكم
FROM checks ORDER BY n;

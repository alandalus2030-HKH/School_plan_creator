-- ════════════════════════════════════════════════════════════════
-- 077: الإسناد الموروث + ترحيل المراسي — م1‑3ج
--      (ويُصلح انكساراً أحدثه 073)
--
--   المرجع: docs/QNSA_ACCREDITATION_ARCHITECTURE.html §4.2 · 3.3
--
--   ── (أ) الانكسار أولاً ──
--   073 جعل `evidence.school_id` NOT NULL، وشاشة دليل المهمّة تُدرج
--   الصفّ من المتصفّح **بلا هذا العمود** — فكل رفعٍ من مهمّة يفشل.
--   والعلاج `DEFAULT my_school_id()`: دالّةٌ قائمة منذ 015 تُرجع المدرسة
--   الفعّالة وتحترم التقمّص. فيُصلَح كل مسار إدخال **بلا لمس سطر كود**.
--   تنبيه: service role بلا auth.uid() ⇒ الدالّة NULL ⇒ على كل إدخال
--   خادميّ أن يُمرّر school_id صراحةً (وهو ما يفعله /api/evidence/direct).
--
--   ── (ب) الإسناد الموروث ──
--   أدلة الخطط لا «تنتقل» إلى مخزن الاعتماد — هي في الجدول نفسه،
--   وينقصها صفٌّ في `evidence_anchors`. والربط قائم في البنية:
--   `plan_nodes.framework_node_id` يكتبه النظام حين يُختار البند من
--   الإطار. فالدليل يرث مرساة **أقرب سلفٍ مُسنَد** في سلسلة عقده.
--
--   ولمَ مُشغّل قاعدة لا كود واجهة؟ لأن مسارات الإدخال متعدّدة (شاشة
--   الرفع · التعديل · أيّ API لاحق)، ومنطقٌ في مكان واحد لا يُنسى في
--   المسار الخامس.
--
--   ── ما يبقى بلا مرساة عمداً ──
--   عقدةٌ أُنشئت «بنداً مخصصاً» لا `framework_node_id` لها، فدليلها بلا
--   مرساة ويظهر في مرشّح «بلا مرساة» ليُسنده فريق التركيز يدوياً.
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════
-- (1) إصلاح الانكسار: المدرسة الفعّالة افتراضاً
-- ════════════════════════════════════════════════════════════════

ALTER TABLE evidence ALTER COLUMN school_id SET DEFAULT my_school_id();

COMMENT ON COLUMN evidence.school_id IS
  'مسار عزل المدرسة المباشر (3.1). افتراضه my_school_id() — يحترم التقمّص. والإدخال بـservice role يُمرّره صراحةً.';

-- ════════════════════════════════════════════════════════════════
-- (2) أقرب سلفٍ مُسنَد إلى الإطار في سلسلة عقد الخطة
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION framework_node_of_plan_node(p_node_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  cur uuid := p_node_id;
  fid uuid;
  pid uuid;
  guard int := 0;
BEGIN
  WHILE cur IS NOT NULL AND guard < 20 LOOP
    SELECT framework_node_id, parent_id INTO fid, pid FROM plan_nodes WHERE id = cur;
    IF fid IS NOT NULL THEN RETURN fid; END IF;
    cur   := pid;
    guard := guard + 1;      -- حارس ضدّ حلقة في الشجرة
  END LOOP;
  RETURN NULL;
END; $fn$;

COMMENT ON FUNCTION framework_node_of_plan_node IS
  'الإسناد الموروث (4.2): يصعد سلسلة العقد إلى أقرب framework_node_id.';

-- ════════════════════════════════════════════════════════════════
-- (3) قبل الإدخال: الفريق المالك والعام المنسوب من سياق الخطة
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION trg_evidence_inherit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_node   uuid;
  v_fnode  uuid;
  v_code   text;
  v_year   text;
BEGIN
  IF NEW.task_id IS NULL THEN RETURN NEW; END IF;   -- القناة المباشرة تُمرّر قيمها

  SELECT t.node_id INTO v_node FROM tasks t WHERE t.id = NEW.task_id;
  IF v_node IS NULL THEN RETURN NEW; END IF;

  /* العام المنسوب يرث عام الخطة — حكمٌ لا تاريخ (3.8)، ويُعدَّل يدوياً */
  IF NEW.academic_year IS NULL THEN
    SELECT p.academic_year INTO v_year
    FROM plan_nodes n JOIN plans p ON p.id = n.plan_id WHERE n.id = v_node;
    IF v_year ~ '^\d{4}-\d{4}$' THEN NEW.academic_year := v_year; END IF;
  END IF;

  /* الفريق المالك من المعيار الرئيس لمرساة العقدة (3.2) */
  IF NEW.owner_team_id IS NULL THEN
    v_fnode := framework_node_of_plan_node(v_node);
    IF v_fnode IS NOT NULL THEN
      SELECT split_part(fn.code, '.', 1) INTO v_code FROM framework_nodes fn WHERE fn.id = v_fnode;
      SELECT ft.id INTO NEW.owner_team_id FROM focus_teams ft
      WHERE ft.school_id = NEW.school_id AND ft.standard_code = v_code;
    END IF;
  END IF;

  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS evidence_inherit ON evidence;
CREATE TRIGGER evidence_inherit BEFORE INSERT ON evidence
  FOR EACH ROW EXECUTE FUNCTION trg_evidence_inherit();

-- ════════════════════════════════════════════════════════════════
-- (4) بعد الإدخال: المرساة الموروثة
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION trg_evidence_anchor_inherit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_node  uuid;
  v_fnode uuid;
BEGIN
  IF NEW.task_id IS NULL THEN RETURN NEW; END IF;

  SELECT t.node_id INTO v_node FROM tasks t WHERE t.id = NEW.task_id;
  IF v_node IS NULL THEN RETURN NEW; END IF;

  v_fnode := framework_node_of_plan_node(v_node);
  IF v_fnode IS NULL THEN RETURN NEW; END IF;       -- بند مخصّص: بلا مرساة عمداً

  INSERT INTO evidence_anchors (evidence_id, framework_node_id, kind, confirm_status, assigned_by)
  VALUES (NEW.id, v_fnode, 'specific', 'confirmed', NEW.uploaded_by)
  ON CONFLICT (evidence_id, framework_node_id) DO NOTHING;

  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS evidence_anchor_inherit ON evidence;
CREATE TRIGGER evidence_anchor_inherit AFTER INSERT ON evidence
  FOR EACH ROW EXECUTE FUNCTION trg_evidence_anchor_inherit();

-- ════════════════════════════════════════════════════════════════
-- (5) ترحيل الأدلة القائمة — مرّةً واحدة
-- ════════════════════════════════════════════════════════════════

/* المراسي */
INSERT INTO evidence_anchors (evidence_id, framework_node_id, kind, confirm_status, assigned_by)
SELECT e.id, framework_node_of_plan_node(t.node_id), 'specific', 'confirmed', e.uploaded_by
FROM   evidence e
JOIN   tasks t ON t.id = e.task_id
WHERE  e.task_id IS NOT NULL
  AND  e.deleted_at IS NULL
  AND  framework_node_of_plan_node(t.node_id) IS NOT NULL
  AND  NOT EXISTS (SELECT 1 FROM evidence_anchors a WHERE a.evidence_id = e.id)
ON CONFLICT (evidence_id, framework_node_id) DO NOTHING;

/* العام المنسوب من عام الخطة */
UPDATE evidence e
SET    academic_year = p.academic_year
FROM   tasks t
JOIN   plan_nodes n ON n.id = t.node_id
JOIN   plans p      ON p.id = n.plan_id
WHERE  t.id = e.task_id
  AND  e.academic_year IS NULL
  AND  p.academic_year ~ '^\d{4}-\d{4}$';

/* الفريق المالك من المعيار الرئيس للمرساة.
   باستعلامٍ مترابط لا UPDATE…FROM: الجدول الهدف لا يُذكر في شرط JOIN. */
UPDATE evidence e
SET    owner_team_id = (
  SELECT ft.id
  FROM   evidence_anchors a
  JOIN   framework_nodes fn ON fn.id = a.framework_node_id
  JOIN   focus_teams ft     ON ft.school_id     = e.school_id
                           AND ft.standard_code = split_part(fn.code, '.', 1)
  WHERE  a.evidence_id = e.id
  ORDER  BY a.assigned_at NULLS LAST
  LIMIT  1
)
WHERE  e.owner_team_id IS NULL
  AND  e.deleted_at IS NULL
  AND  EXISTS (SELECT 1 FROM evidence_anchors a WHERE a.evidence_id = e.id);

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- جدول التحقّق
-- ════════════════════════════════════════════════════════════════

WITH checks AS (
  SELECT 1 AS n, 'افتراض school_id مضبوط' AS الفحص,
         (SELECT CASE WHEN column_default LIKE '%my_school_id%' THEN 'نعم' ELSE 'لا — خلل' END
          FROM information_schema.columns
          WHERE table_name='evidence' AND column_name='school_id') AS النتيجة, 'نعم' AS المتوقع
  UNION ALL SELECT 2, 'المُشغّلان مربوطان',
         (SELECT count(*)::text FROM pg_trigger
          WHERE tgname IN ('evidence_inherit','evidence_anchor_inherit') AND NOT tgisinternal), '2'
  UNION ALL SELECT 3, 'أدلة مهامّ بلا مرساة **ولها عقدة مُسنَدة** (يجب أن تكون صفراً)',
         (SELECT count(*)::text FROM evidence e JOIN tasks t ON t.id = e.task_id
          WHERE e.deleted_at IS NULL
            AND framework_node_of_plan_node(t.node_id) IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM evidence_anchors a WHERE a.evidence_id = e.id)), '0'
  UNION ALL SELECT 4, 'إجمالي الأدلة',
         (SELECT count(*)::text FROM evidence WHERE deleted_at IS NULL), '—'
  UNION ALL SELECT 5, 'منها مُسنَدة إلى الإطار',
         (SELECT count(DISTINCT a.evidence_id)::text FROM evidence_anchors a
          JOIN evidence e ON e.id = a.evidence_id WHERE e.deleted_at IS NULL), '—'
  UNION ALL SELECT 6, 'بلا مرساة (بنود مخصّصة — تُسنَد يدوياً)',
         (SELECT count(*)::text FROM evidence e
          WHERE e.deleted_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM evidence_anchors a WHERE a.evidence_id = e.id)), '—'
  UNION ALL SELECT 7, 'أدلة بلا عام منسوب',
         (SELECT count(*)::text FROM evidence WHERE deleted_at IS NULL AND academic_year IS NULL), '—'
  UNION ALL SELECT 8, 'أدلة بلا فريق مالك',
         (SELECT count(*)::text FROM evidence WHERE deleted_at IS NULL AND owner_team_id IS NULL), '—'
)
SELECT n AS "#", الفحص, النتيجة, المتوقع,
       CASE WHEN المتوقع = '—' THEN '—'
            WHEN النتيجة = المتوقع THEN 'مطابق' ELSE 'خلل' END AS الحكم
FROM checks ORDER BY n;

-- ════════════════════════════════════════════════════════════════
-- 063 — سجلّ الإطار المرجعي المُصدَّر (Canonical Framework Registry)
-- ════════════════════════════════════════════════════════════════
-- المرحلة 4 · الأسبوع 1 · اليوم 1 من مسار الاعتماد QNSA.
--
-- الغرض: فصل «إطار الجهة الثابت» عن «خطة المدرسة المتغيّرة».
--   اليوم: المدرسة تختار من كتالوج qnsa_standards ثم يُنسخ الكود **نصّاً**
--   في plan_nodes.standard_code — يحفظ التاريخ لكنه بلا ربط ولا إصدار
--   ولا مستوى مؤشرات. النتيجة: تقرير طولي عبر السنوات متعذّر إن تغيّر الإطار.
--
--   هذا الترحيل يبني السجلّ المرجعي بثلاثة جداول:
--     1) frameworks        — إصدارات الإطار (تتعايش، لا يُلغى القديم)
--     2) framework_levels  — مسمّيات مستويات كل إصدار (ثنائية اللغة، بيانات لا كود)
--     3) framework_nodes   — عقد الإطار الهرمية بمعرّف UUID **ثابت**
--        هو الذي سترتبط به خطط المدرسة (framework_node_id) في الأسبوع 2.
--
-- نطاق التعديل: **إضافة فقط**. لا يمسّ qnsa_standards ولا plan_nodes،
--   فلا ينكسر شيء في التطبيق الحالي. الترحيل 064 يزرع العقد من الكتالوج.
--
-- الملكية: الإطار **عام للمنصّة كلّها** (لا school_id) — كل المدارس تقرأ
--   نفس الإصدار الرسمي. الكتابة لمشرف النظام وحده (my_is_super_admin).
-- ════════════════════════════════════════════════════════════════

-- ── (0) حارس مشرف النظام ────────────────────────────────────────
-- my_perm() لا يصلح هنا: فهو يمنح school_admin/admin كل الصلاحيات ضمنياً،
-- ومدير المدرسة يجب ألّا يعدّل إطار الجهة المرجعي.
CREATE OR REPLACE FUNCTION my_is_super_admin() RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true
  )
$$;

-- ── (1) إصدارات الإطار ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS frameworks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL,                       -- 'QNSA' — ثابت عبر الإصدارات
  version     TEXT NOT NULL,                       -- 'draft-2026' · 'official-2027'
  name_ar     TEXT NOT NULL,
  name_en     TEXT,
  status      TEXT NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft', 'active', 'archived')),
  issued_at   DATE,                                -- تاريخ إصدار الجهة الرسمي
  source_note TEXT,                                -- مرجع المصدر (وثيقة/رابط)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID
);

CREATE UNIQUE INDEX IF NOT EXISTS frameworks_code_version
  ON frameworks (code, version);
-- إصدار «نشط» واحد لكل إطار (الافتراضي للخطط الجديدة)
CREATE UNIQUE INDEX IF NOT EXISTS frameworks_one_active
  ON frameworks (code) WHERE status = 'active';

-- ── (2) مسمّيات المستويات لكل إصدار ─────────────────────────────
-- مسمّيات المستويات **بيانات لا كود**: مسوّدة QNSA الحالية أربعة مستويات
-- (معيار رئيس · جانب · معيار فرعي · مؤشر)، وقد تصدر النسخة الرسمية بعمق
-- مختلف (محور فوقها مثلاً) — عندها يكفي صفّ جديد بلا تعديل مخطّط.
CREATE TABLE IF NOT EXISTS framework_levels (
  framework_id UUID NOT NULL REFERENCES frameworks(id) ON DELETE CASCADE,
  level        SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 6),
  name_ar      TEXT NOT NULL,
  name_en      TEXT,
  PRIMARY KEY (framework_id, level)
);

-- ── (3) عقد الإطار ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS framework_nodes (
  -- المعرّف الثابت: هو «framework_node_id» الذي ترتبط به خطط المدرسة.
  -- لا يُعاد استخدامه أبداً عبر الإصدارات؛ الجسر بين إصدارين عبر جدول
  -- Crosswalk (ترحيل لاحق — اليوم 4).
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id   UUID NOT NULL REFERENCES frameworks(id) ON DELETE CASCADE,
  parent_id      UUID REFERENCES framework_nodes(id) ON DELETE CASCADE,
  level          SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 6),
  code           TEXT NOT NULL,                    -- '1' · '1.2' · '1.2.3' · '1.2.3.4'
  -- ثنائية اللغة على مستوى **المحتوى** (لا عبر useT — ذاك للواجهة فقط):
  -- الإطار يصدر رسمياً عربياً وإنجليزياً بنفس البنية والأكواد؛ تختلف الأسماء فقط.
  name_ar        TEXT NOT NULL,
  name_en        TEXT,
  description_ar TEXT,
  description_en TEXT,
  sort_order     INT NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- الكود فريد داخل الإصدار الواحد فقط (نفس '1.1.1' يتكرّر عبر الإصدارات)
CREATE UNIQUE INDEX IF NOT EXISTS framework_nodes_version_code
  ON framework_nodes (framework_id, code);
CREATE INDEX IF NOT EXISTS framework_nodes_parent   ON framework_nodes (parent_id);
CREATE INDEX IF NOT EXISTS framework_nodes_fw_level ON framework_nodes (framework_id, level, sort_order);

-- ── (4) RLS: قراءة للجميع · كتابة لمشرف النظام ──────────────────
ALTER TABLE frameworks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE framework_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE framework_nodes  ENABLE ROW LEVEL SECURITY;

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['frameworks', 'framework_levels', 'framework_nodes'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_read',  t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_write', t);

    -- الإطار مرجع عام: أي مستخدم مسجّل يقرأه (لا عزل مدرسة — لا يحوي بيانات مدرسة)
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (auth.uid() IS NOT NULL)',
      t || '_read', t);

    -- الكتابة من المتصفح لمشرف النظام وحده؛ الاستيراد الخادمي (service role)
    -- يتجاوز RLS أصلاً — أداة استيراد Excel/CSV في اليوم 3.
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (my_is_super_admin()) WITH CHECK (my_is_super_admin())',
      t || '_write', t);
  END LOOP;
END $do$;

-- ── (5) سجلّ التدقيق (نفس نمط 059) ──────────────────────────────
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['frameworks', 'framework_levels', 'framework_nodes'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%I ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON %I
       FOR EACH ROW EXECUTE FUNCTION audit_row_change()', t, t);
  END LOOP;
END $do$;

-- ── (6) بذرة الإصدار الحالي (العقد تأتي في الترحيل 064) ─────────
INSERT INTO frameworks (code, version, name_ar, name_en, status, source_note)
VALUES (
  'QNSA', 'draft-2026',
  'معايير الاعتماد المدرسي الوطني القطري — مسودة',
  'Qatar National School Accreditation Standards — Draft',
  'active',
  'الدليل الإرشادي للاعتماد المدرسي الوطني (مسودة للمراجعة) — مصدر الترحيل 027'
)
ON CONFLICT (code, version) DO NOTHING;

INSERT INTO framework_levels (framework_id, level, name_ar, name_en)
SELECT f.id, v.level, v.name_ar, v.name_en
FROM frameworks f,
     (VALUES (1, 'معيار رئيس',  'Standard'),
             (2, 'جانب',        'Aspect'),
             (3, 'معيار فرعي',  'Sub-standard'),
             (4, 'مؤشر أداء',   'Performance Indicator')
     ) AS v(level, name_ar, name_en)
WHERE f.code = 'QNSA' AND f.version = 'draft-2026'
ON CONFLICT (framework_id, level) DO UPDATE
SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en;

-- ── (7) تحقّق ───────────────────────────────────────────────────
SELECT f.code, f.version, f.status, count(l.level) AS levels
FROM frameworks f LEFT JOIN framework_levels l ON l.framework_id = f.id
GROUP BY f.id, f.code, f.version, f.status;
-- المتوقّع: QNSA · draft-2026 · active · levels = 4

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('frameworks', 'framework_levels', 'framework_nodes')
ORDER BY tablename, policyname;
-- المتوقّع: 6 سياسات (قراءة + كتابة لكل جدول)

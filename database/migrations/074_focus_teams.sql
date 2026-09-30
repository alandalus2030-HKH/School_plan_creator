-- ════════════════════════════════════════════════════════════════
-- 074: فرق التركيز وصلاحيتا الفرز والقبول — م1‑2
--
--   المرجع: docs/QNSA_ACCREDITATION_ARCHITECTURE.html §10 الأدوار ·
--           3.2 الفرز والملكية · 9.3 حدود حزمة المقيّم
--
--   ── لماذا جدول مستقلّ عن teams ──
--   فريق التركيز يملك **معياراً رئيساً** لا مهامّ: له طابور أدلة، وقرار
--   قبول، وسرد فصلٍ يكتبه. وفِرق `teams` القائمة تنظيمية تُسنَد إليها
--   المهام. وخلطهما يُربك الشاشتين ويُحمّل جدولاً واحداً معنيين.
--
--   ── لماذا standard_code لا framework_node_id ──
--   معرّفات العقد تتبدّل بتبدّل إصدار الإطار (172 مؤشّراً تغيّر معناه
--   تحت الكود نفسه بين آخر إصدارين). ولو رُبط الفريق بمعرّف عقدة لانقطع
--   عن الإطار الفعّال يوم يُفعَّل إصدار جديد — **صامتاً**. أمّا رمز
--   المعيار الرئيس ('1'..'5') فثابت عبر الإصدارات، ويُحلّ إلى عقدة
--   الإطار **الفعّال** عند الاستعلام — وهو النمط نفسه الذي تعمل به
--   الواجهة: الاختيار بالحالة (status='active') لا بالاسم.
--
--   ── الصلاحيتان الجديدتان ──
--   triage_evidence : الفرز والإسناد — عملٌ يوميّ لا خطر فيه، يُمنح بسخاء
--   accept_evidence : القبول والرفض — يمنح الهويّة الثابتة ويُدخل التغطية
--                     ويجعل الدليل غير قابل للتعديل (039)، فيُمنح بحساب
--   وتبقى فوقهما قاعدة **منع التقييم الذاتي**: من رفع لا يقبل ولو ملكهما.
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════
-- (1) فرق التركيز
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS focus_teams (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  -- رمز المعيار الرئيس في الإطار: '1'..'5' — ثابت عبر الإصدارات
  standard_code TEXT NOT NULL,
  name_ar       TEXT NOT NULL,
  lead_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sort_order    INT  NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id, standard_code)
);

COMMENT ON TABLE  focus_teams IS 'فريق تركيز يملك معياراً رئيساً: طابوره وفرزه وقبوله وسرد فصله (§10)';
COMMENT ON COLUMN focus_teams.standard_code IS 'رمز المعيار الرئيس 1..5 — يُحلّ إلى عقدة الإطار الفعّال عند الاستعلام';
COMMENT ON COLUMN focus_teams.lead_id       IS 'قائد الفريق — وهو أيضاً عضو في focus_team_members';

CREATE INDEX IF NOT EXISTS idx_focus_teams_school ON focus_teams(school_id);

-- ════════════════════════════════════════════════════════════════
-- (2) الأعضاء
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS focus_team_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      UUID NOT NULL REFERENCES focus_teams(id) ON DELETE CASCADE,
  profile_id   UUID NOT NULL REFERENCES profiles(id)    ON DELETE CASCADE,
  role_in_team TEXT NOT NULL DEFAULT 'member'
               CHECK (role_in_team IN ('lead','member')),
  added_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (team_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_focus_members_team    ON focus_team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_focus_members_profile ON focus_team_members(profile_id);

-- ════════════════════════════════════════════════════════════════
-- (3) ربط الدليل بفريقه المالك (العمود أُنشئ فارغاً في 073)
-- ════════════════════════════════════════════════════════════════

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'evidence_owner_team_fk'
  ) THEN
    ALTER TABLE evidence
      ADD CONSTRAINT evidence_owner_team_fk
      FOREIGN KEY (owner_team_id) REFERENCES focus_teams(id) ON DELETE SET NULL;
  END IF;
END $do$;

CREATE INDEX IF NOT EXISTS idx_evidence_owner_team ON evidence(owner_team_id);

-- ════════════════════════════════════════════════════════════════
-- (4) RLS — العزل بالمدرسة، والكتابة بصلاحية manage_teams
-- ════════════════════════════════════════════════════════════════

ALTER TABLE focus_teams        ENABLE ROW LEVEL SECURITY;
ALTER TABLE focus_team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "focus_teams_select" ON focus_teams;
CREATE POLICY "focus_teams_select" ON focus_teams FOR SELECT
USING (school_id = my_school_id());

DROP POLICY IF EXISTS "focus_teams_write" ON focus_teams;
CREATE POLICY "focus_teams_write" ON focus_teams FOR ALL
USING      (has_permission('manage_teams') AND school_id = my_school_id())
WITH CHECK (has_permission('manage_teams') AND school_id = my_school_id());

DROP POLICY IF EXISTS "focus_members_select" ON focus_team_members;
CREATE POLICY "focus_members_select" ON focus_team_members FOR SELECT
USING (EXISTS (
  SELECT 1 FROM focus_teams ft
  WHERE ft.id = focus_team_members.team_id AND ft.school_id = my_school_id()
));

DROP POLICY IF EXISTS "focus_members_write" ON focus_team_members;
CREATE POLICY "focus_members_write" ON focus_team_members FOR ALL
USING (has_permission('manage_teams') AND EXISTS (
  SELECT 1 FROM focus_teams ft
  WHERE ft.id = focus_team_members.team_id AND ft.school_id = my_school_id()
))
WITH CHECK (has_permission('manage_teams') AND EXISTS (
  SELECT 1 FROM focus_teams ft
  WHERE ft.id = focus_team_members.team_id AND ft.school_id = my_school_id()
));

-- ════════════════════════════════════════════════════════════════
-- (5) الصلاحيتان الجديدتان في الأدوار القائمة
--     تُمنحان لمن يملك اليوم review_evidence من أدوار الإدارة والجودة،
--     والفرز وحده لرئيس القسم. ولا تُمنحان للموظّف ولا للمُطّلِع.
-- ════════════════════════════════════════════════════════════════

-- الفرز + القبول
UPDATE roles SET permissions = permissions || '["triage_evidence","accept_evidence"]'::jsonb
WHERE code IN ('school_admin','deputy_principal','quality_coordinator')
  AND NOT (permissions ? 'accept_evidence');

-- الفرز وحده
UPDATE roles SET permissions = permissions || '["triage_evidence"]'::jsonb
WHERE code = 'department_head'
  AND NOT (permissions ? 'triage_evidence');

-- ════════════════════════════════════════════════════════════════
-- (6) بذرة الفرق الخمسة لكل مدرسة — من المعايير الرئيسة للإطار الفعّال
--     (لا تُنشأ إن كانت موجودة: UNIQUE(school_id, standard_code))
-- ════════════════════════════════════════════════════════════════

INSERT INTO focus_teams (school_id, standard_code, name_ar, sort_order)
SELECT s.id, fn.code, fn.name_ar, fn.code::int
FROM   schools s
CROSS JOIN (
  SELECT fn.code, fn.name_ar
  FROM   framework_nodes fn
  JOIN   frameworks f ON f.id = fn.framework_id
  WHERE  f.status = 'active' AND fn.level = 1
) fn
ON CONFLICT (school_id, standard_code) DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- (7) التدقيق
-- ════════════════════════════════════════════════════════════════

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['focus_teams','focus_team_members'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS zz_audit ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE OR DELETE ON %I
       FOR EACH ROW EXECUTE FUNCTION audit_row_change()', t);
  END LOOP;
END $do$;

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- جدول التحقّق
-- ════════════════════════════════════════════════════════════════

WITH checks AS (
  SELECT 1 AS n, 'جدولا فرق التركيز' AS الفحص,
         (SELECT count(*)::text FROM information_schema.tables
          WHERE table_name IN ('focus_teams','focus_team_members')) AS النتيجة, '2' AS المتوقع
  UNION ALL SELECT 2, 'RLS مفعّل على الجدولين',
         (SELECT count(*)::text FROM pg_class
          WHERE relname IN ('focus_teams','focus_team_members') AND relrowsecurity), '2'
  UNION ALL SELECT 3, 'السياسات (2 لكل جدول)',
         (SELECT count(*)::text FROM pg_policies
          WHERE tablename IN ('focus_teams','focus_team_members')), '4'
  UNION ALL SELECT 4, 'مفتاح evidence.owner_team_id',
         (SELECT CASE WHEN count(*)=1 THEN 'موجود' ELSE 'مفقود' END
          FROM information_schema.table_constraints
          WHERE constraint_name='evidence_owner_team_fk'), 'موجود'
  UNION ALL SELECT 5, 'عدد المدارس',
         (SELECT count(*)::text FROM schools), '—'
  UNION ALL SELECT 6, 'فرق مُنشأة (المتوقَّع = المدارس × 5)',
         (SELECT count(*)::text FROM focus_teams), (SELECT (count(*)*5)::text FROM schools)
  UNION ALL SELECT 7, 'مدارس بلا فرق خمسة',
         (SELECT count(*)::text FROM schools s
          WHERE (SELECT count(*) FROM focus_teams ft WHERE ft.school_id = s.id) <> 5), '0'
  UNION ALL SELECT 8, 'أدوار تملك accept_evidence',
         (SELECT count(*)::text FROM roles WHERE permissions ? 'accept_evidence'), '3'
  UNION ALL SELECT 9, 'أدوار تملك triage_evidence',
         (SELECT count(*)::text FROM roles WHERE permissions ? 'triage_evidence'), '4'
  UNION ALL SELECT 10, 'الموظّف لا يملك القبول',
         (SELECT CASE WHEN permissions ? 'accept_evidence' THEN 'يملك — خلل' ELSE 'لا يملك' END
          FROM roles WHERE code='staff'), 'لا يملك'
)
SELECT n AS "#", الفحص, النتيجة, المتوقع,
       CASE WHEN المتوقع = '—' THEN '—'
            WHEN النتيجة = المتوقع THEN 'مطابق' ELSE 'خلل' END AS الحكم
FROM checks ORDER BY n;

-- ════ الفرق كما أُنشئت (للعين) ════
-- SELECT s.name_ar AS المدرسة, ft.standard_code AS المعيار, ft.name_ar AS الفريق
-- FROM focus_teams ft JOIN schools s ON s.id = ft.school_id
-- ORDER BY s.name_ar, ft.sort_order;

-- ════════════════════════════════════════════════════════════════
-- 033: أبعاد التجميع على الخطة + إشراف الأقسام
--   plans: department (القسم) · plan_category (نوع الخطة) · owner_id (المالك)
--   plan_type: كتالوج أنواع الخطط (dropdown عام)
--   department_supervisors: من يشرف على أي قسم (للوحة التجميع)
-- ════════════════════════════════════════════════════════════════

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS department    TEXT,
  ADD COLUMN IF NOT EXISTS plan_category TEXT,
  ADD COLUMN IF NOT EXISTS owner_id      UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- ════ كتالوج أنواع الخطط (dropdown_options عام مثل بقية القوائم) ════
INSERT INTO dropdown_options (category, value, sort_order)
SELECT v.category, v.value, v.ord
FROM (VALUES
  ('plan_type', 'خطة الأنشطة الصفية', 1),
  ('plan_type', 'خطة الأنشطة اللاصفية', 2),
  ('plan_type', 'خطة التطوير المهني', 3),
  ('plan_type', 'خطة الدعم', 4),
  ('plan_type', 'خطة المتفوقين', 5),
  ('plan_type', 'خطة الموهوبين', 6),
  ('plan_type', 'خطة التحسين', 7),
  ('plan_type', 'الخطة التشغيلية', 8)
) AS v(category, value, ord)
WHERE NOT EXISTS (SELECT 1 FROM dropdown_options WHERE category = 'plan_type');

-- ════ إشراف الأقسام ════
CREATE TABLE IF NOT EXISTS department_supervisors (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id, user_id, department)
);
CREATE INDEX IF NOT EXISTS idx_dept_sup_user   ON department_supervisors(user_id);
CREATE INDEX IF NOT EXISTS idx_dept_sup_school ON department_supervisors(school_id);

ALTER TABLE department_supervisors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dept_sup_rw" ON department_supervisors;
CREATE POLICY "dept_sup_rw" ON department_supervisors FOR ALL
USING (school_id = my_school_id())
WITH CHECK (school_id = my_school_id());

-- تحقق
SELECT 'plan_type seeds' AS k, COUNT(*)::text AS v FROM dropdown_options WHERE category='plan_type';

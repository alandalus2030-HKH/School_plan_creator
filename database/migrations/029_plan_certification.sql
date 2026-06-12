-- ============================================================
-- ترحيل 029: اعتماد الخطة
-- يضيف عمودي approved_at و approved_by لجدول plans
-- الخطة المعتمدة محمية من الحذف — تُؤرشَف فقط.
-- الاعتماد حصرياً عبر API خادمي (is_super_admin).
-- ============================================================

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS approved_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by  UUID REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN plans.approved_at IS 'وقت اعتماد الخطة — NULL = غير معتمدة';
COMMENT ON COLUMN plans.approved_by IS 'معرّف مشرف النظام الذي اعتمد الخطة';

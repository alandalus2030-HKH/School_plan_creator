-- ============================================================
-- الترحيل 013: مجموعات المدارس (School Groups)
-- ============================================================
-- التاريخ: 2026-06-08
-- المرحلة 2 من معمارية إدارة المدارس
--
-- المفهوم: مالك مجمع مدارس يرى أرقام مدارسه مُجمَّعة فقط
--   - مدرسة قد تنتمي لمجموعة (group_id) أو تبقى مستقلة (null)
--   - مالك المجموعة لا يرى بيانات فردية، فقط تجميع مدارسه
-- ============================================================

-- ── 1. جدول المجموعات ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS school_groups (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar    TEXT        NOT NULL,
  name_en    TEXT,
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 2. ربط المدرسة بمجموعة (اختياري) ──────────────────────
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES school_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_schools_group ON schools(group_id);

-- ── 3. مالك المجموعة على ملف المستخدم ─────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_group_owner  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS owned_group_id  UUID REFERENCES school_groups(id) ON DELETE SET NULL;

-- ── 4. RLS لجدول المجموعات ────────────────────────────────
ALTER TABLE school_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "groups_read" ON school_groups;

-- القراءة: مشرف النظام يرى الكل، مالك المجموعة يرى مجموعته
-- (الإدارة الفعلية تتم عبر API بصلاحيات الخادم)
CREATE POLICY "groups_read" ON school_groups
FOR SELECT
USING (
  id = (SELECT owned_group_id FROM profiles WHERE id = auth.uid())
  OR (SELECT is_super_admin FROM profiles WHERE id = auth.uid()) = true
);

-- ── التحقق ────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM school_groups) AS groups,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name='schools' AND column_name='group_id') AS schools_group_col,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name='profiles' AND column_name='owned_group_id') AS profiles_owner_col;

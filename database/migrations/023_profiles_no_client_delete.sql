-- ============================================================
-- الترحيل 023: منع حذف profiles من المتصفح (RLS)
-- ============================================================
-- التاريخ: 2026-06-11
-- المشكلة: سياستا profiles_own (ترحيل 011) و profiles_school (ترحيل 016)
--   معرّفتان FOR ALL — أي تشملان DELETE، فيستطيع أي مستخدم في المدرسة
--   (حتى معلّم) حذف أي ملف شخصي في مدرسته مباشرةً من المتصفح،
--   ويستطيع المستخدم حذف ملفه الشخصي.
--
-- الحل: تفكيك السياستين إلى SELECT / INSERT / UPDATE فقط — بلا DELETE.
--   حذف المستخدمين يصبح حصراً عبر API خادمي (service role):
--   DELETE /api/users/[userId] — الذي يفرض حماية الحسابات المميّزة
--   وعزل المدرسة الفعّالة وتنظيف auth.users.
-- ============================================================

-- ════ إزالة السياسات الواسعة ════
DROP POLICY IF EXISTS "profiles_own"    ON profiles;
DROP POLICY IF EXISTS "profiles_school" ON profiles;

-- ════ ملفي الشخصي: قراءة + إنشاء + تعديل (بلا حذف) ════
CREATE POLICY "profiles_own_select" ON profiles FOR SELECT
USING (id = auth.uid());

CREATE POLICY "profiles_own_insert" ON profiles FOR INSERT
WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_own_update" ON profiles FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- ════ مستخدمو مدرستي: قراءة + إنشاء + تعديل (بلا حذف) ════
-- my_school_id() تحترم active_school_id لمشرف النظام المتقمّص (ترحيل 015/016)
CREATE POLICY "profiles_school_select" ON profiles FOR SELECT
USING (school_id = my_school_id());

CREATE POLICY "profiles_school_insert" ON profiles FOR INSERT
WITH CHECK (school_id = my_school_id());

CREATE POLICY "profiles_school_update" ON profiles FOR UPDATE
USING (school_id = my_school_id())
WITH CHECK (school_id = my_school_id());

-- ════ التحقق: يجب ألا تظهر أي سياسة DELETE أو ALL على profiles ════
SELECT policyname, cmd,
  CASE WHEN cmd IN ('DELETE', 'ALL') THEN '⚠️ ثغرة — راجِع' ELSE '✅' END AS status
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;

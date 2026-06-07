-- ============================================================
-- الترحيل 015: الدخول كمدرسة (Impersonation)
-- ============================================================
-- التاريخ: 2026-06-08
-- المرحلة 3: مشرف النظام يتقمّص مدرسة مؤقتاً للمتابعة/الاختبار
--
-- النهج: active_school_id على ملف المشرف (المدرسة المُتقمَّصة)
--   my_school_id() = COALESCE(active_school_id, school_id) للمشرف فقط
--   → كل استعلاماته تُفلتر للمدرسة المختارة بنفس RLS الموجود
-- ============================================================

-- ── عمود المدرسة المُتقمَّصة ──────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS active_school_id UUID REFERENCES schools(id) ON DELETE SET NULL;

-- ── تحديث الدالة: تتقمّص فقط لمشرف النظام (أمان) ──────────
CREATE OR REPLACE FUNCTION my_school_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    CASE WHEN is_super_admin THEN active_school_id ELSE NULL END,
    school_id
  )
  FROM profiles WHERE id = auth.uid()
$$;

-- ── التحقق ────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name='profiles' AND column_name='active_school_id') AS active_col;

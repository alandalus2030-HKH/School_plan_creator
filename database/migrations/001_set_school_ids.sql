-- ============================================================
-- الترحيل 001: تعيين school_id لجميع المستخدمين الحاليين
-- ============================================================
-- التاريخ: 2026-06-06
-- المشكلة: بعض profiles لا تحتوي على school_id
--          وهذا يمنع عمل RLS الجديد
--
-- كيفية التشغيل:
--   Supabase Dashboard → SQL Editor → New Query → الصق → Run
--
-- ملاحظة: يعمل مع نظام المدرسة الواحدة تلقائياً
-- ============================================================

-- ── الخطوة 1: تحقق من المدارس الموجودة ──────────────────────
-- شغّل هذا أولاً وتأكد أن هناك مدرسة واحدة على الأقل
SELECT id, name_ar FROM schools;

-- ── الخطوة 2: تحقق من profiles التي لا تملك school_id ────────
SELECT COUNT(*) AS profiles_without_school
FROM profiles
WHERE school_id IS NULL;

-- ── الخطوة 3: تعيين school_id لجميع profiles الناقصة ─────────
-- يأخذ أول مدرسة في النظام (النظام يدعم مدرسة واحدة حالياً)
UPDATE profiles
SET school_id = (
  SELECT id FROM schools ORDER BY created_at LIMIT 1
)
WHERE school_id IS NULL;

-- ── الخطوة 4: تأكيد النتيجة ──────────────────────────────────
-- يجب أن تُرجع 0
SELECT COUNT(*) AS profiles_still_without_school
FROM profiles
WHERE school_id IS NULL;

-- ── الخطوة 5: عرض توزيع المستخدمين على المدارس ───────────────
SELECT
  s.name_ar AS school_name,
  COUNT(p.id) AS user_count
FROM profiles p
JOIN schools s ON s.id = p.school_id
GROUP BY s.id, s.name_ar;

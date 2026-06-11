-- ============================================================
-- الترحيل 010: مشرف النظام (Super Admin)
-- ============================================================
-- التاريخ: 2026-06-07
-- الغرض: تمييز "مشرف النظام" (يدير كل المدارس) عن
--        "مدير المدرسة" (يدير مدرسته فقط)
--
-- مشرف النظام = مالك المنصة، يُنشئ المدارس الجديدة
--
-- ⚠️⚠️ تحذير: لا تُعِد تشغيل هذا الترحيل أبداً ⚠️⚠️
-- الـ UPDATE أدناه يمنح is_super_admin بناءً على حالة لحظية
-- (أقدم ملف شخصي + أي دور super_admin/admin وقت التشغيل).
-- إعادة تشغيله بعد إضافة مستخدمين قد تمنح العلَم لحساب خاطئ
-- = تصعيد صلاحيات دائم لا يسحبه أي ترحيل لاحق.
-- لمنح/سحب العلَم يدوياً:
--   UPDATE profiles SET is_super_admin = true|false WHERE username = '...';
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;

-- ── تعيين مالك المنصة كمشرف نظام ──────────────────────────
-- المستخدم الأقدم (المؤسس) + أي حساب بدور super_admin
UPDATE profiles
SET is_super_admin = true
WHERE id = (SELECT id FROM profiles ORDER BY created_at LIMIT 1)
   OR role IN ('super_admin', 'admin');

-- ── التحقق ────────────────────────────────────────────────
SELECT id, name_ar, email, role, is_super_admin
FROM profiles
WHERE is_super_admin = true;

-- ============================================================
-- الترحيل 052: تفصيل صلاحيات الخطط (تجربة) + توافق خلفي
-- ============================================================
-- التاريخ: 2026-06-24
-- السبب: كانت manage_plans حزمة خشنة (إنشاء + تعديل + حذف + أرشفة + عرض).
--   فصلناها إلى: view_plans (عرض) · manage_plans (إنشاء/تعديل) ·
--   delete_plans (حذف/أرشفة) · approve_plans (اعتماد).
-- التوافق الخلفي: كل دور يملك حالياً manage_plans يُمنَح تلقائياً
--   view_plans + delete_plans حتى لا يتغيّر سلوكه. (approve_plans لا
--   يُمنَح تلقائياً — يبقى قراراً صريحاً للمسؤول.)
-- عمود permissions نوعه jsonb (مصفوفة نصوص).
-- ملاحظة: شُغِّل عبر Supabase MCP بتاريخه — هذا الملف للتوثيق/التزامن.
-- ============================================================

UPDATE roles
SET permissions = (
  SELECT jsonb_agg(DISTINCT p)
  FROM jsonb_array_elements_text(
    permissions
    || CASE WHEN NOT (permissions ? 'view_plans')   THEN '["view_plans"]'::jsonb   ELSE '[]'::jsonb END
    || CASE WHEN NOT (permissions ? 'delete_plans') THEN '["delete_plans"]'::jsonb ELSE '[]'::jsonb END
  ) AS p
)
WHERE permissions ? 'manage_plans'
  AND NOT (permissions ? 'all');

-- التحقق
SELECT code,
       permissions ? 'view_plans'   AS has_view,
       permissions ? 'manage_plans' AS has_manage,
       permissions ? 'delete_plans' AS has_delete
FROM roles
WHERE permissions ? 'manage_plans';

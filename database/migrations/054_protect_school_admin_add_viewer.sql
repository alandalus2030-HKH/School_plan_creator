-- ============================================================
-- الترحيل 054: حماية «مشرف نظام المدرسة» + دور «مُطّلِع» للقراءة فقط
-- ============================================================
-- التاريخ: 2026-06-27
-- السبب (من مقارنة الأدوار بالأنظمة العالمية):
--  1) «مشرف نظام المدرسة» يملك manage_roles/manage_settings لكنه لم يكن
--     دوراً نظامياً محمياً → يُجعل is_system=true (يُخفى زر حذفه ويرفضه API).
--  2) لم يكن هناك دور قراءة فقط (Viewer/Stakeholder) — أُنشئ «مُطّلِع»
--     بصلاحيات عرض فقط (الخطط/التقارير/التجميع/خزانة الأدلة) — كل المسارات
--     مربوطة بهذه الصلاحيات في الشريط الجانبي، فالدور فعّال فوراً.
-- ملاحظة: شُغِّل عبر Supabase MCP بتاريخه — هذا الملف للتوثيق/التزامن.
-- ============================================================

-- 1) حماية مشرف نظام المدرسة
UPDATE roles SET is_system = true WHERE code = 'school_admin';

-- 2) دور المُطّلِع (قراءة فقط) — يُنشأ إن لم يكن موجوداً
INSERT INTO roles (code, name_ar, name_en, color, permissions, is_system, sort_order)
SELECT 'viewer', 'مُطّلِع (قراءة فقط)', 'Viewer', '#0f766e',
       '["view_plans","view_reports","view_aggregate","view_evidence","receive_notifications"]'::jsonb,
       false, 90
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'viewer');

-- التحقق
SELECT code, name_ar, is_system, permissions FROM roles WHERE code IN ('school_admin', 'viewer');

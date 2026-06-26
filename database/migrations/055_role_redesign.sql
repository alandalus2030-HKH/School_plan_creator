-- ============================================================
-- الترحيل 055: إعادة هيكلة الأدوار والصلاحيات (مُعتمدة)
-- ============================================================
-- التاريخ: 2026-06-27
-- الهدف: أدوار محكمة بلا تضارب اختصاصات (أقل صلاحية · فصل واجبات ·
--   حصر الحوكمة في مدير المدرسة). أُعيدت تسمية الرموز الواضحة مع نقل
--   مستخدميها، وأُضيف «منسّق الجودة»، وحُذف الدور التجريبي.
-- ملاحظة: شُغِّل عبر Supabase MCP بتاريخه — هذا الملف للتوثيق/التزامن.
-- profiles.role نصّي بلا FK، لذا يُنقَل يدوياً مع كل إعادة تسمية رمز.
-- super_admin / school_admin: الرمز ثابت (مستخدم في فحوص الإدارة بالكود).
-- ============================================================
BEGIN;

UPDATE roles SET name_ar='مشرف المنصة' WHERE code='super_admin';

UPDATE roles SET name_ar='مدير المدرسة',
  permissions='["manage_users","manage_roles","manage_settings","manage_teams","view_plans","manage_plans","approve_plans","freeze_plans","delete_plans","view_tasks","manage_tasks","rate_tasks","view_evidence","manage_evidence","review_evidence","view_reports","view_aggregate","manage_meetings","manage_badges","grant_badges","receive_notifications"]'::jsonb
  WHERE code='school_admin';

UPDATE roles SET code='deputy_principal', name_ar='نائب المدير',
  permissions='["manage_teams","view_plans","manage_plans","approve_plans","view_tasks","manage_tasks","rate_tasks","view_evidence","manage_evidence","review_evidence","view_reports","view_aggregate","manage_meetings","grant_badges","receive_notifications"]'::jsonb
  WHERE code='debuty_academic';
UPDATE profiles SET role='deputy_principal' WHERE role='debuty_academic';

UPDATE roles SET code='department_head', name_ar='رئيس قسم',
  permissions='["manage_teams","view_plans","view_tasks","manage_tasks","rate_tasks","view_evidence","manage_evidence","review_evidence","view_reports","view_aggregate","grant_badges","receive_notifications"]'::jsonb
  WHERE code='task_manager';
UPDATE profiles SET role='department_head' WHERE role='task_manager';

UPDATE roles SET code='evaluator', name_ar='مقيّم',
  permissions='["view_tasks","rate_tasks","view_evidence","review_evidence","view_reports","receive_notifications"]'::jsonb
  WHERE code='task_evaluator';
UPDATE profiles SET role='evaluator' WHERE role='task_evaluator';

UPDATE roles SET code='staff', name_ar='موظف',
  permissions='["view_tasks","manage_evidence","receive_notifications"]'::jsonb
  WHERE code='task_assigned_employee';
UPDATE profiles SET role='staff' WHERE role='task_assigned_employee';

UPDATE roles SET name_ar='مُطّلِع (قراءة فقط)' WHERE code='viewer';

INSERT INTO roles (code,name_ar,name_en,color,permissions,is_system,sort_order)
SELECT 'quality_coordinator','منسّق الجودة والتطوير','Quality Coordinator','#b45309',
  '["view_plans","manage_plans","view_tasks","manage_tasks","view_evidence","manage_evidence","review_evidence","view_reports","view_aggregate","manage_meetings","receive_notifications"]'::jsonb,
  false, 40
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code='quality_coordinator');

UPDATE profiles SET role='staff' WHERE role='expermental';
DELETE FROM roles WHERE code='expermental';

COMMIT;

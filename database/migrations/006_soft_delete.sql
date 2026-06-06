-- ============================================================
-- الترحيل 006: Soft Delete + updated_by
-- ============================================================
-- التاريخ: 2026-06-06
-- المشكلة: الحذف الحالي نهائي — لا إمكانية استرداد
-- الحل: إضافة deleted_at (NULL = موجود، تاريخ = محذوف)
--
-- الجداول: tasks, plans, plan_nodes, evidence
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- الخطوة 1: إضافة عمود deleted_at
-- ════════════════════════════════════════════════════════════
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE plan_nodes
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE evidence
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- ════════════════════════════════════════════════════════════
-- الخطوة 2: إضافة عمود updated_by
-- ════════════════════════════════════════════════════════════
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id);

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id);

-- ════════════════════════════════════════════════════════════
-- الخطوة 3: تحديث idx_tasks_status_end_date
-- يُضاف شرط WHERE deleted_at IS NULL الذي فات في الترحيل 005
-- ════════════════════════════════════════════════════════════
DROP INDEX IF EXISTS idx_tasks_status_end_date;

CREATE INDEX idx_tasks_status_end_date
  ON tasks(status, end_date)
  WHERE deleted_at IS NULL;

-- ════════════════════════════════════════════════════════════
-- الخطوة 4: تحديث RLS لاستبعاد المحذوفات تلقائياً
-- ════════════════════════════════════════════════════════════

-- tasks: أضف شرط deleted_at IS NULL للسياسة الموجودة
DROP POLICY IF EXISTS "tasks_school" ON tasks;

CREATE POLICY "tasks_school" ON tasks
FOR ALL
USING (
  (
    node_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM plan_nodes pn
      JOIN plans p ON p.id = pn.plan_id
      WHERE pn.id = tasks.node_id
      AND (
        p.school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
        OR (SELECT school_id FROM profiles WHERE id = auth.uid()) IS NULL
      )
    )
  )
  AND (deleted_at IS NULL)   -- ← لا تُظهر المحذوفات أبداً
)
WITH CHECK (
  node_id IS NULL
  OR EXISTS (
    SELECT 1
    FROM plan_nodes pn
    JOIN plans p ON p.id = pn.plan_id
    WHERE pn.id = tasks.node_id
    AND (
      p.school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
      OR (SELECT school_id FROM profiles WHERE id = auth.uid()) IS NULL
    )
  )
);

-- plans: أضف شرط deleted_at IS NULL
DROP POLICY IF EXISTS "plans_school" ON plans;

CREATE POLICY "plans_school" ON plans
FOR ALL
USING (
  (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR (SELECT school_id FROM profiles WHERE id = auth.uid()) IS NULL
  )
  AND (deleted_at IS NULL)   -- ← لا تُظهر المحذوفات أبداً
)
WITH CHECK (
  school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  OR (SELECT school_id FROM profiles WHERE id = auth.uid()) IS NULL
);

-- plan_nodes: أضف شرط deleted_at IS NULL
DROP POLICY IF EXISTS "plan_nodes_school" ON plan_nodes;

CREATE POLICY "plan_nodes_school" ON plan_nodes
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM plans p
    WHERE p.id = plan_nodes.plan_id
    AND (
      p.school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
      OR (SELECT school_id FROM profiles WHERE id = auth.uid()) IS NULL
    )
  )
  AND (deleted_at IS NULL)   -- ← لا تُظهر المحذوفات أبداً
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM plans p
    WHERE p.id = plan_nodes.plan_id
    AND (
      p.school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
      OR (SELECT school_id FROM profiles WHERE id = auth.uid()) IS NULL
    )
  )
);

-- ════════════════════════════════════════════════════════════
-- الخطوة 5: التحقق من النتائج
-- ════════════════════════════════════════════════════════════

-- تأكيد الأعمدة الجديدة
SELECT table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('deleted_at', 'updated_by')
  AND table_name IN ('tasks', 'plans', 'plan_nodes', 'evidence')
ORDER BY table_name, column_name;

-- تأكيد الـ index المحدَّث
SELECT indexname, indexdef
FROM pg_indexes
WHERE indexname = 'idx_tasks_status_end_date';

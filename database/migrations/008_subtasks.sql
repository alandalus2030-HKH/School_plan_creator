-- ============================================================
-- الترحيل 008: الخطوات الفرعية (Subtasks)
-- ============================================================
-- التاريخ: 2026-06-07
-- إضافة جدول subtasks — خطوات داخل المهمة الواحدة
-- كل خطوة: نص + مكلَّف اختياري + موعد اختياري + حالة إنجاز
-- ============================================================

CREATE TABLE IF NOT EXISTS subtasks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  name_ar     TEXT        NOT NULL,
  assignee_id UUID        REFERENCES profiles(id),
  due_date    DATE,
  is_done     BOOLEAN     NOT NULL DEFAULT false,
  order_num   INTEGER     NOT NULL DEFAULT 1,
  created_by  UUID        REFERENCES profiles(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- index للجلب السريع
CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON subtasks(task_id);

-- تفعيل RLS
ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;

-- السياسة: عبر المهمة → plan_nodes → plans → school_id
DROP POLICY IF EXISTS "subtasks_school" ON subtasks;
CREATE POLICY "subtasks_school" ON subtasks
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM tasks t
    LEFT JOIN plan_nodes pn ON pn.id = t.node_id
    LEFT JOIN plans p ON p.id = pn.plan_id
    WHERE t.id = subtasks.task_id
    AND (
      t.node_id IS NULL
      OR p.school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
      OR (SELECT school_id FROM profiles WHERE id = auth.uid()) IS NULL
    )
  )
)
WITH CHECK (auth.uid() IS NOT NULL);

-- التحقق
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'subtasks'
ORDER BY ordinal_position;

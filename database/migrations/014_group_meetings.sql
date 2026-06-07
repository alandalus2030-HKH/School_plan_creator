-- ============================================================
-- الترحيل 014: اجتماعات المجموعة (Group Meetings)
-- ============================================================
-- التاريخ: 2026-06-08
-- مالك المجموعة يجدول اجتماعات مع مديري مدارس مجموعته
-- منفصلة عن اجتماعات المدرسة (group_id بدل school_id)
-- ============================================================

-- ── جدول اجتماعات المجموعة ────────────────────────────────
CREATE TABLE IF NOT EXISTS group_meetings (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id         UUID        NOT NULL REFERENCES school_groups(id) ON DELETE CASCADE,
  title            TEXT        NOT NULL,
  description      TEXT,
  meeting_url      TEXT,
  platform         TEXT        DEFAULT 'other',
  scheduled_at     TIMESTAMPTZ,
  duration_minutes INTEGER     DEFAULT 60,
  attendees        UUID[]      DEFAULT '{}',   -- مديرو المدارس المدعوون
  created_by       UUID        REFERENCES profiles(id),
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_meetings_group ON group_meetings(group_id);

-- ── تفعيل RLS ─────────────────────────────────────────────
ALTER TABLE group_meetings ENABLE ROW LEVEL SECURITY;

-- القراءة: مالك المجموعة (مجموعته) + المدعو (ضمن المصفوفة) + المشرف
DROP POLICY IF EXISTS "group_meetings_read"   ON group_meetings;
CREATE POLICY "group_meetings_read" ON group_meetings
FOR SELECT
USING (
  group_id = (SELECT owned_group_id FROM profiles WHERE id = auth.uid())
  OR auth.uid() = ANY(attendees)
  OR (SELECT is_super_admin FROM profiles WHERE id = auth.uid()) = true
);

-- الكتابة/التعديل/الحذف: مالك المجموعة لمجموعته فقط
DROP POLICY IF EXISTS "group_meetings_write"  ON group_meetings;
CREATE POLICY "group_meetings_write" ON group_meetings
FOR ALL
USING (
  group_id = (SELECT owned_group_id FROM profiles WHERE id = auth.uid())
)
WITH CHECK (
  group_id = (SELECT owned_group_id FROM profiles WHERE id = auth.uid())
);

-- ── التحقق ────────────────────────────────────────────────
SELECT column_name FROM information_schema.columns
WHERE table_name = 'group_meetings' ORDER BY ordinal_position;

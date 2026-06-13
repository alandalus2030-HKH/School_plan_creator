-- ════════════════════════════════════════════════════════════════
-- 036: حالة الدليل (دورة حياة — ضبط وثائق) + صلاحية خزانة الأدلة
--   status: uploaded (افتراضي) | approved | rejected
--   reviewed_by / reviewed_at: سجل المراجعة (مصداقية الاعتماد)
-- ════════════════════════════════════════════════════════════════

ALTER TABLE evidence ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'uploaded';
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- قيد CHECK (درس مستفاد: قيم status الجديدة قد تُرفض صامتاً بلا قيد صريح)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evidence_status_check') THEN
    ALTER TABLE evidence ADD CONSTRAINT evidence_status_check
      CHECK (status IN ('uploaded', 'approved', 'rejected'));
  END IF;
END $$;

-- منح صلاحية خزانة الأدلة لمشرف نظام المدرسة (ليظهر الرابط في قائمته)
UPDATE roles
SET permissions = permissions || '["view_evidence"]'::jsonb
WHERE code = 'school_admin' AND NOT (permissions ? 'view_evidence');

-- تحقق
SELECT status, COUNT(*) FROM evidence GROUP BY status;

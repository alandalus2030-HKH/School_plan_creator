-- ════════════════════════════════════════════════════════════════
-- 036: قيد حالة الدليل + سجل المراجعة + صلاحية خزانة الأدلة
--   عمود evidence.status موجود مسبقاً بقيم pending/accepted (نظام تحقّق
--   الأدلة) وبوابة الإنجاز تعتمد 'accepted' — لذا نوافقها ونضيف 'rejected'.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE evidence ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- قيد CHECK (يشمل القيم القائمة pending/accepted + الجديدة rejected)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evidence_status_check') THEN
    ALTER TABLE evidence ADD CONSTRAINT evidence_status_check
      CHECK (status IN ('pending', 'accepted', 'rejected'));
  END IF;
END $$;

-- صلاحية خزانة الأدلة لمشرف نظام المدرسة (ليظهر الرابط)
UPDATE roles
SET permissions = permissions || '["view_evidence"]'::jsonb
WHERE code = 'school_admin' AND NOT (permissions ? 'view_evidence');

SELECT status, COUNT(*) FROM evidence GROUP BY status;

-- ════════════════════════════════════════════════════════════════
-- 092 · مؤشّر استهلاك التخزين — المراقَبة تحلّ محلّ المنع
--
-- المرجع: الوثيقة 16 (باقة التخزين: مؤجَّلة بشرطٍ لا بإهمال) · 15
-- (ما يسبق المرحلة الأولى) · 3.6.1 (الرفع الجماعي).
--
-- ── لماذا هذا البند أصلاً ──
-- «القرار: لا تُرفَع الباقة إلى Pro حتى يكتمل تصميم النظام… **والمراقَبة
--  تحلّ محلّ المنع**: مؤشّر استهلاك التخزين في أدوات المشرف، وتنبيهٌ عند
--  70٪ — فتُرقَّى الباقة قبل الامتلاء لا بعده. **والامتلاء المفاجئ هو
--  الخطر الحقيقيّ**: رفعٌ يتوقّف في منتصف دفعة، فتبقى ملفّات في المخزن
--  وأخرى خارجه.»
-- وفي 15: «**ولا يُبدأ الرفع الجماعي قبل حسمه**، وإلّا توقّف العمل في
-- منتصفه». والرفع الجماعي بُني في م1‑9 — فهذا المؤشّر هو ما يحمي دفعةً
-- من أن تنقطع في وسطها.
--
-- ── ولماذا يُقاس من `storage.objects` لا من `evidence_files` ──
-- جمعُ `file_size` يقيس **ما نعرفه**، والقرص يحمل **ما فيه**: ملفٌّ
-- رُفع ثمّ انكسر إدراج صفّه (ومسار 089/direct ينظّف الصفوف لا البايتات)،
-- وشعاراتٌ وصورٌ شخصية لا صفّ لها في `evidence_files` أصلاً. فالفرق بين
-- الرقمين ليس خطأً بل **هو المعلومة**: ما يستهلك الباقة ولا يظهر في
-- المخزن. فتُقاس الحقيقة، ويُعرَض الفرق صريحاً.
--
-- و`storage` مخطَّطٌ لا يُقرأ من واجهة REST، فدالّةٌ SECURITY DEFINER
-- في `public` هي الجسر — ومحصورةٌ في مشرف النظام.
--
-- متطلّبات: 073 (`evidence_files.file_size`) · 058 (دوال المشرف).
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ── (1) حدّ الباقة — رقمٌ يتبدّل بترقيتها، فلا يُكتب في الكود ──────
CREATE TABLE IF NOT EXISTS storage_plan (
  id         INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),   -- صفٌّ واحد أبداً
  plan_name  TEXT NOT NULL DEFAULT 'Free',
  quota_bytes BIGINT NOT NULL DEFAULT 1073741824,        -- غيغابايت المجاني
  warn_pct   INT NOT NULL DEFAULT 70 CHECK (warn_pct BETWEEN 1 AND 99),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- آخر نسبةٍ أُشعر عندها، فلا يتكرّر التنبيه كل يوم بلا تبدّل
  last_alert_pct INT
);
INSERT INTO storage_plan (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE storage_plan IS
  'حدّ باقة التخزين ونسبة التنبيه — «فالترقية بندٌ في قائمة ما قبل الإطلاق، لا قرارٌ منسيّ» (16)';

ALTER TABLE storage_plan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS storage_plan_super ON storage_plan;
CREATE POLICY storage_plan_super ON storage_plan FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin));

-- ── (2) القياس من القرص ─────────────────────────────────────────
-- `metadata->>'size'` هو حجم البايتات كما سجّله التخزين عند الرفع.
CREATE OR REPLACE FUNCTION storage_usage()
RETURNS TABLE (bucket text, objects bigint, bytes bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public, storage AS $fn$
  SELECT o.bucket_id::text,
         count(*)::bigint,
         COALESCE(sum((o.metadata->>'size')::bigint), 0)::bigint
  FROM storage.objects o
  GROUP BY o.bucket_id
  ORDER BY 3 DESC;
$fn$;

REVOKE ALL ON FUNCTION storage_usage() FROM PUBLIC;
COMMENT ON FUNCTION storage_usage IS
  'استهلاك التخزين الفعليّ لكل دلو — يُقرأ من storage.objects، فيَظهر ما رُفع ولا صفَّ له (16)';

-- ── (3) وما يعرفه المخزن: التوزيع على المدارس ──────────────────
-- ليُعرف **من** يستهلك، فالترقية قرارٌ تجاريّ يحتاج التوزيع لا المجموع.
CREATE OR REPLACE FUNCTION evidence_storage_by_school()
RETURNS TABLE (school_id uuid, school_name text, files bigint, bytes bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  SELECT e.school_id, s.name_ar,
         count(f.id)::bigint,
         COALESCE(sum(f.file_size), 0)::bigint
  FROM evidence_files f
  JOIN evidence e ON e.id = f.evidence_id
  LEFT JOIN schools s ON s.id = e.school_id
  WHERE e.deleted_at IS NULL
  GROUP BY e.school_id, s.name_ar
  ORDER BY 4 DESC;
$fn$;

REVOKE ALL ON FUNCTION evidence_storage_by_school() FROM PUBLIC;

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- التحقّق — يُشغَّل بعد الترحيل
-- ════════════════════════════════════════════════════════════════
-- SELECT 'جدول الباقة' AS الفحص,
--        (SELECT count(*) FROM storage_plan)::text AS الفعلي, '1' AS المتوقع
-- UNION ALL SELECT 'الحدّ المسجَّل (غيغابايت)',
--        (SELECT round(quota_bytes / 1073741824.0, 2)::text FROM storage_plan), '1.00'
-- UNION ALL SELECT 'نسبة التنبيه',
--        (SELECT warn_pct::text FROM storage_plan), '70'
-- UNION ALL SELECT 'دالّتا القياس',
--        (SELECT count(*) FROM pg_proc
--          WHERE proname IN ('storage_usage','evidence_storage_by_school'))::text, '2'
-- UNION ALL SELECT 'المستهلك فعلاً (ميغابايت)',
--        (SELECT round(COALESCE(sum(bytes), 0) / 1048576.0, 2)::text FROM storage_usage()), NULL
-- UNION ALL SELECT 'منه ما يعرفه مخزن الأدلة (ميغابايت)',
--        (SELECT round(COALESCE(sum(bytes), 0) / 1048576.0, 2)::text FROM evidence_storage_by_school()), NULL;

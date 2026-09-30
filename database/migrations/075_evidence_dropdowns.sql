-- ════════════════════════════════════════════════════════════════
-- 075: قائمتا مخزن الأدلة في dropdown_options — تمهيد م1‑3
--
--   المرجع: docs/QNSA_ACCREDITATION_ARCHITECTURE.html 3.2 · 3.4 · 3.7
--
--   ── لماذا dropdown_options لا قيود CHECK ──
--   القائمتان تتبدّلان بالتجربة: سببٌ يظهر بعد فصل، ونوعٌ يُدمج بآخر.
--   ولو كانتا قيدَي CHECK لاحتاج كل تعديل ترحيلاً جديداً ونشراً. وهما
--   في dropdown_options يعدّلهما منسّق الجودة من الإعدادات — وهو النمط
--   نفسه المعمول به في الأقسام والمسمّيات الوظيفية.
--
--   ── التمييز بين الحقلين ──
--   reason_code   : **لماذا** رُفع الدليل خارج خطة — يُسأل عنه في القناة
--                   المباشرة وحدها، ولا معنى له لدليلٍ جاء من مهمّة.
--   evidence_type : **ماهيّة** الملفّ — يُسأل عنه في القنوات كلّها.
--   (والمصدر `source` قناة الدخول، وهو آليّ لا يُسأل عنه أحد — 3.4)
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ════ سبب الرفع خارج خطة ════
INSERT INTO dropdown_options (category, value, sort_order)
SELECT v.category, v.value, v.ord
FROM (VALUES
  ('evidence_reason', 'وثيقة نظامية دائمة',       10),
  ('evidence_reason', 'أرشيف عام سابق',           20),
  ('evidence_reason', 'ممارسة قائمة',             30),
  ('evidence_reason', 'طلب من فريق التركيز',      40),
  ('evidence_reason', 'صادر عن الجهة',            50),
  ('evidence_reason', 'أخرى',                     99)
) AS v(category, value, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM dropdown_options d
  WHERE d.category = v.category AND d.value = v.value
);

-- ════ نوع الدليل ════
INSERT INTO dropdown_options (category, value, sort_order)
SELECT v.category, v.value, v.ord
FROM (VALUES
  ('evidence_type', 'سياسة',          10),
  ('evidence_type', 'محضر',           20),
  ('evidence_type', 'تقرير',          30),
  ('evidence_type', 'صورة',           40),
  ('evidence_type', 'تحليل بيانات',   50),
  ('evidence_type', 'استمارة',        60),
  ('evidence_type', 'شهادة',          70),
  ('evidence_type', 'أخرى',           99)
) AS v(category, value, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM dropdown_options d
  WHERE d.category = v.category AND d.value = v.value
);

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- جدول التحقّق
-- ════════════════════════════════════════════════════════════════

WITH checks AS (
  SELECT 1 AS n, 'أسباب الرفع خارج خطة' AS الفحص,
         (SELECT count(*)::text FROM dropdown_options
          WHERE category='evidence_reason' AND is_active) AS النتيجة, '6' AS المتوقع
  UNION ALL SELECT 2, 'أنواع الأدلة',
         (SELECT count(*)::text FROM dropdown_options
          WHERE category='evidence_type' AND is_active), '8'
  UNION ALL SELECT 3, 'لا تكرار في القيم',
         (SELECT count(*)::text FROM (
            SELECT category, value FROM dropdown_options
            WHERE category IN ('evidence_reason','evidence_type')
            GROUP BY category, value HAVING count(*) > 1) x), '0'
)
SELECT n AS "#", الفحص, النتيجة, المتوقع,
       CASE WHEN النتيجة = المتوقع THEN 'مطابق' ELSE 'خلل' END AS الحكم
FROM checks ORDER BY n;

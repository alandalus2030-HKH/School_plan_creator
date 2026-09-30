-- ════════════════════════════════════════════════════════════════
-- 076: تصحيح 075 — إزالة ما كرّر قائمة أنواع الأدلة القائمة
--
--   ── الخطأ ──
--   الترحيل 075 عامل `evidence_type` كأنها فئة جديدة، وهي قائمة منذ
--   الترحيل 021 لأدلة المهام بستّ قيم. فصارت 13، وفيها مترادفات:
--   «محضر» بجوار «محضر اجتماع»، و«صورة» بجوار «صور».
--
--   ── لماذا لا نفصلها في فئة خاصة بالاعتماد ──
--   العمود `evidence.evidence_type` **واحد للقنوات الأربع**. وقائمتان
--   منفصلتان تُنتجان في الجدول نفسه دليلاً نوعه «محضر» وآخر «محضر
--   اجتماع» — فتنكسر كل إحصاءٍ وفلترٍ على النوع.
--
--   ── ولماذا لا نصحّح القديم بدل الجديد ──
--   `tasks.required_evidence_types` مصفوفة نصّية تُطابَق **حرفياً** عند
--   انتقال المهمة (api/tasks/[taskId]/transition). وتغيير «محضر اجتماع»
--   إلى «محضر» يُفرغ شرط مهامّ قائمة **صامتاً** — فتمرّ بلا دليلها.
--   فالقديم يبقى، والجديد يتنازل.
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- المترادفات التي أضافها 075 — تُحذف ما دامت لم تُستعمل بعد
DELETE FROM dropdown_options d
WHERE d.category = 'evidence_type'
  AND d.value IN ('محضر', 'صورة')
  AND NOT EXISTS (SELECT 1 FROM evidence e WHERE e.evidence_type = d.value)
  AND NOT EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.required_evidence_types IS NOT NULL
      AND d.value = ANY(t.required_evidence_types)
  );

-- ترتيب القائمة الموحَّدة: الستّ الأصلية أولاً ثم المضافة
UPDATE dropdown_options SET sort_order = v.ord
FROM (VALUES
  ('خطة', 10), ('محضر اجتماع', 20), ('تقرير', 30), ('صور', 40),
  ('مستند', 50), ('نتائج/إحصاءات', 60),
  ('سياسة', 70), ('تحليل بيانات', 80), ('استمارة', 90), ('شهادة', 100),
  ('أخرى', 999)
) AS v(val, ord)
WHERE dropdown_options.category = 'evidence_type'
  AND dropdown_options.value = v.val;

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- جدول التحقّق
-- ════════════════════════════════════════════════════════════════

WITH checks AS (
  SELECT 1 AS n, 'إجمالي أنواع الأدلة' AS الفحص,
         (SELECT count(*)::text FROM dropdown_options
          WHERE category='evidence_type' AND is_active) AS النتيجة, '11' AS المتوقع
  UNION ALL SELECT 2, 'المترادفات أُزيلت (محضر · صورة)',
         (SELECT count(*)::text FROM dropdown_options
          WHERE category='evidence_type' AND value IN ('محضر','صورة')), '0'
  UNION ALL SELECT 3, 'الستّ الأصلية سليمة',
         (SELECT count(*)::text FROM dropdown_options
          WHERE category='evidence_type'
            AND value IN ('خطة','محضر اجتماع','تقرير','صور','مستند','نتائج/إحصاءات')), '6'
  UNION ALL SELECT 4, 'أسباب الرفع خارج خطة',
         (SELECT count(*)::text FROM dropdown_options
          WHERE category='evidence_reason' AND is_active), '6'
)
SELECT n AS "#", الفحص, النتيجة, المتوقع,
       CASE WHEN النتيجة = المتوقع THEN 'مطابق' ELSE 'خلل' END AS الحكم
FROM checks ORDER BY n;

-- ════ القائمة الموحَّدة كما ستظهر في الشاشات ════
-- SELECT value AS النوع, sort_order AS الترتيب FROM dropdown_options
-- WHERE category='evidence_type' AND is_active ORDER BY sort_order;

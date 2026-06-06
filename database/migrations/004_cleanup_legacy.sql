-- ============================================================
-- الترحيل 004: تنظيف الجداول والأعمدة القديمة
-- ============================================================
-- التاريخ: 2026-06-06
-- المشكلة: جداول موروثة من التصميم الأول لا يستخدمها التطبيق،
--          وأعمدة مكررة، وألوان افتراضية قديمة
--
-- ⚠️  تحذير: هذا الترحيل يحذف بيانات نهائياً
--     تأكد من النسخ الاحتياطي قبل التشغيل
--     Supabase Dashboard → Database → Backups
--
-- ⚠️  شغّل الاستعلامات التحقق أولاً قبل الحذف
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- الخطوة 1: تحقق من عدم وجود بيانات في الجداول القديمة
-- شغّل هذا أولاً — إذا كانت النتائج كلها 0 تابع بأمان
-- ════════════════════════════════════════════════════════════
SELECT 'axes'               AS table_name, COUNT(*) AS row_count FROM axes
UNION ALL
SELECT 'initiatives',        COUNT(*) FROM initiatives
UNION ALL
SELECT 'general_objectives', COUNT(*) FROM general_objectives
UNION ALL
SELECT 'sub_objectives',     COUNT(*) FROM sub_objectives
UNION ALL
SELECT 'task_assignments',   COUNT(*) FROM task_assignments;

-- ════════════════════════════════════════════════════════════
-- الخطوة 2: حذف الجداول القديمة الموروثة
-- (بعد التأكد من أن row_count = 0 لكل منها)
-- ════════════════════════════════════════════════════════════

-- الترتيب مهم: الجداول الأبناء أولاً
DROP TABLE IF EXISTS sub_objectives     CASCADE;
DROP TABLE IF EXISTS general_objectives CASCADE;
DROP TABLE IF EXISTS initiatives        CASCADE;
DROP TABLE IF EXISTS axes               CASCADE;
DROP TABLE IF EXISTS task_assignments   CASCADE;

-- ════════════════════════════════════════════════════════════
-- الخطوة 3: حذف العمود المكرر depends_on من tasks
-- الكود يستخدم depends_on_task_id فقط
-- ════════════════════════════════════════════════════════════
ALTER TABLE tasks DROP COLUMN IF EXISTS depends_on;

-- ════════════════════════════════════════════════════════════
-- الخطوة 4: تصحيح الألوان الافتراضية القديمة (#7c3aed → #8a1538)
-- ════════════════════════════════════════════════════════════

-- badges
ALTER TABLE badges ALTER COLUMN color SET DEFAULT '#8a1538';

-- teams
ALTER TABLE teams ALTER COLUMN color SET DEFAULT '#8a1538';

-- roles
ALTER TABLE roles ALTER COLUMN color SET DEFAULT '#8a1538';

-- تحديث القيم الموجودة في badges و teams و roles
-- (السجلات التي لا تزال تحمل اللون القديم)
UPDATE badges SET color = '#8a1538' WHERE color = '#7c3aed';
UPDATE teams  SET color = '#8a1538' WHERE color = '#7c3aed';
UPDATE roles  SET color = '#8a1538' WHERE color = '#7c3aed';

-- ════════════════════════════════════════════════════════════
-- الخطوة 5: التحقق من النتائج
-- ════════════════════════════════════════════════════════════

-- تأكيد حذف الجداول
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'axes','initiatives','general_objectives',
    'sub_objectives','task_assignments'
  );
-- يجب أن تُرجع 0 صفوف

-- تأكيد حذف العمود
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tasks'
  AND column_name = 'depends_on';
-- يجب أن تُرجع 0 صفوف

-- تأكيد الألوان
SELECT 'badges' AS tbl, color, COUNT(*) FROM badges GROUP BY color
UNION ALL
SELECT 'teams',  color, COUNT(*) FROM teams  GROUP BY color
UNION ALL
SELECT 'roles',  color, COUNT(*) FROM roles  GROUP BY color;
-- يجب ألا يظهر #7c3aed في النتائج

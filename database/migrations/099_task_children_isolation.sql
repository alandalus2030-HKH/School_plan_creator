-- ════════════════════════════════════════════════════════════════
-- 099 · تتمّة 098: جدولان آخران يسألان الخطةَ عمّا تملكه المهمّة
--
-- ── كيف وُجدا ──
-- بالمسحة التي تتبع كلّ درسٍ يُسجَّل. فـ098 عالج أربعة جداول،
-- والمسحة أخرجت اثنين بقيا على الوصل القديم:
--   `task_transitions` (021) · `task_locations` (032)
-- وكلاهما يصل `tasks → plan_nodes → plans` **وصلاً داخلياً**، فمهمّةٌ
-- بلا عقدة تُسقط الصفّ كلَّه.
--
-- ── وأثرُهما معكوسٌ لا مكشوف ──
-- لا تسريبَ هنا بل **حجب**: سجلُّ انتقالات المهمّة المستقلّة لا يُقرأ
-- من المتصفّح ([tasks/[taskId]/page.tsx:213])، وأماكنُها لا تُعرَض ولا
-- تُحذف ([:622]). والكتابةُ تمرّ لأن منفذ الانتقالات خادميّ (service
-- role يتجاوز RLS) — **فالعطب يظهر في القراءة وحدها**، وهو أخفى.
--
-- ── وفي `task_locations` ثغرةٌ ثانية مستقلّة عن هذا كلّه ──
-- شرطُ كتابته: `WITH CHECK (auth.uid() IS NOT NULL)` — **أيُّ مستخدمٍ
-- مسجَّل يربط أيَّ مهمّة بأيّ مكان في أيّ مدرسة**. ولا علاقة لها
-- بالمهمّة المستقلّة: هي مفتوحةٌ للمهامّ كلّها منذ 032.
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ── (1) سجلّ انتقالات المهمّة ───────────────────────────────────
DROP POLICY IF EXISTS task_transitions_school ON task_transitions;
CREATE POLICY task_transitions_school ON task_transitions FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM tasks t
   WHERE t.id = task_transitions.task_id AND t.school_id = my_school_id()))
WITH CHECK (EXISTS (
  SELECT 1 FROM tasks t
   WHERE t.id = task_transitions.task_id AND t.school_id = my_school_id()));

-- ── (2) أماكن المهمّة ──────────────────────────────────────────
-- والكتابةُ تُقيَّد كالقراءة: `auth.uid() IS NOT NULL` ليس عزلاً.
DROP POLICY IF EXISTS "task_locations_rw" ON task_locations;
CREATE POLICY "task_locations_rw" ON task_locations FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM tasks t
   WHERE t.id = task_locations.task_id AND t.school_id = my_school_id()))
WITH CHECK (EXISTS (
  SELECT 1 FROM tasks t
   WHERE t.id = task_locations.task_id AND t.school_id = my_school_id()));

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- التحقّق — انسخه وحده بعد التشغيل
-- ════════════════════════════════════════════════════════════════
-- SELECT tablename AS الجدول, policyname AS السياسة, cmd AS الأمر,
--        CASE WHEN (COALESCE(qual,'')||' '||COALESCE(with_check,''))
--                  LIKE '%(t.school_id = my_school_id())%'
--             THEN 'مقيَّدة' ELSE 'مفتوحة' END AS "حال العزل",
--        roles::text AS الأدوار
--   FROM pg_policies
--  WHERE schemaname='public' AND tablename IN ('task_transitions','task_locations');
-- المتوقع: صفّان · كلاهما «مقيَّدة» · {authenticated}
--
-- ── وبصلاحيات ياسر: سجلُّ مهمّته المستقلّة صار يُقرأ ──
-- BEGIN;
--   SELECT set_config('request.jwt.claims',
--     '{"sub":"4f4723f7-9d85-4d7f-8ef9-bfd7716143f3","role":"authenticated"}', true);
--   SET LOCAL ROLE authenticated;
--   SELECT count(*) AS "انتقالاتٌ يراها — المتوقع > 0"
--     FROM task_transitions WHERE task_id = '150d4dbc-b4e6-446b-a4d0-ec83f6dd8785';
-- ROLLBACK;

-- ════════════════════════════════════════════════════════════════
-- 098 · المرحلة ٢: سدُّ ثغرة المهمّة المستقلّة — في أربعة جداول
--
-- 🔒 **لا يُشغَّل إلا بعد أن يُرجع 097 «بلا مدرسة = 0».**
--
-- ── ما يُسَدّ ──
-- الاستثناء `node_id IS NULL OR …` مكتوبٌ في **أربعة** مواضع لا واحد:
--   · `tasks`         (024) — select · insert · update
--   · `subtasks`      (024) — الأربع
--   · `task_comments` (011) — وفيه زيادةٌ أخطر: `OR my_school_id() IS NULL`
--   · `evidence`      (073) — بصيغته المعكوسة: يشترط خطّةً، فيمنع
--                             الدليل عن كل مهمّة مستقلّة في المنصّة
-- فسدُّ واحدٍ منها دون إخوته يترك الباب موارباً — «وكلّ درسٍ يُسجَّل
-- تتبعه مسحةٌ على المشروع كلّه».
--
-- ── والدور يُقيَّد ──
-- السياسات القديمة بلا `TO`، أي على `{public}` — ومنه `anon`. والعزل
-- يقوم على `auth.uid()`، فبلا جلسةٍ تُرجع `my_school_id()` فراغاً.
-- فتُكتب الآن على `authenticated` صراحةً.
--
-- ── وما لا يتغيّر ──
-- شروطُ الحالة كما هي حرفياً: قفلُ المهمّة المنجزة (024)، ومنعُ تعيين
-- «منجزة» من العميل، وحمايةُ الدليل المقبول (039)، و`has_permission`.
-- **الشرط الجديد أضيقُ لا أوسع** — وهو نمط 073 نفسه.
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ── (1) مُشغِّلٌ يملأ المدرسة حين لا تأتي ───────────────────────
-- لازمٌ لمفتاح الخدمة: لا `auth.uid()` له، فتُرجع `my_school_id()`
-- فراغاً ويسقط الافتراض — وهي عينُ العلّة المسجّلة في CLAUDE.md عن
-- `evidence.school_id` في 073. فالعلاج هنا **مُشغِّلٌ لا افتراضٌ وحده**،
-- يُصلح كلّ مسارٍ حتى ما نسيناه.
CREATE OR REPLACE FUNCTION trg_tasks_fill_school() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.school_id IS NOT NULL THEN RETURN NEW; END IF;

  IF NEW.node_id IS NOT NULL THEN
    SELECT p.school_id INTO NEW.school_id
      FROM plan_nodes pn JOIN plans p ON p.id = pn.plan_id
     WHERE pn.id = NEW.node_id;
  END IF;

  IF NEW.school_id IS NULL THEN
    NEW.school_id := COALESCE(
      (SELECT school_id FROM profiles WHERE id = NEW.created_by),
      (SELECT school_id FROM profiles WHERE id = NEW.assigned_to_user_id));
  END IF;

  IF NEW.school_id IS NULL THEN
    RAISE EXCEPTION 'مهمّةٌ بلا مدرسة — ولا خطّةَ لها ولا منشئ معروف (097).'
      USING ERRCODE = 'not_null_violation';
  END IF;
  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS tasks_fill_school ON tasks;
CREATE TRIGGER tasks_fill_school BEFORE INSERT ON tasks
  FOR EACH ROW EXECUTE FUNCTION trg_tasks_fill_school();

ALTER TABLE tasks ALTER COLUMN school_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_school ON tasks (school_id)
  WHERE deleted_at IS NULL;

-- ── (2) سياسات `tasks` ─────────────────────────────────────────
DROP POLICY IF EXISTS "tasks_school_select" ON tasks;
CREATE POLICY "tasks_school_select" ON tasks FOR SELECT TO authenticated
USING (deleted_at IS NULL AND school_id = my_school_id());

DROP POLICY IF EXISTS "tasks_school_insert" ON tasks;
CREATE POLICY "tasks_school_insert" ON tasks FOR INSERT TO authenticated
WITH CHECK (
  status IS DISTINCT FROM 'completed'
  AND school_id = my_school_id()
  -- وإن كانت على خطّة فخطّتها من المدرسة نفسها — فلا تُعلَّق على خطة غيرك
  AND (node_id IS NULL OR EXISTS (
        SELECT 1 FROM plan_nodes pn JOIN plans p ON p.id = pn.plan_id
         WHERE pn.id = tasks.node_id AND p.school_id = my_school_id()))
);

DROP POLICY IF EXISTS "tasks_school_update" ON tasks;
CREATE POLICY "tasks_school_update" ON tasks FOR UPDATE TO authenticated
USING (
  deleted_at IS NULL AND status <> 'completed'
  AND school_id = my_school_id()
)
WITH CHECK (
  status IS DISTINCT FROM 'completed'
  AND school_id = my_school_id()
  AND (node_id IS NULL OR EXISTS (
        SELECT 1 FROM plan_nodes pn JOIN plans p ON p.id = pn.plan_id
         WHERE pn.id = tasks.node_id AND p.school_id = my_school_id()))
);
-- ولا سياسة DELETE — الحذف ناعمٌ عبر الـAPI (024)

-- ── (3) سياسات `subtasks` — العزل عبر مدرسة مهمّتها ────────────
DROP POLICY IF EXISTS "subtasks_school_select" ON subtasks;
CREATE POLICY "subtasks_school_select" ON subtasks FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM tasks t
                WHERE t.id = subtasks.task_id AND t.school_id = my_school_id()));

DROP POLICY IF EXISTS "subtasks_school_insert" ON subtasks;
CREATE POLICY "subtasks_school_insert" ON subtasks FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM tasks t
                     WHERE t.id = subtasks.task_id AND t.school_id = my_school_id()
                       AND t.status <> 'completed'));

DROP POLICY IF EXISTS "subtasks_school_update" ON subtasks;
CREATE POLICY "subtasks_school_update" ON subtasks FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM tasks t
                WHERE t.id = subtasks.task_id AND t.school_id = my_school_id()
                  AND t.status <> 'completed'))
WITH CHECK (EXISTS (SELECT 1 FROM tasks t
                     WHERE t.id = subtasks.task_id AND t.school_id = my_school_id()
                       AND t.status <> 'completed'));

DROP POLICY IF EXISTS "subtasks_school_delete" ON subtasks;
CREATE POLICY "subtasks_school_delete" ON subtasks FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM tasks t
                WHERE t.id = subtasks.task_id AND t.school_id = my_school_id()
                  AND t.status <> 'completed'));

-- ── (4) `task_comments` — وفيه كان `OR my_school_id() IS NULL` ──
-- وهو استثناءٌ يفتح الجدول كلَّه لمن لا مدرسةَ له.
DROP POLICY IF EXISTS "task_comments_school" ON task_comments;
CREATE POLICY "task_comments_school" ON task_comments FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM tasks t
                WHERE t.id = task_comments.task_id AND t.school_id = my_school_id()))
WITH CHECK (EXISTS (SELECT 1 FROM tasks t
                     WHERE t.id = task_comments.task_id AND t.school_id = my_school_id()));

-- ── (5) سياسات `evidence` — المهمّة تُسأل عن مدرستها لا عن خطّتها ──
-- وبقيّة الشروط حرفياً كما في 073 و039.
DROP POLICY IF EXISTS "evidence_school_select" ON evidence;
CREATE POLICY "evidence_school_select" ON evidence FOR SELECT TO authenticated
USING (school_id = my_school_id());

DROP POLICY IF EXISTS "evidence_school_insert" ON evidence;
CREATE POLICY "evidence_school_insert" ON evidence FOR INSERT TO authenticated
WITH CHECK (
  has_permission('manage_evidence')
  AND school_id = my_school_id()
  AND (task_id IS NULL OR EXISTS (
        SELECT 1 FROM tasks t
         WHERE t.id = evidence.task_id
           AND t.school_id = my_school_id()
           AND t.status NOT IN ('completed','submitted')))
);

DROP POLICY IF EXISTS "evidence_school_update" ON evidence;
CREATE POLICY "evidence_school_update" ON evidence FOR UPDATE TO authenticated
USING (
  has_permission('manage_evidence')
  AND school_id = my_school_id()
  AND status <> 'accepted'                      -- المقبول سجلّ موثّق (039)
  AND (task_id IS NULL OR EXISTS (
        SELECT 1 FROM tasks t
         WHERE t.id = evidence.task_id
           AND t.school_id = my_school_id()
           AND t.status NOT IN ('completed','submitted')))
)
WITH CHECK (
  has_permission('manage_evidence')
  AND school_id = my_school_id()
  AND (task_id IS NULL OR EXISTS (
        SELECT 1 FROM tasks t
         WHERE t.id = evidence.task_id
           AND t.school_id = my_school_id()
           AND t.status NOT IN ('completed','submitted')))
);

DROP POLICY IF EXISTS "evidence_school_delete" ON evidence;
CREATE POLICY "evidence_school_delete" ON evidence FOR DELETE TO authenticated
USING (
  has_permission('manage_evidence')
  AND school_id = my_school_id()
  AND status <> 'accepted'
  AND (task_id IS NULL OR EXISTS (
        SELECT 1 FROM tasks t
         WHERE t.id = evidence.task_id
           AND t.school_id = my_school_id()
           AND t.status NOT IN ('completed','submitted')))
);

-- ── (6) رافعُ الدليل يُختم في القاعدة لا في المنفذ ──────────────
-- شاشةُ دليل المهمّة تُدرج من المتصفّح **بلا `uploaded_by`**، فيبقى
-- فارغاً. وأثرُه أخطر من فراغ عمود:
--   · `review/route.ts` يمنع التقييم الذاتي بـ`uploaded_by = auth.uid()`
--     — ومع الفراغ **لا يمنع شيئاً**، فيقبل الموظّف دليلَ نفسه.
--   · ورسالةُ الرفض تذهب إلى `uploaded_by` — فلا تصل رافعَه.
-- والعلاج `DEFAULT` من القاعدة: يُصلح كلّ مسارٍ دفعةً واحدة.
ALTER TABLE evidence ALTER COLUMN uploaded_by SET DEFAULT auth.uid();

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- التحقّق — انسخه وحده بعد التشغيل
-- ════════════════════════════════════════════════════════════════
-- ⚠️ ولا يُفحَص ببحثٍ عن نصّ `node_id IS NULL` — فهو باقٍ في سياستَي
--    الإدراج والتعديل **حارساً لا مخرجاً**: المدرسة شرطٌ مستقلّ قبله،
--    وهو يقول «لا خطّةَ فلا شيءَ أفحصه في الخطة». وحذفُه يمنع إنشاء
--    كلّ مهمّة مستقلّة — وهو ما جئنا نُصلحه. فالفحص على **الشرط
--    الحاكم** لا على نصٍّ عابر:
-- SELECT 'سياساتٌ غير مقيَّدة بمدرسة' AS الفحص,
--        (SELECT count(*)::text FROM pg_policies
--          WHERE schemaname = 'public'
--            AND tablename IN ('tasks','subtasks','task_comments','evidence')
--            AND (COALESCE(qual,'')||' '||COALESCE(with_check,''))
--                NOT LIKE '%(school_id = my_school_id())%'
--            AND (COALESCE(qual,'')||' '||COALESCE(with_check,''))
--                NOT LIKE '%(t.school_id = my_school_id())%') AS الفعلي,
--        '0' AS المتوقع
-- UNION ALL SELECT 'وسياساتُ المهامّ على authenticated',
--        (SELECT count(*)::text FROM pg_policies
--          WHERE schemaname='public' AND tablename='tasks'
--            AND roles::text LIKE '%authenticated%'), '3'
-- UNION ALL SELECT 'ومشغّلُ المدرسة قائم',
--        (SELECT count(*)::text FROM pg_trigger WHERE tgname='tasks_fill_school'), '1'
-- UNION ALL SELECT 'و`school_id` إلزاميّ',
--        (SELECT CASE WHEN attnotnull THEN 'نعم' ELSE 'لا' END FROM pg_attribute
--          WHERE attrelid='tasks'::regclass AND attname='school_id'), 'نعم'
-- UNION ALL SELECT 'ورافعُ الدليل له افتراض',
--        (SELECT CASE WHEN count(*)>0 THEN 'نعم' ELSE 'لا' END FROM information_schema.columns
--          WHERE table_name='evidence' AND column_name='uploaded_by'
--            AND column_default IS NOT NULL), 'نعم';

-- ── اختبارُ العزل بصلاحيات ياسر (معاملةٌ تُلغى) ──
-- BEGIN;
--   SELECT set_config('request.jwt.claims',
--     '{"sub":"4f4723f7-9d85-4d7f-8ef9-bfd7716143f3","role":"authenticated"}', true);
--   SET LOCAL ROLE authenticated;
--   SELECT count(*) AS "مهامٌّ من مدارس أخرى — المتوقع 0"
--     FROM tasks WHERE school_id <> 'ce24af0d-963d-48e1-a9ae-50423d58214c';
--   SELECT my_school_id() AS "مدرسته", has_permission('manage_evidence') AS "صلاحيته";
-- ROLLBACK;

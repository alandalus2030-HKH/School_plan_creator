-- ════════════════════════════════════════════════════════════════
-- 097 · المرحلة ١: عمود `school_id` في `tasks` وتعبئته — **بيانات فقط**
--
-- ⚠️ لا سياسةَ تتغيّر هنا، ولا قيدَ NOT NULL. هذا الترحيل **آمنُ
--    الرجوع**: يضيف عموداً ويملؤه، ولا يمنع شيئاً كان يعمل.
--    و098 هو الذي يُحكم — ولا يُشغَّل إلا بعد أن يُرجع هذا صفراً.
--
-- ── العلّة ──
-- `tasks` **بلا عمود مدرسة أصلاً**، فعزلُها مشتقٌّ من سلسلة
-- `tasks → plan_nodes → plans.school_id`. والمهمّة المستقلّة
-- (`node_id IS NULL`) تقطع السلسلة من أوّل حلقة — فكُتبت السياسات
-- بـ«`node_id IS NULL` **أو** خطّتها من مدرستي»، وهو استثناءٌ مفتوح:
--   · كلُّ مهمّة مستقلّة مرئيّةٌ وقابلةٌ للتعديل **لكل مستخدمي كل
--     المدارس** (ثغرة عزل، لا عطل واجهة).
--   · ودليلٌ لا يُرفع عليها أبداً، لأن `evidence_school_insert`
--     يشترط خطّةً لا مجرّد غياب خطة.
--
-- وهي عينُ العلّة المسجّلة في CLAUDE.md: «ما بُني قبل القناة المباشرة
-- يسأل الخطةَ عمّا يملكه الدليل». وهنا تسأل الخطةَ عمّا تملكه المهمّة.
--
-- ── والعلاج: المدرسة عمودٌ في المهمّة لا استنتاجٌ من خطّتها ──
-- «اشتقّ القيمة من مصدرها ولا تنسخها» تُقرأ هنا بعكسها: مصدرُ انتماء
-- المهمّة مدرستُها، لا الخطة التي قد لا توجد.
-- ════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS school_id UUID
  REFERENCES schools(id) ON DELETE CASCADE;

-- الافتراض للمسار المعتاد (متصفّح بجلسة) — ومفتاحُ الخدمة لا يُرجع
-- منه شيئاً، فيتولّاه مُشغِّل 098.
ALTER TABLE tasks ALTER COLUMN school_id SET DEFAULT my_school_id();

COMMENT ON COLUMN tasks.school_id IS
  'مدرسة المهمّة — عمودٌ لا استنتاجٌ من خطّتها، فالمهمّة المستقلّة بلا خطة (097)';

-- ── (1) ما له خطّة: من خطّته ────────────────────────────────────
UPDATE tasks t SET school_id = p.school_id
  FROM plan_nodes pn JOIN plans p ON p.id = pn.plan_id
 WHERE pn.id = t.node_id AND t.school_id IS NULL;

-- ── (2) وما لا خطّة له: من منشئه، فمن المُسنَد إليه ─────────────
-- والترتيب مقصود: المنشئ أوثقُ نسبةً من المُسنَد إليه، إذ قد يُسنَد
-- إلى من نُقل بعدها إلى مدرسةٍ أخرى.
UPDATE tasks t SET school_id = COALESCE(
    (SELECT school_id FROM profiles WHERE id = t.created_by),
    (SELECT school_id FROM profiles WHERE id = t.assigned_to_user_id))
 WHERE t.school_id IS NULL;

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- بوّابة 098 — شغّل هذا وأرسل نتيجته
-- ════════════════════════════════════════════════════════════════
SELECT
  count(*) FILTER (WHERE school_id IS NULL)                       AS "بلا مدرسة",
  count(*)                                                        AS "الإجمالي",
  count(*) FILTER (WHERE node_id IS NULL AND deleted_at IS NULL)  AS "مستقلّة حيّة",
  count(DISTINCT school_id)                                       AS "عدد المدارس"
FROM tasks;

-- 🔒 **لا تُشغّل 098 إلا إذا كان «بلا مدرسة» = 0.**
--    وإن بقي شيء فهي مهامٌّ منشئُها محذوفٌ ولا مُسنَدَ إليها — تُعالَج
--    يدوياً بنسبتها إلى مدرستها الصحيحة، **ولا تُحذف**: «في قاعدةٍ
--    حذفها ناعم، ما لا أثرَ له لا يُخترع ولا يُمحى».

-- ── ولقياس حجم المهامّ المستقلّة (للقرار التصميميّ) ──
-- SELECT count(*) FILTER (WHERE node_id IS NULL) AS "مستقلّة",
--        count(*) AS "الإجمالي"
--   FROM tasks WHERE deleted_at IS NULL;
--
-- SELECT count(*) AS "أدلّةٌ على مهامّ مستقلّة"
--   FROM evidence e JOIN tasks t ON t.id = e.task_id
--  WHERE t.node_id IS NULL AND e.deleted_at IS NULL;

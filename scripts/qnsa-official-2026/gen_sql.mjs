/* ════════════════════════════════════════════════════════════════
   يولّد ترحيلات إصدار «official-2026» من كتالوج الهيئة.
     070 — الإصدار والمستويات وسلم المسمّيات و380 عقدة
     071 — أوصاف سلم التقدير (168 صفّاً × 5 مستويات = 840 عبارة)
     072 — نماذج الأدلة + البيانات التوضيحية وأسئلة التأمل، ثم **التفعيل**

   لماذا ثلاثة ملفّات لا واحد: حجم SQL الكلّي ~700KB، ويُلصق يدوياً في
   محرّر Supabase. وثلاثتها تتبع ترتيب 064/065/067 نفسه فيسهل تتبّعها.

   ولماذا يأتي التفعيل في الأخير: الإصدار الجديد يُنشأ بحالة draft،
   ولا يصير active إلا بعد اكتمال محتواه كلّه. فلو توقّف التشغيل بين
   ترحيلين، يبقى final-2026 نشطاً والتطبيق يعمل — لا إطار نصف فارغ.

   التشغيل: node scripts/qnsa-official-2026/gen_sql.mjs
   ════════════════════════════════════════════════════════════════ */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../..')
const SRC  = JSON.parse(fs.readFileSync('C:/Users/pcl_h/Desktop/guide/accreditation_catalog_2026.json', 'utf8'))
const VER  = 'official-2026'

const q = t => "'" + String(t ?? '').replace(/'/g, "''").replace(/\r\n?/g, '\n') + "'"
const qn = v => (v === null || v === undefined || v === '' ? 'NULL' : q(v))
const page1 = p => (Array.isArray(p) && p.length ? p[0] : null)
const pgArr = p => (Array.isArray(p) && p.length ? `ARRAY[${p.join(',')}]` : 'NULL')

/* ── تسطيح المصدر ── */
const nodes = [], rubric = [], evidence = [], notes = []
let aspectsN = 0, subsN = 0, indsN = 0

SRC.standards.forEach((st, si) => {
  nodes.push({ code: st.number, level: 1, parent: null, name: st.name, sort: si + 1, page: null })
  st.aspects.forEach((a, ai) => {
    aspectsN++
    nodes.push({ code: a.number, level: 2, parent: st.number, name: a.name, sort: ai + 1, page: null })
    ;(a.evidence || []).forEach((e, n) => evidence.push({
      aspect: a.number, sort: n + 1, code: e.number, text: e.text, page: page1(e.pages),
    }))
    a.substandards.forEach((s, sj) => {
      subsN++
      nodes.push({ code: s.number, level: 3, parent: a.number, name: s.name, sort: sj + 1,
                   page: page1((s.indicators[0] || {}).pages) })
      s.indicators.forEach((i, n) => {
        indsN++
        nodes.push({ code: i.number, level: 4, parent: s.number, name: i.text, sort: n + 1, page: page1(i.pages) })
      })
      ;(s.rubric || []).forEach(r => rubric.push({
        sub: s.number, row: r.row, group: r.group || null, pages: r.pages || [],
        levels: [[5, r.excellent], [4, r.very_good], [3, r.good], [2, r.acceptable], [1, r.weak]],
      }))
      ;(s.explanatory_data || []).forEach((e, n) => notes.push({
        sub: s.number, kind: 'guidance', sort: n + 1, text: e.text, lvl: e.level ?? null, page: page1(e.pages),
      }))
      ;(s.reflection_questions || []).forEach((r, n) => notes.push({
        sub: s.number, kind: 'reflection', sort: n + 1, text: r.text, lvl: null, page: page1(r.pages),
      }))
    })
  })
})

const HEAD = (num, title, body) => `-- ════════════════════════════════════════════════════════════════
-- ${num} — ${title}
-- ════════════════════════════════════════════════════════════════
-- المصدر: «دليل الاعتماد المدرسي الوطني 2026» — الصفحات 27–209.
--   وصل من الهيئة بصيغتين (JSON + Excel) طوبقتا عنصراً بعنصر فكانتا
--   متطابقتين (scripts/qnsa-official-2026/verify_sources.mjs)، ودقّق
--   المستخدم عيّنة منهما مقابل النسخة الورقية (2026-09-24).
--
-- التوليد: node scripts/qnsa-official-2026/gen_sql.mjs — لا يُحرَّر يدوياً.
${body}
-- ════════════════════════════════════════════════════════════════
`

/* ════════════════ 070 — الهيكل ════════════════ */
const sql070 = HEAD('070', `إطار QNSA/${VER} — الإصدار والعقد`, `--
-- يُنشأ الإصدار بحالة **draft** ولا يُفعَّل هنا: التفعيل وأرشفة القديمين
--   في الترحيل 072 بعد اكتمال السلم والأدلة. فإن توقّف التشغيل بينهما
--   بقي final-2026 نشطاً والتطبيق يعمل.
-- العقد: ${nodes.length} (5 محاور · ${aspectsN} جوانب · ${subsN} معايير فرعية · ${indsN} مؤشرات).
-- source_page: صفحة العنصر في الدليل — لتتبّع أيّ نصّ إلى أصله.`) + `
-- ── (0) عمود التتبّع ───────────────────────────────────────────
ALTER TABLE framework_nodes ADD COLUMN IF NOT EXISTS source_page int;

COMMENT ON COLUMN framework_nodes.source_page IS
  'صفحة العنصر في وثيقة الجهة — للمراجعة والتدقيق';

-- ── (1) الإصدار (draft) + المستويات + سلم المسمّيات ─────────────
INSERT INTO frameworks (code, version, name_ar, name_en, status, source_note)
VALUES ('QNSA', ${q(VER)},
        'معايير الاعتماد المدرسي الوطني — النسخة المعتمدة 2026',
        'Qatar National School Accreditation Standards — Official 2026',
        'draft',
        'دليل الاعتماد المدرسي الوطني 2026 — الصفحات 27–209 (JSON + Excel من الهيئة)')
ON CONFLICT (code, version) DO UPDATE
SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en, source_note = EXCLUDED.source_note;

INSERT INTO framework_levels (framework_id, level, name_ar, name_en)
SELECT f.id, v.level, v.name_ar, v.name_en
FROM frameworks f,
     (VALUES (1, 'معيار رئيس', 'Standard'),
             (2, 'جانب',       'Aspect'),
             (3, 'معيار فرعي', 'Sub-standard'),
             (4, 'مؤشر أداء',  'Performance Indicator')
     ) AS v(level, name_ar, name_en)
WHERE f.code = 'QNSA' AND f.version = ${q(VER)}
ON CONFLICT (framework_id, level) DO UPDATE
SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en;

INSERT INTO framework_rating_scale (framework_id, level, name_ar, name_en)
SELECT f.id, v.level, v.name_ar, v.name_en
FROM frameworks f,
     (VALUES (1, 'ضعيف',     'Weak'),
             (2, 'مقبول',    'Acceptable'),
             (3, 'جيد',       'Good'),
             (4, 'جيد جداً', 'Very Good'),
             (5, 'ممتاز',    'Outstanding')
     ) AS v(level, name_ar, name_en)
WHERE f.code = 'QNSA' AND f.version = ${q(VER)}
ON CONFLICT (framework_id, level) DO UPDATE
SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en;

-- ── (2) العقد في جدول مرحلي ثم إدراجها مستوىً بعد مستوى ─────────
CREATE TEMP TABLE _q26_nodes (
  code text, level int, parent text, name_ar text, sort_order int, page int
) ON COMMIT DROP;

INSERT INTO _q26_nodes (code, level, parent, name_ar, sort_order, page) VALUES
${nodes.map(n => `  (${q(n.code)}, ${n.level}, ${qn(n.parent)}, ${q(n.name)}, ${n.sort}, ${n.page ?? 'NULL'})`).join(',\n')};

DO $seed$
DECLARE fw uuid; lvl int; n int;
BEGIN
  SELECT id INTO fw FROM frameworks WHERE code = 'QNSA' AND version = ${q(VER)};
  IF fw IS NULL THEN RAISE EXCEPTION 'الإصدار غير موجود'; END IF;

  FOR lvl IN 1..4 LOOP
    INSERT INTO framework_nodes
      (framework_id, parent_id, level, code, name_ar, sort_order, source_page)
    SELECT fw, p.id, s.level, s.code, s.name_ar, s.sort_order, s.page
    FROM _q26_nodes s
    LEFT JOIN framework_nodes p ON p.framework_id = fw AND p.code = s.parent
    WHERE s.level = lvl
    ON CONFLICT (framework_id, code) DO UPDATE
    SET name_ar = EXCLUDED.name_ar, parent_id = EXCLUDED.parent_id,
        sort_order = EXCLUDED.sort_order, level = EXCLUDED.level,
        source_page = EXCLUDED.source_page;

    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'المستوى %: % عقدة', lvl, n;
  END LOOP;

  SELECT count(*) INTO n FROM framework_nodes
   WHERE framework_id = fw AND level > 1 AND parent_id IS NULL;
  IF n > 0 THEN RAISE EXCEPTION 'عقد بلا أب: %', n; END IF;
END $seed$;

-- ── (3) تحقّق ───────────────────────────────────────────────────
SELECT l.name_ar AS المستوى, count(*) AS العدد,
       CASE WHEN count(*) = v.expected THEN 'مطابق' ELSE 'مختلف — المتوقّع ' || v.expected END AS الحالة
FROM framework_nodes n
JOIN frameworks f ON f.id = n.framework_id
JOIN framework_levels l ON l.framework_id = f.id AND l.level = n.level
JOIN (VALUES (1, 5), (2, ${aspectsN}), (3, ${subsN}), (4, ${indsN})) AS v(lvl, expected) ON v.lvl = n.level
WHERE f.code = 'QNSA' AND f.version = ${q(VER)}
GROUP BY l.name_ar, n.level, v.expected ORDER BY n.level;
-- المتوقّع: ${nodes.length} عقدة — 5 · ${aspectsN} · ${subsN} · ${indsN}، كلّها «مطابق»

SELECT version, status FROM frameworks WHERE code = 'QNSA' ORDER BY version;
-- المتوقّع: draft-2026 = archived · final-2026 = active · ${VER} = draft (يُفعَّل في 072)
`

/* ════════════════ 071 — سلم التقدير ════════════════ */
const rubricRows = []
for (const r of rubric) {
  for (const [lvl, text] of r.levels) {
    rubricRows.push(`  (${q(r.sub)}, ${r.row}, ${lvl}, ${q(text)}, ${qn(r.group)}, ${pgArr(r.pages)})`)
  }
}

const sql071 = HEAD('071', `سلم التقدير لإصدار QNSA/${VER}`, `--
-- ${rubric.length} وصفاً موزّعة على المعايير الفرعية، لكلٍّ خمسة مستويات
--   (ممتاز · جيد جداً · جيد · مقبول · ضعيف) = ${rubricRows.length} عبارة.
-- الوصف مرتبط بعقدة **المعيار الفرعي** لا بمؤشّر بعينه — كما في الوثيقة.
-- group_ar: مجموعة الوصف حين تقسّمه الوثيقة (مثل اختبارات TIMSS/PISA/PIRLS).`) + `
-- ── (0) أعمدة إضافية على جدول السلم القائم (لا تمسّ الإصدارات السابقة) ──
ALTER TABLE framework_rubric ADD COLUMN IF NOT EXISTS group_ar     text;
ALTER TABLE framework_rubric ADD COLUMN IF NOT EXISTS source_pages int[];

COMMENT ON COLUMN framework_rubric.group_ar IS
  'مجموعة الوصف داخل المعيار الفرعي حين تقسّمها الوثيقة (مثل اختبار TIMSS)';

-- ── (1) الأوصاف ────────────────────────────────────────────────
CREATE TEMP TABLE _q26_rubric (
  sub text, row_index int, level int, descriptor text, group_ar text, pages int[]
) ON COMMIT DROP;

INSERT INTO _q26_rubric (sub, row_index, level, descriptor, group_ar, pages) VALUES
${rubricRows.join(',\n')};

DO $rub$
DECLARE fw uuid; n int; orphan int;
BEGIN
  SELECT id INTO fw FROM frameworks WHERE code = 'QNSA' AND version = ${q(VER)};
  IF fw IS NULL THEN RAISE EXCEPTION 'الإصدار ${VER} غير موجود — شغّل 070 أولاً'; END IF;

  SELECT count(DISTINCT r.sub) INTO orphan FROM _q26_rubric r
   WHERE NOT EXISTS (SELECT 1 FROM framework_nodes fn
                      WHERE fn.framework_id = fw AND fn.level = 3 AND fn.code = r.sub);
  IF orphan > 0 THEN RAISE EXCEPTION 'أوصاف بلا معيار فرعي مقابل: %', orphan; END IF;

  INSERT INTO framework_rubric (framework_node_id, row_index, level, descriptor_ar, group_ar, source_pages)
  SELECT fn.id, r.row_index, r.level, r.descriptor, r.group_ar, r.pages
  FROM _q26_rubric r
  JOIN framework_nodes fn ON fn.framework_id = fw AND fn.level = 3 AND fn.code = r.sub
  ON CONFLICT (framework_node_id, row_index, level) DO UPDATE
  SET descriptor_ar = EXCLUDED.descriptor_ar, group_ar = EXCLUDED.group_ar,
      source_pages = EXCLUDED.source_pages;

  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'أوصاف السلم: % عبارة', n;
END $rub$;

-- ── (2) تحقّق ───────────────────────────────────────────────────
SELECT 'عبارات السلم' AS البند, count(*)::text AS العدد,
       CASE WHEN count(*) = ${rubricRows.length} THEN 'مطابق' ELSE 'مختلف — المتوقّع ${rubricRows.length}' END AS الحالة
FROM framework_rubric r
JOIN framework_nodes fn ON fn.id = r.framework_node_id
JOIN frameworks f ON f.id = fn.framework_id
WHERE f.code = 'QNSA' AND f.version = ${q(VER)}
UNION ALL
SELECT 'أوصاف (صفوف)', count(*)::text,
       CASE WHEN count(*) = ${rubric.length} THEN 'مطابق' ELSE 'مختلف — المتوقّع ${rubric.length}' END
FROM (SELECT DISTINCT r.framework_node_id, r.row_index
      FROM framework_rubric r
      JOIN framework_nodes fn ON fn.id = r.framework_node_id
      JOIN frameworks f ON f.id = fn.framework_id
      WHERE f.code = 'QNSA' AND f.version = ${q(VER)}) x
UNION ALL
SELECT 'أوصاف ناقصة المستويات', count(*)::text,
       CASE WHEN count(*) = 0 THEN 'مطابق' ELSE 'خلل' END
FROM (SELECT r.framework_node_id, r.row_index
      FROM framework_rubric r
      JOIN framework_nodes fn ON fn.id = r.framework_node_id
      JOIN frameworks f ON f.id = fn.framework_id
      WHERE f.code = 'QNSA' AND f.version = ${q(VER)}
      GROUP BY r.framework_node_id, r.row_index HAVING count(*) <> 5) y;
-- المتوقّع: ${rubricRows.length} · ${rubric.length} · 0 — كلّها «مطابق»
`

/* ════════════════ 072 — الأدلة والملاحظات والتفعيل ════════════════ */
const guidanceN = notes.filter(n => n.kind === 'guidance').length
const reflectN  = notes.filter(n => n.kind === 'reflection').length

const sql072 = HEAD('072', `نماذج الأدلة والبيانات التوضيحية — وتفعيل ${VER}`, `--
-- ${evidence.length} نموذج دليل (مرتبطة بعقدة **الجانب** كما في الوثيقة)
-- ${guidanceN} بياناً توضيحياً و${reflectN} سؤال تأمّل ذاتي — مفصّلة بنداً بنداً
--   في جدول جديد، بخلاف الإصدار السابق الذي خزّنها نصّاً واحداً في عمودين.
--
-- وفي آخره **التفعيل**: ${VER} → active · draft-2026 و final-2026 → archived.
--   بعده تتحوّل الواجهة كلّها إلى الإصدار الجديد دون تعديل سطر كود،
--   لأنها تختار الإصدار بحالته (status = 'active') لا باسمه.`) + `
-- ── (0) أعمدة على جدول الأدلة القائم ───────────────────────────
ALTER TABLE framework_evidence_samples ADD COLUMN IF NOT EXISTS code        text;
ALTER TABLE framework_evidence_samples ADD COLUMN IF NOT EXISTS source_page int;

-- ── (1) جدول البيانات التوضيحية وأسئلة التأمل ──────────────────
CREATE TABLE IF NOT EXISTS framework_node_notes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_node_id uuid NOT NULL REFERENCES framework_nodes(id) ON DELETE CASCADE,
  kind              text NOT NULL CHECK (kind IN ('guidance', 'reflection')),
  sort_order        int  NOT NULL CHECK (sort_order >= 1),
  text_ar           text NOT NULL,
  depth             smallint,   -- مستوى البند في الوثيقة (تعشيق القوائم)
  source_page       int,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (framework_node_id, kind, sort_order)
);

CREATE INDEX IF NOT EXISTS framework_node_notes_node_idx
  ON framework_node_notes (framework_node_id, kind, sort_order);

COMMENT ON TABLE framework_node_notes IS
  'البيانات التوضيحية وأسئلة التأمل الذاتي لكل معيار فرعي — بنداً بنداً';

ALTER TABLE framework_node_notes ENABLE ROW LEVEL SECURITY;

DO $do$
DECLARE t text := 'framework_node_notes';
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_read',  t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_write', t);

  EXECUTE format(
    'CREATE POLICY %I ON %I FOR SELECT USING (auth.uid() IS NOT NULL)',
    t || '_read', t);
  EXECUTE format(
    'CREATE POLICY %I ON %I FOR ALL USING (my_is_super_admin()) WITH CHECK (my_is_super_admin())',
    t || '_write', t);

  EXECUTE format('DROP TRIGGER IF EXISTS audit_%I ON %I', t, t);
  EXECUTE format(
    'CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON %I
     FOR EACH ROW EXECUTE FUNCTION audit_row_change()', t, t);
END $do$;

-- ── (2) نماذج الأدلة ───────────────────────────────────────────
CREATE TEMP TABLE _q26_evidence (
  aspect text, sort_order int, code text, text_ar text, page int
) ON COMMIT DROP;

INSERT INTO _q26_evidence (aspect, sort_order, code, text_ar, page) VALUES
${evidence.map(e => `  (${q(e.aspect)}, ${e.sort}, ${q(e.code)}, ${q(e.text)}, ${e.page ?? 'NULL'})`).join(',\n')};

-- ── (3) البيانات التوضيحية وأسئلة التأمل ───────────────────────
CREATE TEMP TABLE _q26_notes (
  sub text, kind text, sort_order int, text_ar text, depth int, page int
) ON COMMIT DROP;

INSERT INTO _q26_notes (sub, kind, sort_order, text_ar, depth, page) VALUES
${notes.map(n => `  (${q(n.sub)}, ${q(n.kind)}, ${n.sort}, ${q(n.text)}, ${n.lvl ?? 'NULL'}, ${n.page ?? 'NULL'})`).join(',\n')};

DO $fill$
DECLARE fw uuid; n int; orphan int;
BEGIN
  SELECT id INTO fw FROM frameworks WHERE code = 'QNSA' AND version = ${q(VER)};
  IF fw IS NULL THEN RAISE EXCEPTION 'الإصدار ${VER} غير موجود — شغّل 070 أولاً'; END IF;

  SELECT count(*) INTO orphan FROM framework_nodes
   WHERE framework_id = fw AND level = 3
     AND NOT EXISTS (SELECT 1 FROM framework_rubric r WHERE r.framework_node_id = framework_nodes.id);
  IF orphan > 0 THEN RAISE EXCEPTION 'معايير فرعية بلا سلم تقدير: % — شغّل 071 أولاً', orphan; END IF;

  SELECT count(DISTINCT e.aspect) INTO orphan FROM _q26_evidence e
   WHERE NOT EXISTS (SELECT 1 FROM framework_nodes fn
                      WHERE fn.framework_id = fw AND fn.level = 2 AND fn.code = e.aspect);
  IF orphan > 0 THEN RAISE EXCEPTION 'أدلّة بلا جانب مقابل: %', orphan; END IF;

  INSERT INTO framework_evidence_samples (framework_node_id, sort_order, text_ar, code, source_page)
  SELECT fn.id, e.sort_order, e.text_ar, e.code, e.page
  FROM _q26_evidence e
  JOIN framework_nodes fn ON fn.framework_id = fw AND fn.level = 2 AND fn.code = e.aspect
  ON CONFLICT (framework_node_id, sort_order) DO UPDATE
  SET text_ar = EXCLUDED.text_ar, code = EXCLUDED.code, source_page = EXCLUDED.source_page;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'نماذج الأدلة: %', n;

  SELECT count(DISTINCT t.sub) INTO orphan FROM _q26_notes t
   WHERE NOT EXISTS (SELECT 1 FROM framework_nodes fn
                      WHERE fn.framework_id = fw AND fn.level = 3 AND fn.code = t.sub);
  IF orphan > 0 THEN RAISE EXCEPTION 'ملاحظات بلا معيار فرعي مقابل: %', orphan; END IF;

  INSERT INTO framework_node_notes (framework_node_id, kind, sort_order, text_ar, depth, source_page)
  SELECT fn.id, t.kind, t.sort_order, t.text_ar, t.depth, t.page
  FROM _q26_notes t
  JOIN framework_nodes fn ON fn.framework_id = fw AND fn.level = 3 AND fn.code = t.sub
  ON CONFLICT (framework_node_id, kind, sort_order) DO UPDATE
  SET text_ar = EXCLUDED.text_ar, depth = EXCLUDED.depth, source_page = EXCLUDED.source_page;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'البيانات التوضيحية وأسئلة التأمل: %', n;
END $fill$;

-- ── (4) التفعيل ────────────────────────────────────────────────
UPDATE frameworks SET status = 'archived'
 WHERE code = 'QNSA' AND version IN ('draft-2026', 'final-2026');

UPDATE frameworks SET status = 'active'
 WHERE code = 'QNSA' AND version = ${q(VER)};

-- ── (5) تحقّق ───────────────────────────────────────────────────
SELECT 'نماذج الأدلة' AS البند, count(*)::text AS العدد,
       CASE WHEN count(*) = ${evidence.length} THEN 'مطابق' ELSE 'مختلف — المتوقّع ${evidence.length}' END AS الحالة
FROM framework_evidence_samples e
JOIN framework_nodes fn ON fn.id = e.framework_node_id
JOIN frameworks f ON f.id = fn.framework_id
WHERE f.code = 'QNSA' AND f.version = ${q(VER)}
UNION ALL
SELECT 'بيانات توضيحية', count(*)::text,
       CASE WHEN count(*) = ${guidanceN} THEN 'مطابق' ELSE 'مختلف — المتوقّع ${guidanceN}' END
FROM framework_node_notes t
JOIN framework_nodes fn ON fn.id = t.framework_node_id
JOIN frameworks f ON f.id = fn.framework_id
WHERE f.code = 'QNSA' AND f.version = ${q(VER)} AND t.kind = 'guidance'
UNION ALL
SELECT 'أسئلة تأمّل', count(*)::text,
       CASE WHEN count(*) = ${reflectN} THEN 'مطابق' ELSE 'مختلف — المتوقّع ${reflectN}' END
FROM framework_node_notes t
JOIN framework_nodes fn ON fn.id = t.framework_node_id
JOIN frameworks f ON f.id = fn.framework_id
WHERE f.code = 'QNSA' AND f.version = ${q(VER)} AND t.kind = 'reflection'
UNION ALL
SELECT 'الإصدار النشط', string_agg(version, ' · ' ORDER BY version),
       CASE WHEN count(*) = 1 AND min(version) = ${q(VER)} THEN 'مطابق' ELSE 'خلل' END
FROM frameworks WHERE code = 'QNSA' AND status = 'active';
-- المتوقّع: ${evidence.length} · ${guidanceN} · ${reflectN} · ${VER} — كلّها «مطابق»

SELECT version, status FROM frameworks WHERE code = 'QNSA' ORDER BY version;
-- المتوقّع: draft-2026 = archived · final-2026 = archived · ${VER} = active
`

/* ── الكتابة ── */
const out = [
  ['070_qnsa_official_2026_nodes.sql', sql070],
  ['071_qnsa_official_2026_rubric.sql', sql071],
  ['072_qnsa_official_2026_evidence_notes.sql', sql072],
]
for (const [name, sql] of out) {
  const p = path.join(ROOT, 'database/migrations', name)
  if (fs.existsSync(p) && !process.env.QNSA_REGEN_APPLIED) {
    console.log('⏭ ', name, 'موجود — لم يُعَد توليده (QNSA_REGEN_APPLIED=1 للتجاوز)')
    continue
  }
  fs.writeFileSync(p, sql, 'utf8')
  console.log('✓ ', name, '—', Math.round(sql.length / 1024), 'KB')
}
console.log(`\nالمحتوى: ${nodes.length} عقدة · ${rubricRows.length} عبارة سلم · ${evidence.length} دليلاً · ${guidanceN}+${reflectN} ملاحظة`)

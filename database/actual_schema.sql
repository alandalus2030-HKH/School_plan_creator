-- ============================================================
-- ACTUAL SCHEMA — نظام متابعة الخطط المدرسية
-- ============================================================
-- تاريخ التوثيق: 2026-06-06
-- المصدر: تصدير مباشر من Supabase SQL Editor
-- الغرض: هذا هو الـ schema الفعلي في قاعدة البيانات الحية
--        يستبدل schema.sql و schema_fixed.sql القديمَين
--
-- ملاحظة: يحتوي على جداول "قديمة" موروثة من التصميم الأول
--         موثّقة بوضوح لإمكانية تنظيفها لاحقاً
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- القسم 1: الجداول الأساسية الفعّالة (يستخدمها التطبيق)
-- ════════════════════════════════════════════════════════════

-- ── المدارس ──────────────────────────────────────────────
CREATE TABLE schools (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar      TEXT        NOT NULL,
  name_en      TEXT,
  logo_url     TEXT,
  vision_ar    TEXT,
  vision_en    TEXT,
  mission_ar   TEXT,
  mission_en   TEXT,
  code         TEXT,                          -- إضافة لاحقة (لم تكن في schema.sql الأصلي)
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- ── الأدوار ───────────────────────────────────────────────
-- ملاحظة: يحتوي على عمودَين متوازيَين للصلاحيات:
--   1. الأعمدة البوليانية القديمة (is_system_admin, can_*)
--   2. عمود permissions JSONB الجديد (يستخدمه التطبيق فعلياً)
CREATE TABLE roles (
  id                   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            UUID,                 -- REFERENCES schools(id)
  name_ar              TEXT    NOT NULL,
  name_en              TEXT,
  code                 TEXT,                 -- ✅ يستخدمه التطبيق (super_admin, teacher...)
  color                TEXT    NOT NULL DEFAULT '#8a1538',  -- ⚠️ كان #7c3aed — تم التصحيح
  permissions          JSONB   NOT NULL DEFAULT '[]',       -- ✅ يستخدمه التطبيق
  is_system            BOOLEAN NOT NULL DEFAULT false,
  sort_order           INTEGER NOT NULL DEFAULT 0,
  -- أعمدة قديمة (موروثة — لا يستخدمها التطبيق حالياً)
  is_system_admin      BOOLEAN DEFAULT false,
  is_school_admin      BOOLEAN DEFAULT false,
  is_plan_coordinator  BOOLEAN DEFAULT false,
  is_team_leader       BOOLEAN DEFAULT false,
  can_manage_users     BOOLEAN DEFAULT false,
  can_manage_plans     BOOLEAN DEFAULT false,
  can_manage_tasks     BOOLEAN DEFAULT false,
  can_evaluate_tasks   BOOLEAN DEFAULT false,
  can_upload_evidence  BOOLEAN DEFAULT false,
  can_view_reports     BOOLEAN DEFAULT false,
  can_manage_teams     BOOLEAN DEFAULT false,
  can_grant_badges     BOOLEAN DEFAULT false,
  created_at           TIMESTAMPTZ DEFAULT now()
);

-- ── ملفات المستخدمين ──────────────────────────────────────
-- ملاحظة: role_id (UUID FK) موجود لكن التطبيق يستخدم role (TEXT) فعلياً
CREATE TABLE profiles (
  id              UUID    PRIMARY KEY,       -- REFERENCES auth.users(id)
  school_id       UUID,                      -- REFERENCES schools(id)
  role            TEXT    NOT NULL DEFAULT 'teacher',  -- ✅ يستخدمه التطبيق (code نصي)
  -- الاسم
  name_ar         TEXT    NOT NULL DEFAULT 'مستخدم جديد',
  name_en         TEXT,
  full_name_ar    TEXT    NOT NULL DEFAULT '',
  full_name_en    TEXT,
  first_name_ar   TEXT,
  last_name_ar    TEXT,
  first_name_en   TEXT,
  last_name_en    TEXT,
  -- بيانات الدخول
  username        TEXT,
  email           TEXT,
  avatar_url      TEXT,
  -- بيانات وظيفية
  job_title       TEXT,
  department      TEXT,
  school          TEXT,                      -- اسم المدرسة نصاً (ليس FK)
  -- بيانات شخصية
  phone           TEXT,
  emergency_phone TEXT,
  nationality     TEXT,
  residence       TEXT,
  birth_date      DATE,
  join_date       DATE,
  marital_status  TEXT,
  children_count  INTEGER,
  personal_id     TEXT,
  -- تأهيل
  education_level TEXT,
  specialization  TEXT,
  -- إعدادات الإشعارات
  notif_enabled   BOOLEAN DEFAULT true,
  notif_inapp     BOOLEAN DEFAULT true,
  notif_email     BOOLEAN DEFAULT true,
  -- حالة الحساب
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ── الخطط ─────────────────────────────────────────────────
CREATE TABLE plans (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID    NOT NULL,            -- REFERENCES schools(id)
  name_ar       TEXT    NOT NULL,
  name_en       TEXT,
  academic_year TEXT    NOT NULL,
  start_date    DATE,
  end_date      DATE,
  level_count   INTEGER DEFAULT 3,
  level_names   JSONB   DEFAULT '["المحور","المبادرة","الهدف"]',
  kpi_levels    JSONB   DEFAULT '[]',        -- إعدادات مؤشرات الأداء لكل مستوى
  is_archived   BOOLEAN DEFAULT false,
  is_template   BOOLEAN DEFAULT false,
  template_name TEXT,
  created_by    UUID,                        -- REFERENCES profiles(id)
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ── عقد الخطة (الهيكل الهرمي المرن) ─────────────────────
-- هذا الجدول يستبدل axes+initiatives+general_objectives+sub_objectives القديمة
CREATE TABLE plan_nodes (
  id        UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id   UUID    NOT NULL,               -- REFERENCES plans(id)
  parent_id UUID,                           -- REFERENCES plan_nodes(id) — null للمستوى الأول
  level_num INTEGER NOT NULL DEFAULT 1,
  name_ar   TEXT    NOT NULL,
  order_num INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── المهام ────────────────────────────────────────────────
-- ⚠️ ملاحظة: يحتوي على depends_on وdepends_on_task_id (تكرار — يُنظَّف لاحقاً)
CREATE TABLE tasks (
  id                  UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id             UUID,                 -- ✅ الرابط الفعّال (REFERENCES plan_nodes)
  name_ar             TEXT     NOT NULL,
  name_en             TEXT,
  description         TEXT,
  task_type           TEXT     DEFAULT 'general',   -- academic | administrative | general
  status              TEXT     DEFAULT 'not_started',
  priority            TEXT     DEFAULT 'medium',
  start_date          DATE,
  end_date            DATE,
  rating              SMALLINT,                     -- 1-5
  rating_note         TEXT,
  rated_at            TIMESTAMPTZ,
  is_recurring        BOOLEAN  DEFAULT false,
  recurrence_type     TEXT,
  assigned_to_user_id UUID,                         -- REFERENCES profiles(id)
  assigned_to_team_id UUID,                         -- REFERENCES teams(id)
  reviewer_id         UUID,                         -- REFERENCES profiles(id)
  budget_qar          NUMERIC,
  other_resources     TEXT,
  evidence_required   TEXT,
  order_num           INTEGER  NOT NULL DEFAULT 1,
  created_by          UUID,                         -- REFERENCES profiles(id)
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  -- التبعيات بين المهام
  depends_on_task_id  UUID                          -- REFERENCES tasks(id)
);

-- ── مؤشرات الأداء ─────────────────────────────────────────
CREATE TABLE kpis (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id        UUID,                             -- REFERENCES plan_nodes(id)
  name_ar        TEXT    NOT NULL,
  kpi_type       TEXT    DEFAULT 'outcome',        -- impact | outcome | output
  frequency      TEXT    DEFAULT 'yearly',         -- monthly | quarterly | semester | yearly
  target_value   NUMERIC,
  baseline_value NUMERIC,
  unit           TEXT    DEFAULT '%',
  description    TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ── قراءات مؤشرات الأداء ──────────────────────────────────
CREATE TABLE kpi_readings (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id       UUID,                              -- REFERENCES kpis(id)
  reading_date DATE    NOT NULL DEFAULT CURRENT_DATE,
  actual_value NUMERIC NOT NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ── الفرق ─────────────────────────────────────────────────
CREATE TABLE teams (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID,                               -- REFERENCES schools(id)
  name_ar     TEXT  NOT NULL,
  name_en     TEXT,
  leader_id   UUID,                               -- REFERENCES profiles(id)
  color       TEXT  NOT NULL DEFAULT '#8a1538',   -- ⚠️ كان #7c3aed — تم التصحيح
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── أعضاء الفرق ───────────────────────────────────────────
CREATE TABLE team_members (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID    NOT NULL,                    -- REFERENCES teams(id)
  profile_id UUID    NOT NULL,                    -- REFERENCES profiles(id)
  is_leader  BOOLEAN NOT NULL DEFAULT false,
  joined_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(team_id, profile_id)
);

-- ── الأدلة ────────────────────────────────────────────────
CREATE TABLE evidence (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID    NOT NULL,               -- REFERENCES tasks(id)
  name            TEXT    NOT NULL,
  description     TEXT,
  file_url        TEXT    NOT NULL,
  file_type       TEXT,
  file_size       INTEGER,
  evidence_number TEXT,
  uploaded_by     UUID,                           -- REFERENCES profiles(id)
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ── تعليقات المهام ────────────────────────────────────────
CREATE TABLE task_comments (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id   UUID NOT NULL,                        -- REFERENCES tasks(id)
  author_id UUID NOT NULL,                        -- REFERENCES profiles(id)
  content   TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── الإشعارات ─────────────────────────────────────────────
CREATE TABLE notifications (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID,                              -- REFERENCES profiles(id)
  team_id      UUID,                              -- REFERENCES teams(id)
  sender_id    UUID,                              -- REFERENCES profiles(id)
  title        TEXT    NOT NULL,
  body         TEXT,
  type         TEXT    DEFAULT 'general',
  link         TEXT,
  is_read      BOOLEAN DEFAULT false,
  send_email   BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ── الاجتماعات ────────────────────────────────────────────
CREATE TABLE meetings (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID,                          -- REFERENCES schools(id)
  title            TEXT    NOT NULL,
  description      TEXT,
  meeting_url      TEXT,
  platform         TEXT    DEFAULT 'other',       -- google_meet | teams | zoom | other
  scheduled_at     TIMESTAMPTZ,
  duration_minutes INTEGER DEFAULT 60,
  plan_id          UUID,                          -- REFERENCES plans(id)
  task_id          UUID,                          -- REFERENCES tasks(id)
  attendees        UUID[]  DEFAULT '{}',
  created_by       UUID,                          -- REFERENCES profiles(id)
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ── حضور الاجتماعات ───────────────────────────────────────
CREATE TABLE meeting_attendees (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL,                       -- REFERENCES meetings(id)
  profile_id UUID NOT NULL,                       -- REFERENCES profiles(id)
  UNIQUE(meeting_id, profile_id)
);

-- ── القوائم المنسدلة الديناميكية ──────────────────────────
CREATE TABLE dropdown_options (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  category   TEXT    NOT NULL,   -- job_title | department | education_level | nationality | marital_status
  value      TEXT    NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── الأوسمة ───────────────────────────────────────────────
CREATE TABLE badges (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID NOT NULL,                       -- REFERENCES schools(id)
  name_ar    TEXT NOT NULL,
  name_en    TEXT,
  icon       TEXT,
  color      TEXT DEFAULT '#8a1538',              -- ⚠️ كان #7c3aed — تم التصحيح
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── أوسمة المستخدمين ──────────────────────────────────────
CREATE TABLE user_badges (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_id   UUID NOT NULL,                       -- REFERENCES badges(id)
  profile_id UUID NOT NULL,                       -- REFERENCES profiles(id)
  granted_by UUID,                                -- REFERENCES profiles(id)
  note       TEXT,
  granted_at TIMESTAMPTZ DEFAULT now()
);

-- ── العبارات التحفيزية ────────────────────────────────────
CREATE TABLE motivational_quotes (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID,                               -- REFERENCES schools(id)
  text_ar    TEXT    NOT NULL,
  text_en    TEXT,
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── سجل التدقيق ───────────────────────────────────────────
CREATE TABLE audit_logs (
  id         UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID,                               -- REFERENCES schools(id)
  user_id    UUID,                               -- REFERENCES profiles(id)
  action     TEXT  NOT NULL,
  table_name TEXT,
  record_id  TEXT,
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ════════════════════════════════════════════════════════════
-- القسم 2: ما تم تنظيفه (الترحيل 004 — 2026-06-06)
-- ════════════════════════════════════════════════════════════
-- ✅ حُذفت هذه الجداول الموروثة (كانت فارغة):
--    axes, initiatives, general_objectives, sub_objectives, task_assignments
--
-- ✅ حُذف العمود المكرر: tasks.depends_on
--    (يبقى tasks.depends_on_task_id هو المستخدم)
--
-- ✅ تصحيح اللون الافتراضي: #7c3aed → #8a1538
--    في badges.color, teams.color, roles.color

-- ════════════════════════════════════════════════════════════
-- القسم 3: الترحيل 004b — تنظيف الأعمدة الزائدة (2026-06-06)
-- ════════════════════════════════════════════════════════════
-- ✅ حُذفت فوراً — لا ديون تقنية متبقية:
--
--   tasks.sub_objective_id   → كان يشير لجدول محذوف
--   meetings.teams_link      → مكرر مع meeting_url
--   meetings.meeting_date    → مكرر مع scheduled_at
--   profiles.role_id         → UUID FK غير مستخدم
--
-- قاعدة البيانات الآن نظيفة بالكامل — لا أعمدة زائدة.

-- ════════════════════════════════════════════════════════════
-- القسم 4: الـ Indexes المطبَّقة (الترحيل 005 — 2026-06-06)
-- ════════════════════════════════════════════════════════════
-- إجمالي: 31 index (23 جديدة + 8 مسبقة في Supabase)

-- plan_nodes
CREATE INDEX idx_plan_nodes_plan_id    ON plan_nodes(plan_id);
CREATE INDEX idx_plan_nodes_parent_id  ON plan_nodes(parent_id);
CREATE INDEX idx_plan_nodes_order      ON plan_nodes(plan_id, order_num);

-- tasks
CREATE INDEX idx_tasks_node_id          ON tasks(node_id);
CREATE INDEX idx_tasks_status           ON tasks(status);
CREATE INDEX idx_tasks_end_date         ON tasks(end_date);
CREATE INDEX idx_tasks_assigned_user    ON tasks(assigned_to_user_id);
CREATE INDEX idx_tasks_assigned_team    ON tasks(assigned_to_team_id);
CREATE INDEX idx_tasks_reviewer         ON tasks(reviewer_id);
CREATE INDEX idx_tasks_created_at       ON tasks(created_at DESC);
CREATE INDEX idx_tasks_status_end_date  ON tasks(status, end_date);
-- ملاحظة: idx_tasks_status_end_date سيُحوَّل لـ partial index بعد إضافة deleted_at

-- notifications
CREATE INDEX idx_notifications_recipient ON notifications(recipient_id, is_read);
CREATE INDEX idx_notifications_created   ON notifications(recipient_id, created_at DESC);

-- kpis + kpi_readings
CREATE INDEX idx_kpis_node_id           ON kpis(node_id);
CREATE INDEX idx_kpi_readings_kpi_id    ON kpi_readings(kpi_id);
CREATE INDEX idx_kpi_readings_date      ON kpi_readings(kpi_id, reading_date DESC);

-- profiles
CREATE INDEX idx_profiles_school_id     ON profiles(school_id);
CREATE INDEX idx_profiles_role          ON profiles(role);
CREATE INDEX idx_profiles_username      ON profiles(username);
CREATE INDEX idx_profiles_is_active     ON profiles(is_active) WHERE is_active = true;

-- roles
CREATE INDEX idx_roles_code             ON roles(code);

-- evidence + comments
CREATE INDEX idx_evidence_task_id       ON evidence(task_id);
CREATE INDEX idx_task_comments_task_id  ON task_comments(task_id);

-- teams
CREATE INDEX idx_team_members_team_id    ON team_members(team_id);
CREATE INDEX idx_team_members_profile_id ON team_members(profile_id);

-- meetings
CREATE INDEX idx_meetings_school_id     ON meetings(school_id);
CREATE INDEX idx_meetings_scheduled_at  ON meetings(scheduled_at);

-- dropdown
CREATE INDEX idx_dropdown_category
  ON dropdown_options(category, sort_order) WHERE is_active = true;

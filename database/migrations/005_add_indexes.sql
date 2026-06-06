-- ============================================================
-- الترحيل 005: إضافة Indexes لتحسين أداء الاستعلامات
-- ============================================================
-- التاريخ: 2026-06-06
-- الأساس: تحليل الاستعلامات الفعلية في الكود
--
-- الأعمدة الأكثر تكراراً في الاستعلامات:
--   plan_id (10x) · node_id (9x) · recipient_id (5x)
--   kpi_id (4x) · is_active (6x) · code (4x) · status (2x)
--
-- كيفية التشغيل:
--   Supabase Dashboard → SQL Editor → الصق → Run
--   (قد يستغرق بضع ثوانٍ على الجداول الكبيرة)
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- جدول PLAN_NODES — الأكثر استعلاماً (هيكل الخطة)
-- ════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_plan_nodes_plan_id
  ON plan_nodes(plan_id);                    -- جلب عقد خطة معينة

CREATE INDEX IF NOT EXISTS idx_plan_nodes_parent_id
  ON plan_nodes(parent_id);                  -- بناء الهرمية (parent → children)

CREATE INDEX IF NOT EXISTS idx_plan_nodes_order
  ON plan_nodes(plan_id, order_num);         -- الترتيب داخل الخطة

-- ════════════════════════════════════════════════════════════
-- جدول TASKS — القلب النابض للتطبيق
-- ════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_tasks_node_id
  ON tasks(node_id);                         -- جلب مهام عقدة معينة

CREATE INDEX IF NOT EXISTS idx_tasks_status
  ON tasks(status);                          -- فلترة بالحالة

CREATE INDEX IF NOT EXISTS idx_tasks_end_date
  ON tasks(end_date);                        -- مهام المتأخرة + Cron jobs

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_user
  ON tasks(assigned_to_user_id);             -- مهام موظف معين

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_team
  ON tasks(assigned_to_team_id);             -- مهام فريق معين

CREATE INDEX IF NOT EXISTS idx_tasks_reviewer
  ON tasks(reviewer_id);                     -- مهام المراجع

CREATE INDEX IF NOT EXISTS idx_tasks_created_at
  ON tasks(created_at DESC);                 -- أحدث المهام

-- index مركّب للاستعلامات الشائعة (حالة + تاريخ)
-- ملاحظة: بدون WHERE deleted_at — العمود يُضاف في الترحيل 006
CREATE INDEX IF NOT EXISTS idx_tasks_status_end_date
  ON tasks(status, end_date);

-- ════════════════════════════════════════════════════════════
-- جدول NOTIFICATIONS — عالي التكرار (يُقرأ عند كل تحميل)
-- ════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON notifications(recipient_id, is_read);   -- إشعارات المستخدم غير المقروءة

CREATE INDEX IF NOT EXISTS idx_notifications_created
  ON notifications(recipient_id, created_at DESC);  -- أحدث الإشعارات

-- ════════════════════════════════════════════════════════════
-- جدول KPI_READINGS — مرتّبة دائماً بالتاريخ
-- ════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_kpi_readings_kpi_id
  ON kpi_readings(kpi_id);                   -- قراءات مؤشر معين

CREATE INDEX IF NOT EXISTS idx_kpi_readings_date
  ON kpi_readings(kpi_id, reading_date DESC); -- أحدث قراءة لكل مؤشر

-- ════════════════════════════════════════════════════════════
-- جدول KPIS
-- ════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_kpis_node_id
  ON kpis(node_id);                          -- مؤشرات عقدة معينة

-- ════════════════════════════════════════════════════════════
-- جدول PROFILES — أساس RLS + تسجيل الدخول
-- ════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_profiles_school_id
  ON profiles(school_id);                    -- أساسي لـ RLS

CREATE INDEX IF NOT EXISTS idx_profiles_role
  ON profiles(role);                         -- جلب مستخدمي دور معين

CREATE INDEX IF NOT EXISTS idx_profiles_username
  ON profiles(username);                     -- تسجيل الدخول بـ username

CREATE INDEX IF NOT EXISTS idx_profiles_is_active
  ON profiles(is_active)
  WHERE is_active = true;                    -- partial index للمستخدمين النشطين

-- ════════════════════════════════════════════════════════════
-- جدول ROLES
-- ════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_roles_code
  ON roles(code);                            -- جلب دور بـ code نصي

-- ════════════════════════════════════════════════════════════
-- جدول EVIDENCE
-- ════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_evidence_task_id
  ON evidence(task_id);                      -- أدلة مهمة معينة

-- ════════════════════════════════════════════════════════════
-- جدول TASK_COMMENTS
-- ════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id
  ON task_comments(task_id);                 -- تعليقات مهمة معينة

-- ════════════════════════════════════════════════════════════
-- جدول TEAM_MEMBERS
-- ════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_team_members_team_id
  ON team_members(team_id);                  -- أعضاء فريق معين

CREATE INDEX IF NOT EXISTS idx_team_members_profile_id
  ON team_members(profile_id);               -- فرق المستخدم

-- ════════════════════════════════════════════════════════════
-- جدول MEETINGS
-- ════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_meetings_school_id
  ON meetings(school_id);                    -- اجتماعات المدرسة

CREATE INDEX IF NOT EXISTS idx_meetings_scheduled_at
  ON meetings(scheduled_at);                 -- ترتيب الاجتماعات بالتاريخ

-- ════════════════════════════════════════════════════════════
-- جدول DROPDOWN_OPTIONS
-- ════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_dropdown_category
  ON dropdown_options(category, sort_order)
  WHERE is_active = true;                    -- جلب قائمة نوع معين

-- ════════════════════════════════════════════════════════════
-- التحقق من الـ Indexes المُضافة
-- ════════════════════════════════════════════════════════════
SELECT
  indexname,
  tablename,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

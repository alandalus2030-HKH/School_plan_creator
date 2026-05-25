-- =============================================
-- نظام متابعة الخطط المدرسية - قاعدة البيانات
-- =============================================

-- جدول المدارس
CREATE TABLE schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar TEXT NOT NULL,
  name_en TEXT,
  logo_url TEXT,
  vision_ar TEXT,
  vision_en TEXT,
  mission_ar TEXT,
  mission_en TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول الأدوار
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  is_system_admin BOOLEAN DEFAULT FALSE,
  is_school_admin BOOLEAN DEFAULT FALSE,
  is_plan_coordinator BOOLEAN DEFAULT FALSE,
  is_team_leader BOOLEAN DEFAULT FALSE,
  can_manage_users BOOLEAN DEFAULT FALSE,
  can_manage_plans BOOLEAN DEFAULT FALSE,
  can_manage_tasks BOOLEAN DEFAULT FALSE,
  can_evaluate_tasks BOOLEAN DEFAULT FALSE,
  can_upload_evidence BOOLEAN DEFAULT FALSE,
  can_view_reports BOOLEAN DEFAULT FALSE,
  can_manage_teams BOOLEAN DEFAULT FALSE,
  can_grant_badges BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول ملفات المستخدمين (امتداد لـ auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id UUID REFERENCES schools(id),
  role_id UUID REFERENCES roles(id),
  full_name_ar TEXT NOT NULL,
  full_name_en TEXT,
  avatar_url TEXT,
  email TEXT,
  phone TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول الخطط
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  academic_year TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  is_template BOOLEAN DEFAULT FALSE,
  template_name TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول المحاور
CREATE TABLE axes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  order_num INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول المبادرات
CREATE TABLE initiatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  axis_id UUID NOT NULL REFERENCES axes(id) ON DELETE CASCADE,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  order_num INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول الأهداف العامة
CREATE TABLE general_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id UUID NOT NULL REFERENCES initiatives(id) ON DELETE CASCADE,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  order_num INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول الأهداف الفرعية
CREATE TABLE sub_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  general_objective_id UUID NOT NULL REFERENCES general_objectives(id) ON DELETE CASCADE,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  order_num INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول المهام
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_objective_id UUID NOT NULL REFERENCES sub_objectives(id) ON DELETE CASCADE,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  description TEXT,
  task_type TEXT CHECK (task_type IN ('administrative', 'academic', 'general')) DEFAULT 'general',
  status TEXT CHECK (status IN ('not_started', 'in_progress', 'completed', 'delayed')) DEFAULT 'not_started',
  priority TEXT CHECK (priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
  start_date DATE,
  end_date DATE,
  rating TEXT CHECK (rating IN ('excellent', 'very_good', 'good', 'acceptable', 'weak')),
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_type TEXT CHECK (recurrence_type IN ('daily', 'weekly', 'monthly')),
  depends_on UUID REFERENCES tasks(id),
  order_num INTEGER NOT NULL DEFAULT 1,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول مؤشرات الأداء
CREATE TABLE kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  name_ar TEXT NOT NULL,
  target_value NUMERIC,
  achieved_value NUMERIC DEFAULT 0,
  unit TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول الفرق
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  leader_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول أعضاء الفرق
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, profile_id)
);

-- جدول إسناد المهام
CREATE TABLE task_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id),
  team_id UUID REFERENCES teams(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT assignment_target CHECK (profile_id IS NOT NULL OR team_id IS NOT NULL)
);

-- جدول الأدلة
CREATE TABLE evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  evidence_number TEXT,
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول التعليقات
CREATE TABLE task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول الإشعارات
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID REFERENCES profiles(id),
  team_id UUID REFERENCES teams(id),
  sender_id UUID REFERENCES profiles(id),
  title TEXT NOT NULL,
  body TEXT,
  type TEXT DEFAULT 'general',
  is_read BOOLEAN DEFAULT FALSE,
  send_email BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول الأوسمة
CREATE TABLE badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  icon TEXT,
  color TEXT DEFAULT '#7c3aed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول أوسمة المستخدمين
CREATE TABLE user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_id UUID NOT NULL REFERENCES badges(id),
  profile_id UUID NOT NULL REFERENCES profiles(id),
  granted_by UUID REFERENCES profiles(id),
  note TEXT,
  granted_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول الاجتماعات
CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  title TEXT NOT NULL,
  meeting_date TIMESTAMPTZ NOT NULL,
  teams_link TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول المدعوين للاجتماع
CREATE TABLE meeting_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id),
  UNIQUE(meeting_id, profile_id)
);

-- جدول العبارات التحفيزية
CREATE TABLE motivational_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id),
  text_ar TEXT NOT NULL,
  text_en TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول سجل التدقيق
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id),
  user_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL,
  table_name TEXT,
  record_id TEXT,
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- إدراج البيانات الأساسية
-- =============================================

-- إدراج مدرسة افتراضية
INSERT INTO schools (id, name_ar, name_en, vision_ar, mission_ar)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'مدرستي',
  'My School',
  'نحو تعليم متميز يُعدّ جيلاً واعياً قادراً على قيادة المستقبل',
  'تقديم تعليم عالي الجودة في بيئة آمنة ومحفزة تنمي شخصية الطالب'
);

-- إدراج الدور الافتراضي (مشرف النظام)
INSERT INTO roles (id, school_id, name_ar, name_en, is_system_admin, can_manage_users, can_manage_plans, can_manage_tasks, can_evaluate_tasks, can_upload_evidence, can_view_reports, can_manage_teams, can_grant_badges)
VALUES (
  'r1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'مشرف النظام',
  'System Admin',
  TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE
);

-- =============================================
-- تفعيل Row Level Security
-- =============================================

ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE axes ENABLE ROW LEVEL SECURITY;
ALTER TABLE initiatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE general_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE motivational_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

-- سياسة: المستخدم المسجل يرى بياناته
CREATE POLICY "profiles_own" ON profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "profiles_read" ON profiles FOR SELECT USING (auth.uid() IS NOT NULL);

-- سياسة مفتوحة مؤقتة للتطوير (سنضيق النطاق لاحقاً)
CREATE POLICY "schools_all" ON schools FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "roles_all" ON roles FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "plans_all" ON plans FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "axes_all" ON axes FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "initiatives_all" ON initiatives FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "general_objectives_all" ON general_objectives FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "sub_objectives_all" ON sub_objectives FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "tasks_all" ON tasks FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "kpis_all" ON kpis FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "teams_all" ON teams FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "team_members_all" ON team_members FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "task_assignments_all" ON task_assignments FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "evidence_all" ON evidence FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "task_comments_all" ON task_comments FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "notifications_all" ON notifications FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "badges_all" ON badges FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "user_badges_all" ON user_badges FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "meetings_all" ON meetings FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "meeting_attendees_all" ON meeting_attendees FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "motivational_quotes_all" ON motivational_quotes FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "audit_logs_all" ON audit_logs FOR ALL USING (auth.uid() IS NOT NULL);

-- دالة إنشاء الملف الشخصي تلقائياً عند التسجيل
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name_ar)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

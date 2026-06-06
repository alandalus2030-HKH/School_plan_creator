/**
 * أنواع بيانات النظام — مستخرجة من actual_schema.sql
 * استيراد: import type { Task, Plan, Profile, PlanNode } from '@/lib/types'
 */

/* ════════════════════════════════════════════════════════
   الأنواع الأساسية
════════════════════════════════════════════════════════ */

export type TaskStatus   = 'not_started' | 'in_progress' | 'completed' | 'delayed'
export type TaskPriority = 'low' | 'medium' | 'high'
export type TaskType     = 'academic' | 'administrative' | 'general'

/* ════════════════════════════════════════════════════════
   المهمة
   الحقول الأساسية مطلوبة، الباقي اختياري
   (لأن بعض الاستعلامات تجلب حقولاً جزئية فقط)
════════════════════════════════════════════════════════ */
export type Task = {
  // حقول أساسية — دائماً موجودة
  id:                   string
  name_ar:              string
  status:               TaskStatus
  priority:             TaskPriority
  task_type:            TaskType
  order_num:            number
  // حقول شائعة — غالباً موجودة
  node_id?:             string | null
  plan_id?:             string | null
  start_date?:          string | null
  end_date?:            string | null
  rating?:              number | null
  rated_at?:            string | null
  assigned_to_user_id?: string | null
  assigned_to_team_id?: string | null
  reviewer_id?:         string | null
  depends_on_task_id?:  string | null
  // حقول تفصيلية — عند فتح المهمة كاملة
  name_en?:             string | null
  description?:         string | null
  rating_note?:         string | null
  is_recurring?:        boolean
  recurrence_type?:     string | null
  budget_qar?:          number | null
  other_resources?:     string | null
  evidence_required?:   string | null
  created_by?:          string | null
  updated_by?:          string | null
  created_at?:          string
  updated_at?:          string
  deleted_at?:          string | null
}

/* ════════════════════════════════════════════════════════
   الخطة
════════════════════════════════════════════════════════ */
export type Plan = {
  // حقول أساسية
  id:             string
  name_ar:        string
  // حقول شائعة
  academic_year?: string
  school_id?:     string
  level_count?:   number
  level_names?:   string[]
  kpi_levels?:    KpiLevelConfig[]
  is_archived?:   boolean
  is_template?:   boolean
  // حقول تفصيلية
  name_en?:       string | null
  template_name?: string | null
  created_by?:    string | null
  updated_by?:    string | null
  created_at?:    string
  updated_at?:    string
  deleted_at?:    string | null
}

export type KpiLevelConfig = {
  levelIndex: number
  levelName:  string
  kpiType:    string
  frequency:  string
}

/* ════════════════════════════════════════════════════════
   عقدة الخطة (المحاور والمبادرات والأهداف)
════════════════════════════════════════════════════════ */
export type PlanNode = {
  id:          string
  plan_id:     string
  parent_id:   string | null
  name_ar:     string
  level_num:   number
  order_num:   number
  created_at?: string
  deleted_at?: string | null
}

/* ════════════════════════════════════════════════════════
   الملف الشخصي
════════════════════════════════════════════════════════ */
export type Profile = {
  // حقول أساسية
  id:              string
  name_ar:         string
  // حقول شائعة — اختيارية للاستعلامات الجزئية
  school_id?:      string | null
  role?:           string
  name_en?:        string | null
  full_name_ar?:   string
  first_name_ar?:  string | null
  last_name_ar?:   string | null
  username?:       string | null
  email?:          string | null
  avatar_url?:     string | null
  job_title?:      string | null
  department?:     string | null
  school?:         string | null
  phone?:          string | null
  nationality?:    string | null
  is_active?:      boolean
  notif_enabled?:  boolean
  notif_inapp?:    boolean
  notif_email?:    boolean
  created_at?:     string
  updated_at?:     string
}

/* ════════════════════════════════════════════════════════
   الفريق
════════════════════════════════════════════════════════ */
export type Team = {
  id:           string
  name_ar:      string
  school_id?:   string | null
  name_en?:     string | null
  leader_id?:   string | null
  color?:       string
  description?: string | null
  created_at?:  string
}

export type TeamMember = {
  id:         string
  team_id:    string
  profile_id: string
  is_leader:  boolean
  joined_at:  string
}

/* ════════════════════════════════════════════════════════
   مؤشرات الأداء
════════════════════════════════════════════════════════ */
export type Kpi = {
  id:             string
  node_id:        string | null
  name_ar:        string
  kpi_type:       string
  frequency:      string
  target_value:   number | null
  baseline_value: number | null
  unit:           string
  description:    string | null
  created_at:     string
  /* حقول محسوبة في الكود */
  latest_reading: number | null
  latest_date:    string | null
  plan_id:        string | null
  node_name:      string
  node_level:     number
}

export type KpiReading = {
  id:           string
  kpi_id:       string
  reading_date: string
  actual_value: number
  notes:        string | null
  created_at:   string
}

/* ════════════════════════════════════════════════════════
   الإشعارات
════════════════════════════════════════════════════════ */
export type Notification = {
  id:           string
  recipient_id: string | null
  team_id:      string | null
  sender_id:    string | null
  title:        string
  body:         string | null
  type:         string
  link:         string | null
  is_read:      boolean
  send_email:   boolean
  created_at:   string
}

/* ════════════════════════════════════════════════════════
   الأدلة
════════════════════════════════════════════════════════ */
export type Evidence = {
  id:              string
  task_id:         string
  name:            string
  description:     string | null
  file_url:        string
  file_type:       string | null
  file_size:       number | null
  evidence_number: string | null
  uploaded_by:     string | null
  created_at:      string
  updated_at:      string
  deleted_at:      string | null
}

/* ════════════════════════════════════════════════════════
   الاجتماعات
════════════════════════════════════════════════════════ */
export type Meeting = {
  id:               string
  school_id:        string | null
  title:            string
  description:      string | null
  meeting_url:      string | null
  platform:         string
  scheduled_at:     string | null
  duration_minutes: number
  plan_id:          string | null
  task_id:          string | null
  notes:            string | null
  attendees:        string[]
  created_by:       string | null
  created_at:       string
}

/* ════════════════════════════════════════════════════════
   الدور
════════════════════════════════════════════════════════ */
export type Role = {
  id:          string
  school_id:   string | null
  name_ar:     string
  code:        string | null
  color:       string
  permissions: string[]
  is_system:   boolean
  sort_order:  number
  created_at:  string
}

/* ════════════════════════════════════════════════════════
   المدرسة
════════════════════════════════════════════════════════ */
export type School = {
  id:         string
  name_ar:    string
  name_en:    string | null
  logo_url:   string | null
  vision_ar:  string | null
  mission_ar: string | null
  code:       string | null
  created_at: string
  updated_at: string
}

/* ════════════════════════════════════════════════════════
   تعليقات المهام
════════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════════
   الخطوات الفرعية
════════════════════════════════════════════════════════ */
export type Subtask = {
  id:          string
  task_id:     string
  name_ar:     string
  assignee_id: string | null
  due_date:    string | null
  is_done:     boolean
  order_num:   number
  created_by:  string | null
  created_at:  string
}

export type TaskComment = {
  id:         string
  task_id:    string
  author_id:  string
  content:    string
  created_at: string
  /* حقول محسوبة في الكود */
  author_name?: string
}

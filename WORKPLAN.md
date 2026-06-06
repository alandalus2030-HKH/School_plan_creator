# خطة العمل التنفيذية — نظام متابعة الخطط المدرسية
**إصدار:** 1.0 | **تاريخ البدء:** 2026-06-08 | **المدة الإجمالية:** 12 أسبوع
**مصدر الخطة:** IMPROVEMENT_PLAN.md + FUNCTIONAL_IMPROVEMENTS.md

> ### كيفية الاستخدام اليومي
> في بداية كل جلسة اكتب:
> **"اقرأ PROJECT_CONTEXT.md و WORKPLAN.md ثم نفّذ [رقم الأسبوع - رقم اليوم]"**
> مثال: "اقرأ PROJECT_CONTEXT.md و WORKPLAN.md ثم نفّذ الأسبوع 1 - اليوم 2"
>
> بعد إنجاز كل يوم: ضع ✅ + التاريخ الفعلي أمامه

---

## نظرة شاملة على الخطة

```
الشهر الأول  ▶  أسابيع 1-4  ▶  الأمان + الأساس + Quick Wins
الشهر الثاني ▶  أسابيع 5-8  ▶  ميزات جديدة + جودة الكود
الشهر الثالث ▶  أسابيع 9-12 ▶  تجربة المستخدم + الجاهزية التجارية
```

| الأسبوع | الموضوع | النوع | الأولوية |
|---------|---------|-------|---------|
| 1 | الأمان الحرج | 🔴 أمان | فوري |
| 2 | قاعدة البيانات | 🟠 أساس | عالية |
| 3 | توحيد الكود + Error Handling | 🟠 جودة | عالية |
| 4 | Quick Wins — الواجهة (الجزء 1) | ⚡ تجربة | عالية |
| 5 | Quick Wins — الواجهة (الجزء 2) | ⚡ تجربة | عالية |
| 6 | البحث الشامل + التنقل | ✨ ميزة | عالية |
| 7 | الإشعارات والأتمتة | ✨ ميزة | عالية |
| 8 | ميزات جديدة — Subtasks + Calendar | ✨ ميزة | متوسطة |
| 9 | جودة الكود — تفكيك الملفات | 🟡 جودة | متوسطة |
| 10 | تجربة المستخدم — موبايل + إمكانية الوصول | 🟡 تجربة | متوسطة |
| 11 | الجاهزية التجارية — Onboarding + QNSA | 🟢 تجاري | مستقبلية |
| 12 | الصقل النهائي + الإطلاق | 🟢 إطلاق | مستقبلية |

---
---

## 🔴 الأسبوع الأول — الأمان الحرج
> **الهدف:** إغلاق الثغرات الأمنية قبل أي عرض للمدارس
> **أسبوع العمل:** الأحد 8 يونيو → الخميس 12 يونيو 2026

---

### اليوم 1 — الأحد | حذف الثغرة الأمنية الكبرى ✅ 2026-06-06
**الوقت المقدر:** 2-3 ساعات
**الأثر:** 🔴 حرج — ثغرة مكشوفة للعموم

**المهام:**
- [x] حذف المجلد كاملاً: `src/app/api/debug/check-username/`
- [x] تنظيف `...rest` في create-user API
  - الملف: `src/app/api/users/create/route.ts`
  - whitelist صريحة بـ 13 حقلاً مسموحاً بها فقط
- [x] `npm run build` — نجح بدون أخطاء
- [x] Push لـ GitHub ✓ | commit: `46239dd`

**الملفات المتأثرة:**
```
حذف:  src/app/api/debug/check-username/route.ts
تعديل: src/app/api/users/create/route.ts
```

**معيار الإنجاز:** الرابط `/api/debug/check-username` يعيد 404

---

### اليوم 2 — الاثنين | حماية API Routes ✅ 2026-06-06
**الوقت المقدر:** 3-4 ساعات
**الأثر:** 🔴 حرج — يمكن تجاوز الصلاحيات بـ Postman

**المهام:**
- [x] إضافة دالة مساعدة `requireAuth()` في `src/lib/supabase/server.ts`
- [x] تطبيقها على 4 routes كانت مكشوفة:
  - `src/app/api/users/create/route.ts` ✓
  - `src/app/api/invite/route.ts` ✓
  - `src/app/api/plans/[planId]/export-excel/route.ts` ✓
  - `src/app/api/kpis/generate/route.ts` ✓ (إضافي)
- [x] إضافة *.docx لـ .gitignore + حذف الملفات المتسربة
- [x] `npm run build` — نجح ✓ | commit: `c79db80`

**نموذج الكود المطلوب:**
```typescript
// في كل API route حساسة
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
```

**الملفات المتأثرة:**
```
تعديل: src/lib/supabase/server.ts
تعديل: src/app/api/users/create/route.ts
تعديل: src/app/api/invite/route.ts
تعديل: src/app/api/plans/[planId]/export-excel/route.ts
```

---

### اليوم 3 — الثلاثاء | إصلاح RLS — الجزء الأول ✅ 2026-06-06
**الوقت المقدر:** 3-4 ساعات
**الأثر:** 🔴 حرج — عزل بيانات المدارس عن بعضها

**المهام:**
- [x] إنشاء `database/migrations/001_set_school_ids.sql` — تعيين school_id للمستخدمين
- [x] إنشاء `database/migrations/002_rls_school_isolation.sql` — سياسات RLS للـ 3 جداول
- [x] إنشاء `database/migrations/002_rollback.sql` — للطوارئ
- [x] تحديث `create-user` ليُعيّن school_id تلقائياً لكل مستخدم جديد
- [x] تشغيل `001_set_school_ids.sql` → 5 مستخدمين مرتبطون بـ "مدرستي" ✓
- [x] تشغيل `002_rls_school_isolation.sql` → السياسات الجديدة مُطبَّقة ✓
- [x] تشغيل `002b_drop_old_policies.sql` → حذف 3 سياسات قديمة متعارضة ✓
- [x] النتيجة النهائية: 3 سياسات نظيفة فقط (plans/plan_nodes/tasks) ✓

**الملفات المُنشأة:**
```
database/migrations/001_set_school_ids.sql
database/migrations/002_rls_school_isolation.sql
database/migrations/002_rollback.sql
src/app/api/users/create/route.ts (school_id تلقائي)
```
**commit:** `20398d7`

---

### اليوم 4 — الأربعاء | إصلاح RLS — الجزء الثاني ✅ 2026-06-06
**الوقت المقدر:** 3-4 ساعات

**المهام:**
- [x] `003_rls_remaining_tables.sql` — RLS على teams, kpis, notifications, evidence
- [x] `003b_drop_old_kpis_policy.sql` — حذف `allow_all_kpis` القديمة المتعارضة

**النتيجة النهائية — 10 سياسات نظيفة:**
```
evidence       → evidence_school        ✅
kpis           → kpis_school            ✅
notifications  → notifications_delete   ✅
notifications  → notifications_insert   ✅
notifications  → notifications_read     ✅
notifications  → notifications_update   ✅
plan_nodes     → plan_nodes_school      ✅
plans          → plans_school           ✅
tasks          → tasks_school           ✅
teams          → teams_school           ✅
```
**commit:** `84854fb`

---

### اليوم 5 — الخميس | الاستضافة + إصلاح البريد ⏸️ مؤجّل — قرار تجاري
**السبب:** يحتاج ميزانية وقرار بشراء النطاق والترقية للخطة المدفوعة.

**المهام عند العودة له:**
- [ ] الانتقال لـ **Supabase Pro** ($25/شهر)
  - الرابط: supabase.com/dashboard → Settings → Billing
  - يُفعِّل: daily backups + لا توقف للقاعدة
- [ ] شراء نطاق مخصص (`qnsaplan.qa` أو `madrasati-plans.qa`)
  - من: domains.google.com أو Namecheap
- [ ] تحديث `src/app/api/notifications/email/route.ts` السطر 24
  - تغيير `notifications@yourdomain.com` لعنوان حقيقي
- [ ] ربط النطاق بـ Vercel + Push

---
---

## 🟠 الأسبوع الثاني — قاعدة البيانات
> **الهدف:** توثيق وتقوية قاعدة البيانات للتوسع
> **أسبوع العمل:** الأحد 15 يونيو → الخميس 19 يونيو 2026

---

### اليوم 6 — الأحد | توثيق الـ Schema الفعلي ✅ 2026-06-06

**المهام:**
- [x] تصدير البنية الكاملة من Supabase (22 جدول، 257 عمود)
- [x] إنشاء `database/actual_schema.sql` — الوثيقة الرسمية الجديدة
- [x] توثيق الفروق عن schema.sql الأصلي
- [x] توثيق المشاكل المكتشفة (أعمدة مكررة، جداول قديمة، ألوان قديمة)
- [x] حذف `database/schema_fixed.sql` المُربك
- [x] Push ✓

**أبرز الاكتشافات:**
- `plan_nodes` هو الجدول الفعّال — axes/initiatives/sub_objectives موروثة وغير مستخدمة
- `profiles.role` (TEXT) يستخدمه التطبيق — `profiles.role_id` (UUID) غير مستخدم
- `tasks` فيه عمودان مكرران: `depends_on` + `depends_on_task_id`
- ألوان افتراضية قديمة `#7c3aed` في badges/teams/roles → يُصحَّح لاحقاً

---

### اليوم 7 — الاثنين | إضافة Indexes ✅ 2026-06-06

**المهام:**
- [x] تحليل الاستعلامات الفعلية في الكود (42+ استعلام)
- [x] كتابة `005_add_indexes.sql` — 23 index جديدة
- [x] تشغيل في Supabase SQL Editor
- [x] النتيجة: 31 index نشط (23 جديدة + 8 مسبقة في Supabase)
- [x] تحديث `actual_schema.sql` بقسم الـ Indexes
- [x] commit: `dd410c4`

**الجداول المُعالَجة:** plan_nodes · tasks · notifications ·
kpis · kpi_readings · profiles · roles · evidence ·
task_comments · team_members · meetings · dropdown_options

---

### اليوم 8 — الثلاثاء | Soft Delete — قاعدة البيانات ✅ 2026-06-06

**المهام:**
- [x] إضافة `deleted_at` لـ: tasks, plans, plan_nodes, evidence
- [x] إضافة `updated_by` لـ: tasks, plans
- [x] تحديث `idx_tasks_status_end_date` بشرط `WHERE deleted_at IS NULL`
- [x] تحديث RLS لـ tasks/plans/plan_nodes لاستبعاد المحذوفات تلقائياً
- [x] توثيق في `actual_schema.sql`
- [x] commit: `8c55c77`

---

### اليوم 9 — الأربعاء | Soft Delete — الكود ✅ 2026-06-06

**المهام:**
- [x] `TaskActions.tsx` — حذف المهمة → soft delete + updated_by
- [x] `tasks/[taskId]/page.tsx` — حذف المهمة + حذف الدليل → soft delete
- [x] `plans/[planId]/page.tsx` — حذف الخطة + حذف العقدة → soft delete
- [x] `plans/page.tsx` — حذف الخطة → soft delete + userId من usePermissions
- [x] `plans/[planId]/nodes/[nodeId]/page.tsx` — حذف العقدة → soft delete
- [x] الجداول الأخرى (meetings, kpis, comments...) تبقى حذفاً حقيقياً ✓
- [x] ملاحظة: لا حاجة لإضافة `.is('deleted_at', null)` — RLS يُخفيها تلقائياً
- [x] `npm run build` — نجح ✓
  ```
- [ ] الملفات المتأثرة الرئيسية:
  - `src/app/dashboard/tasks/[taskId]/page.tsx`
  - `src/app/dashboard/plans/[planId]/page.tsx`
  - `src/app/dashboard/plans/[planId]/axes/[axisId]/page.tsx`
- [ ] Build + Push

---

### اليوم 10 — الخميس | حدود الاستعلامات + Error Boundary ✅ 2026-06-06

**المهام:**
- [x] إضافة `.limit()` في 4 ملفات (22 استعلام):
  - `reports/page.tsx` — 7 استعلامات (tasks×2, plans, nodes, profiles, kpis, readings)
  - `tasks/page.tsx` — 5 استعلامات (tasks×2, nodes, profiles, teams)
  - `users/page.tsx` — profiles.limit(500)
  - `meetings/page.tsx` — 5 استعلامات (meetings, plans, tasks, profiles, teams)
- [x] إنشاء `src/components/ErrorBoundary.tsx`
  - زر "إعادة المحاولة" + رسالة واضحة بالعربية
- [x] تطبيق ErrorBoundary في `dashboard/layout.tsx`
  - يُغلّف كل صفحات الـ dashboard دفعة واحدة
- [x] `npm run build` — نجح ✓
  ```tsx
  'use client'
  import { Component, ReactNode } from 'react'
  export class ErrorBoundary extends Component<
    { children: ReactNode; fallback?: ReactNode },
    { hasError: boolean }
  > {
    state = { hasError: false }
    static getDerivedStateFromError() { return { hasError: true } }
    render() {
      if (this.state.hasError) return this.props.fallback ?? (
        <div className="p-8 text-center text-slate-500">
          <p className="font-semibold">حدث خطأ غير متوقع</p>
          <button onClick={() => this.setState({ hasError: false })}
            className="mt-3 px-4 py-2 bg-maroon-600 text-white rounded-xl text-sm">
            إعادة المحاولة
          </button>
        </div>
      )
      return this.props.children
    }
  }
  ```
- [ ] تغليف `DashboardClient.tsx` و `reports/page.tsx` بـ ErrorBoundary
- [ ] Build + Push

**✅ نهاية الأسبوع الثاني:**
قاعدة البيانات موثقة، أسرع أداءً، محمية من الحذف العرضي.

---
---

## 🟠 الأسبوع الثالث — توحيد الكود
> **الهدف:** إنشاء مرجع مركزي للثوابت وتوحيد أنواع البيانات
> **أسبوع العمل:** الأحد 22 يونيو → الخميس 26 يونيو 2026

---

### اليوم 11 — الأحد | ملف الثوابت المركزي
**الوقت المقدر:** 3-4 ساعات

**المهام:**
- [ ] إنشاء `src/lib/constants/tasks.ts` يحتوي:
  ```typescript
  export const STATUS_META = {
    not_started: { ar: 'لم تبدأ',  bg: 'var(--status-todo-bg)',  fg: 'var(--status-todo-fg)'  },
    in_progress:  { ar: 'جارية',   bg: 'var(--status-doing-bg)', fg: 'var(--status-doing-fg)' },
    completed:    { ar: 'منجزة',   bg: 'var(--status-done-bg)',  fg: 'var(--status-done-fg)'  },
    delayed:      { ar: 'متأخرة',  bg: 'var(--status-late-bg)',  fg: 'var(--status-late-fg)'  },
  } as const

  export const PRIORITY_META = {
    high:   { ar: 'عالية',   dot: '#8a1538' },
    medium: { ar: 'متوسطة', dot: '#d98ea0' },
    low:    { ar: 'منخفضة', dot: '#f4dde2' },
  } as const

  export const RATING_META = {
    5: { ar: 'ممتاز',    bg: '#46091a', fg: '#ffffff' },
    4: { ar: 'جيد جداً', bg: '#8a1538', fg: '#ffffff' },
    3: { ar: 'جيد',      bg: '#a83356', fg: '#ffffff' },
    2: { ar: 'مقبول',    bg: '#d98ea0', fg: '#46091a' },
    1: { ar: 'ضعيف',     bg: '#f4dde2', fg: '#8a1538' },
  } as const

  export const TYPE_META = {
    academic:       { ar: 'أكاديمية',   icon: 'BookOpen'  },
    administrative: { ar: 'إدارية',     icon: 'Archive'   },
    general:        { ar: 'عامة',       icon: 'Pin'       },
  } as const
  ```
- [x] الملف مُنشأ: `src/lib/constants/tasks.ts`
- [x] مُستورَد في: `tasks/page.tsx` + `reports/page.tsx` + `my-tasks/page.tsx`
- [x] حذف التعريفات المكررة من 3 ملفات
- [x] إصلاح emoji → نصوص عربية في reports
- [x] Build نظيف ✓

---

### اليوم 12 — الاثنين | ملف الأنواع (TypeScript Types) ✅ 2026-06-06

**المهام:**
- [x] إنشاء `src/lib/types/index.ts` — 10 أنواع كاملة
- [x] تطبيق الأنواع في 4 ملفات رئيسية:
  - `tasks/page.tsx` → Task, Profile, Team, PlanNode, Plan
  - `my-tasks/page.tsx` → PlanNode, Plan, Team
  - `reports/page.tsx` → Task, Plan, PlanNode, Profile, Kpi
  - `meetings/page.tsx` → Meeting, Plan, Team, TeamMember
- [x] إصلاح 8 أخطاء TypeScript تدريجياً
- [x] Build نظيف بلا أخطاء ✓
- [ ] إنشاء `src/lib/types/index.ts`:
  ```typescript
  export type TaskStatus   = 'not_started' | 'in_progress' | 'completed' | 'delayed'
  export type TaskPriority = 'low' | 'medium' | 'high'
  export type TaskType     = 'academic' | 'administrative' | 'general'

  export type Task = {
    id:                   string
    name_ar:              string
    description:          string | null
    status:               TaskStatus
    priority:             TaskPriority
    task_type:            TaskType
    start_date:           string | null
    end_date:             string | null
    rating:               number | null
    node_id:              string | null
    plan_id:              string | null
    assigned_to_user_id:  string | null
    assigned_to_team_id:  string | null
    reviewer_id:          string | null
    deleted_at:           string | null
    created_at:           string
  }

  export type Plan = {
    id:           string
    name_ar:      string
    academic_year: string
    school_id:    string
    level_count:  number
    level_names:  string[]
    deleted_at:   string | null
  }

  export type Profile = {
    id:         string
    name_ar:    string
    email:      string
    role:       string
    school_id:  string | null
    is_active:  boolean
    department: string | null
  }

  export type PlanNode = {
    id:        string
    plan_id:   string
    parent_id: string | null
    name_ar:   string
    level_num: number
    order_num: number
  }
  ```
- [ ] استبدال `any` بالأنواع الصحيحة في `my-tasks/page.tsx` و `tasks/page.tsx`
- [ ] Build + Push

---

### اليوم 13 — الثلاثاء | استبدال Emoji المتبقية ✅ 2026-06-06

**المهام:**
- [x] `src/lib/permissions.ts` — 10 emoji → أسماء Lucide components
- [x] `src/lib/notifications.ts` — NOTIF_ICONS → أسماء Lucide
- [x] `src/components/NotificationBell.tsx` — عرض ديناميكي لأيقونات Lucide
- [x] `src/app/dashboard/settings/page.tsx` — 🔓 ⚠️ 💾 ✅ → Lucide icons
- [x] `src/app/dashboard/meetings/page.tsx` — PLATFORM_META: 🎥 💼 📹 🔗 → Lucide
- [x] `src/app/dashboard/my-tasks/page.tsx` — ⏳ ⭐ → Clock, Star
- [x] `src/app/dashboard/plans/new/page.tsx` — 🎯 📊 📦 → Target, TrendingUp, Package
- [x] `src/app/dashboard/plans/[planId]/page.tsx` — ratingBadgeClass + KPI icons
- [x] Build نظيف ✓

---

### اليوم 14 — الأربعاء | توحيد ألوان الحالة
**الوقت المقدر:** 2-3 ساعات

**المهام:**
- [ ] استبدال الألوان الزرقاء لـ `in_progress` بالعنابي الفاتح في كل الملفات:
  ```typescript
  // قبل
  in_progress: { ..., hex: '#3b82f6', light: 'bg-blue-100', text: 'text-blue-700' }
  // بعد — يستخدم متغيرات CSS المعرَّفة في globals.css
  in_progress: { ..., bg: 'var(--status-doing-bg)', fg: 'var(--status-doing-fg)' }
  ```
- [ ] التحقق من `reports/page.tsx`, `tasks/page.tsx`, `my-tasks/page.tsx`
- [ ] التأكد من أن STATUS_META المركزي الجديد يُستخدم في كل مكان
- [ ] Build + Push

---

### اليوم 15 — الخميس | Loading Skeletons
**الوقت المقدر:** 4 ساعات

**المهام:**
- [ ] إنشاء `src/components/Skeleton.tsx`:
  ```tsx
  export function SkeletonCard() {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-5 animate-pulse">
        <div className="h-4 bg-slate-200 rounded-full w-3/4 mb-3" />
        <div className="h-3 bg-slate-100 rounded-full w-1/2 mb-2" />
        <div className="h-3 bg-slate-100 rounded-full w-2/3" />
      </div>
    )
  }
  export function SkeletonRow() {
    return (
      <div className="flex items-center gap-3 px-4 py-3 animate-pulse">
        <div className="w-8 h-8 bg-slate-200 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 bg-slate-200 rounded-full w-2/3" />
          <div className="h-2.5 bg-slate-100 rounded-full w-1/3" />
        </div>
      </div>
    )
  }
  export function SkeletonTable({ rows = 5 }: { rows?: number }) {
    return <div className="divide-y divide-slate-50">{Array.from({length:rows}).map((_,i)=><SkeletonRow key={i}/>)}</div>
  }
  ```
- [ ] استبدال `<div className="animate-spin...">` في:
  - `tasks/page.tsx`, `reports/page.tsx`, `users/page.tsx`, `dashboard/page.tsx`
- [ ] Build + Push

**✅ نهاية الأسبوع الثالث:**
الكود موحد، الأنواع محددة، التجربة أفضل بدون Spinners مزعجة.

---
---

## ⚡ الأسبوع الرابع — Quick Wins (الواجهة - الجزء الأول)
> **الهدف:** التحسينات الأعلى أثراً في الاستخدام اليومي
> **أسبوع العمل:** الأحد 29 يونيو → الخميس 3 يوليو 2026

---

### اليوم 16 — الأحد | Inline Status Update
**الوقت المقدر:** 4-5 ساعات
**الأثر:** ⬆⬆⬆ الأعلى في الاستخدام اليومي

**المهام:**
- [ ] في `src/app/dashboard/tasks/page.tsx` — تحويل badge الحالة لزر تفاعلي:
  - النقر يفتح Dropdown مباشرة في القائمة
  - الاختيار يحفظ فوراً بدون فتح الصفحة
  - Optimistic Update: تغيير الواجهة فوراً ثم الحفظ
  - Flash أخضر سريع تأكيداً على الحفظ
- [ ] نفس المنطق في `my-tasks/page.tsx`
- [ ] Build + Push

---

### اليوم 17 — الاثنين | عداد المهام في Sidebar + تأكيد بصري
**الوقت المقدر:** 3 ساعات
**الأثر:** ⬆⬆ مرئي ومفيد فوراً

**المهام:**
- [ ] في `src/components/Sidebar.tsx` — إضافة عداد بجانب "مهامي":
  ```tsx
  // جلب عدد المهام المستحقة اليوم والمتأخرة
  // عرض badge حمراء صغيرة مع الرقم
  مهامي  [🔴 3]
  ```
- [ ] إضافة Toast notification بسيط عند أي حفظ ناجح:
  - إنشاء `src/components/Toast.tsx`
  - "✓ تم الحفظ" — يظهر 2 ثانية ثم يختفي
- [ ] Build + Push

---

### اليوم 18 — الثلاثاء | Breadcrumb في صفحات العقد والمهام
**الوقت المقدر:** 3 ساعات
**الأثر:** ⬆⬆ يحل مشكلة التنقل في الهرمية

**المهام:**
- [ ] إنشاء `src/components/Breadcrumb.tsx`:
  ```tsx
  // مثال على العرض:
  // الخطة الدراسية 2025 ← محور الحوكمة ← مبادرة التخطيط
  ```
- [ ] تطبيقه في:
  - `src/app/dashboard/plans/[planId]/axes/[axisId]/page.tsx`
  - `src/app/dashboard/plans/[planId]/nodes/[nodeId]/page.tsx`
  - `src/app/dashboard/tasks/[taskId]/page.tsx`
- [ ] Build + Push

---

### اليوم 19 — الأربعاء | حفظ الفلاتر في localStorage
**الوقت المقدر:** 3 ساعات
**الأثر:** ⬆⬆ يُزعج المستخدم حالياً عند كل تحديث

**المهام:**
- [ ] في `src/app/dashboard/tasks/page.tsx`:
  - حفظ قيم الفلاتر (statusF, priorityF, planF, teamF) في `localStorage`
  - استعادتها عند تحميل الصفحة
  ```typescript
  // عند التغيير
  localStorage.setItem('tasks_filters', JSON.stringify({ statusF, priorityF, planF }))
  // عند التحميل
  const saved = localStorage.getItem('tasks_filters')
  if (saved) { const f = JSON.parse(saved); setStatusF(f.statusF); ... }
  ```
- [ ] نفس المنطق في `reports/page.tsx` (planFilter, activeTab)
- [ ] Build + Push

---

### اليوم 20 — الخميس | Quick Add Floating Button
**الوقت المقدر:** 4-5 ساعات
**الأثر:** ⬆⬆⬆ يقلل مسار إنشاء المهمة من 5 خطوات لخطوة واحدة

**المهام:**
- [ ] إنشاء `src/components/QuickAddTask.tsx`:
  - زر `+` دائري ثابت أسفل يمين الشاشة
  - Modal صغير عند النقر:
    ```
    اسم المهمة: [_____________]
    تحت: [اختر خطة ▼]
    لـ: [اختر شخص ▼]  الموعد: [📅]
    [إضافة] [تفاصيل أكثر ←]
    ```
  - "إضافة" تحفظ فوراً بالحقول الإلزامية فقط
  - "تفاصيل أكثر" تنتقل لصفحة إنشاء المهمة الكاملة
- [ ] إضافته في `src/app/dashboard/layout.tsx` ليظهر في كل الصفحات
- [ ] اختصار لوحة المفاتيح: الضغط على `N` يفتحه من أي صفحة
- [ ] Build + Push

**✅ نهاية الأسبوع الرابع:**
الاستخدام اليومي أسهل بكثير — تغيير حالة بنقرة، مهمة جديدة بثانيتين.

---
---

## ⚡ الأسبوع الخامس — Quick Wins (الواجهة - الجزء الثاني)
> **أسبوع العمل:** الأحد 6 يوليو → الخميس 10 يوليو 2026

---

### اليوم 21 — الأحد | تبسيط نموذج KPI
**الوقت المقدر:** 4 ساعات

**المهام:**
- [ ] في `src/app/dashboard/plans/[planId]/kpis/page.tsx`:
  - إضافة مفتاح "وضع بسيط / وضع متقدم"
  - الوضع البسيط يعرض فقط: الاسم + الهدف (من رقم → إلى رقم) + الموعد
  - الوضع المتقدم يعرض الحقول الكاملة الحالية
  - حفظ تفضيل المستخدم في localStorage
- [ ] Build + Push

---

### اليوم 22 — الاثنين | تبسيط صفحة التقارير
**الوقت المقدر:** 4 ساعات

**المهام:**
- [ ] إضافة "لمحة سريعة" كعرض افتراضي أعلى الصفحة:
  ```
  [نسبة الإنجاز الكلية مع شريط]
  [المتأخرة: X]  [منجزة اليوم: X]  [المستحق هذا الأسبوع: X]
  ```
- [ ] تحريك التبويبات التفصيلية لما بعد هذا الملخص
- [ ] إضافة زر "طي/توسيع" لكل قسم في التقارير
- [ ] Build + Push

---

### اليوم 23 — الثلاثاء | ربط الاجتماعات بالمهام
**الوقت المقدر:** 3-4 ساعات

**المهام:**
- [ ] في `src/app/dashboard/meetings/page.tsx`:
  - إضافة قسم "القرارات والمهام الناتجة" في نموذج الاجتماع
  - زر "أنشئ مهمة من هذا القرار" يفتح Quick Add Modal مباشرة
  - إضافة حقل "ملاحظات الاجتماع" (نص حر)
- [ ] تحديث جدول meetings في Supabase:
  ```sql
  ALTER TABLE meetings ADD COLUMN IF NOT EXISTS notes TEXT;
  ALTER TABLE meetings ADD COLUMN IF NOT EXISTS outcome_tasks UUID[];
  ```
- [ ] Build + Push

---

### اليوم 24 — الأربعاء | إضافة aria-labels للأزرار
**الوقت المقدر:** 3 ساعات

**المهام:**
- [ ] البحث في جميع الملفات عن أزرار بدون نص ظاهر:
  ```typescript
  // أزرار الإغلاق، الحذف، التعديل، الأيقونات
  <button aria-label="إغلاق النافذة">✕</button>
  <button aria-label="حذف المهمة"><Trash2 /></button>
  <button aria-label="تعديل الخطة"><Edit /></button>
  ```
- [ ] الملفات الرئيسية: `KanbanBoard.tsx`, `GanttChart.tsx`, `Sidebar.tsx`, `TopBar.tsx`
- [ ] Build + Push

---

### اليوم 25 — الخميس | Pagination في قائمة المهام
**الوقت المقدر:** 4 ساعات

**المهام:**
- [ ] في `src/app/dashboard/tasks/page.tsx`:
  - عرض 25 مهمة لكل صفحة افتراضياً
  - أزرار: السابق / التالي / أرقام الصفحات
  - عرض: "عرض 1-25 من 143 مهمة"
- [ ] إنشاء `src/components/Pagination.tsx` مكون قابل لإعادة الاستخدام
- [ ] Build + Push

**✅ نهاية الأسبوع الخامس:**
الواجهة أبسط وأسرع، التقارير أوضح، KPIs أقل تعقيداً.

---
---

## ✨ الأسبوع السادس — البحث الشامل + التنقل
> **أسبوع العمل:** الأحد 13 يوليو → الخميس 17 يوليو 2026

---

### اليوم 26-27 — الأحد-الاثنين | Global Search (يومان)
**الوقت المقدر:** 8-10 ساعات
**الأثر:** ⬆⬆⬆ ميزة مطلوبة جداً

**المهام:**
- [ ] في `src/components/TopBar.tsx`:
  - إضافة حقل بحث يُفعَّل بـ `Ctrl+K`
  - Modal يظهر عند الكتابة
- [ ] إنشاء `src/components/GlobalSearch.tsx`:
  ```
  البحث في: [اكتب للبحث...]
  ─────────────────────────
  مهام (3)
    ✓ إعداد تقرير الاعتماد   [في: الخطة 2025]
    ⏳ مراجعة المناهج         [في: محور التعليم]
  ─────────────────────────
  خطط (1)
    📋 الخطة التطويرية 2025-2026
  ```
- [ ] البحث يشمل: tasks.name_ar, plans.name_ar, plan_nodes.name_ar, profiles.name_ar
- [ ] Debounce 300ms قبل إرسال الاستعلام
- [ ] Build + Push

---

### اليوم 28 — الثلاثاء | Activity Feed في Dashboard
**الوقت المقدر:** 4 ساعات

**المهام:**
- [ ] تفعيل تسجيل النشاط في `audit_logs` عند:
  - تغيير حالة مهمة
  - إضافة دليل
  - إنشاء خطة جديدة
- [ ] إضافة ودجة "آخر النشاطات" في `DashboardClient.tsx`:
  ```
  🕐 آخر النشاطات
  ─────────────────────────
  أحمد غيّر حالة "إعداد التقرير" → منجزة   منذ ساعة
  سارة أضافت دليلاً على "مراجعة المناهج"   منذ 3 ساعات
  ```
- [ ] Build + Push

---

### اليوم 29 — الأربعاء | Workload View
**الوقت المقدر:** 4-5 ساعات

**المهام:**
- [ ] إضافة تبويب "توزيع العمل" في `src/app/dashboard/teams/page.tsx`:
  ```
  عضو الفريق    | المهام النشطة | المستحقة هذا الأسبوع | نسبة الإنجاز
  ─────────────────────────────────────────────────────────
  أحمد محمد     |     🔴 8      |           3           |    45%
  سارة العلي    |     🟢 3      |           1           |    78%
  ```
- [ ] تلوين تحذيري للموظفين الذين تجاوزوا 6 مهام نشطة
- [ ] Build + Push

---

### اليوم 30 — الخميس | اختصارات لوحة المفاتيح
**الوقت المقدر:** 2 ساعات

**المهام:**
- [ ] في `src/app/dashboard/layout.tsx` — إضافة keyboard shortcuts:
  ```typescript
  // N → Quick Add Task
  // K أو Ctrl+K → Global Search
  // Escape → إغلاق أي Modal مفتوح
  ```
- [ ] إضافة "Keyboard Shortcuts Help" صغيرة في الـ Footer
- [ ] Build + Push

**✅ نهاية الأسبوع السادس:**
المستخدم يجد ما يريد خلال ثانيتين، يرى نشاط فريقه، يعرف من محمّل أكثر.

---
---

## ✨ الأسبوع السابع — الإشعارات والأتمتة
> **أسبوع العمل:** الأحد 20 يوليو → الخميس 24 يوليو 2026

---

### اليوم 31-32 — الأحد-الاثنين | Cron Job للمهام المتأخرة (يومان)
**الوقت المقدر:** 6-8 ساعات

**المهام:**
- [ ] إنشاء `src/app/api/cron/update-delayed/route.ts`:
  ```typescript
  // يشغّله Vercel Cron كل يوم في 6:00 صباحاً
  // يغيّر حالة كل مهمة انتهى موعدها وحالتها != completed إلى delayed
  export async function GET(req: NextRequest) {
    // التحقق من Cron Secret
    if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const today = new Date().toISOString().split('T')[0]
    const { error } = await supabase
      .from('tasks')
      .update({ status: 'delayed' })
      .lt('end_date', today)
      .in('status', ['not_started', 'in_progress'])
      .is('deleted_at', null)

    return NextResponse.json({ ok: !error })
  }
  ```
- [ ] إضافة `vercel.json` بإعدادات الـ Cron:
  ```json
  {
    "crons": [{
      "path": "/api/cron/update-delayed",
      "schedule": "0 3 * * *"
    }]
  }
  ```
  *(3:00 UTC = 6:00 صباحاً بتوقيت قطر)*
- [ ] إضافة `CRON_SECRET` في Vercel Environment Variables
- [ ] Build + Push + اختبار

---

### اليوم 33 — الثلاثاء | إشعار اقتراب الموعد (48 ساعة)
**الوقت المقدر:** 4 ساعات

**المهام:**
- [ ] إنشاء `src/app/api/cron/remind-upcoming/route.ts`:
  - يجد كل مهام موعدها بعد 48 ساعة وحالتها != completed
  - يُرسل إشعاراً داخلياً للمكلَّف
- [ ] إضافته لـ `vercel.json`:
  ```json
  { "path": "/api/cron/remind-upcoming", "schedule": "0 4 * * *" }
  ```
- [ ] Build + Push

---

### اليوم 34 — الأربعاء | إشعار تلقائي عند اكتمال المهمة
**الوقت المقدر:** 3 ساعات

**المهام:**
- [ ] في `src/app/dashboard/tasks/[taskId]/page.tsx`:
  - عند تغيير الحالة لـ "منجزة" → إرسال إشعار تلقائي للمراجع (`reviewer_id`)
  - الرسالة: "تم إنجاز مهمة [اسم المهمة] — يُرجى مراجعتها"
- [ ] استخدام `createNotification` الموجود في `src/lib/notifications.ts`
- [ ] Build + Push

---

### اليوم 35 — الخميس | Daily Digest — البنية الأساسية
**الوقت المقدر:** 4 ساعات

**المهام:**
- [ ] إنشاء `src/app/api/cron/daily-digest/route.ts`:
  - لكل مستخدم نشط: تجميع مهامه المستحقة اليوم + المتأخرة
  - إرسال بريد HTML منسق عبر Resend
- [ ] قالب البريد:
  ```html
  صباح الخير [الاسم]،
  مهامك اليوم: X مهمة
  المتأخرة: X مهمة [رابط]
  ```
- [ ] إضافة حقل `email_digest` في profiles (boolean, default false)
- [ ] Build + Push

**✅ نهاية الأسبوع السابع:**
النظام يعمل تلقائياً — يُحدّث المتأخرات، يُذكّر، يُشعر، يُرسل ملخصاً.

---
---

## ✨ الأسبوع الثامن — ميزات جديدة (Subtasks + Calendar)
> **أسبوع العمل:** الأحد 27 يوليو → الخميس 31 يوليو 2026

---

### اليوم 36 — الأحد | Subtasks — قاعدة البيانات
**الوقت المقدر:** 2 ساعات

**المهام:**
- [ ] إضافة عمود في Supabase SQL Editor:
  ```sql
  ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES tasks(id);
  CREATE INDEX idx_tasks_parent ON tasks(parent_task_id);
  ```
- [ ] توثيق التغيير في `database/actual_schema.sql`

---

### اليوم 37-38 — الاثنين-الثلاثاء | Subtasks — الواجهة (يومان)
**الوقت المقدر:** 8 ساعات

**المهام:**
- [ ] في `src/app/dashboard/tasks/[taskId]/page.tsx`:
  - إضافة قسم "الخطوات الفرعية" أسفل تفاصيل المهمة
  - حقل إضافة خطوة: [النص] [المكلَّف] [الموعد] [+]
  - عرض الخطوات مع Checkbox
  - تحديث تلقائي للتقدم: "3 من 5 خطوات مكتملة"
- [ ] في `tasks/page.tsx`:
  - عرض عداد الـ subtasks في القائمة: `(2/5 ✓)`
- [ ] Build + Push

---

### اليوم 39-40 — الأربعاء-الخميس | Calendar View (يومان)
**الوقت المقدر:** 8-10 ساعات

**المهام:**
- [ ] تثبيت المكتبة:
  ```bash
  npm install @fullcalendar/react @fullcalendar/daygrid @fullcalendar/interaction
  ```
- [ ] إنشاء `src/components/TaskCalendar.tsx`:
  - عرض المهام حسب `end_date` على تقويم شهري
  - ألوان حسب الحالة
  - النقر على مهمة يفتح صفحتها
- [ ] إضافة تبويب "التقويم" في `tasks/page.tsx`
- [ ] Build + Push

**✅ نهاية الأسبوع الثامن:**
ميزتان مطلوبتان جداً: تقسيم المهام لخطوات، وعرض التقويم.

---
---

## 🟡 الأسبوع التاسع — جودة الكود (تفكيك الملفات)
> **أسبوع العمل:** الأحد 3 أغسطس → الخميس 7 أغسطس 2026

---

### اليوم 41-42 | تفكيك reports/page.tsx
- [ ] استخراج `src/components/reports/OverviewTab.tsx`
- [ ] استخراج `src/components/reports/HierarchyTab.tsx`
- [ ] استخراج `src/components/reports/KpiTab.tsx`
- [ ] استخراج `src/components/reports/UsersTab.tsx`
- [ ] استخراج `src/components/reports/DelayedTab.tsx`
- [ ] استخراج `src/components/modals/TasksModal.tsx`
- [ ] Build + Push (ملف التقارير يصبح < 200 سطر)

### اليوم 43-44 | تفكيك users/page.tsx
- [ ] استخراج `src/components/users/UserCard.tsx`
- [ ] استخراج `src/components/users/UserFormModal.tsx`
- [ ] استخراج `src/components/users/InviteModal.tsx`
- [ ] Build + Push

### اليوم 45 | مركزة جلب البيانات
- [ ] إنشاء `src/lib/api/tasks.ts` — دوال: `fetchTasks()`, `updateTaskStatus()`, `deleteTask()`
- [ ] إنشاء `src/lib/api/plans.ts` — دوال: `fetchPlans()`, `fetchPlanNodes()`
- [ ] استخدامها في صفحتَي المهام والتقارير
- [ ] Build + Push

---
---

## 🟡 الأسبوع العاشر — تجربة الموبايل + @Mentions
> **أسبوع العمل:** الأحد 10 أغسطس → الخميس 14 أغسطس 2026

---

### اليوم 46-47 | Card View للموبايل
- [ ] إنشاء `src/components/TaskCard.tsx` — بطاقة مهمة مناسبة للموبايل
- [ ] في `tasks/page.tsx`: عرض الجدول على الشاشات الكبيرة، البطاقات على الصغيرة
- [ ] اختبار على شاشة 375px (iPhone SE)
- [ ] Build + Push

### اليوم 48 | اختبار الموبايل الشامل
- [ ] التحقق من كل صفحة على شاشة 375px و768px
- [ ] إصلاح ما يظهر من مشاكل (Overflow، نصوص مقطوعة، أزرار صغيرة)
- [ ] Build + Push

### اليوم 49-50 | @Mentions في التعليقات
- [ ] في `tasks/[taskId]/page.tsx`:
  - Autocomplete عند كتابة `@` يعرض قائمة المستخدمين
  - استخراج الأسماء المذكورة وإرسال إشعار لكل منهم
  - تمييز الأسماء بلون عنابي في عرض التعليق
- [ ] Build + Push

---
---

## 🟢 الأسبوع الحادي عشر — الجاهزية التجارية
> **أسبوع العمل:** الأحد 17 أغسطس → الخميس 21 أغسطس 2026

---

### اليوم 51-52 | نظام Onboarding للمدارس الجديدة
- [ ] صفحة `/onboarding`:
  - الخطوة 1: اسم المدرسة + الشعار + بيانات الاتصال
  - الخطوة 2: إنشاء مدير المدرسة الأول
  - الخطوة 3: wizard سريع لإنشاء الخطة الأولى
- [ ] Build + Push

### اليوم 53-54 | تقرير QNSA رسمي
- [ ] إنشاء `src/app/api/plans/[planId]/export-qnsa/route.ts`:
  - تصدير PDF منسق بمعايير QNSA
  - رأسية المدرسة (اسم + شعار)
  - الهيكل الهرمي الكامل مع نسب الإنجاز
  - جدول مؤشرات الأداء
- [ ] زر "تصدير QNSA" في صفحة الخطة
- [ ] Build + Push

### اليوم 55 | سياسة الخصوصية + شروط الاستخدام
- [ ] إنشاء `src/app/privacy/page.tsx` و `src/app/terms/page.tsx`
- [ ] محتوى يغطي: ما نجمعه، كيف نحفظه، حقوق المستخدم، التواصل
- [ ] رابطهما في صفحة login وصفحة Onboarding
- [ ] Build + Push

---
---

## 🟢 الأسبوع الثاني عشر — الصقل النهائي
> **أسبوع العمل:** الأحد 24 أغسطس → الخميس 28 أغسطس 2026

---

### اليوم 56-57 | صورة شخصية للمستخدم + الأوسمة
- [ ] رفع الصورة لـ Supabase Storage في `profile/page.tsx`
- [ ] عرضها في Sidebar بدل الـ Avatar الحرفي
- [ ] صفحة منح الأوسمة (إنشاء وسام + منحه لمستخدم)
- [ ] Build + Push

### اليوم 58 | عبارات تحفيزية في صفحة الدخول
- [ ] إضافة جدول `motivational_quotes` (موجود في schema الأصلي)
- [ ] إدراج 10 عبارات تحفيزية باللغتين
- [ ] عرض عبارة عشوائية في صفحة `login/page.tsx`
- [ ] Build + Push

### اليوم 59 | اختبار شامل نهائي
- [ ] اختبار كل الصفحات بأدوار مختلفة (مدير، معلم، منسق)
- [ ] اختبار على: Chrome, Safari, موبايل
- [ ] مراجعة سرعة التحميل (Vercel Analytics)
- [ ] إصلاح أي مشاكل تظهر

### اليوم 60 | التوثيق + الإطلاق
- [ ] تحديث `PROJECT_CONTEXT.md` بكل ما تغيّر
- [ ] تحديث `WORKPLAN.md` بتواريخ الإنجاز الفعلية
- [ ] Build نهائي + Push + التحقق من Vercel
- [ ] 🎉 الإطلاق الرسمي

---
---

## ملخص الأسابيع الاثني عشر

| الأسبوع | الأيام | الموضوع | ✅ |
|---------|--------|---------|---|
| 1 | 1-5   | الأمان الحرج | ⬜ |
| 2 | 6-10  | قاعدة البيانات | ⬜ |
| 3 | 11-15 | توحيد الكود + Loading Skeletons | ⬜ |
| 4 | 16-20 | Inline Editing + Quick Add Button | ⬜ |
| 5 | 21-25 | تبسيط KPI + التقارير + Pagination | ⬜ |
| 6 | 26-30 | Global Search + Activity Feed + Workload | ⬜ |
| 7 | 31-35 | Cron Jobs + إشعارات تلقائية + Daily Digest | ⬜ |
| 8 | 36-40 | Subtasks + Calendar View | ⬜ |
| 9 | 41-45 | تفكيك الملفات الكبيرة | ⬜ |
| 10 | 46-50 | موبايل + @Mentions | ⬜ |
| 11 | 51-55 | Onboarding + QNSA Report + قانوني | ⬜ |
| 12 | 56-60 | أوسمة + تحفيز + اختبار + إطلاق | ⬜ |

---

## قواعد العمل اليومية

```
✅ قبل أي جلسة:
   اكتب: "اقرأ PROJECT_CONTEXT.md و WORKPLAN.md ثم نفّذ الأسبوع X - اليوم Y"

✅ خلال الجلسة:
   - مهمة واحدة في كل مرة، لا تقفز
   - npm run build بعد كل تغيير
   - إذا ظهر خطأ → أصلحه قبل المتابعة

✅ بعد كل يوم:
   - git push origin main
   - تحقق من نشر Vercel
   - ضع ✅ + التاريخ الفعلي هنا

✅ قاعدة الأولوية الصارمة:
   أسبوع 1 لا يُتجاوز قبل اكتماله
   أسابيع الأمان (1-2) تُنفَّذ قبل أي ميزة
```

---

## سجل الإنجازات

| التاريخ | اليوم | المنجز | الملفات المتأثرة |
|---------|-------|--------|-----------------|
| 2026-06-06 | — | إصلاح شريط التقدم من بنفسجي لعنابي | `reports/page.tsx` |
| 2026-06-06 | أسبوع 1 / يوم 1 | حذف debug endpoint + whitelist في create-user | `api/debug/` محذوف، `api/users/create/route.ts` |
| 2026-06-06 | أسبوع 1 / يوم 2 | requireAuth() + حماية 4 API routes + تنظيف .gitignore | `server.ts`، `invite`، `export-excel`، `kpis/generate` |
| 2026-06-06 | أسبوع 1 / يوم 3 | RLS كامل على plans+plan_nodes+tasks + school_id تلقائي | `migrations/001,002,002b`، `users/create/route.ts` |
| 2026-06-06 | أسبوع 1 / يوم 4 | RLS على teams+kpis+notifications+evidence — 10 سياسات نظيفة | `migrations/003,003b` |
| 2026-06-06 | أسبوع 2 / يوم 6 | توثيق الـ Schema الفعلي — 22 جدول | `database/actual_schema.sql` |
| 2026-06-06 | أسبوع 2 / يوم 6+ | حذف 5 جداول قديمة + عمود مكرر + إصلاح ألوان | `migrations/004` + Supabase |
| 2026-06-06 | أسبوع 2 / يوم 7  | 23 index جديد — 31 index نشط إجمالاً | `migrations/005` + Supabase |
| 2026-06-06 | أسبوع 2 / يوم 8  | Soft Delete — deleted_at + updated_by + RLS محدَّث | `migrations/006` + Supabase |
| 2026-06-06 | أسبوع 2 / يوم 9  | Soft Delete كود — 7 استعلامات في 5 ملفات | TaskActions, taskId/page, planId/page, plans/page, nodeId/page |
| 2026-06-06 | أسبوع 2 / يوم 10 | حدود الاستعلامات (22 limit) + ErrorBoundary في layout | reports, tasks, users, meetings, layout.tsx |
| | | | |

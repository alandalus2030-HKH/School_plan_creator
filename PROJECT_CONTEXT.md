# 📋 PROJECT CONTEXT — نظام متابعة الخطط المدرسية

> **اقرأ هذا الملف أولاً** عند بدء أي محادثة جديدة لاستعادة كامل سياق المشروع.
> آخر تحديث: 2026-06-16

---

## 🎯 ما هو المشروع؟

**نظام متابعة الخطط المدرسية** (School Plan Tracking System) — تطبيق ويب RTL عربي لمدرسة خاصة في قطر،
يساعد المدارس على بناء خطط تطويرية (محاور → مبادرات → أهداف → مهام)، تكليف المهام للفرق،
تتبّع الإنجاز، وإنتاج تقارير الاعتماد وفق معايير **الاعتماد المدرسي الوطني القطري (QNSA)**.

- **الجمهور:** عربي بالكامل (RTL) مع إمكانية التبديل للإنجليزية.
- **اللون المؤسسي:** العنابي القطري `#8a1538`.

---

## 🛠️ المكدّس التقني (Tech Stack)

| الطبقة | التقنية |
|--------|---------|
| **Framework** | Next.js `16.2.6` (App Router) |
| **UI** | React `19.2.4` |
| **التنسيق** | Tailwind CSS v4 |
| **قاعدة البيانات + Auth** | Supabase (`@supabase/ssr`, `@supabase/supabase-js`) |
| **الاستضافة** | Vercel (deploy تلقائي عند push لـ main) |
| **الأيقونات** | `lucide-react` |
| **الرسوم البيانية** | `recharts` |
| **Drag & Drop** | `@dnd-kit/core` (لوحة Kanban) |
| **التصدير** | `exceljs`, `xlsx`, `jspdf`, `html2canvas` |
| **AI (للـ KPIs)** | `@anthropic-ai/sdk`, `@google/generative-ai`, `groq-sdk` |

> ⚠️ **ملاحظة مهمة من AGENTS.md:** هذه نسخة Next.js بتغييرات جذرية — APIs وبنية الملفات قد تختلف عن
> المعرفة المُدرَّبة. **اقرأ الدليل في `node_modules/next/dist/docs/` قبل كتابة أي كود** وانتبه لإشعارات الإهمال.

---

## 📁 بنية المشروع

### الصفحات (`src/app/`)
```
login/                              صفحة الدخول (شعار + تدرج عنابي)
auth/callback, auth/update-password Auth flows
dashboard/                          لوحة التحكم الرئيسية
  ├── page.tsx + DashboardClient.tsx   (server/client split للأيقونات)
  ├── my-tasks/                     مهامي
  ├── plans/                        الخطط
  │   ├── [planId]/                 تفاصيل خطة
  │   │   ├── axes/[axisId]/        المحاور
  │   │   ├── kpis/                 مؤشرات الأداء
  │   │   └── nodes/[nodeId]/       العقد (مبادرات/أهداف)
  │   └── new/
  ├── tasks/                        كل المهام (List/Kanban/Gantt views)
  │   ├── [taskId]/                 تفاصيل مهمة + evidence/new
  │   └── new/
  ├── teams/                        الفرق
  ├── reports/                      التقارير
  ├── meetings/                     الاجتماعات
  ├── users/                        المستخدمون
  ├── settings/                     الإعدادات (الأدوار، الصلاحيات)
  └── profile/                      الملف الشخصي
```

### API Routes (`src/app/api/`)
```
auth/reset-password, auth/resolve-username
users/create
invite/
plans/[planId]/export-excel
kpis/generate              (توليد KPIs بالـ AI)
notifications/, notifications/send, notifications/email
debug/check-username
```

### المكونات (`src/components/`)
| المكون | الوظيفة |
|--------|---------|
| `Sidebar.tsx` | الشريط الجانبي (nav + معلومات المستخدم) |
| `TopBar.tsx` | الشريط العلوي |
| `Logo.tsx` | شعار QNSA (SVG clipboard-checklist) |
| `NotificationBell.tsx` | جرس الإشعارات |
| `KanbanBoard.tsx` | لوحة Kanban (drag & drop) |
| `GanttChart.tsx` | مخطط Gantt |
| `LogoutButton.tsx` | زر الخروج |
| `NoAccess.tsx` | شاشة عدم الصلاحية |

### المكتبات (`src/lib/`)
| الملف | الوظيفة |
|--------|---------|
| `PermissionsContext.tsx` | سياق الصلاحيات (can, userName, userEmail, userId) |
| `permissions.ts` | منطق الصلاحيات + `ROLE_COLORS_PALETTE` (بدرجات عنابي) |
| `notifications.ts` | `NOTIF_ICONS`, `NOTIF_LABELS`, `timeAgo` |
| `rating.ts` | منطق التقييم (1-5 نجوم) |
| `supabase/client.ts` | Supabase client (browser) |
| `supabase/server.ts` | Supabase client (server) |

---

## 🎨 نظام التصميم

> التفاصيل الكاملة في ملف **`DESIGN_SYSTEM.md`** — اقرأه عند أي عمل على التصميم.

**الملخص السريع:**
- اللون الأساسي: العنابي `#8a1538` (`--maroon-600`)
- الخطوط: Cairo (رئيسي) → IBM Plex Sans (لاتيني خالص) → Segoe UI/Arial (fallback)
- الأيقونات: Lucide React (لا إيموجي — لأنها لا تُلوّن بـ CSS)
- التقنية الذكية: `@theme` يعيد تعيين كل ألوان Tailwind (violet/purple/etc) للعنابي تلقائياً

---

## 🧠 القرارات التقنية المهمة

1. **إعادة تعيين ألوان Tailwind في `@theme`:** بدل تعديل مئات المكونات، أعدنا تعريف
   أسماء ألوان Tailwind لتشير للعنابي. أي `bg-violet-600` يصبح عنابياً تلقائياً.

2. **استبدال كل الإيموجي بـ Lucide:** الإيموجي لا تُلوّن بـ CSS. تم استبدالها بالكامل
   عبر التطبيق (بناءً على طلب المستخدم الصريح: "أريد حلاً شاملاً لا للحلول الجزئية").

3. **فصل Server/Client Components:** Server Components لا تستطيع استخدام Lucide.
   الحل: جلب البيانات في server (`page.tsx`) والعرض في client (`DashboardClient.tsx`).

4. **تحميل الخطوط (درس صعب):**
   - `@import` للخطوط **قبل** `@import "tailwindcss"`
   - تطبيق الخط مباشرة على `<html>` في `layout.tsx`
   - بدون معامل `display` في رابط Google Fonts

5. **حالات المهام تبقى دلالية:** رغم تحويل الألوان للعنابي، حالات المهام لها أربعة ألوان
   ثابتة عبر متغيرات `--status-*` (todo/doing/done/late).

---

## 🐛 المشاكل التي حُلّت

| المشكلة | الحل |
|---------|------|
| الألوان البنفسجية لم تتحول للعنابي | إعادة تعيين شاملة في `@theme` block |
| حالات المهام بألوان Tailwind الافتراضية | متغيرات `--status-*` بدرجات عنابي |
| الإيموجي لا تُلوّن | استبدال كامل بأيقونات Lucide |
| Server Components تفشل مع Lucide | فصل server/client (DashboardClient.tsx) |
| أسماء أيقونات خاطئة | `CircleCheckBig` (لا CheckSquare)، `ChartNoAxesColumn` (لا BarChart3) |
| خط Segoe UI بدل Cairo | ترتيب @import + تطبيق على `<html>` + إزالة display param |
| `UserRound` غير معرّف في tasks/page | إضافته للـ imports من lucide-react |

---

## 🚀 سير العمل (Workflow)

### النشر على Vercel
```bash
# Vercel متصل بـ GitHub، deploy تلقائي عند:
git push origin main
# المستودع: alandalus2030-HKH/School_plan_creator
# الموقع الحي: school-plan-creator.vercel.app
```

### البناء المحلي
```bash
cd "C:\Users\pcl_h\Desktop\school-plan"
npm run build    # تحقق من عدم وجود أخطاء قبل الدفع
npm run dev      # التطوير المحلي
```

### معايير Git
- أنشئ commit (لا amend عادةً) عند طلب المستخدم.
- رسائل commit تنتهي بـ: `Co-Authored-By: Claude ...`
- ملاحظة: قد تظهر رسالة "GitHub CLI authentication expired" — يمكن تجاهلها (لا تؤثر على git العادي).

---

## 🆕 الوحدات والمزايا الرئيسية (حتى 2026-06-16)

> تفاصيل التنفيذ والأخطاء والدروس في `WORKPLAN_V2.md`. ملخّص:

- **سير عمل المهام (آلة حالات):** لم تبدأ → جارية → مرفوعة للتقييم → منجزة+تقييم / مُعادة. منع التقييم الذاتي (للمهمة والدليل). نقطة `/api/tasks/[taskId]/transition` + سجل `task_transitions`.
- **الأدلة:** اعتماد/رفض + أنواع أدلة + **بوّابة الإنجاز** (required_evidence_types) + **خزانة الأدلة** `/dashboard/evidence` (تغطية المعايير).
- **العدسات الثلاث:** `my-tasks` (شخصي) · `tasks` (تشغيلي: قائمة/كانبان/جانت/تقويم + فلاتر + ترقيم) · `aggregate` (إشرافي: تجميع حسب القسم/النوع/المالك + **اتجاه زمني** عبر لقطات pg_cron أسبوعية).
- **التقويم المدرسي:** `school_calendar` (عطلات/اختبارات) + نهاية الأسبوع → منع/تنبيه على تواريخ المهام + تظليل التقويم (إدارة في الإعدادات).
- **مركز التقارير الرسمية:** `/dashboard/reports/official` — 15 تقريراً عبر `ReportShell` (ترويسة+توقيع+ختم، طباعة PDF) + `/api/reports` (محمي `view_reports`) + مُشغّل ومنتقي فترة.
- **التقدير:** الأوسمة + النقاط + منصة التتويج (موظف الشهر).
- **تعدد المدارس + التقمّص + مجموعات المدارس** (مشرف النظام). كل العزل عبر `my_school_id()`.
- **بريد:** Resend (إشعارات، عبر `RESEND_API_KEY`/`RESEND_FROM`) + Supabase Auth (إعادة تعيين). بديل: «نسخ رابط إعادة التعيين» بلا بريد.

## 🗄️ الترحيلات الحديثة (مرجع سريع)
021 سير العمل · 029 اعتماد الخطة · 030–036 الأدلة (فيديو/ملفات/أماكن/أبعاد/روابط/حالة) · 037–039 صلاحيات وRLS الأدلة · 040 تكليف القسم · **041 لقطات التجميع (pg_cron)** · **042 التقويم المدرسي** · **043 علامة التقارير (توقيع/ختم)** · **044 تحصين أمني**. (المستخدم يشغّلها يدوياً أو عبر MCP المصرّح به.)

## 📊 حالة المشروع الحالية

- ✅ نظام التصميم العنابي + الخطوط + Lucide مُطبّق بالكامل
- ✅ الأسبوعان الأول والثاني (سير العمل + الأدلة) **مكتملان**؛ الأسبوع الثالث (اختبار/توثيق/إطلاق) جارٍ — انظر `TEST_PLAN.md`
- ✅ مدقّق أمان Supabase: لا أخطاء (تحذيرات التوسّع في الـBacklog)
- ✅ كل التحديثات مدفوعة لـ GitHub ومنشورة على Vercel

---

## 📝 ملفات التوثيق المرجعية

| الملف | المحتوى |
|--------|---------|
| `PROJECT_CONTEXT.md` | **هذا الملف** — سياق المشروع الكامل |
| `WORKPLAN_V2.md` | الخطة النشطة + الأخطاء المعلّقة + الدروس + Backlog المؤجَّلات |
| `TEST_PLAN.md` | قائمة الاختبار الشامل قبل الإطلاق (الأسبوع 3) |
| `DESIGN_SYSTEM.md` | نظام التصميم الكامل (ألوان، خطوط، أيقونات) — لإعادة الاستخدام |
| `AGENTS.md` / `CLAUDE.md` | تحذير حول نسخة Next.js المعدّلة |
| `MEMORY.md` (في ~/.claude) | ذاكرة دائمة عبر المحادثات |

---

## 🔄 كيف تبدأ محادثة جديدة بكفاءة كاملة؟

في أي محادثة جديدة، اكتب ببساطة:
> "اقرأ PROJECT_CONTEXT.md و DESIGN_SYSTEM.md، ثم [اطلب المهمة]"

وسأستعيد كامل المعرفة بالمشروع مع كفاءة تفكير كاملة (سياق نظيف).

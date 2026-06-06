# خطة التحسين والتطوير — نظام متابعة الخطط المدرسية
**إصدار:** 1.0 | **تاريخ الإعداد:** 2026-06-06 | **المرجع:** تقرير المراجعة الشاملة

> **كيفية الاستخدام:** في أي جلسة عمل جديدة اكتب:
> "اقرأ PROJECT_CONTEXT.md و IMPROVEMENT_PLAN.md ثم [المهمة]"
> وضع ✅ أمام كل بند يُنجز مع تاريخ الإنجاز.

---

## ملخص الأولويات

```
🔴 حرجة — تمنع التسويق أو تشكّل خطراً أمنياً   → فورية
🟠 عالية — تؤثر على الأداء والجودة              → شهر 1
🟡 متوسطة — تحسينات مهمة للنضج                → شهر 2-3
🟢 مستقبلية — ميزات تنافسية وتجارية             → شهر 4+
```

---

## المرحلة صفر — إصلاحات فورية 🔴
> **الجدول الزمني:** هذا الأسبوع — قبل أي عرض للمدارس

### الأمان

- [ ] **حذف debug endpoint** — `/api/debug/check-username` متاح للجمهور ويكشف بيانات المستخدمين
  - الملف: `src/app/api/debug/check-username/route.ts`
  - الإجراء: حذف المجلد كاملاً

- [ ] **إصلاح RLS — فرز البيانات بالمدرسة**
  - المشكلة: أي مستخدم مسجّل يرى بيانات جميع المدارس
  - الإجراء: تحديث policies في Supabase لتشترط `school_id = auth_user.school_id`
  - الجداول المتأثرة: tasks, plans, teams, notifications, kpis, evidence

- [ ] **إضافة حماية على API routes**
  - المشكلة: الصلاحيات تعمل في المتصفح فقط — يمكن تجاوزها بـ Postman
  - الإجراء: إضافة `auth.getUser()` + فحص الدور في كل API route

- [ ] **إصلاح البريد الإلكتروني**
  - الملف: `src/app/api/notifications/email/route.ts` السطر 24
  - المشكلة: `notifications@yourdomain.com` — domain وهمي
  - الإجراء: ربط بـ Resend بـ domain حقيقي أو إيقاف ميزة البريد مؤقتاً

### الاستضافة

- [ ] **الانتقال لـ Supabase Pro ($25/شهر)**
  - السبب: الخطة المجانية توقف قاعدة البيانات بعد 7 أيام بدون استخدام ولا توفر backups
  - يشمل: daily backups + 8 GB storage + لا توقف

- [ ] **الانتقال لـ Vercel Pro ($20/شهر)**
  - السبب: الخطة المجانية بلا SLA ولا ضمان أداء
  - أو البديل: إبقاء Hobby مؤقتاً وإضافة نطاق مخصص فقط

- [ ] **شراء نطاق مخصص**
  - الحالي: `school-plan-creator.vercel.app` — غير احترافي
  - المقترح: `qnsaplan.qa` أو `madrasati-plans.qa`
  - التكلفة: ~50-150 ريال/سنة

---

## المرحلة الأولى — إصلاح الأساس 🟠
> **الجدول الزمني:** الشهر الأول بعد المرحلة صفر

### قاعدة البيانات

- [ ] **توثيق الـ Schema الفعلي**
  - المشكلة: `schema.sql` و `schema_fixed.sql` لا يعكسان قاعدة البيانات الحقيقية
  - الإجراء: تصدير الـ schema الفعلي من Supabase Dashboard وحفظه في `database/actual_schema.sql`
  - حذف `schema_fixed.sql` (مُربك)

- [ ] **إضافة Indexes لتحسين الأداء**
  ```sql
  CREATE INDEX idx_tasks_node_id       ON tasks(node_id);
  CREATE INDEX idx_tasks_status        ON tasks(status);
  CREATE INDEX idx_tasks_assigned      ON tasks(assigned_to_user_id);
  CREATE INDEX idx_tasks_end_date      ON tasks(end_date);
  CREATE INDEX idx_notifications_recip ON notifications(recipient_id, is_read);
  CREATE INDEX idx_profiles_school     ON profiles(school_id);
  CREATE INDEX idx_plan_nodes_plan     ON plan_nodes(plan_id);
  CREATE INDEX idx_kpis_node           ON kpis(node_id);
  ```

- [ ] **إضافة Soft Delete للمهام والخطط**
  - إضافة عمود `deleted_at TIMESTAMPTZ DEFAULT NULL` للجداول الرئيسية
  - الجداول: `tasks`, `plans`, `plan_nodes`, `evidence`
  - تحديث الاستعلامات لتستثني `WHERE deleted_at IS NULL`
  - إضافة صفحة "سلة المحذوفات" مع إمكانية الاسترداد خلال 30 يوم

- [ ] **إضافة updated_by للتغييرات المهمة**
  - إضافة `updated_by UUID REFERENCES profiles(id)` لجداول tasks, plans

### الكود

- [ ] **حذف Emoji المتبقية واستبدالها بـ Lucide**
  - الملف: `src/lib/permissions.ts` — icons مُعرَّفة كـ emoji نصي
  - الملف: `src/app/dashboard/plans/[planId]/page.tsx` — emoji في ratingBadgeClass
  - الملف: `src/app/dashboard/reports/page.tsx` — emoji في TYPE_META, PRIORITY_META, RATING_META

- [ ] **توحيد ثوابت المهام في ملف مركزي**
  - المشكلة: `STATUS_META` مُعرَّف بشكل مختلف في reports وtasks وأماكن أخرى
  - الإجراء: إنشاء `src/lib/constants/tasks.ts` يحتوي جميع الثوابت
  - يشمل: STATUS_META, TYPE_META, PRIORITY_META, RATING_META

- [ ] **إضافة Limit لجميع استعلامات قاعدة البيانات**
  - المشكلة: جلب آلاف السجلات دفعة واحدة
  ```typescript
  // قبل
  supabase.from('tasks').select('...')
  // بعد
  supabase.from('tasks').select('...').limit(500)
  ```

- [ ] **إضافة Error Boundary للصفحات**
  - إنشاء `src/components/ErrorBoundary.tsx`
  - تغليف الصفحات الرئيسية به لمنع الانهيار الكامل

### الأمان (تكملة)

- [ ] **إضافة Rate Limiting على API routes الحساسة**
  - `/api/users/create`
  - `/api/invite`
  - `/api/kpis/generate`
  - الأداة المقترحة: `@upstash/ratelimit` مع Redis

- [ ] **تنظيف `...rest` في create-user**
  - الملف: `src/app/api/users/create/route.ts` السطر 76
  - المشكلة: أي field يُرسل من العميل يدخل للـ profile
  - الإجراء: whitelist للحقول المسموح بها فقط

---

## المرحلة الثانية — جودة الكود والتجربة 🟡
> **الجدول الزمني:** الشهر الثاني والثالث

### إعادة هيكلة الكود

- [ ] **تفكيك `reports/page.tsx` (1642 سطر)**
  - استخراج: `ReportOverviewTab.tsx`
  - استخراج: `ReportHierarchyTab.tsx`
  - استخراج: `ReportKpiTab.tsx`
  - استخراج: `ReportUsersTab.tsx`
  - استخراج: `ReportDelayedTab.tsx`
  - استخراج: `TasksModal.tsx` → `src/components/modals/`
  - استخراج: `KpiDetailModal.tsx` → `src/components/modals/`

- [ ] **تفكيك `users/page.tsx` (1355 سطر)**
  - استخراج: `UserCard.tsx`
  - استخراج: `UserFormModal.tsx`
  - استخراج: `InviteModal.tsx`

- [ ] **إضافة TypeScript Types للكيانات الأساسية**
  - إنشاء `src/lib/types/index.ts`
  ```typescript
  export type Task = {
    id: string
    name_ar: string
    status: 'not_started' | 'in_progress' | 'completed' | 'delayed'
    priority: 'low' | 'medium' | 'high'
    // ...
  }
  export type Plan = { id: string; name_ar: string; academic_year: string; ... }
  export type Profile = { id: string; name_ar: string; role: string; ... }
  // الخ...
  ```
  - استبدال `any[]` في جميع الملفات تدريجياً

- [ ] **مركزة جلب البيانات**
  - إنشاء `src/lib/api/tasks.ts` — دوال لجلب المهام
  - إنشاء `src/lib/api/plans.ts` — دوال لجلب الخطط
  - يمنع التكرار ويسهل الصيانة

### تجربة المستخدم

- [ ] **إضافة Pagination للجداول الكبيرة**
  - المهام: 20 مهمة لكل صفحة
  - المستخدمون: 25 مستخدم لكل صفحة
  - التقارير: فلترة بدل تحميل الكل

- [ ] **إضافة Loading Skeletons**
  - بدل الـ spinner البسيط
  - نموذج: بطاقات رمادية متحركة أثناء التحميل (كما في Notion, Linear)

- [ ] **تحسين تجربة الموبايل**
  - إنشاء Card View بديل للجداول على الشاشات الصغيرة
  - تحسين Kanban Board على الموبايل
  - التحقق من كل صفحة على شاشة 375px

- [ ] **إضافة `aria-label` للأزرار الأيقونية**
  - كل زر يحتوي أيقونة فقط يجب أن يحمل `aria-label`
  - شرط إمكانية الوصول (Accessibility)

- [ ] **إصلاح ألوان الحالة في STATUS_META**
  - `in_progress` مازال أزرق (`#3b82f6`) في بعض الأماكن — يجب عنابي فاتح
  - `completed` مازال أخضر في بعض الأماكن — مقبول لكن يجب توحيده

- [ ] **توحيد الـ badge اللوني في RATING_META**
  - الملف: `src/app/dashboard/reports/page.tsx` السطر 34-40
  - الملف: `src/app/dashboard/tasks/page.tsx` السطر 34-40
  - قيم مختلفة لنفس التقييم — توحيد في `src/lib/constants/tasks.ts`

---

## المرحلة الثالثة — الميزات التجارية 🟢
> **الجدول الزمني:** الشهر الرابع وما بعده

### نظام الاشتراكات والمدارس

- [ ] **نظام Onboarding للمدارس الجديدة**
  - صفحة تسجيل المدرسة (اسم + شعار + بيانات الاتصال)
  - إنشاء مدير أول تلقائياً
  - wizard لإعداد الخطة الأولى

- [ ] **نظام الاشتراكات**
  - تحديد خطط (مدرسة واحدة / مجموعة مدارس)
  - ربط بـ Stripe أو بوابة دفع قطرية
  - تجديد تلقائي

- [ ] **لوحة تحكم Super Admin**
  - إدارة جميع المدارس المشتركة
  - إحصائيات الاستخدام
  - إيقاف/تفعيل اشتراكات

### الميزات المفقودة

- [ ] **تقرير QNSA رسمي جاهز للتقديم**
  - تصدير PDF بتنسيق معايير الاعتماد المدرسي القطري
  - رأسية + تذييل المدرسة
  - توقيع رقمي (اختياري)

- [ ] **إشعارات تلقائية مجدولة (Cron Jobs)**
  - إشعار يومي بالمهام المتأخرة للمدير
  - تذكير أسبوعي للمكلَّفين بمهام قادمة
  - ملخص شهري للإنجاز
  - الأداة المقترحة: Vercel Cron أو Supabase pg_cron

- [ ] **تبعيات المهام (Task Dependencies)**
  - منع بدء مهمة قبل انتهاء مهمة سابقة
  - عرض بصري في Gantt Chart

- [ ] **المهام المتكررة (Recurring Tasks)**
  - يومية / أسبوعية / شهرية / فصلية
  - إنشاء تلقائي للنسخة التالية عند الإغلاق

- [ ] **صورة شخصية للمستخدم**
  - رفع صورة لـ Supabase Storage
  - عرضها في Sidebar وبطاقة المستخدم

- [ ] **أوسمة مخصصة (Badges)**
  - إنشاء أوسمة من قِبل المدير
  - منح الأوسمة للمجتهدين
  - عرضها في ملف المستخدم

- [ ] **قوالب الخطط (Plan Templates)**
  - حفظ خطة كقالب قابل للاستخدام لسنوات أخرى
  - مكتبة قوالب جاهزة لهيكل QNSA

- [ ] **سجل التدقيق (Audit Log)**
  - تسجيل كل تغيير (من غيّر ماذا ومتى)
  - عرض في صفحة مخصصة للمديرين

- [ ] **إجراءات جماعية (Bulk Actions)**
  - تغيير حالة مجموعة مهام دفعة واحدة
  - تكليف مجموعة مهام لشخص واحد
  - حذف جماعي

- [ ] **Dark Mode**
  - طلب شائع من المستخدمين الشباب
  - يحسن تجربة العمل الليلي

- [ ] **دعم اللغة الإنجليزية الكاملة**
  - حالياً: بعض النصوص عربية فقط في الكود
  - المطلوب: i18n framework (next-intl) + ترجمة كاملة

- [ ] **عبارات تحفيزية في شاشة الدخول**
  - إضافة جدول `motivational_quotes` في قاعدة البيانات (موجود في schema)
  - عرض عبارة عشوائية في صفحة login

### التوثيق والدعم

- [ ] **دليل المستخدم**
  - PDF أو موقع مساعدة (help.qnsaplan.qa)
  - شرح كل وظيفة بلقطات شاشة

- [ ] **فيديوهات تعليمية**
  - فيديو إنشاء الخطة الأولى
  - فيديو إدارة المهام والفرق
  - فيديو قراءة التقارير

- [ ] **نظام تذاكر الدعم الفني**
  - نموذج داخل التطبيق
  - أو ربط بـ Freshdesk / Zendesk

---

## المتطلبات غير التقنية

- [ ] **الامتثال لقانون حماية البيانات القطري (PDPL)**
  - سياسة الخصوصية (Privacy Policy)
  - شروط الاستخدام (Terms of Service)
  - إشعار كيفية تخزين البيانات
  - آلية حذف بيانات المستخدم بناءً على طلبه

- [ ] **اتفاقية مستوى الخدمة (SLA)**
  - تحديد ضمان الوقت التشغيلي (Uptime ≥ 99.5%)
  - سياسة النسخ الاحتياطي
  - إجراء التعافي من الكوارث (Disaster Recovery)

- [ ] **شهادة أمان (اختياري — للعملاء الحكوميين)**
  - ISO 27001 أو ما يعادلها
  - قد تُطلبها المدارس الحكومية

---

## مرجع التقييم الحالي

| المحور | التقييم الحالي | الهدف |
|--------|---------------|-------|
| جودة الكود | 4/10 | 7/10 |
| قاعدة البيانات | 5/10 | 8/10 |
| الأمان | **2/10** | **8/10** |
| التصميم | 7/10 | 8/10 |
| قابلية التوسع | 3/10 | 7/10 |
| الاستضافة | 3/10 | 8/10 |
| القابلية التجارية | 4/10 | 7/10 |

---

## سجل الإنجازات

| التاريخ | البند المُنجز | الملف المتأثر |
|---------|--------------|--------------|
| 2026-06-06 | إصلاح شريط تقدم التقارير من بنفسجي لعنابي | `reports/page.tsx` |
| | | |

---

## ملاحظات للمطور

> **قاعدة العمل:** لا تُنجز بنداً دون:
> 1. اختبار محلي بـ `npm run dev`
> 2. `npm run build` بدون أخطاء
> 3. push لـ GitHub والتحقق من نشر Vercel
> 4. وضع ✅ + التاريخ في هذا الملف

> **ترتيب الأولوية الصارم:** المرحلة صفر كاملة → المرحلة الأولى → المرحلة الثانية → المرحلة الثالثة.
> لا تقفز للمرحلة الثالثة وفي المرحلة صفر بنود مفتوحة.

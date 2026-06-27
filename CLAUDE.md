@AGENTS.md

# دليل المشروع — نظام متابعة الخطط المدرسية

> سياق دائم يُحمَّل كل محادثة. للتفاصيل الكاملة: `PROJECT_CONTEXT.md` (المشروع) و`WORKPLAN_V2.md` (الخطة الحالية + الأخطاء المعلّقة + الدروس).

## المكدّس
Next.js 16.2.6 **معدّل** (Turbopack — اقرأ `node_modules/next/dist/docs/` قبل الكود) · React 19 · Tailwind v4 · Supabase (@supabase/ssr) · Vercel (deploy تلقائي عند push لـ main) · lucide-react · عربي RTL · العنابي `#8a1538`.

## أوامر شائعة
- البناء: `npm run build` (بعد كل تغيير قبل الدفع)
- تطوير محلي: `npm run dev` (لرؤية أخطاء غير مُصغّرة بالسطر — استخدمه عند أي خطأ غامض)
- النشر: `git push origin main` (رسائل commit تنتهي بـ `Co-Authored-By: Claude ...`)
- الترحيلات: المستخدم يشغّلها يدوياً في Supabase SQL Editor (لا تفترض أنها شُغّلت).

## أنماط معمارية إلزامية
1. **تعدد المدارس + التقمّص:** أي عملية تُحدّد المدرسة **يجب** أن تستخدم المدرسة الفعّالة:
   `schoolId = (is_super_admin && active_school_id) ? active_school_id : school_id`
   — عبر **API خادمي** (`createAdminClient`)، **لا** `supabase.from('schools').select('id').single()` من المتصفح (يفشل لمشرف النظام).
2. **`my_school_id()`** دالة SECURITY DEFINER تُستخدم في كل سياسات RLS المدرسية (ترحيل 016).
3. **علاقة schools غامضة:** profiles له FK مزدوج لـ schools → استخدم `school:schools!school_id(...)` في النِسب.
4. **الحراسة 3 طبقات:** واجهة (إخفاء) + خادم (رفض) + عزل المدرسة. لا تكتفِ بالواجهة.
5. **الرفع للتخزين:** عبر الخادم (service role) لتجاوز RLS — كما في شعار المدرسة/الصورة الشخصية.

## دروس مُكلّفة (لا تكرّرها)
- **`insertBefore`/`removeChild` في React:** سببه **أيقونة شرطية بجوار نص شرطي** داخل عنصر. الحل: اعزل الأيقونة في `<span className="inline-flex">{cond ? <A/> : <B/>}</span>` وافصل النص في span آخر.
- **`X is not a function` رغم الاستيراد:** ابحث عن **متغير محلي يحجب المستورد** (shadowing) أولاً.
- **قيم enum/status جديدة:** تحقّق من **قيود CHECK** في القاعدة (مثل `tasks_status_check`) — قد ترفض القيمة صامتاً.
- **لا تبتلع أخطاء القاعدة:** افحص `error` و`.select()` لعدد الصفوف بعد UPDATE/INSERT في الـ API.
- **التصدير من الوحدات المشتركة:** `export const` (لا تنشغل بـ function).
- **ترجمة Chrome المدمجة** تكسر React بـ insertBefore — `<meta name="google" content="notranslate">` موجود.
- **أسماء أيقونات lucide تحجب كائنات JS العامة:** `import { Map }`/`Image`/`Text` يكسر `new Map()` بـ"lacks construct signature". استورد كـ `Map as MapIcon`.
- **محاذاة بطاقات إحصاء متساوية الارتفاع:** ثبّت المحتوى للأعلى بـ`flex flex-col items-center h-full` وادفع الـCTA السفلي بـ`mt-auto`؛ لا تضع الأيقونة في `text-3xl` (line-height يزيح الـSVG) — استخدم `<div className="flex">`.
- **الأيقونات = Lucide أحادي اللون فقط، لا إيموجي** في واجهة JSX. إيموجي `<option>`/`title`/طباعة HTML تُجرَّد لنص (لا تقبل مكوّن React)؛ ورسائل `startsWith('✅')` تُترك (تجريدها يكسر التلوين).

## آلة حالات المهمة (المرحلة 2)
`لم تبدأ → جارية → مرفوعة للتقييم → (المقيّم) منجزة+تقييم | مُعادة للتعديل → جارية`
- المكلّف: start/submit فقط. المقيّم: approve(+rating)/return(+note). **منع التقييم الذاتي**.
- "متأخرة" **وسم محسوب** (`isOverdue`) لا حالة. كل انتقال يُسجَّل في `task_transitions`.
- نقطة الانتقالات: `/api/tasks/[taskId]/transition`. الإدارة: `/api/tasks/[taskId]` (PATCH/DELETE).

## الترحيلات (Supabase)
001-016 (أساس + RLS + super admin + impersonation) · 017 (بيانات المدرسة) · 018/018b (أوسمة RLS) · 019 (نقاط) · 020 (موظف الشهر) · 021 (سير عمل المهام) · 022 (قيد حالة المهمة).

## قواعد التعاون
لا تجامل — كن صريحاً بالحقائق. اسأل قبل القرارات التصميمية المهمة. عند خطأ غامض: شغّل dev محلياً بدل التخمين.

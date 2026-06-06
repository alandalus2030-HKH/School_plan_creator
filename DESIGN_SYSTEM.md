# 🎨 QNSA Design System — نظام تصميم متابعة الخطط المدرسية

> نظام تصميم احترافي مستوحى من اللون العنابي القطري (Qatar Maroon) للمؤسسات التعليمية.
> هذا الملف هو **المرجع الكامل** لإعادة تطبيق هذا التصميم على أي مشروع Next.js / React جديد.

---

## 📌 الفلسفة العامة (Vibe)

- **الإحساس العام:** هادئ، موثوق، مؤسسي لكن عصري. لوحة سليت (slate) باردة تحمل بطاقات بيضاء ناعمة، مع تدرج عنابي قطري واحد يمنح كل الطاقة.
- **الانطباع:** "Government-grade SaaS" — برمجيات حكومية احترافية، لا edtech مرحة.
- **اللون الأساسي:** العنابي `#8a1538` (لون قطر الوطني، يرمز للاعتماد المؤسسي).
- **الاتجاه:** RTL أولاً (عربي) مع إمكانية التبديل للإنجليزية.

---

## 🎨 1. الألوان (Colors)

### لوحة العنابي الكاملة (Maroon Palette)

| الدرجة | Hex | الاستخدام |
|--------|-----|-----------|
| `--maroon-50`  | `#fbf2f4` | خلفيات ناعمة جداً (soft surfaces) |
| `--maroon-100` | `#f4dde2` | خلفيات بطاقات، حالة "جارية" |
| `--maroon-200` | `#e9bcc6` | حدود التأكيد (borders) |
| `--maroon-300` | `#d98ea0` | حالة "منجزة"، scrollbar |
| `--maroon-400` | `#c25c74` | أيقونات، avatars |
| `--maroon-500` | `#a83356` | تدرجات |
| `--maroon-600` | `#8a1538` | **الأساسي (Primary)** |
| `--maroon-700` | `#6f1029` | hover / غامق |
| `--maroon-800` | `#5a0d22` | active / أغمق |
| `--maroon-900` | `#46091a` | sidebar، أغمق درجة |
| (`--maroon-950`)| `#2d0714` | للـ Tailwind فقط (950) |

### الألوان الدلالية (Semantic)

```css
--primary:        #8a1538;   /* اللون الأساسي */
--primary-hover:  #6f1029;
--primary-active: #5a0d22;
--primary-soft:   #fbf2f4;   /* خلفية ناعمة */
--primary-border: #e9bcc6;
--on-primary:     #ffffff;   /* نص على الأساسي */
--background:     #f8fafc;    /* خلفية التطبيق (slate-50) */
--foreground:     #1e293b;    /* النص الأساسي (slate-800) */
```

### النيوترال (Neutrals) — سلسلة Slate كاملة
- `slate-50` = خلفية التطبيق (canvas)
- `slate-200` = الحدود الافتراضية
- `slate-100` = الفواصل الداخلية
- `slate-800` = العناوين

### ⚠️ ملاحظة مهمة جداً — استراتيجية إعادة تعيين Tailwind

**التقنية الأساسية:** في `@theme` block، أعدنا تعريف **كل** أسماء ألوان Tailwind (violet, purple, indigo, amber, blue, green) لتشير إلى درجات العنابي. هذا يعني:

> أي class موجود مثل `bg-violet-600` أو `text-purple-700` يتحول تلقائياً للعنابي **دون لمس أي مكون**.

هذا يوفّر تعديل مئات المكونات يدوياً. (راجع قسم globals.css أدناه.)

### حالات المهام (Status Colors) — أربعة ألوان دلالية ثابتة

```css
--status-todo-bg:   #f1f5f9;   --status-todo-fg:   #64748b;  /* لم تبدأ (slate) */
--status-doing-bg:  #f4dde2;   --status-doing-fg:  #8a1538;  /* جارية (عنابي فاتح) */
--status-done-bg:   #d98ea0;   --status-done-fg:   #46091a;  /* منجزة (عنابي متوسط) */
--status-late-bg:   #8a1538;   --status-late-fg:   #ffffff;  /* متأخرة (عنابي غامق) */
```

**مفردات الحالات (canonical):** لم تبدأ · جارية · منجزة · متأخرة

---

## 🌈 2. التدرجات (Gradients) — التوقيع البصري

التدرج العنابي هو **الموتيف المميز** للنظام. يظهر في: لوحة الدخول، الشريط الجانبي، الأزرار الرئيسية، رؤوس بطاقات الخطط، وأشرطة التقدم.

```css
--gradient-brand:   linear-gradient(135deg, #6f1029, #8a1538 55%, #a83356);
--gradient-button:  linear-gradient(135deg, #5a0d22, #a83356);
--gradient-button-2:linear-gradient(135deg, #6f1029, #c25c74);
--gradient-sidebar: linear-gradient(180deg, #46091a, #6f1029);
--gradient-header:  linear-gradient(270deg, #8a1538, #5a0d22);
```

> ⚠️ **قاعدة:** ابقَ على درجات العنابي فقط — لا ألوان بنفسجية خارجة عن النغمة (no off-hue purples).

---

## ✍️ 3. الخطوط (Typography)

### استراتيجية الخطوط (ثلاثية الطبقات)

```
Cairo (الرئيسي — عربي + لاتيني)
  ↓ fallback
Segoe UI / Arial (احتياطي إذا لم يُحمّل Cairo)
```

```
IBM Plex Sans (للنصوص اللاتينية الخالصة فقط: emails, usernames, dates, years)
  ↓ fallback
Cairo → Segoe UI → Arial
```

### تعريف الخطوط

```css
--font-sans:   'Cairo', 'Segoe UI', Arial, sans-serif;
--font-latin:  'IBM Plex Sans', 'Cairo', 'Segoe UI', Arial, sans-serif;
```

### ⚠️ دروس حرجة في تحميل الخطوط (تعلّمناها بصعوبة)

1. **ترتيب الـ @import حاسم:** يجب أن تأتي `@import` للخطوط **قبل** `@import "tailwindcss"`:
   ```css
   @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700');
   @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700');
   @import "tailwindcss";
   ```

2. **تطبيق الخط مباشرة على `<html>`** في `layout.tsx` لضمان التحميل:
   ```tsx
   <html lang="ar" dir="rtl" style={{ fontFamily: "'Cairo', 'Segoe UI', Arial, sans-serif" }}>
     <body style={{ fontFamily: "inherit" }}>{children}</body>
   </html>
   ```

3. **بدون معامل `display`** في رابط Google Fonts (السلوك الافتراضي أنسب من `swap` أو `block` في حالتنا).

4. **class `font-latin`** يُطبّق يدوياً على النصوص اللاتينية الخالصة (راجع القسم 8).

### الأوزان (Weights)
- Regular `400` · Medium `500` · SemiBold `600` · Bold `700`

### مقياس الأحجام (مطابق لـ Tailwind)
| Token | الحجم | الاستخدام |
|-------|-------|-----------|
| `text-xs`   | 12px | شارات، meta |
| `text-sm`   | 14px | body، labels، nav |
| `text-base` | 16px | افتراضي |
| `text-lg`   | 18px | عناوين فرعية |
| `text-xl`   | 20px | عناوين بطاقات |
| `text-2xl`  | 24px | عناوين الصفحات |
| `text-3xl`  | 30px | أرقام الإحصاءات |

### ارتفاع الأسطر (Line Height)
- **`1.6`** للنص العربي (body) — العربية تُقرأ أفضل بتباعد أوسع.
- العناوين: tight (`1.2`).

---

## 📐 4. الزوايا والبطاقات (Corners & Cards)

- **Inputs / buttons / nav:** `rounded-xl` (12px)
- **Cards / dialogs:** `rounded-2xl` (16px)
- **Badges / avatars / pills:** `rounded-full`
- **بطاقة قياسية:** خلفية بيضاء + حد `1px slate-200` + `shadow-sm`
- **Dialogs:** تطفو على `rgba(0,0,0,0.4)` مع `shadow-2xl`

---

## 🌑 5. الظلال (Shadows)

ظلال ناعمة وباردة (slate-tinted):

```css
--shadow-sm:  0 1px 2px 0 rgba(15, 23, 42, 0.05);
--shadow-md:  0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.05);
--shadow-lg:  0 10px 15px -3px rgba(15, 23, 42, 0.10), 0 4px 6px -4px rgba(15, 23, 42, 0.05);
--shadow-xl:  0 20px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.06);
--shadow-2xl: 0 25px 50px -12px rgba(15, 23, 42, 0.25);

/* الظل الملوّن الوحيد — التوهج العنابي تحت الأزرار الرئيسية و nav النشط */
--shadow-brand:    0 10px 20px -6px rgba(138, 21, 56, 0.35);
--shadow-brand-sm: 0 6px 14px -6px rgba(138, 21, 56, 0.30);
```

---

## 🎬 6. الحركة (Motion)

```css
--duration-fast:   150ms;
--duration-normal: 200ms;   /* hovers / colors */
--duration-slow:   300ms;   /* طي الشريط الجانبي */
--ease-out:        cubic-bezier(0.16, 1, 0.3, 1);
--ease-in-out:     cubic-bezier(0.4, 0, 0.2, 1);
```

- سريعة وغير متكلّفة. لا ارتدادات (bounces)، لا حلقات لا نهائية.
- **Hover:** الأزرار تغمق قليلاً (`brightness(0.94)`) وترفع توهجها؛ البطاقات `shadow-sm`→`shadow-md`؛ عناصر nav من `white/70`→`white`.
- **Loader:** spinner بـ `border-t-transparent`.

---

## 🔣 7. الأيقونات (Iconography)

### النظام الأساسي = أيقونات Lucide الخطية

> **قرار حاسم:** استبدلنا **كل** الإيموجي بأيقونات Lucide (`lucide-react`).
> السبب: الإيموجي **لا يمكن** تلوينها بـ CSS، بينما Lucide ترث اللون عبر CSS.

- المكتبة: `lucide-react`
- السماكة: thin-stroke (1.5px) rounded line icons
- اللون: slate للحالة الساكنة، عنابي للحالة النشطة

### خريطة الأيقونات (Concept → Lucide)

| المفهوم | Lucide | المفهوم | Lucide |
|---------|--------|---------|--------|
| لوحة التحكم | `LayoutDashboard` | التقارير | `ChartNoAxesColumn` |
| مهامي | `ClipboardList` | الاجتماعات | `CalendarDays` |
| الخطط | `Map` | المستخدمون | `UserRound` |
| كل المهام | `CircleCheckBig` | الإعدادات | `Settings` |
| الفرق | `Users` | منجزة/إنجاز | `Trophy` |
| مؤرشف | `Archive` | متأخر/تحذير | `AlertTriangle` (triangle-alert) |
| ملفي الشخصي | `Contact` | الإشعارات | `Bell` |

> ⚠️ **تحذير Server Components:** مكونات Next.js من نوع Server لا تستطيع استخدام أيقونات Lucide مباشرة. الحل: افصل جلب البيانات (server) عن العرض (client component منفصل، مثل `DashboardClient.tsx`).

### الشعار (Logo)
- العلامة: **clipboard-checklist** (حافظة بثلاثة صفوف تحقّق) بدرجات العنابي على بلاطة بيضاء مدوّرة.
- المكون: `src/components/Logo.tsx` — SVG inline.
- الألوان: board `#6f1029`, checks `#a83356`, lines `#d98ea0`, clip `#8a1538`.

---

## 🌐 8. دعم RTL والنصوص اللاتينية

### القاعدة
```css
/* النصوص اللاتينية الخالصة تأخذ IBM Plex Sans */
[dir="ltr"], input[dir="ltr"], .font-latin {
  font-family: var(--font-latin);
}
```

### متى تستخدم `font-latin`؟
طبّق class `font-latin` على النصوص **اللاتينية الخالصة** فقط:
- ✅ عناوين البريد الإلكتروني (emails)
- ✅ أسماء المستخدمين (usernames)
- ✅ أسماء الملفات (filenames)
- ✅ السنوات الدراسية والأرقام اللاتينية
- ✅ التواريخ بأرقام لاتينية

التواريخ العربية تستخدم `toLocaleDateString('ar-QA')` (أرقام عربية شرقية).

---

## 🖋️ 9. اللغة والصوت (Content)

- **عربي أولاً، RTL، فصحى حديثة** — واضح، رسمي، مشجّع دون تكلّف.
- الإنجليزية toggle ثانوي (`عربي` ⇄ `English`).
- لا عامية، لا إكثار من علامات التعجب.
- **أمثلة نبرة:**
  - عنوان فرعي للدخول: *"أدخل بياناتك للوصول إلى النظام"*
  - تأكيد حذف: *"سيتم حذف الخطة وجميع محاورها ومبادراتها وأهدافها ومهامها بشكل نهائي لا يمكن التراجع عنه."*
- **الأزرار:** أفعال أمر (دخول، حفظ، حذف، إنشاء الخطة).
- **الحالات الفارغة (Empty states):** أيقونة Lucide كبيرة + عنوان سطر واحد + تلميح لطيف + CTA.

---

## 🏗️ 10. التخطيط (Layout)

```css
--sidebar-w: 16rem;    /* 256px، يطوى إلى 64px */
--topbar-h:  3.5rem;   /* شريط علوي أبيض لاصق */
```

- شريط جانبي ثابت 256px (يطوى إلى 64px).
- شريط علوي أبيض لاصق (sticky).
- المحتوى الرئيسي يمرّر على `slate-50` مع padding `24px`.
- أقصى عرض للمحتوى ≈ `80rem`.
- RTL أولاً — استخدم الخصائص المنطقية (`inset-inline-start`, `margin-inline`).

---

## 📄 11. ملف globals.css الكامل (نقطة البداية لأي مشروع)

> هذا الملف هو **حجر الأساس**. انسخه كما هو لأي مشروع Next.js + Tailwind v4 جديد.

الموقع: `src/app/globals.css` — راجع الملف الفعلي في هذا المشروع للنسخة الكاملة (194 سطراً).

البنية:
1. استيراد خطوط Google (Cairo + IBM Plex Sans) — **قبل** Tailwind
2. `@import "tailwindcss"`
3. `@theme` block — إعادة تعيين كل ألوان Tailwind للعنابي + الظلال
4. `:root` — متغيرات CSS الكاملة (ألوان، تدرجات، حالات، خطوط، حركة، تخطيط)
5. `body` — الخلفية، اللون، الخط، line-height 1.6
6. قاعدة `.font-latin`
7. Scrollbar مخصص بالعنابي
8. تجاوزات للأزرار وحلقات الـ ring

---

## ✅ قائمة التحقق لتطبيق النظام على مشروع جديد

- [ ] انسخ `globals.css` بالكامل
- [ ] طبّق الخط على `<html>` في `layout.tsx` + `dir="rtl" lang="ar"`
- [ ] ثبّت `lucide-react` للأيقونات
- [ ] انسخ مكون `Logo.tsx`
- [ ] استخدم classes Tailwind العادية (violet/purple/etc.) — ستتحول للعنابي تلقائياً
- [ ] طبّق `font-latin` على الإيميلات/الأسماء/التواريخ اللاتينية
- [ ] افصل Server/Client components عند استخدام Lucide
- [ ] استخدم متغيرات الحالات `--status-*` للمهام
- [ ] استخدم `--gradient-*` للأزرار والشريط الجانبي

---

## 📚 المصدر الأصلي

هذا النظام مُستخرَج من ملف Claude Design:
`C:\Users\pcl_h\Downloads\maroon\` (يحتوي tokens/, components/, guidelines/)
وملف العرض: `QNSA School Plans.html`

اللون مستوحى من **اللون الوطني القطري (Qatar Maroon)** لمعايير الاعتماد المدرسي QNSA.

# تصميم سير عمل المهام والأدلة

> المرجع التصميمي المعتمد (المرحلة الثانية). يُحدَّث مع التنفيذ.

## 1) آلة حالات المهمة

| الحالة (code) | عربي | من يضبطها |
|---------------|------|-----------|
| `not_started` | لم تبدأ | المكلّف (افتراضي) |
| `in_progress` | جارية | المكلّف |
| `submitted` | مرفوعة للتقييم | المكلّف (آخر ما يملكه) |
| `returned` | مُعادة للتعديل | المقيّم (+سبب) → ترجع جارية |
| `completed` | منجزة | المقيّم (اعتماد + تقييم) |

**الانتقالات المسموحة:**
```
not_started → in_progress            [المكلّف]
in_progress → submitted              [المكلّف]  (شرط: أدلة مطلوبة مرفوعة إن وُجدت)
submitted   → completed (+rating)    [المقيّم]  (شرط: أدلة مطلوبة معتمدة + تقييم 1-5)
submitted   → returned (+note)       [المقيّم]
returned    → in_progress            [المكلّف]  (يعيد العمل)
(completed  → in_progress            [المقيّم/مدير] لإعادة الفتح — اختياري)
```

**التأخير (overdue):** ليس حالة. يُحسب: `end_date < اليوم AND status ≠ completed`. يُعرض **كوسم** فوق أي حالة.

## 2) الأدوار والصلاحيات
- **المكلّف** = `assigned_to_user_id` (أو عضو الفريق): يضبط not_started/in_progress/submitted فقط.
- **المقيّم** = `reviewer_id`؛ إن لم يُحدَّد → أي صاحب صلاحية `rate_tasks`/`all`.
- **منع التقييم الذاتي:** لا يجوز أن يكون المقيّم هو المكلّف (تُرفض العملية).

## 3) دورة الدليل
| `evidence.status` | عربي | من |
|-------------------|------|-----|
| `pending` | مرفوع (بانتظار المراجعة) | تلقائي عند الرفع |
| `accepted` | معتمد | المقيّم |
| `rejected` | مرفوض (+سبب) | المقيّم |

- `evidence.evidence_type`: تصنيف اختياري (مصدره فئة `evidence_type` في القوائم المنسدلة).
- `tasks.required_evidence_types TEXT[]`: أنواع الأدلة المطلوبة (اختيارية لكل مهمة).
- **بوابة الإنجاز:** إن حُدّدت أنواع مطلوبة → لكل نوع دليل `accepted` واحد على الأقل قبل الاعتماد. وإلا فاعتماد المقيّم كافٍ.

## 4) الحالات الحدّية
- **بلا مقيّم محدد:** أي صاحب `rate_tasks` يراجع.
- **بلا أدلة مطلوبة:** الاعتماد لا يشترط أدلة.
- **إعادة متكررة:** returned → in_progress → submitted … بلا حد، وكلها مُسجّلة.
- **التقييم:** يُضبط **فقط** عند الاعتماد ومن المقيّم.

## 5) سجل التحوّلات (للمصداقية)
جدول `task_transitions`: (task_id, from_status, to_status, actor_id, note, created_at).
يُسجَّل كل انتقال — يغذّي صفحة المهمة وتقرير QNSA (من رفع/اعتمد/أعاد ومتى).

## 6) تغييرات قاعدة البيانات (ترحيل 021)
- `tasks`: + submitted_at, submitted_by, return_note, required_evidence_types.
- `evidence`: + status, review_note, evidence_type, reviewed_by, reviewed_at.
- جدول `task_transitions` + RLS بالمدرسة (عبر node→plan→school).
- فئة `evidence_type` في dropdown_options (بذور عامة).
- ترحيل: `delayed`→`in_progress`؛ الأدلة الحالية→`accepted`.

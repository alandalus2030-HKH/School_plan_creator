# مدرسة الاختبار — إنشاء وإعادة تهيئة آمنة

> الهدف: اختبار متكرّر دون تدمير بيانات حقيقية أو حسابات مميّزة.

## 1) إنشاء مدرسة اختبار جديدة (الطريقة الموصى بها)
استخدم **معالج Onboarding** (`/onboarding` كمشرف نظام) — يُنشئ المدرسة + حساب مدير (auth user حقيقي عبر admin API) + خطة اختيارية. لا تُنشئ مستخدمين يدوياً في SQL (لن يكون لهم auth user).

## 2) إعادة تهيئة بيانات مدرسة اختبار (مسح العمليات دون المستخدمين)
احصل على `school_id` أولاً:
```sql
SELECT id, name_ar FROM schools WHERE name_ar ILIKE '%اختبار%';
```
ثم امسح بيانات العمل لها (بترتيب FK آمن) — **غيّر `:sid`**:
```sql
-- مهام وأدلة وتحوّلات الخطط التابعة للمدرسة
DELETE FROM task_transitions WHERE task_id IN (
  SELECT t.id FROM tasks t JOIN plan_nodes n ON n.id=t.node_id JOIN plans p ON p.id=n.plan_id WHERE p.school_id = ':sid');
DELETE FROM evidence WHERE task_id IN (
  SELECT t.id FROM tasks t JOIN plan_nodes n ON n.id=t.node_id JOIN plans p ON p.id=n.plan_id WHERE p.school_id = ':sid');
DELETE FROM tasks WHERE node_id IN (
  SELECT n.id FROM plan_nodes n JOIN plans p ON p.id=n.plan_id WHERE p.school_id = ':sid');
DELETE FROM plan_nodes WHERE plan_id IN (SELECT id FROM plans WHERE school_id = ':sid');
DELETE FROM plans WHERE school_id = ':sid';
-- (اختياري) أوسمة المدرسة
DELETE FROM user_badges WHERE badge_id IN (SELECT id FROM badges WHERE school_id = ':sid');
DELETE FROM badges WHERE school_id = ':sid';
```

## 3) ⚠️ لا تحذف الحسابات المميّزة
**لا تحذف** مستخدمين بـ `is_super_admin=true` أو `role IN ('school_admin','admin')` — النظام يجب أن يمنع ذلك (خطأ معلّق في WORKPLAN_V2). للتحقق:
```sql
SELECT name_ar, role, is_super_admin FROM profiles WHERE school_id = ':sid';
```

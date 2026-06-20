-- 047_must_change_password.sql
-- إجبار تغيير كلمة المرور عند أول دخول للحسابات التي يضبط المدير كلمتها (مؤقتة).
-- يُضبط true عند إنشاء/استيراد مستخدم بكلمة مرور؛ ويُصفَّر بعد أن يضبط المستخدم كلمته.
-- نموذج «الدعوة بالرابط» (بلا كلمة مرور) يبقى false لأن المستخدم يضبط كلمته بنفسه.

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

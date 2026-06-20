-- 048_remove_user_plan_access.sql
-- إزالة ميزة «تقييد وصول المستخدمين للخطط» (كانت 046) بقرار 2026-06-20.
-- السبب: قليلة القيمة في سياق مدرسة واحدة (الوصول مضبوط أصلاً بالدور + القسم)،
-- وعالية الكلفة: سياسة RLS المقيِّدة على plans كانت تتسرّب لسياسات الجداول
-- التي تربط plans (مثل tasks) فتُخفي المهام المكلّف بها. الاعتماد على الدور + القسم.

drop policy if exists plans_restrict_plan_access on public.plans;
drop table  if exists public.user_plan_access cascade;
drop function if exists public.my_plan_allowed(uuid);

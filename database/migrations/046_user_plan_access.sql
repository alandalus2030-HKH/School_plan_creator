-- 046_user_plan_access.sql
-- تقييد وصول المستخدمين للخطط (نموذج: الكل افتراضياً ثم تقييد).
-- المدير/المشرف يرون الكل دائماً؛ غيرهم: بلا صفوف = كل الخطط، ووجود صفوف = قصر عليها.

create table if not exists public.user_plan_access (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  plan_id     uuid not null references public.plans(id)    on delete cascade,
  created_at  timestamptz default now(),
  unique (profile_id, plan_id)
);

create index if not exists idx_upa_profile on public.user_plan_access(profile_id);
create index if not exists idx_upa_plan    on public.user_plan_access(plan_id);

alter table public.user_plan_access enable row level security;

-- قراءة: ضمن نفس المدرسة (عبر صاحب الصف)
drop policy if exists upa_select on public.user_plan_access;
create policy upa_select on public.user_plan_access for select
  using ( exists (select 1 from public.profiles pr where pr.id = profile_id and pr.school_id = public.my_school_id()) );

-- كتابة: لمن يملك manage_users ضمن نفس المدرسة
drop policy if exists upa_write on public.user_plan_access;
create policy upa_write on public.user_plan_access for all
  using ( public.my_perm('manage_users') and exists (select 1 from public.profiles pr where pr.id = profile_id and pr.school_id = public.my_school_id()) )
  with check ( public.my_perm('manage_users') and exists (select 1 from public.profiles pr where pr.id = profile_id and pr.school_id = public.my_school_id()) );

-- دالة: هل الخطة مسموحة للمستخدم الحالي؟
create or replace function public.my_plan_allowed(p uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select is_super_admin from profiles where id = auth.uid()), false)
    or public.my_perm('all')
    or coalesce((select role from profiles where id = auth.uid()) in ('school_admin','admin'), false)
    or not exists (select 1 from user_plan_access where profile_id = auth.uid())
    or exists (select 1 from user_plan_access where profile_id = auth.uid() and plan_id = p);
$$;

revoke execute on function public.my_plan_allowed(uuid) from public, anon;

-- سياسة مقيِّدة (RESTRICTIVE) على قراءة الخطط: تُضاف فوق سياسة المدرسة (AND)
drop policy if exists plans_restrict_plan_access on public.plans;
create policy plans_restrict_plan_access on public.plans as restrictive for select
  using ( public.my_plan_allowed(id) );

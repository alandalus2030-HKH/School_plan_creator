-- 041_plan_metric_snapshots.sql
-- البُعد الزمني للوحة التجميع: لقطات دورية لمؤشرات كل خطة + جدولة أسبوعية عبر pg_cron.
-- آمن لإعادة التشغيل (idempotent).

/* ── جدول اللقطات: صفّ لكل خطة لكل تاريخ التقاط ── */
create table if not exists plan_metric_snapshots (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null,
  plan_id           uuid not null references plans(id) on delete cascade,
  captured_on       date not null default current_date,
  total             int  not null default 0,
  completed         int  not null default 0,
  in_progress       int  not null default 0,
  not_started       int  not null default 0,
  overdue           int  not null default 0,
  rating_sum        int  not null default 0,
  rating_count      int  not null default 0,
  evidence_accepted int  not null default 0,
  progress          int  not null default 0,
  created_at        timestamptz not null default now(),
  unique (plan_id, captured_on)
);

create index if not exists idx_snapshots_school_date on plan_metric_snapshots (school_id, captured_on);
create index if not exists idx_snapshots_plan_date   on plan_metric_snapshots (plan_id, captured_on);

/* ── RLS: القراءة ضمن المدرسة الفعّالة فقط (الكتابة عبر الدالة SECURITY DEFINER) ── */
alter table plan_metric_snapshots enable row level security;
drop policy if exists snapshots_select_school on plan_metric_snapshots;
create policy snapshots_select_school on plan_metric_snapshots
  for select using (school_id = my_school_id());

/* ── دالة الالتقاط: تكتب لقطة اليوم لكل خطة غير مؤرشفة (idempotent عبر ON CONFLICT) ── */
create or replace function capture_plan_snapshots()
returns void
language sql
security definer
set search_path = public
as $$
  insert into plan_metric_snapshots (
    school_id, plan_id, captured_on,
    total, completed, in_progress, not_started, overdue,
    rating_sum, rating_count, evidence_accepted, progress
  )
  with plan_tasks as (
    select p.id as plan_id, p.school_id, t.id as task_id, t.status, t.end_date, t.rating
    from plans p
    join plan_nodes n on n.plan_id = p.id
    join tasks t on t.node_id = n.id
    where p.is_archived = false
  ),
  agg as (
    select
      p.id as plan_id, p.school_id,
      count(pt.task_id)                                                                                          as total,
      count(*) filter (where pt.status = 'completed')                                                            as completed,
      count(*) filter (where pt.status = 'in_progress')                                                          as in_progress,
      count(*) filter (where pt.task_id is not null and pt.status not in ('completed','in_progress'))            as not_started,
      count(*) filter (where pt.status <> 'completed' and pt.end_date is not null and pt.end_date < current_date) as overdue,
      coalesce(sum(pt.rating), 0)                                                                                 as rating_sum,
      count(*) filter (where pt.rating is not null)                                                              as rating_count
    from plans p
    left join plan_tasks pt on pt.plan_id = p.id
    where p.is_archived = false
    group by p.id, p.school_id
  ),
  ev as (
    select pt.plan_id, count(*) as evidence_accepted
    from plan_tasks pt
    join evidence e on e.task_id = pt.task_id and e.status = 'accepted'
    group by pt.plan_id
  )
  select
    a.school_id, a.plan_id, current_date,
    a.total, a.completed, a.in_progress, a.not_started, a.overdue,
    a.rating_sum, a.rating_count, coalesce(ev.evidence_accepted, 0),
    case when a.total > 0 then round(a.completed::numeric * 100 / a.total)::int else 0 end
  from agg a
  left join ev on ev.plan_id = a.plan_id
  on conflict (plan_id, captured_on) do update set
    total             = excluded.total,
    completed         = excluded.completed,
    in_progress       = excluded.in_progress,
    not_started       = excluded.not_started,
    overdue           = excluded.overdue,
    rating_sum        = excluded.rating_sum,
    rating_count      = excluded.rating_count,
    evidence_accepted = excluded.evidence_accepted,
    progress          = excluded.progress;
$$;

/* ── جدولة أسبوعية: كل اثنين 02:00 UTC ── */
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'weekly-plan-snapshots') then
    perform cron.unschedule('weekly-plan-snapshots');
  end if;
  perform cron.schedule('weekly-plan-snapshots', '0 2 * * 1', 'select capture_plan_snapshots();');
end $$;

/* ── لقطة أولى فورية (بداية الخط الزمني) ── */
select capture_plan_snapshots();

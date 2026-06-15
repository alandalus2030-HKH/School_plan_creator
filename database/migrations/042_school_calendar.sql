-- 042_school_calendar.sql
-- التقويم المدرسي: أيام محجوزة (عطلات/اختبارات) تُظهَر وتمنع/تنبّه عند تحديد تواريخ المهام.
-- + أيام نهاية الأسبوع لكل مدرسة (افتراضي الجمعة/السبت).
-- آمن لإعادة التشغيل.

/* ── أيام نهاية الأسبوع لكل مدرسة (أرقام JS getDay: الأحد=0 … الجمعة=5، السبت=6) ── */
alter table schools add column if not exists weekend_days smallint[] not null default '{5,6}';

/* ── جدول التقويم ── */
create table if not exists school_calendar (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  title       text not null,
  kind        text not null default 'holiday'
              check (kind in ('holiday','exam','break','national','eid','other')),
  enforcement text not null default 'warn'
              check (enforcement in ('block','warn')),
  start_date  date not null,
  end_date    date not null,
  note        text,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists idx_school_calendar_school on school_calendar (school_id, start_date, end_date);

/* ── RLS: القراءة ضمن المدرسة الفعّالة (الكتابة عبر API بصلاحية الخدمة) ── */
alter table school_calendar enable row level security;
drop policy if exists school_calendar_select on school_calendar;
create policy school_calendar_select on school_calendar
  for select using (school_id = my_school_id());

/* ── بذرة التقويم الرسمي لمدارس قطر 2025/2026 (لكل المدارس) ── */
insert into school_calendar (school_id, title, kind, enforcement, start_date, end_date)
select s.id, v.title, v.kind, v.enforcement, v.sd::date, v.ed::date
from schools s
cross join (values
  ('إجازة منتصف الفصل الدراسي الأول','break','block','2025-10-26','2025-10-30'),
  ('إجازة منتصف العام الأكاديمي','break','block','2025-12-21','2026-01-03'),
  ('إجازة (رمضان)','holiday','block','2026-03-15','2026-03-16'),
  ('إجازة نهاية أسبوع مطوّلة','holiday','block','2026-04-08','2026-04-09'),
  ('إجازة الموظفين في المدارس (الصيف)','break','block','2026-06-28','2026-08-20'),
  ('اختبارات الدور الثاني 2024/2025','exam','warn','2025-08-24','2025-08-28'),
  ('اختبارات منتصف الفصل الأول','exam','warn','2025-10-14','2025-10-23'),
  ('اختبارات نهاية الفصل الأول','exam','warn','2025-12-07','2025-12-16'),
  ('ملحق اختبارات نهاية الفصل الأول','exam','warn','2026-01-18','2026-01-27'),
  ('اختبارات منتصف الفصل الثاني','exam','warn','2026-03-29','2026-04-07'),
  ('اختبارات نهاية الفصل الثاني','exam','warn','2026-06-04','2026-06-21'),
  ('اختبارات الدور الثاني 2025/2026','exam','warn','2026-08-23','2026-08-27')
) as v(title, kind, enforcement, sd, ed)
where not exists (
  select 1 from school_calendar c
  where c.school_id = s.id and c.title = v.title and c.start_date = v.sd::date
);

-- Run this ONLY if you already ran the previous version of supabase/schema.sql
-- and have an existing "alarms" table with tv_ids/font_id/line_font_sizes columns.
-- If this is a brand new Supabase project, just run schema.sql instead — skip this file.

create extension if not exists pgcrypto;

-- 1) Image templates (new)
create table if not exists image_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_ids uuid[] not null default '{}'
);
alter table image_templates enable row level security;
create policy if not exists "public rw image_templates" on image_templates for all using (true) with check (true);

-- 2) Global alarm settings (new)
create table if not exists alarm_settings (
  id int primary key default 1,
  font_id uuid references fonts(id) on delete set null,
  line_font_sizes jsonb not null default '[40,28,28,24]',
  duration_seconds int not null default 30,
  template text not null default 'ANNOUNCEMENT
[프로그램명],[장소]에서 시작됩니다.
해당 장소 앞으로 이동해주세요.
시작 시간 : [시작시간]',
  check (id = 1)
);
insert into alarm_settings (id) values (1) on conflict (id) do nothing;
alter table alarm_settings enable row level security;
create policy if not exists "public rw alarm_settings" on alarm_settings for all using (true) with check (true);

-- 3) alarms table: move from multi-TV (tv_ids array) to single tv_id,
--    rename start_time -> alarm_time, add scheduled_time, drop per-alarm
--    font/size columns (now global via alarm_settings).
--    This EMPTIES existing alarm rows into per-TV rows — back up first if
--    you already have real alarms entered and want to keep them.

alter table alarms add column if not exists tv_id smallint references tvs(id) on delete cascade;
alter table alarms add column if not exists scheduled_time time;
alter table alarms rename column start_time to alarm_time;

-- Expand any existing multi-TV alarm into one row per TV it was assigned to
do $$
declare r record;
begin
  for r in select * from alarms where tv_id is null and tv_ids is not null loop
    insert into alarms (tv_id, alarm_date, alarm_time, scheduled_time, program_name, location, duration_seconds)
    select unnest(r.tv_ids), r.alarm_date, r.alarm_time,
           coalesce(r.alarm_time, r.alarm_time), r.program_name, r.location, r.duration_seconds;
  end loop;
end $$;

delete from alarms where tv_id is null;
alter table alarms alter column tv_id set not null;
alter table alarms alter column scheduled_time set default '00:00:00';
update alarms set scheduled_time = alarm_time where scheduled_time is null;
alter table alarms alter column scheduled_time set not null;

alter table alarms drop column if exists tv_ids;
alter table alarms drop column if exists font_id;
alter table alarms drop column if exists line_font_sizes;

create index if not exists alarms_tv_date_idx on alarms (tv_id, alarm_date);

alter publication supabase_realtime add table alarm_settings;

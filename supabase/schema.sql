-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).
-- Upgrading from an earlier version? Use the matching migration file instead:
--   supabase/migration_v2.sql — if you were on the very first schema
--   supabase/migration_v3.sql — if you already applied migration_v2.sql

create extension if not exists pgcrypto;

create table if not exists tvs (
  id smallint primary key,
  name text not null,
  check (id between 1 and 5)
);
insert into tvs (id, name) values (1,'TV 1'),(2,'TV 2'),(3,'TV 3'),(4,'TV 4'),(5,'TV 5')
  on conflict (id) do nothing;

create table if not exists images (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  url text not null,
  created_at timestamptz not null default now()
);

-- Reusable bundles of images ("자주 쓰는 이미지 묶음"). image_ids is ordered
-- and may contain the same image more than once (repeats are allowed).
create table if not exists image_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_ids uuid[] not null default '{}'
);

create table if not exists fonts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null
);

create table if not exists tv_settings (
  tv_id smallint primary key references tvs(id) on delete cascade,
  interval_seconds int not null default 5,           -- 이미지 전환 간격(초)
  transition_effect text not null default 'cut',      -- 'cut' | 'fade' | 'slide'
  alarm_duration_seconds int not null default 30,      -- 이 TV의 모든 알람에 일괄 적용되는 노출 시간(초)
  check (transition_effect in ('cut', 'fade', 'slide'))
);

-- Ordered playlist; the same image can appear more than once (sort_order
-- is the row's position, id lets a single image be listed several times).
create table if not exists tv_playlists (
  id uuid primary key default gen_random_uuid(),
  tv_id smallint references tvs(id) on delete cascade,
  image_id uuid references images(id) on delete cascade,
  sort_order int not null default 0
);

create table if not exists scheduled_image_sets (
  id uuid primary key default gen_random_uuid(),
  tv_id smallint references tvs(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0=Sun .. 6=Sat
  start_time time not null,
  end_time time not null,
  image_ids uuid[] not null default '{}'
);

create table if not exists tv_audio (
  tv_id smallint primary key references tvs(id) on delete cascade,
  audio_url text,
  audio_enabled boolean not null default false
);

-- One alarm belongs to exactly one TV — each TV's alarm list is managed
-- and displayed independently. Duration is not stored per alarm; every
-- alarm on a TV uses that TV's tv_settings.alarm_duration_seconds.
create table if not exists alarms (
  id uuid primary key default gen_random_uuid(),
  tv_id smallint not null references tvs(id) on delete cascade,
  alarm_date date not null,          -- 날짜
  alarm_time time not null,          -- 알람시각: 이 시각에 알람 화면이 뜨기 시작함
  scheduled_time time not null,      -- 시작예정시각: 알람 문구에 표시되는 "시작 시간"
  program_name text not null,        -- 프로그램명
  location text not null             -- 장소(렉처룸)
);

create index if not exists alarms_tv_date_idx on alarms (tv_id, alarm_date);

-- Global alarm look & template — applies to every TV's alarm screen.
-- Always exactly one row (id = 1).
create table if not exists alarm_settings (
  id int primary key default 1,
  font_id uuid references fonts(id) on delete set null,
  line_font_sizes jsonb not null default '[40,28,28,24]', -- 템플릿 줄 순서대로 매칭되는 글자 크기(px) 배열
  template text not null default 'ANNOUNCEMENT
[프로그램명],[장소]에서 시작됩니다.
해당 장소 앞으로 이동해주세요.
시작 시간 : [시작시간]',
  check (id = 1)
);
insert into alarm_settings (id) values (1) on conflict (id) do nothing;

-- Enable realtime so player screens get pushed updates instead of only polling
alter publication supabase_realtime add table alarms;
alter publication supabase_realtime add table tv_playlists;
alter publication supabase_realtime add table scheduled_image_sets;
alter publication supabase_realtime add table tv_settings;
alter publication supabase_realtime add table tv_audio;
alter publication supabase_realtime add table alarm_settings;

-- Row Level Security ---------------------------------------------------
-- NOTE: the admin UI writes directly from the browser using the public
-- "anon" key (the /admin password gate lives in Next.js middleware, not
-- in Supabase). These policies allow that anon key to read and write
-- every table below. That is fine for an internal tool used only by
-- trusted staff, but means anyone who extracted the anon key from the
-- deployed site's JS bundle could also write to these tables directly.
-- If that ever matters, move writes into server-side API routes using
-- SUPABASE_SERVICE_ROLE_KEY and lock these policies down to read-only.

alter table tvs enable row level security;
alter table images enable row level security;
alter table image_templates enable row level security;
alter table fonts enable row level security;
alter table tv_settings enable row level security;
alter table tv_playlists enable row level security;
alter table scheduled_image_sets enable row level security;
alter table tv_audio enable row level security;
alter table alarms enable row level security;
alter table alarm_settings enable row level security;

create policy "public read tvs" on tvs for select using (true);
create policy "public rw images" on images for all using (true) with check (true);
create policy "public rw image_templates" on image_templates for all using (true) with check (true);
create policy "public rw fonts" on fonts for all using (true) with check (true);
create policy "public rw tv_settings" on tv_settings for all using (true) with check (true);
create policy "public rw tv_playlists" on tv_playlists for all using (true) with check (true);
create policy "public rw scheduled_image_sets" on scheduled_image_sets for all using (true) with check (true);
create policy "public rw tv_audio" on tv_audio for all using (true) with check (true);
create policy "public rw alarms" on alarms for all using (true) with check (true);
create policy "public rw alarm_settings" on alarm_settings for all using (true) with check (true);

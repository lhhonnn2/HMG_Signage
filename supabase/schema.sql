-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).

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

create table if not exists fonts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null
);

create table if not exists tv_settings (
  tv_id smallint primary key references tvs(id) on delete cascade,
  interval_seconds int not null default 5
);

create table if not exists tv_playlists (
  tv_id smallint references tvs(id) on delete cascade,
  image_id uuid references images(id) on delete cascade,
  sort_order int not null default 0,
  primary key (tv_id, image_id)
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

create table if not exists alarms (
  id uuid primary key default gen_random_uuid(),
  alarm_date date not null,
  start_time time not null,
  program_name text not null,
  location text not null,
  duration_seconds int not null default 30,
  font_id uuid references fonts(id) on delete set null,
  line_font_sizes jsonb not null default '{"line1":40,"line2":28,"line3":28,"line4":24}',
  tv_ids smallint[] not null default '{1,2,3,4,5}'
);

create index if not exists alarms_date_idx on alarms (alarm_date);

-- Enable realtime so player screens get pushed updates instead of only polling
alter publication supabase_realtime add table alarms;
alter publication supabase_realtime add table tv_playlists;
alter publication supabase_realtime add table scheduled_image_sets;
alter publication supabase_realtime add table tv_settings;
alter publication supabase_realtime add table tv_audio;

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
alter table fonts enable row level security;
alter table tv_settings enable row level security;
alter table tv_playlists enable row level security;
alter table scheduled_image_sets enable row level security;
alter table tv_audio enable row level security;
alter table alarms enable row level security;

create policy "public read tvs" on tvs for select using (true);
create policy "public rw images" on images for all using (true) with check (true);
create policy "public rw fonts" on fonts for all using (true) with check (true);
create policy "public rw tv_settings" on tv_settings for all using (true) with check (true);
create policy "public rw tv_playlists" on tv_playlists for all using (true) with check (true);
create policy "public rw scheduled_image_sets" on scheduled_image_sets for all using (true) with check (true);
create policy "public rw tv_audio" on tv_audio for all using (true) with check (true);
create policy "public rw alarms" on alarms for all using (true) with check (true);

-- Run this ONLY if you already applied supabase/migration_v2.sql (or the
-- schema it produced) and are now upgrading further. If this is a brand
-- new project, just run schema.sql instead — skip this file.

-- 1) tv_settings: add per-TV alarm duration + image transition effect
alter table tv_settings add column if not exists transition_effect text not null default 'cut';
alter table tv_settings add column if not exists alarm_duration_seconds int not null default 30;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tv_settings_transition_effect_check'
  ) then
    alter table tv_settings add constraint tv_settings_transition_effect_check
      check (transition_effect in ('cut', 'fade', 'slide'));
  end if;
end $$;

-- Carry over any existing global default duration into each TV, then drop
-- the now-unused global column.
do $$
begin
  if exists (select 1 from information_schema.columns where table_name='alarm_settings' and column_name='duration_seconds') then
    update tv_settings
    set alarm_duration_seconds = coalesce((select duration_seconds from alarm_settings where id = 1), 30);
  end if;
end $$;

alter table alarm_settings drop column if exists duration_seconds;

-- 2) alarms: duration is no longer stored per alarm (uses tv_settings.alarm_duration_seconds)
alter table alarms drop column if exists duration_seconds;

-- 3) tv_playlists: allow the same image to appear more than once, in order.
-- The old table used (tv_id, image_id) as its primary key, which blocked
-- duplicates. Rebuild it with a surrogate id instead.
alter table tv_playlists add column if not exists id uuid default gen_random_uuid();
update tv_playlists set id = gen_random_uuid() where id is null;
alter table tv_playlists alter column id set not null;

do $$
declare pk_name text;
begin
  select constraint_name into pk_name
  from information_schema.table_constraints
  where table_name = 'tv_playlists' and constraint_type = 'PRIMARY KEY';

  if pk_name is not null and pk_name <> 'tv_playlists_pkey_id' then
    execute format('alter table tv_playlists drop constraint %I', pk_name);
  end if;

  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'tv_playlists' and constraint_type = 'PRIMARY KEY'
  ) then
    alter table tv_playlists add constraint tv_playlists_pkey_id primary key (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'tv_playlists'
  ) then
    alter publication supabase_realtime add table tv_playlists;
  end if;
end $$;

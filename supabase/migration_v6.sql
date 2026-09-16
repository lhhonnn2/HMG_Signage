-- Run this if you already applied migration_v5.sql (or schema.sql) and are
-- now upgrading further. If this is a brand new project, just run
-- schema.sql — skip this file.

-- Lets a playlist say "these images should each show once every other lap"
-- instead of having to hand-build a list like 1,2,3,4,1,2,3,5.
alter table tv_settings add column if not exists frequency_groups jsonb not null default '[]';
alter table image_templates add column if not exists frequency_groups jsonb not null default '[]';

-- transition_effect was added in migration_v3 and removed from the app in
-- a later update (the fade/slide effects never worked reliably) — drop it
-- if it's still there.
alter table tv_settings drop column if exists transition_effect;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'tv_settings'
  ) then
    alter publication supabase_realtime add table tv_settings;
  end if;
end $$;

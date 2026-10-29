-- Run this if you already applied migration_v7.sql (or schema.sql) and are
-- now upgrading further. If this is a brand new project, just run
-- schema.sql — skip this file.

create table if not exists day_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  rows jsonb not null default '[]'
);

alter table day_plans enable row level security;
drop policy if exists "public rw day_plans" on day_plans;
create policy "public rw day_plans" on day_plans for all using (true) with check (true);

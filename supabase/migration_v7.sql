-- Run this if you already applied migration_v6.sql (or schema.sql) and are
-- now upgrading further. If this is a brand new project, just run
-- schema.sql — skip this file.
--
-- This migration reworks how playlists are stored so a frequency group can
-- be positioned anywhere in the list (previously groups were always
-- appended after all images). It moves tv_playlists rows and
-- image_templates.image_ids into a single ordered "entries" list per TV /
-- template, and gives every existing frequency group a stable id so it can
-- be referenced from that list.

alter table tv_settings add column if not exists playlist_entries jsonb not null default '[]';
alter table image_templates add column if not exists entries jsonb not null default '[]';

-- 1) Fold existing tv_playlists rows into tv_settings.playlist_entries as
--    image entries, in their existing sort_order.
do $$
declare
  r record;
  built jsonb;
begin
  for r in select distinct tv_id from tv_playlists loop
    select coalesce(
      jsonb_agg(
        jsonb_build_object('id', gen_random_uuid()::text, 'type', 'image', 'image_id', image_id::text)
        order by sort_order
      ),
      '[]'::jsonb
    )
    into built
    from tv_playlists
    where tv_id = r.tv_id;

    insert into tv_settings (tv_id, playlist_entries)
    values (r.tv_id, built)
    on conflict (tv_id) do update set playlist_entries = excluded.playlist_entries;
  end loop;
end $$;

-- 2) Give every existing tv_settings frequency group a stable id, and
--    append a matching group-placeholder entry to the end of that TV's
--    playlist_entries (preserving the old "always at the end" behavior for
--    data that already existed before this update).
do $$
declare
  r record;
  g jsonb;
  gid text;
  new_groups jsonb;
  group_entries jsonb;
begin
  for r in select tv_id, frequency_groups, playlist_entries from tv_settings where jsonb_array_length(frequency_groups) > 0 loop
    new_groups := '[]'::jsonb;
    group_entries := '[]'::jsonb;
    for g in select * from jsonb_array_elements(r.frequency_groups) loop
      if g ? 'id' then
        gid := g ->> 'id';
      else
        gid := gen_random_uuid()::text;
      end if;
      new_groups := new_groups || jsonb_build_array(jsonb_build_object('id', gid, 'image_ids', coalesce(g -> 'image_ids', '[]'::jsonb)));
      group_entries := group_entries || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'type', 'group', 'group_id', gid));
    end loop;

    update tv_settings
    set frequency_groups = new_groups,
        playlist_entries = coalesce(r.playlist_entries, '[]'::jsonb) || group_entries
    where tv_id = r.tv_id;
  end loop;
end $$;

-- 3) Same conversion for image_templates: image_ids[] -> entries jsonb,
--    and frequency_groups get stable ids + matching group entries appended.
do $$
declare
  r record;
  img_entries jsonb;
  iid uuid;
  g jsonb;
  gid text;
  new_groups jsonb;
  group_entries jsonb;
begin
  for r in select id, image_ids, frequency_groups from image_templates loop
    img_entries := '[]'::jsonb;
    if r.image_ids is not null then
      foreach iid in array r.image_ids loop
        img_entries := img_entries || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'type', 'image', 'image_id', iid::text));
      end loop;
    end if;

    new_groups := '[]'::jsonb;
    group_entries := '[]'::jsonb;
    if r.frequency_groups is not null then
      for g in select * from jsonb_array_elements(r.frequency_groups) loop
        if g ? 'id' then
          gid := g ->> 'id';
        else
          gid := gen_random_uuid()::text;
        end if;
        new_groups := new_groups || jsonb_build_array(jsonb_build_object('id', gid, 'image_ids', coalesce(g -> 'image_ids', '[]'::jsonb)));
        group_entries := group_entries || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'type', 'group', 'group_id', gid));
      end loop;
    end if;

    update image_templates
    set entries = img_entries || group_entries,
        frequency_groups = new_groups
    where id = r.id;
  end loop;
end $$;

alter table image_templates drop column if exists image_ids;

drop table if exists tv_playlists;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'tv_settings'
  ) then
    alter publication supabase_realtime add table tv_settings;
  end if;
end $$;

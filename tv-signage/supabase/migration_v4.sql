-- Run this if you already applied migration_v2.sql and migration_v3.sql
-- (or schema.sql) and are now upgrading further. If this is a brand new
-- project, just run schema.sql — skip this file.

-- Small resized copy used for admin grid thumbnails, so the admin pages
-- don't have to download every full-resolution original just to show a
-- 120px preview. Existing images will simply show their full image as the
-- thumbnail until re-uploaded (thumbnail_url stays null, UI falls back to url).
alter table images add column if not exists thumbnail_url text;

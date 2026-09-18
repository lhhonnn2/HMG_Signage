-- Run this if you already applied migration_v8.sql (or schema.sql) and are
-- now upgrading further. If this is a brand new project, just run
-- schema.sql — skip this file.

alter table alarm_settings add column if not exists background_color text not null default '#000000';

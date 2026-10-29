-- Run this if you already applied migration_v4.sql (or schema.sql) and are
-- now upgrading further. If this is a brand new project, just run
-- schema.sql — skip this file.

-- Lets one "요일별 추가 이미지" entry cover several days at once (e.g. 토+일
-- together) instead of needing a separate entry per weekday.
alter table scheduled_image_sets add column if not exists weekdays smallint[];
update scheduled_image_sets set weekdays = array[weekday] where weekdays is null and weekday is not null;
alter table scheduled_image_sets alter column weekdays set default '{}';
update scheduled_image_sets set weekdays = '{}' where weekdays is null;
alter table scheduled_image_sets alter column weekdays set not null;
alter table scheduled_image_sets drop column if exists weekday;

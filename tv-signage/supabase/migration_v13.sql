-- v13: 폰 알림 구조 개편
--   구분(DX/DP) → 브랜드 → 카테고리 / 프로그램별 카테고리 지정 / 직원별 알림 시차·개별 선택
-- ※ v12에서 만든 폰 알람 테스트 데이터(phone_alarms, 기존 카테고리)는 새 구조와 달라서 삭제됩니다.
-- 여러 번 실행해도 안전합니다.

-- 1) 이전 구조 정리
drop table if exists phone_alarms;

-- 2) 카테고리: 구분 + 브랜드 + 이름
alter table phone_categories add column if not exists division text;
alter table phone_categories add column if not exists brand text;
delete from phone_categories where division is null or brand is null;   -- v12 테스트 카테고리 제거
alter table phone_categories alter column division set not null;
alter table phone_categories alter column brand set not null;
alter table phone_categories drop constraint if exists phone_categories_name_key;
create unique index if not exists phone_categories_uniq on phone_categories (division, brand, name);

-- 3) 폰 타임테이블 (알람시각 없음: 직원이 고른 "N분 전"으로 알림 시각을 계산)
create table if not exists phone_timetable (
  id uuid primary key default gen_random_uuid(),
  alarm_date date not null,
  start_time time not null,
  program_name text not null default '',
  location text not null default ''
);
create index if not exists phone_timetable_date_idx on phone_timetable (alarm_date);

-- 4) 프로그램 → 카테고리 지정 (프로그램 이름 기준, 한 번 지정하면 매일 자동 적용)
create table if not exists phone_programs (
  name text primary key,
  category_id uuid references phone_categories(id) on delete set null
);

-- 5) 직원 구독: 선택한 구분/브랜드/카테고리, 개별 프로그램 예외, 알림 시차
alter table push_subscriptions add column if not exists divisions text[] not null default '{}';
alter table push_subscriptions add column if not exists brands text[] not null default '{}';
alter table push_subscriptions add column if not exists category_names text[] not null default '{}';
alter table push_subscriptions add column if not exists excluded_programs text[] not null default '{}';
alter table push_subscriptions add column if not exists extra_programs text[] not null default '{}';
alter table push_subscriptions add column if not exists lead_minutes integer not null default 5;

alter table phone_timetable enable row level security;
alter table phone_programs enable row level security;
drop policy if exists "public rw phone_timetable" on phone_timetable;
create policy "public rw phone_timetable" on phone_timetable for all using (true) with check (true);
drop policy if exists "public rw phone_programs" on phone_programs;
create policy "public rw phone_programs" on phone_programs for all using (true) with check (true);

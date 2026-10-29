-- v12: 폰 전용 알람(카테고리) + 웹 푸시 구독/발송 기록
-- 여러 번 실행해도 안전합니다.

-- 1) 폰 알람 카테고리
create table if not exists phone_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- 2) 폰 전용 알람 (TV와 무관, 카테고리에 소속)
create table if not exists phone_alarms (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references phone_categories(id) on delete cascade,
  alarm_date date not null,
  alarm_time time not null,        -- 폰 알림이 가는 시각
  scheduled_time time not null,    -- 시작예정시각 (알림 문구의 "N분 전" 계산에 사용)
  program_name text not null default '',
  location text not null default ''
);
create index if not exists phone_alarms_date_idx on phone_alarms (alarm_date);
create index if not exists phone_alarms_cat_date_idx on phone_alarms (category_id, alarm_date);

-- 3) 직원 폰 구독 정보 (서버 전용: anon 접근 불가)
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  tv_ids integer[] not null default '{}',
  category_ids uuid[] not null default '{}',
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4) 발송 기록 (같은 알림을 같은 폰에 두 번 보내지 않기 위한 중복 방지)
create table if not exists push_log (
  id bigserial primary key,
  subscription_id uuid not null references push_subscriptions(id) on delete cascade,
  dedupe_key text not null,
  sent_at timestamptz not null default now(),
  unique (subscription_id, dedupe_key)
);

alter table phone_categories enable row level security;
alter table phone_alarms enable row level security;
alter table push_subscriptions enable row level security;
alter table push_log enable row level security;

-- 카테고리/폰 알람은 다른 관리 테이블과 동일하게 anon 허용 (관리자 화면이 직접 씀)
drop policy if exists "public rw phone_categories" on phone_categories;
create policy "public rw phone_categories" on phone_categories for all using (true) with check (true);
drop policy if exists "public rw phone_alarms" on phone_alarms;
create policy "public rw phone_alarms" on phone_alarms for all using (true) with check (true);
-- push_subscriptions, push_log 는 정책을 만들지 않음 → anon 키로는 읽기/쓰기 불가,
-- 서버(service role)만 접근합니다. (구독 정보가 외부에 노출되지 않도록)

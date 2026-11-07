-- v14: 발송 현황(cron 실행 기록) + 전체 공지 기록
-- 여러 번 실행해도 안전합니다. (둘 다 서버 전용: 정책을 만들지 않음)

-- 1) cron 실행 기록 (1분마다 한 줄, 7일 지난 기록은 자동 삭제)
create table if not exists push_runs (
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  planned integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,
  removed integer not null default 0,
  errors jsonb not null default '[]'::jsonb
);
create index if not exists push_runs_ran_at_idx on push_runs (ran_at desc);

-- 2) 전체 공지 기록
create table if not exists push_announcements (
  id uuid primary key default gen_random_uuid(),
  sent_at timestamptz not null default now(),
  title text not null default '',
  body text not null,
  recipients integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,
  removed integer not null default 0
);
create index if not exists push_announcements_sent_at_idx on push_announcements (sent_at desc);

alter table push_runs enable row level security;
alter table push_announcements enable row level security;

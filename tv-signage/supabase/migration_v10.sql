-- v10: TV를 자유롭게 추가/삭제할 수 있도록 1~5 제한을 제거합니다.
-- Supabase SQL Editor에서 한 번 실행하세요.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.tvs'::regclass and contype = 'c'
  loop
    execute format('alter table public.tvs drop constraint %I', c);
  end loop;
end $$;

-- tvs 테이블에 쓰기(추가/이름변경/삭제) 권한 정책 추가
-- (기존에는 읽기 정책만 있어서 TV 추가·삭제·이름 저장이 거부되었습니다)
drop policy if exists "public read tvs" on tvs;
drop policy if exists "public rw tvs" on tvs;
create policy "public rw tvs" on tvs for all using (true) with check (true);

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

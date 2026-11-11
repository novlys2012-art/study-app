-- Who may do what with the answer log and the server-only tables. Every block raises on a failure.
\set ON_ERROR_STOP on
\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''

-- The progress saved before the answer log became base rows, with the ids the app uses.
do $$ begin
  if (select count(*) from public.reviews) <> 3 then raise exception 'expected 3 base rows, got %', (select count(*) from public.reviews); end if;
  if not exists (select from public.reviews where id = 'b:u1:q1' and kind = 'base' and n = 3 and c = 2 and correct
    and user_id = 'aaaaaaaa-0000-0000-0000-000000000001') then raise exception 'base row for q1 is wrong'; end if;
  if not exists (select from public.reviews where id = 'b:u1:q2' and not correct and n = 1 and c = 0) then raise exception 'base row for q2 is wrong'; end if;
end $$;

-- A adds answers. created_at comes from the database, not from the device.
begin;
set local role authenticated;
set local request.jwt.claim.sub = :A;
insert into public.reviews (id, subject_id, question_id, kind, correct, at, created_at)
  values ('r1', 'u1', 'q1', 'answer', true, now(), '2000-01-01'), ('r2', 'u1', 'q2', 'answer', false, now(), '2000-01-01');
-- Sending the same answer again (a sync that was cut off) adds nothing and is not an error.
insert into public.reviews (id, subject_id, question_id, kind, correct, at) values ('r1', 'u1', 'q1', 'answer', false, now())
  on conflict (user_id, id) do nothing;
do $$ begin
  if (select count(*) from public.reviews) <> 4 then raise exception 'A should see 4 rows (2 base, 2 answers), sees %', (select count(*) from public.reviews); end if;
  if (select correct from public.reviews where id = 'r1') is not true then raise exception 'a repeated answer changed the first one'; end if;
  if exists (select from public.reviews where created_at < now() - interval '1 day') then raise exception 'created_at came from the device'; end if;
end $$;
-- No one can change an answer.
do $$ begin
  begin update public.reviews set correct = false where id = 'r1'; raise exception 'A could change an answer';
  exception when insufficient_privilege then null; end;
end $$;
-- A cannot add a row for B.
do $$ begin
  begin insert into public.reviews (user_id, id, subject_id, question_id, kind, correct, at)
    values ('bbbbbbbb-0000-0000-0000-000000000002', 'x', 'u1', 'q1', 'answer', true, now());
    raise exception 'A could add a row for B';
  exception when insufficient_privilege then null; end;
end $$;
-- Rows must be complete for their kind.
do $$ begin
  begin insert into public.reviews (id, subject_id, kind, correct, at) values ('bad', 'u1', 'answer', true, now());
    raise exception 'an answer without a question was accepted';
  exception when check_violation then null; end;
end $$;
-- The server-only tables and functions are closed to students.
do $$ begin
  begin perform * from public.ai_cache; raise exception 'a student could read ai_cache';
  exception when insufficient_privilege then null; end;
  begin perform public.ai_spend('aaaaaaaa-0000-0000-0000-000000000001'); raise exception 'a student could call ai_spend';
  exception when insufficient_privilege then null; end;
  begin insert into public.ai_usage (user_id, task, model, input_tokens, output_tokens, cost_usd)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'summary', 'm', 0, 0, 0); raise exception 'a student could write ai_usage';
  exception when insufficient_privilege then null; end;
end $$;
commit;

-- B sees none of A's rows and cannot delete them.
begin;
set local role authenticated;
set local request.jwt.claim.sub = :B;
do $$ declare gone int; begin
  if exists (select from public.reviews where user_id <> 'bbbbbbbb-0000-0000-0000-000000000002') then raise exception 'B can read A''s reviews'; end if;
  if (select count(*) from public.reviews) <> 1 then raise exception 'B should see only their own base row'; end if;
  if exists (select from public.progress where user_id <> 'bbbbbbbb-0000-0000-0000-000000000002') then raise exception 'B can read A''s progress'; end if;
  delete from public.reviews where id in ('r1', 'r2'); get diagnostics gone = row_count;
  if gone <> 0 then raise exception 'B deleted A''s rows'; end if;
end $$;
commit;

-- Signed out: nothing.
begin;
set local role anon;
do $$ begin
  begin perform * from public.reviews; raise exception 'anon could read reviews';
  exception when insufficient_privilege then null; end;
end $$;
commit;

-- A deletes a subject's rows (the subject was deleted).
begin;
set local role authenticated;
set local request.jwt.claim.sub = :A;
do $$ declare gone int; begin
  delete from public.reviews where subject_id = 'u1'; get diagnostics gone = row_count;
  if gone <> 4 then raise exception 'A should delete 4 own rows, deleted %', gone; end if;
end $$;
commit;

-- The server: per-minute count and the cache.
insert into public.ai_usage (user_id, task, model, input_tokens, output_tokens, cost_usd, cached)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'summary', 'm', 10, 5, 0.01, false),
         ('aaaaaaaa-0000-0000-0000-000000000001', 'summary', 'm', 0, 0, 0, true);
begin;
set local role service_role;
do $$ declare r record; begin
  select * into r from public.ai_spend('aaaaaaaa-0000-0000-0000-000000000001');
  if r.user_minute <> 2 or r.user_month <> 0.01 then raise exception 'ai_spend gave % / %', r.user_minute, r.user_month; end if;
  insert into public.ai_cache (key, task, model, result) values (repeat('a', 64), 'summary', 'm', '{}');
  begin insert into public.ai_cache (key, task, model, result) values ('short', 'summary', 'm', '{}'); raise exception 'a bad cache key was accepted';
  exception when check_violation then null; end;
end $$;
commit;

-- Deleting an account removes its answers.
delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$ begin
  if exists (select from public.reviews where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') then raise exception 'reviews outlived the account'; end if;
end $$;
\echo 'database access checks passed'

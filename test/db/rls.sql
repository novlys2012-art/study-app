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
  begin perform public.ai_reserve('aaaaaaaa-0000-0000-0000-000000000001', null, 'free', 'summary', 'm', 0.01, 0.15, 25, 3, 60, 0, 18); raise exception 'a student could call ai_reserve';
  exception when insufficient_privilege then null; end;
  begin insert into public.ai_usage (user_id, task, model, input_tokens, output_tokens, cost_usd)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'summary', 'm', 0, 0, 0); raise exception 'a student could write ai_usage';
  exception when insufficient_privilege then null; end;
end $$;
-- Per-user row limit on subjects (200 max; updating an existing row at the limit still works).
insert into public.subjects (id, data)
  select 'lim-' || g, '{}'::jsonb from generate_series(1, 200) g;
insert into public.subjects (id, data) values ('lim-1', '{"ok":true}'::jsonb)
  on conflict (user_id, id) do update set data = excluded.data;
do $$ begin
  begin insert into public.subjects (id, data) values ('lim-201', '{}'::jsonb);
    raise exception 'A exceeded the 200-subject per-user row limit';
  exception when check_violation then null; end;
end $$;
delete from public.subjects where id like 'lim-%';
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

-- The server: per-minute count, cache pruning and survival across account deletion.
insert into public.ai_usage (user_id, account_key, task, model, input_tokens, output_tokens, cost_usd, cached, created_at)
  values ('aaaaaaaa-0000-0000-0000-000000000001', repeat('e', 64), 'summary', 'm', 0, 0, 0, true, now() - interval '20 minutes');
insert into public.ai_usage (user_id, account_key, task, model, input_tokens, output_tokens, cost_usd, cached)
  values ('aaaaaaaa-0000-0000-0000-000000000001', repeat('e', 64), 'summary', 'm', 10, 5, 0.01, false),
         ('aaaaaaaa-0000-0000-0000-000000000001', repeat('e', 64), 'summary', 'm', 0, 0, 0, true);
begin;
set local role service_role;
do $$ declare r record; begin
  if exists (select from public.ai_usage where cached = true and created_at < now() - interval '15 minutes') then
    raise exception 'stale cached ai_usage row was not pruned';
  end if;
  select * into r from public.ai_spend('aaaaaaaa-0000-0000-0000-000000000001');
  if r.user_minute <> 2 or r.user_month <> 0.01 then raise exception 'ai_spend gave % / %', r.user_minute, r.user_month; end if;
  insert into public.ai_cache (key, task, model, result, created_at) values (repeat('b', 64), 'summary', 'm', '{}', now() - interval '91 days');
  insert into public.ai_cache (key, task, model, result) values (repeat('a', 64), 'summary', 'm', '{}');
  if exists (select from public.ai_cache where key = repeat('b', 64)) then raise exception 'expired ai_cache row was not pruned'; end if;
  begin insert into public.ai_cache (key, task, model, result) values ('short', 'summary', 'm', '{}'); raise exception 'a bad cache key was accepted';
  exception when check_violation then null; end;

  -- Atomic ai_reserve: enforces monthly, free-daily (without blocking Plus), vision page limit, and inserts a reserved row.
  select * into r from public.ai_reserve('bbbbbbbb-0000-0000-0000-000000000002', repeat('d', 64), 'free', 'vision', 'm', 0.14, 0.15, 25, 0.14, 60, 10, 18);
  if not r.ok or r.row_id is null then raise exception 'first ai_reserve failed: %', r.reason; end if;
  -- Vision monthly limit blocks another 10 pages for Free (10 + 10 > 18).
  select * into r from public.ai_reserve('bbbbbbbb-0000-0000-0000-000000000002', repeat('d', 64), 'free', 'vision', 'm', 0.01, 0.15, 25, 3, 60, 10, 18);
  if r.ok or r.reason <> 'plus_required' then raise exception 'expected plus_required for vision cap, got % / %', r.ok, r.reason; end if;
  -- Free daily cap blocks another Free user once Free daily spend reached 0.14, but a Plus user still succeeds.
  select * into r from public.ai_reserve('cccccccc-0000-0000-0000-000000000003', null, 'free', 'summary', 'm', 0.01, 0.15, 25, 0.14, 60, 0, 18);
  if r.ok or r.reason <> 'daily_limit' then raise exception 'expected daily_limit for free pool, got % / %', r.ok, r.reason; end if;
  select * into r from public.ai_reserve('cccccccc-0000-0000-0000-000000000003', null, 'plus', 'summary', 'm', 0.01, 1.5, 25, 0.14, 60, 0, null);
  if not r.ok or r.row_id is null then raise exception 'plus user was blocked by free daily pool: %', r.reason; end if;
  delete from public.ai_usage where user_id in ('bbbbbbbb-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003');
end $$;
commit;

-- Deleting an account removes its answers, but keeps ai_usage so deleting/re-registering cannot reset spend caps.
delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001';
begin;
set local role service_role;
do $$ declare r record; begin
  if exists (select from public.reviews where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') then raise exception 'reviews outlived the account'; end if;
  select * into r from public.ai_spend('cccccccc-0000-0000-0000-000000000003', repeat('e', 64));
  if r.user_month <> 0.01 or r.all_today <> 0.01 then raise exception 'ai_usage spend was lost after account deletion: % / %', r.user_month, r.all_today; end if;
end $$;
commit;
\echo 'database access checks passed'

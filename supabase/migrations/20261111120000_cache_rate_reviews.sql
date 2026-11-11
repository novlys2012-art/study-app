-- Phase 0 quick fixes: a result cache for AI answers, a per-minute limit, and the answer log.

-- ----- ai_usage: answers served from the cache are recorded too (cost 0), so re-runs can be measured.
alter table public.ai_usage add column if not exists cached boolean not null default false;

-- This month's spending for one account, today's spending for the whole app (UTC), and the account's
-- AI tasks in the last minute (for the per-minute limit).
drop function if exists public.ai_spend(uuid);
create function public.ai_spend(uid uuid)
returns table (user_month numeric, all_today numeric, user_minute bigint)
language sql stable security definer set search_path = ''
as $$
  select
    coalesce(sum(cost_usd) filter (where user_id = uid), 0),
    coalesce(sum(cost_usd) filter (where created_at >= date_trunc('day', now())), 0),
    count(*) filter (where user_id = uid and created_at >= now() - interval '1 minute')
  from public.ai_usage
  where created_at >= least(date_trunc('month', now()), now() - interval '1 minute');
$$;
revoke execute on function public.ai_spend(uuid) from public, anon, authenticated;
grant execute on function public.ai_spend(uuid) to service_role;

-- ----- ai_cache: AI answers by a SHA-256 of the whole request (task, model, settings, prompt, source text,
-- pictures; see server/generate.js). The same section sent again, after a failed upload or by another
-- student with the same file, is answered from here for free. Only identical input matches, so no
-- student sees anything derived from material they did not send. Server function only: no access for users.
create table if not exists public.ai_cache (
  key text primary key check (key ~ '^[0-9a-f]{64}$'),
  task text not null,
  model text not null,
  result text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_cache_time on public.ai_cache (created_at);
alter table public.ai_cache enable row level security;
revoke all on public.ai_cache from public, anon, authenticated;
grant all on public.ai_cache to service_role;

-- ----- reviews: the answer log. One row per answer, so two devices never overwrite each other's answers;
-- the counts the app shows are worked out from it (src/app/subjects.js, progressFrom).
--   kind 'answer': question_id, correct
--   kind 'base':   question_id, n answers, c right, correct = the last one was right (counts from before the log)
--   kind 'reset':  the student started the subject again; earlier rows no longer count
-- at is when it happened on the device; created_at is set by the database and is what devices sync by.
create table if not exists public.reviews (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 160),
  subject_id text not null check (char_length(subject_id) between 1 and 64),
  question_id text check (char_length(question_id) between 1 and 64),
  kind text not null check (kind in ('answer', 'base', 'reset')),
  correct boolean,
  n integer check (n >= 0),
  c integer check (c >= 0),
  at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  check (case kind
    when 'answer' then question_id is not null and correct is not null
    when 'base' then question_id is not null and n is not null and c is not null
    else question_id is null end)
);
create index if not exists reviews_user_time on public.reviews (user_id, created_at);
create index if not exists reviews_user_subject on public.reviews (user_id, subject_id);

-- The database, not the device, sets created_at, so a phone with a wrong clock cannot hide rows from a sync.
create or replace function public.reviews_stamp() returns trigger
language plpgsql set search_path = ''
as $$ begin new.created_at := now(); return new; end $$;
drop trigger if exists reviews_stamp on public.reviews;
create trigger reviews_stamp before insert on public.reviews for each row execute function public.reviews_stamp();

-- Each student reads, adds and (with a subject) deletes only their own rows. No one can change a row.
alter table public.reviews enable row level security;
drop policy if exists "read own reviews" on public.reviews;
create policy "read own reviews" on public.reviews for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "add own reviews" on public.reviews;
create policy "add own reviews" on public.reviews for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "delete own reviews" on public.reviews;
create policy "delete own reviews" on public.reviews for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.reviews from public, anon, authenticated;
grant select, insert, delete on public.reviews to authenticated;
grant all on public.reviews to service_role;

-- The counts saved so far become one 'base' row per question. The id is the one the app gives the same
-- counts on the device ('b:' subject ':' question), so a device that still has them adds nothing twice.
-- The progress table stays as it was (read-only for the app from now on) until the move is checked.
insert into public.reviews (user_id, id, subject_id, question_id, kind, correct, n, c, at)
select p.user_id, 'b:' || p.subject_id || ':' || q.key, p.subject_id, q.key, 'base',
  coalesce(q.value ->> 'l', '') = '1',
  (q.value ->> 'n')::integer,
  case when coalesce(q.value ->> 'c', '') ~ '^\d{1,9}$' then (q.value ->> 'c')::integer else 0 end,
  p.updated_at
from public.progress p
cross join lateral jsonb_each(case when jsonb_typeof(p.data) = 'object' then p.data else '{}'::jsonb end) q
where jsonb_typeof(q.value) = 'object'
  and coalesce(q.value ->> 'n', '') ~ '^\d{1,9}$' and (q.value ->> 'n')::integer > 0
  and char_length(q.key) between 1 and 64
on conflict do nothing;

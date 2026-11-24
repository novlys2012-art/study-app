-- Security hardening (24 Nov 2026):
-- 1. Atomic spend/rate/vision reservation via pg_advisory_xact_lock (ai_reserve), separating the Free daily pool
--    from the overall emergency daily ceiling so Free abuse cannot lock out paying Lekto Plus users.
-- 2. Per-user row limits on subjects (200), progress (200), and reviews (200,000).
-- 3. 90-day retention pruning on ai_cache.

-- ----- ai_usage: track plan (for separate Free daily budget) and vision_pages (for Free monthly vision cap).
alter table public.ai_usage
  add column if not exists plan text not null default 'free' check (plan in ('free', 'plus')),
  add column if not exists vision_pages integer not null default 0 check (vision_pages >= 0);

drop function if exists public.ai_spend(uuid, text);
create function public.ai_spend(uid uuid, acct_key text default null)
returns table (user_month numeric, all_today numeric, user_minute bigint, free_today numeric, user_vision bigint)
language sql stable security definer set search_path = ''
as $$
  select
    coalesce(sum(cost_usd) filter (where (user_id = uid or (acct_key is not null and account_key = acct_key)) and created_at >= date_trunc('month', now())), 0),
    coalesce(sum(cost_usd) filter (where created_at >= date_trunc('day', now())), 0),
    count(*) filter (where (user_id = uid or (acct_key is not null and account_key = acct_key)) and created_at >= now() - interval '1 minute'),
    coalesce(sum(cost_usd) filter (where plan = 'free' and created_at >= date_trunc('day', now())), 0),
    coalesce(sum(vision_pages) filter (where (user_id = uid or (acct_key is not null and account_key = acct_key)) and created_at >= date_trunc('month', now())), 0)
  from public.ai_usage
  where created_at >= least(date_trunc('month', now()), now() - interval '1 minute');
$$;
revoke execute on function public.ai_spend(uuid, text) from public, anon, authenticated;
grant execute on function public.ai_spend(uuid, text) to service_role;

-- Atomic pre-call reservation: serializes cap checks across all Edge Function instances and inserts a worst-case
-- reservation row before the AI provider is called. The caller updates it to real cost on success or deletes it on failure.
drop function if exists public.ai_reserve(uuid, text, text, text, text, numeric, numeric, numeric, numeric, integer, integer, integer);
create function public.ai_reserve(
  uid uuid,
  acct_key text,
  p_plan text,
  p_task text,
  p_model text,
  p_est_usd numeric,
  p_month_limit numeric,
  p_daily_limit numeric,
  p_free_daily_limit numeric,
  p_per_minute integer,
  p_vision_pages integer default 0,
  p_vision_month_limit integer default null
)
returns table (
  ok boolean,
  reason text,
  row_id bigint,
  user_month numeric,
  all_today numeric,
  free_today numeric,
  user_minute bigint
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_plan text := case when p_plan = 'plus' then 'plus' else 'free' end;
  v_month numeric;
  v_today numeric;
  v_free_today numeric;
  v_minute bigint;
  v_vision bigint;
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('lekto:ai_reserve'));

  select
    coalesce(sum(cost_usd) filter (where (user_id = uid or (acct_key is not null and account_key = acct_key)) and created_at >= date_trunc('month', now())), 0),
    coalesce(sum(cost_usd) filter (where created_at >= date_trunc('day', now())), 0),
    coalesce(sum(cost_usd) filter (where plan = 'free' and created_at >= date_trunc('day', now())), 0),
    count(*) filter (where (user_id = uid or (acct_key is not null and account_key = acct_key)) and created_at >= now() - interval '1 minute'),
    coalesce(sum(vision_pages) filter (where (user_id = uid or (acct_key is not null and account_key = acct_key)) and created_at >= date_trunc('month', now())), 0)
  into v_month, v_today, v_free_today, v_minute, v_vision
  from public.ai_usage
  where created_at >= least(date_trunc('month', now()), now() - interval '1 minute');

  if v_minute >= p_per_minute then
    return query select false, 'rate_limit'::text, null::bigint, v_month, v_today, v_free_today, v_minute;
    return;
  end if;

  if p_vision_month_limit is not null and p_vision_pages > 0 and v_vision + p_vision_pages > p_vision_month_limit then
    return query select false, 'plus_required'::text, null::bigint, v_month, v_today, v_free_today, v_minute;
    return;
  end if;

  if v_month >= p_month_limit then
    return query select false, 'user_limit'::text, null::bigint, v_month, v_today, v_free_today, v_minute;
    return;
  end if;

  if v_today >= p_daily_limit or (v_plan = 'free' and p_free_daily_limit is not null and v_free_today >= p_free_daily_limit) then
    return query select false, 'daily_limit'::text, null::bigint, v_month, v_today, v_free_today, v_minute;
    return;
  end if;

  insert into public.ai_usage (user_id, account_key, plan, task, model, input_tokens, output_tokens, cost_usd, cached, vision_pages)
  values (uid, acct_key, v_plan, p_task, p_model, 0, 0, greatest(0, coalesce(p_est_usd, 0)), false, greatest(0, coalesce(p_vision_pages, 0)))
  returning id into v_id;

  return query select true, null::text, v_id, v_month, v_today, v_free_today, v_minute;
end
$$;
revoke execute on function public.ai_reserve(uuid, text, text, text, text, numeric, numeric, numeric, numeric, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.ai_reserve(uuid, text, text, text, text, numeric, numeric, numeric, numeric, integer, integer, integer) to service_role;

-- ----- Per-user row limits (AFTER INSERT FOR EACH STATEMENT so batch upserts stay O(1) and updates at cap succeed).
create or replace function public.subjects_row_limit() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare uid uuid;
begin
  for uid in select distinct user_id from ins loop
    perform pg_advisory_xact_lock(hashtext('lekto:row_limit:subjects:' || uid::text));
    if (select count(*) from public.subjects where user_id = uid) > 200 then
      raise exception 'row limit (200 per user) exceeded on subjects' using errcode = '23514';
    end if;
  end loop;
  return null;
end
$$;
revoke execute on function public.subjects_row_limit() from public, anon, authenticated;
drop trigger if exists subjects_row_limit on public.subjects;
create trigger subjects_row_limit after insert on public.subjects
  referencing new table as ins
  for each statement execute function public.subjects_row_limit();

create or replace function public.progress_row_limit() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare uid uuid;
begin
  for uid in select distinct user_id from ins loop
    perform pg_advisory_xact_lock(hashtext('lekto:row_limit:progress:' || uid::text));
    if (select count(*) from public.progress where user_id = uid) > 200 then
      raise exception 'row limit (200 per user) exceeded on progress' using errcode = '23514';
    end if;
  end loop;
  return null;
end
$$;
revoke execute on function public.progress_row_limit() from public, anon, authenticated;
drop trigger if exists progress_row_limit on public.progress;
create trigger progress_row_limit after insert on public.progress
  referencing new table as ins
  for each statement execute function public.progress_row_limit();

create or replace function public.reviews_row_limit() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare uid uuid;
begin
  for uid in select distinct user_id from ins loop
    perform pg_advisory_xact_lock(hashtext('lekto:row_limit:reviews:' || uid::text));
    if (select count(*) from public.reviews where user_id = uid) > 200000 then
      raise exception 'row limit (200000 per user) exceeded on reviews' using errcode = '23514';
    end if;
  end loop;
  return null;
end
$$;
revoke execute on function public.reviews_row_limit() from public, anon, authenticated;
drop trigger if exists reviews_row_limit on public.reviews;
create trigger reviews_row_limit after insert on public.reviews
  referencing new table as ins
  for each statement execute function public.reviews_row_limit();

-- ----- ai_cache: prune anonymous cached AI outputs older than 90 days.
create or replace function public.ai_cache_prune_expired() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.ai_cache where created_at < now() - interval '90 days';
  return null;
end
$$;
revoke execute on function public.ai_cache_prune_expired() from public, anon, authenticated;
drop trigger if exists ai_cache_prune_expired on public.ai_cache;
create trigger ai_cache_prune_expired after insert on public.ai_cache
  for each statement execute function public.ai_cache_prune_expired();

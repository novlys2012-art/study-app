-- Hardens ai_usage against two abuse vectors:
-- 1. Delete-account quota reset: dropping the ON DELETE CASCADE foreign key on ai_usage.user_id and adding an
--    irreversible SHA-256 account_key hash ensures deleting and recreating an account cannot erase monthly
--    or daily AI spending, while keeping zero PII in ai_usage after account deletion.
-- 2. Cache-hit flooding: cached = true rows have cost_usd = 0 and are only needed for the 1-minute rate-limit
--    window; a trigger prunes a user's cached rows older than 15 minutes whenever a new cached row is logged.

alter table public.ai_usage drop constraint if exists ai_usage_user_id_fkey;
alter table public.ai_usage add column if not exists account_key text check (account_key is null or account_key ~ '^[0-9a-f]{64}$');
create index if not exists ai_usage_account_key_time on public.ai_usage (account_key, created_at) where account_key is not null;

drop function if exists public.ai_spend(uuid);
drop function if exists public.ai_spend(uuid, text);
create function public.ai_spend(uid uuid, acct_key text default null)
returns table (user_month numeric, all_today numeric, user_minute bigint)
language sql stable security definer set search_path = ''
as $$
  select
    coalesce(sum(cost_usd) filter (where user_id = uid or (acct_key is not null and account_key = acct_key)), 0),
    coalesce(sum(cost_usd) filter (where created_at >= date_trunc('day', now())), 0),
    count(*) filter (where (user_id = uid or (acct_key is not null and account_key = acct_key)) and created_at >= now() - interval '1 minute')
  from public.ai_usage
  where created_at >= least(date_trunc('month', now()), now() - interval '1 minute');
$$;
revoke execute on function public.ai_spend(uuid, text) from public, anon, authenticated;
grant execute on function public.ai_spend(uuid, text) to service_role;

create or replace function public.ai_usage_prune_cached() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.ai_usage
  where (user_id = new.user_id or (new.account_key is not null and account_key = new.account_key))
    and cached = true
    and created_at < now() - interval '15 minutes';
  return null;
end
$$;
revoke execute on function public.ai_usage_prune_cached() from public, anon, authenticated;
drop trigger if exists ai_usage_prune_cached on public.ai_usage;
create trigger ai_usage_prune_cached after insert on public.ai_usage
  for each row when (new.cached) execute function public.ai_usage_prune_cached();

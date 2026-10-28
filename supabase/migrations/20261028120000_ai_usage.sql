-- One row per AI call, so every account's spending can be capped and shown.
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  task text not null,
  model text not null,
  input_tokens integer not null,
  output_tokens integer not null,
  cost_usd numeric(12, 6) not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_time on public.ai_usage (user_id, created_at);
create index if not exists ai_usage_time on public.ai_usage (created_at);

-- Students can read their own rows; only the server function (service role) writes.
alter table public.ai_usage enable row level security;
drop policy if exists "read own usage" on public.ai_usage;
create policy "read own usage" on public.ai_usage for select to authenticated using ((select auth.uid()) = user_id);

-- This month's spending for one account, and today's spending for the whole app (UTC).
create or replace function public.ai_spend(uid uuid)
returns table (user_month numeric, all_today numeric)
language sql stable security definer set search_path = ''
as $$
  select
    coalesce(sum(cost_usd) filter (where user_id = uid), 0),
    coalesce(sum(cost_usd) filter (where created_at >= date_trunc('day', now())), 0)
  from public.ai_usage
  where created_at >= date_trunc('month', now());
$$;
revoke execute on function public.ai_spend(uuid) from public, anon, authenticated;
grant execute on function public.ai_spend(uuid) to service_role;

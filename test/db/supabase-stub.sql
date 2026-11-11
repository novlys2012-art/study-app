-- The parts of a Supabase database the migrations rely on, for testing them on plain Postgres:
-- the anon, authenticated and service_role roles, auth.users, auth.uid(), and Supabase's default grants.
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key);
-- As in Supabase: the user id from the request's token.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true), current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), '')::uuid
$$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
-- Supabase gives these roles every right on new tables and functions in public; migrations must take them back.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

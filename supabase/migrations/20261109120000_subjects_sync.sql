-- The student's subjects (summaries, topics, questions, exam date) and quiz progress, so they survive
-- a cleared browser and follow the student to another device. The app keeps its own copy on the device
-- and syncs with these tables (src/cloud/sync.js). updated_at is the time of the change on the device.

create table if not exists public.subjects (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  -- The whole subject as the app stores it; null once deleted (the row stays so other devices learn of it).
  data jsonb check (data is null or pg_column_size(data) < 4000000),
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.progress (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id text not null check (char_length(subject_id) between 1 and 64),
  -- { questionId: { n: answers, c: right ones, l: 1 if the last one was right } }
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) < 1000000),
  updated_at timestamptz not null default now(),
  primary key (user_id, subject_id)
);

-- Each student reads and writes only their own rows.
alter table public.subjects enable row level security;
alter table public.progress enable row level security;

drop policy if exists "own subjects" on public.subjects;
create policy "own subjects" on public.subjects for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own progress" on public.progress;
create policy "own progress" on public.progress for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.subjects, public.progress from anon;
grant select, insert, update, delete on public.subjects, public.progress to authenticated;
grant all on public.subjects, public.progress to service_role;

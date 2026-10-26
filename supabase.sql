-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Stores every prediction the app makes (inputs + output) as verification evidence.

create table if not exists public.predictions (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  inputs jsonb not null,
  probability numeric(4,3) not null check (probability between 0 and 1),
  tier text not null check (tier in ('Low','Medium','High')),
  action text not null,
  model_version text not null
);

alter table public.predictions enable row level security;

-- The public app may only ADD rows. It cannot read, change or delete them.
-- Your team reads the rows in the Supabase dashboard (Table Editor).
create policy "app can insert predictions"
  on public.predictions for insert
  to anon
  with check (true);

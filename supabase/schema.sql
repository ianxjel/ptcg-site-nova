-- Run this once in the Supabase SQL editor to create the sign-ups table.
create table if not exists public.signups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_id text not null,
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 200),
  player_id text check (player_id is null or char_length(player_id) <= 20),
  division text not null default 'Masters' check (division in ('Junior', 'Senior', 'Masters'))
);

alter table public.signups enable row level security;

-- Visitors can add a sign-up but can never read, edit or delete them.
-- You see the list in the Supabase dashboard (Table Editor > signups).
create policy "Anyone can sign up"
  on public.signups for insert
  to anon
  with check (true);

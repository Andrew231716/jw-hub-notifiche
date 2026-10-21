-- JW Hub Notifiche schema

create extension if not exists "pgcrypto";

create table if not exists public.jw_updates (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  title text not null,
  category text,
  published_date date,
  image_url text,
  description text,
  first_seen_at timestamptz not null default now(),
  notified boolean not null default false,
  read boolean not null default false
);

create table if not exists public.jw_fetch_log (
  id uuid primary key default gen_random_uuid(),
  fetched_at timestamptz not null default now(),
  new_count integer not null default 0,
  status text not null default 'success',
  error_message text
);

create index if not exists jw_updates_published_date_idx
  on public.jw_updates (published_date desc nulls last, first_seen_at desc);

alter table public.jw_updates enable row level security;
alter table public.jw_fetch_log enable row level security;

create policy "Public read jw_updates"
  on public.jw_updates for select
  using (true);

create policy "Public update read flag"
  on public.jw_updates for update
  using (true)
  with check (true);

create policy "Public read jw_fetch_log"
  on public.jw_fetch_log for select
  using (true);

-- Service role (edge function) inserts via bypass / service key.
-- Optional: allow anon insert only from edge function using service role.

alter publication supabase_realtime add table public.jw_updates;

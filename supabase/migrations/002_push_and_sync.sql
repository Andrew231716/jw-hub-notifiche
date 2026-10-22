-- Push subscriptions + device sync (optional Supabase backend)

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  subscription jsonb not null,
  device_id text,
  language text not null default 'it',
  categories jsonb not null default '{}'::jsonb,
  quiet_hours_enabled boolean not null default false,
  quiet_start text not null default '22:00',
  quiet_end text not null default '07:00',
  frequency text not null default 'instant',
  updated_at timestamptz not null default now()
);

create table if not exists public.device_sync (
  code text primary key,
  device_id text,
  read_ids jsonb not null default '[]'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  updates jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
alter table public.device_sync enable row level security;

-- Service role / edge functions manage writes; anon can upsert own sync code.
create policy "sync read by code"
  on public.device_sync for select using (true);

create policy "sync upsert"
  on public.device_sync for insert with check (true);

create policy "sync update"
  on public.device_sync for update using (true) with check (true);

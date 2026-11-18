create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z]{4}-[0-9]{2}$'),
  host_name text not null check (char_length(host_name) between 1 and 30),
  host_avatar text not null default 'sparkles',
  host_token_hash text not null,
  amount_cents integer check (amount_cents > 0),
  currency char(3) not null default 'COP',
  status text not null default 'waiting' check (status in ('waiting', 'ready', 'playing', 'finished', 'closed')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  room_code text not null references public.rooms(code) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  avatar text not null default 'sparkles',
  token_hash text not null,
  is_host boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (room_code, name)
);

create table if not exists public.game_events (
  id uuid primary key default gen_random_uuid(),
  room_code text not null references public.rooms(code) on delete cascade,
  type text not null check (type in ('split', 'roulette', 'dice_tie', 'dice_result')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists rooms_expires_at_idx on public.rooms(expires_at);
create index if not exists participants_room_code_idx on public.participants(room_code);
create index if not exists game_events_room_code_created_at_idx on public.game_events(room_code, created_at desc);

-- Permite volver a ejecutar el archivo en proyectos creados antes del evento "split".
alter table public.game_events drop constraint if exists game_events_type_check;
alter table public.game_events add constraint game_events_type_check
  check (type in ('split', 'roulette', 'dice_tie', 'dice_result'));

alter table public.rooms drop constraint if exists rooms_status_check;
alter table public.rooms add constraint rooms_status_check
  check (status in ('waiting', 'ready', 'playing', 'finished', 'closed'));

create or replace function public.cleanup_expired_rooms()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare deleted_count integer;
begin
  delete from public.rooms where expires_at < now() or (status = 'closed' and updated_at < now() - interval '1 hour');
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_expired_rooms() from public;
grant execute on function public.cleanup_expired_rooms() to service_role;

alter table public.rooms enable row level security;
alter table public.participants enable row level security;
alter table public.game_events enable row level security;

-- No se crean políticas públicas: únicamente el backend usa la service role.
-- Ejecutar periódicamente desde Supabase Cron:
-- select public.cleanup_expired_rooms();

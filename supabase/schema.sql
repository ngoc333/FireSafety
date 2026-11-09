-- Run in Supabase SQL Editor. All app records are user-scoped.
-- The internal C# worker uses service-role credentials ONLY on its server.
create table if not exists public.fs_profiles (
  owner_uid uuid primary key references auth.users(id) on delete cascade,
  employee_id text not null, full_name text not null, dept_name text, factory_code text
);
create table if not exists public.fs_locations (
  owner_uid uuid not null references auth.users(id) on delete cascade,
  key text not null, data jsonb not null, primary key(owner_uid,key)
);
create table if not exists public.fs_items (
  owner_uid uuid not null references auth.users(id) on delete cascade,
  key text not null, data jsonb not null, primary key(owner_uid,key)
);
create table if not exists public.fs_countermeasures (
  owner_uid uuid not null references auth.users(id) on delete cascade,
  key text not null, data jsonb not null, primary key(owner_uid,key)
);
create table if not exists public.fs_schedules (
  owner_uid uuid not null references auth.users(id) on delete cascade,
  key text not null, data jsonb not null, primary key(owner_uid,key)
);
create table if not exists public.fs_repairs (
  owner_uid uuid not null references auth.users(id) on delete cascade,
  key text not null, data jsonb not null, primary key(owner_uid,key)
);
create table if not exists public.fs_events (
  id uuid primary key,
  owner_uid uuid not null references auth.users(id) on delete cascade,
  kind text not null check(kind in ('inspection','repair')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text
);
create index if not exists idx_fs_events_pending on public.fs_events(created_at) where processed_at is null;
alter table public.fs_profiles enable row level security;
alter table public.fs_locations enable row level security;
alter table public.fs_items enable row level security;
alter table public.fs_countermeasures enable row level security;
alter table public.fs_schedules enable row level security;
alter table public.fs_repairs enable row level security;
alter table public.fs_events enable row level security;

-- Clients may read their scoped bootstrap. No direct public writes to master.
drop policy if exists fs_profiles_read on public.fs_profiles;
create policy fs_profiles_read on public.fs_profiles for select to authenticated using(owner_uid=auth.uid());
drop policy if exists fs_locations_read on public.fs_locations;
create policy fs_locations_read on public.fs_locations for select to authenticated using(owner_uid=auth.uid());
drop policy if exists fs_items_read on public.fs_items;
create policy fs_items_read on public.fs_items for select to authenticated using(owner_uid=auth.uid());
drop policy if exists fs_countermeasures_read on public.fs_countermeasures;
create policy fs_countermeasures_read on public.fs_countermeasures for select to authenticated using(owner_uid=auth.uid());
drop policy if exists fs_schedules_read on public.fs_schedules;
create policy fs_schedules_read on public.fs_schedules for select to authenticated using(owner_uid=auth.uid());
drop policy if exists fs_repairs_read on public.fs_repairs;
create policy fs_repairs_read on public.fs_repairs for select to authenticated using(owner_uid=auth.uid());

-- No client-facing fs_events policy: inserts occur via Edge Function and a
-- narrowly defined SECURITY DEFINER RPC; worker uses service role.
create or replace function public.fs_submit_event(
  p_id uuid, p_kind text, p_payload jsonb
) returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Unauthorized'; end if;
  if p_kind not in ('inspection','repair') then raise exception 'Invalid event type'; end if;
  if octet_length(p_payload::text)>65536 then raise exception 'Payload too large'; end if;
  if p_payload->>'id' is distinct from p_id::text
    then raise exception 'Event ID mismatch'; end if;
  if p_payload->>'employeeId' is distinct from
    (select employee_id from public.fs_profiles where owner_uid=v_uid)
    then raise exception 'Employee mismatch'; end if;
  insert into public.fs_events(id,owner_uid,kind,payload)
    values (p_id,v_uid,p_kind,p_payload)
    on conflict(id) do nothing;
  if not exists(select 1 from public.fs_events where id=p_id and owner_uid=v_uid and kind=p_kind and payload=p_payload)
    then raise exception 'Conflicting event ID'; end if;
  return true;
end $$;
revoke all on function public.fs_submit_event(uuid,text,jsonb) from public, anon;
grant execute on function public.fs_submit_event(uuid,text,jsonb) to authenticated;

-- =============================================================================
-- Cloud9 Fulfilment — Task Timer
-- Migration 0001: Schema, Enums, Indexes, Views, Triggers & RLS
-- =============================================================================

-- Provide auth schema & uid() compatibility when running in standalone Postgres / PGlite
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  encrypted_password text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    nullif(current_setting('app.current_user_id', true), '')::uuid
  );
$$ language sql stable;

-- Enums
do $$ begin
  create type role as enum ('operative','supervisor','admin','client_viewer');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type entry_source as enum ('scan','typed','picked','crew','manual');
exception when duplicate_object then null;
end $$;

-- =============================================================================
-- Tables (all with UUID PKs, created_at, updated_at)
-- =============================================================================

create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role role not null default 'operative',
  pin_hash text,                 -- operatives only
  hourly_cost numeric(8,2),      -- admin-only via RLS
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  rounding_minutes int not null default 0,   -- 0 = exact; 5/10/15 = round UP per entry for billing
  billable_default boolean not null default true,
  baseline_status text not null default 'learning',
  baseline_approved boolean not null default false,
  baseline_approved_by uuid references users(id),
  baseline_approved_at timestamptz,
  baseline_notes text,
  manager_target_delegated boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists task_types (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete restrict,
  is_standard boolean not null default false,
  category text not null default 'Fulfilment',
  name text not null,
  code text not null,
  rounding_minutes int,           -- nullable; when set (0/5/10/15), supersedes client rounding_minutes
  standard_minutes numeric(8,2),  -- nullable; null = no standard yet
  unit_label text,                -- e.g. 'units', 'orders', 'pallets'; null = no units
  billable boolean not null default true,
  rate numeric(8,2),              -- per hour, nullable
  barcode text,                   -- scan value that starts this task; unique when present
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, code)
);

create unique index if not exists task_types_barcode_idx
  on task_types(barcode)
  where barcode is not null;

create table if not exists time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete restrict,
  client_id uuid not null references clients(id) on delete restrict,
  task_type_id uuid not null references task_types(id) on delete restrict,
  order_ref text,
  started_at timestamptz not null,
  ended_at timestamptz,            -- null = running
  units int,
  billable boolean not null,
  source entry_source not null,
  crew_id uuid,                    -- shared across entries started together
  created_by uuid not null references users(id) on delete restrict,
  auto_stopped boolean not null default false,
  note text,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists one_running_entry_per_user
  on time_entries(user_id)
  where ended_at is null;

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete restrict,
  clock_in timestamptz not null,
  clock_out timestamptz,
  auto_closed boolean not null default false,
  reviewed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists one_open_attendance_per_user
  on attendance(user_id)
  where clock_out is null;

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references time_entries(id) on delete cascade,
  changed_by uuid not null references users(id) on delete restrict,
  changed_at timestamptz not null default now(),
  field text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists target_change_requests (
  id uuid primary key default gen_random_uuid(),
  task_type_id uuid not null references task_types(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  current_standard_minutes numeric(8,2),
  proposed_standard_minutes numeric(8,2) not null,
  observed_pace numeric(8,2),
  variance_percent numeric(6,2),
  sample_runs int not null default 0,
  sample_units int not null default 0,
  operatives_count int not null default 0,
  reason text not null,
  status text not null default 'pending',
  requested_by uuid not null references users(id) on delete restrict,
  reviewed_by uuid references users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists settings (
  id uuid not null default gen_random_uuid(),
  key text primary key,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  filter_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================================================
-- Public View: users_public (excludes hourly_cost and pin_hash)
-- =============================================================================

create or replace view users_public as
  select
    id,
    display_name,
    role,
    active,
    created_at,
    updated_at
  from users;

-- =============================================================================
-- Triggers
-- =============================================================================

-- 1. Automatic updated_at maintenance
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_users_updated_at on users;
create trigger trg_users_updated_at before update on users for each row execute function set_updated_at();

drop trigger if exists trg_clients_updated_at on clients;
create trigger trg_clients_updated_at before update on clients for each row execute function set_updated_at();

drop trigger if exists trg_task_types_updated_at on task_types;
create trigger trg_task_types_updated_at before update on task_types for each row execute function set_updated_at();

drop trigger if exists trg_time_entries_updated_at on time_entries;
create trigger trg_time_entries_updated_at before update on time_entries for each row execute function set_updated_at();

drop trigger if exists trg_attendance_updated_at on attendance;
create trigger trg_attendance_updated_at before update on attendance for each row execute function set_updated_at();

drop trigger if exists trg_settings_updated_at on settings;
create trigger trg_settings_updated_at before update on settings for each row execute function set_updated_at();

drop trigger if exists trg_saved_views_updated_at on saved_views;
create trigger trg_saved_views_updated_at before update on saved_views for each row execute function set_updated_at();

-- 2. Validate client_id on time_entries matches task_types.client_id (unless task is a global standard task)
create or replace function check_time_entry_client_matches_task() returns trigger as $$
declare
  v_task_exists boolean;
  v_task_client_id uuid;
  v_is_standard boolean;
begin
  select true, client_id, coalesce(is_standard, false)
    into v_task_exists, v_task_client_id, v_is_standard
  from task_types
  where id = new.task_type_id;

  if not coalesce(v_task_exists, false) then
    raise exception 'Task type % does not exist', new.task_type_id;
  end if;

  if not v_is_standard and v_task_client_id is not null and v_task_client_id <> new.client_id then
    raise exception 'client_id (%) on time_entries must match task_types.client_id (%)', new.client_id, v_task_client_id;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_check_time_entry_client on time_entries;
create trigger trg_check_time_entry_client
  before insert or update of client_id, task_type_id on time_entries
  for each row execute function check_time_entry_client_matches_task();

-- 3. Enforce operative update restrictions at the DB level
-- Operatives can only update ended_at and units (plus last_activity_at) on their own running entry.
-- They cannot update stopped entries.
create or replace function enforce_operative_entry_rules() returns trigger as $$
declare
  v_actor_id uuid;
  v_actor_role role;
begin
  v_actor_id := auth.uid();
  if v_actor_id is not null then
    select u.role into v_actor_role from users u where u.id = v_actor_id;
    if v_actor_role = 'operative' then
      if old.user_id <> v_actor_id then
        raise exception 'Operatives may only update their own time entries';
      end if;
      if old.ended_at is not null then
        raise exception 'Operatives cannot edit a time entry after it has been stopped';
      end if;
      if new.user_id is distinct from old.user_id
         or new.client_id is distinct from old.client_id
         or new.task_type_id is distinct from old.task_type_id
         or new.order_ref is distinct from old.order_ref
         or new.started_at is distinct from old.started_at
         or new.billable is distinct from old.billable
         or new.source is distinct from old.source
         or new.crew_id is distinct from old.crew_id
         or new.created_by is distinct from old.created_by
         or new.auto_stopped is distinct from old.auto_stopped
         or new.note is distinct from old.note then
        raise exception 'Operatives may only update ended_at and units on a running entry';
      end if;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_enforce_operative_entry_rules on time_entries;
create trigger trg_enforce_operative_entry_rules
  before update on time_entries
  for each row execute function enforce_operative_entry_rules();

-- 4. Write one audit_events row per changed field on every update to time_entries
create or replace function audit_time_entries_changes() returns trigger as $$
declare
  v_changed_by uuid;
begin
  v_changed_by := coalesce(auth.uid(), new.created_by, new.user_id);

  if old.client_id is distinct from new.client_id then
    insert into audit_events (entry_id, changed_by, field, old_value, new_value)
    values (new.id, v_changed_by, 'client_id', old.client_id::text, new.client_id::text);
  end if;

  if old.task_type_id is distinct from new.task_type_id then
    insert into audit_events (entry_id, changed_by, field, old_value, new_value)
    values (new.id, v_changed_by, 'task_type_id', old.task_type_id::text, new.task_type_id::text);
  end if;

  if old.order_ref is distinct from new.order_ref then
    insert into audit_events (entry_id, changed_by, field, old_value, new_value)
    values (new.id, v_changed_by, 'order_ref', old.order_ref, new.order_ref);
  end if;

  if old.started_at is distinct from new.started_at then
    insert into audit_events (entry_id, changed_by, field, old_value, new_value)
    values (new.id, v_changed_by, 'started_at', old.started_at::text, new.started_at::text);
  end if;

  if old.ended_at is distinct from new.ended_at then
    insert into audit_events (entry_id, changed_by, field, old_value, new_value)
    values (new.id, v_changed_by, 'ended_at', old.ended_at::text, new.ended_at::text);
  end if;

  if old.units is distinct from new.units then
    insert into audit_events (entry_id, changed_by, field, old_value, new_value)
    values (new.id, v_changed_by, 'units', old.units::text, new.units::text);
  end if;

  if old.billable is distinct from new.billable then
    insert into audit_events (entry_id, changed_by, field, old_value, new_value)
    values (new.id, v_changed_by, 'billable', old.billable::text, new.billable::text);
  end if;

  if old.source is distinct from new.source then
    insert into audit_events (entry_id, changed_by, field, old_value, new_value)
    values (new.id, v_changed_by, 'source', old.source::text, new.source::text);
  end if;

  if old.auto_stopped is distinct from new.auto_stopped then
    insert into audit_events (entry_id, changed_by, field, old_value, new_value)
    values (new.id, v_changed_by, 'auto_stopped', old.auto_stopped::text, new.auto_stopped::text);
  end if;

  if old.note is distinct from new.note then
    insert into audit_events (entry_id, changed_by, field, old_value, new_value)
    values (new.id, v_changed_by, 'note', old.note, new.note);
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_audit_time_entries on time_entries;
create trigger trg_audit_time_entries
  after update on time_entries
  for each row execute function audit_time_entries_changes();

-- =============================================================================
-- Row Level Security (RLS)
-- =============================================================================

alter table users enable row level security;
alter table clients enable row level security;
alter table task_types enable row level security;
alter table time_entries enable row level security;
alter table attendance enable row level security;
alter table audit_events enable row level security;
alter table settings enable row level security;
alter table saved_views enable row level security;

-- Helper function to look up the current user's role without recursion
create or replace function current_user_role() returns role as $$
  select u.role from users u where u.id = auth.uid();
$$ language sql security definer stable;

-- users table: only admins can read full users rows (which include hourly_cost and pin_hash)
-- Non-admins read from users_public view
drop policy if exists users_admin_all on users;
create policy users_admin_all on users
  for all
  using (current_user_role() = 'admin')
  with check (current_user_role() = 'admin');

-- clients table: readable by all authenticated users, editable by admin
drop policy if exists clients_read_all on clients;
create policy clients_read_all on clients
  for select
  using (auth.uid() is not null);

drop policy if exists clients_admin_write on clients;
create policy clients_admin_write on clients
  for all
  using (current_user_role() = 'admin')
  with check (current_user_role() = 'admin');

-- task_types table: readable by all authenticated users, editable by admin
drop policy if exists task_types_read_all on task_types;
create policy task_types_read_all on task_types
  for select
  using (auth.uid() is not null);

drop policy if exists task_types_admin_write on task_types;
create policy task_types_admin_write on task_types
  for all
  using (current_user_role() = 'admin')
  with check (current_user_role() = 'admin');

-- time_entries policies:
-- Operatives can view own entries, insert for themselves, and update own running entry.
-- Supervisors and admins can view, insert, and update all entries.
drop policy if exists time_entries_select on time_entries;
create policy time_entries_select on time_entries
  for select
  using (
    user_id = auth.uid()
    or current_user_role() in ('supervisor', 'admin')
  );

drop policy if exists time_entries_insert on time_entries;
create policy time_entries_insert on time_entries
  for insert
  with check (
    (user_id = auth.uid() and created_by = auth.uid())
    or current_user_role() in ('supervisor', 'admin')
  );

drop policy if exists time_entries_update_operative on time_entries;
create policy time_entries_update_operative on time_entries
  for update
  using (
    (user_id = auth.uid() and ended_at is null)
    or current_user_role() in ('supervisor', 'admin')
  )
  with check (
    user_id = auth.uid()
    or current_user_role() in ('supervisor', 'admin')
  );

-- attendance policies:
drop policy if exists attendance_select on attendance;
create policy attendance_select on attendance
  for select
  using (
    user_id = auth.uid()
    or current_user_role() in ('supervisor', 'admin')
  );

drop policy if exists attendance_insert on attendance;
create policy attendance_insert on attendance
  for insert
  with check (
    user_id = auth.uid()
    or current_user_role() in ('supervisor', 'admin')
  );

drop policy if exists attendance_update on attendance;
create policy attendance_update on attendance
  for update
  using (
    user_id = auth.uid()
    or current_user_role() in ('supervisor', 'admin')
  );

-- audit_events policies: supervisors and admins can read, trigger inserts
drop policy if exists audit_events_select on audit_events;
create policy audit_events_select on audit_events
  for select
  using (current_user_role() in ('supervisor', 'admin'));

drop policy if exists audit_events_insert on audit_events;
create policy audit_events_insert on audit_events
  for insert
  with check (true);

-- settings policies: readable by all authenticated users, editable by admin
drop policy if exists settings_select on settings;
create policy settings_select on settings
  for select
  using (auth.uid() is not null);

drop policy if exists settings_admin_write on settings;
create policy settings_admin_write on settings
  for all
  using (current_user_role() = 'admin')
  with check (current_user_role() = 'admin');

-- saved_views policies: per user
drop policy if exists saved_views_own on saved_views;
create policy saved_views_own on saved_views
  for all
  using (user_id = auth.uid() or current_user_role() = 'admin')
  with check (user_id = auth.uid() or current_user_role() = 'admin');

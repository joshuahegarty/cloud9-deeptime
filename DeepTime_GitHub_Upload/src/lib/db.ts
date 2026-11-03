import { PGlite } from '@electric-sql/pglite';
import { AsyncLocalStorage } from 'async_hooks';
import fs from 'fs';
import path from 'path';

export type DbTx = {
  query: <R = Record<string, any>>(sql: string, params?: any[]) => Promise<{ rows: R[] }>;
  exec: (sql: string) => Promise<void>;
};

const txStorage = new AsyncLocalStorage<DbTx>();

const globalForDb = globalThis as unknown as {
  __deeptimePgPromise?: Promise<PGlite>;
  __deeptimeMigratedV11?: boolean;
  __deeptimeMutex?: Promise<unknown>;
  __deeptimeRealtimeVersion?: number;
};

export function bumpRealtimeVersion(): number {
  globalForDb.__deeptimeRealtimeVersion = (globalForDb.__deeptimeRealtimeVersion ?? 1) + 1;
  return globalForDb.__deeptimeRealtimeVersion;
}

export function getRealtimeVersion(): number {
  return globalForDb.__deeptimeRealtimeVersion ?? 1;
}

const UPGRADE_AND_STANDARD_TASKS_SQL = `
  alter table task_types add column if not exists is_standard boolean not null default false;
  alter table task_types add column if not exists category text not null default 'Fulfilment';
  alter table task_types add column if not exists project_name text;
  alter table task_types add column if not exists project_color text default 'amber';
  alter table task_types add column if not exists rounding_minutes int;
  alter table task_types add column if not exists min_charge_minutes int default 0;
  alter table task_types add column if not exists billing_status text not null default 'needs_billed';
  alter table task_types add column if not exists require_units_on_close boolean not null default true;
  alter table time_entries add column if not exists billing_status text not null default 'needs_billed';
  alter table time_entries add column if not exists unbilled_reason text;
  alter table time_entries add column if not exists billing_review_status text not null default 'pending';
  alter table time_entries add column if not exists billing_review_note text;
  alter table task_types alter column client_id drop not null;
  alter table settings add column if not exists show_targets_to_operatives boolean not null default false;

  -- Assigned Tasks Queue (Supervisor delegates tasks to Operatives or Open Task Pool for the "Assigned to You" tab)
  create table if not exists assigned_tasks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references users(id) on delete cascade,
    client_id uuid not null references clients(id) on delete cascade,
    task_type_id uuid not null references task_types(id) on delete cascade,
    order_ref text,
    note text,
    assigned_by uuid references users(id) on delete set null,
    status text not null default 'pending',
    created_at timestamptz not null default now()
  );
  alter table assigned_tasks alter column user_id drop not null;

  -- Client Baseline and Two-Point Governance
  alter table clients add column if not exists baseline_status text not null default 'learning';
  alter table clients add column if not exists baseline_approved boolean not null default false;
  alter table clients add column if not exists baseline_approved_by uuid references users(id);
  alter table clients add column if not exists baseline_approved_at timestamptz;
  alter table clients add column if not exists baseline_notes text;
  alter table clients add column if not exists manager_target_delegated boolean not null default false;

  -- Target Change Requests for Two-Point Governance (Manager requests, Admin approves)
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

  -- Global F8 Bug Reports & Feature Requests
  create table if not exists feedback_reports (
    id uuid primary key default gen_random_uuid(),
    type text not null default 'bug',
    severity text not null default 'medium',
    title text not null,
    description text not null,
    page_path text not null default '/',
    reporter_user_id uuid references users(id) on delete set null,
    reporter_name text not null default 'Anonymous',
    reporter_role text not null default 'operative',
    status text not null default 'open',
    admin_note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

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

  -- Update categories on initial seeded client-specific tasks
  update task_types set category = 'Pick & Pack' where code in ('PDN-PICK', 'SCA-PICK');
  update task_types set category = 'Inbound / Goods-In' where code in ('PDN-GIN');
  update task_types set category = 'Kitting & Value Add' where code in ('PDN-KIT');
  update task_types set category = 'Returns' where code in ('SCA-RET');
  update task_types set category = 'Housekeeping' where code in ('SCA-REPL');
  update task_types set unit_label = 'units' where unit_label is null or trim(unit_label) = '';

  -- Seed Standard Tasks available across ALL clients (is_standard = true, client_id = null)
  insert into task_types (
    id, client_id, is_standard, category, name, code,
    standard_minutes, unit_label, require_units_on_close, billable, rate, barcode, sort_order, active
  ) values
    (
      '20000000-0000-0000-0000-000000000101',
      null,
      true,
      'Pick & Pack',
      'Standard Order Pick',
      'STD-PICK',
      1.50,
      'orders',
      false,
      true,
      24.00,
      'BC-STD-PICK',
      1,
      true
    ),
    (
      '20000000-0000-0000-0000-000000000106',
      null,
      true,
      'Pick & Pack',
      'Standard Order Pack',
      'STD-PACK',
      1.50,
      'orders',
      false,
      true,
      24.00,
      'BC-STD-PACK',
      2,
      true
    ),
    (
      '20000000-0000-0000-0000-000000000102',
      null,
      true,
      'Inbound / Goods-In',
      'Goods-In (Containers / Pallets / Boxes)',
      'STD-GOODSIN',
      10.00,
      'pallets',
      true,
      true,
      25.00,
      'BC-STD-GIN',
      3,
      true
    ),
    (
      '20000000-0000-0000-0000-000000000108',
      null,
      true,
      'Inbound / Goods-In',
      'Goods-In: Container Unload (De-Vanning)',
      'STD-GIN-CONT',
      90.00,
      'containers',
      true,
      true,
      26.00,
      'BC-STD-GIN-CONT',
      4,
      true
    ),
    (
      '20000000-0000-0000-0000-000000000109',
      null,
      true,
      'Inbound / Goods-In',
      'Goods-In: Pallet Receiving & Check-In',
      'STD-GIN-PAL',
      10.00,
      'pallets',
      true,
      true,
      25.00,
      'BC-STD-GIN-PAL',
      5,
      true
    ),
    (
      '20000000-0000-0000-0000-000000000110',
      null,
      true,
      'Inbound / Goods-In',
      'Goods-In: Boxes & Carton Receiving',
      'STD-GIN-BOX',
      1.50,
      'boxes',
      true,
      true,
      24.50,
      'BC-STD-GIN-BOX',
      6,
      true
    ),
    (
      '20000000-0000-0000-0000-000000000112',
      null,
      true,
      'Inbound / Goods-In',
      'Inbound Putaway to Racking / Pick Face',
      'STD-PUTAWAY',
      6.00,
      'pallets',
      true,
      true,
      24.50,
      'BC-STD-PUT',
      7,
      true
    ),
    (
      '20000000-0000-0000-0000-000000000103',
      null,
      true,
      'Outbound / Dispatch',
      'Pallet Wrap & Carrier Dispatch',
      'STD-DISPATCH',
      5.00,
      'pallets',
      true,
      true,
      24.00,
      'BC-STD-DISP',
      8,
      true
    ),
    (
      '20000000-0000-0000-0000-000000000111',
      null,
      true,
      'Outbound / Dispatch',
      'Pallet Build & Wrap',
      'STD-PALLET-BW',
      8.00,
      'pallets',
      true,
      true,
      25.00,
      'BC-STD-PALBW',
      9,
      true
    ),
    (
      '20000000-0000-0000-0000-000000000104',
      null,
      true,
      'Kitting & Value Add',
      'Rework, Relabelling & Barcoding',
      'STD-REWORK',
      1.00,
      'units',
      true,
      true,
      24.50,
      'BC-STD-RWK',
      10,
      true
    ),
    (
      '20000000-0000-0000-0000-000000000105',
      null,
      true,
      'Inventory',
      'Stock Take & Cycle Count',
      'STD-STOCK',
      0.50,
      'locations',
      true,
      true,
      23.00,
      'BC-STD-STK',
      11,
      true
    ),
    (
      '20000000-0000-0000-0000-000000000113',
      null,
      true,
      'Pick & Pack',
      'B2B / Wholesale Case & Master Carton Pick',
      'STD-B2B-PICK',
      1.20,
      'cartons',
      true,
      true,
      25.00,
      'BC-STD-B2B',
      12,
      true
    ),
    (
      '20000000-0000-0000-0000-000000000114',
      null,
      true,
      'Kitting & Value Add',
      'Kitting, Bundling & Multi-Pack Assembly',
      'STD-KITTING',
      2.00,
      'kits',
      true,
      true,
      25.50,
      'BC-STD-KIT',
      13,
      true
    ),
    (
      '20000000-0000-0000-0000-000000000115',
      null,
      true,
      'Returns',
      'Customer Returns Processing & Grading (RMA)',
      'STD-RETURNS',
      3.00,
      'returns',
      true,
      true,
      24.50,
      'BC-STD-RET',
      14,
      true
    ),
    (
      '20000000-0000-0000-0000-000000000116',
      null,
      true,
      'Inventory',
      'Quality Control (QC) & Batch Inspection',
      'STD-QC',
      2.00,
      'cartons',
      true,
      true,
      24.50,
      'BC-STD-QC',
      15,
      true
    ),
    (
      '20000000-0000-0000-0000-000000000117',
      null,
      true,
      'Outbound / Dispatch',
      'Container / Wagon Loading & Carrier Handover',
      'STD-LOAD',
      4.00,
      'pallets',
      true,
      true,
      25.00,
      'BC-STD-LOAD',
      16,
      true
    )
  on conflict (id) do nothing;

  -- Ensure Standard Order Pick is the #1 default task and never says "Pick & Pack"
  update task_types
  set name = 'Standard Order Pick', require_units_on_close = false, sort_order = 1
  where id = '20000000-0000-0000-0000-000000000101';

  update task_types
  set name = 'Standard Order Pack', require_units_on_close = false, sort_order = 2
  where id = '20000000-0000-0000-0000-000000000106';

  update task_types
  set name = 'Goods-In (Containers / Pallets / Boxes)', sort_order = 3
  where id = '20000000-0000-0000-0000-000000000102';

  update task_types
  set require_units_on_close = false
  where code in ('STD-PICK', 'STD-PACK');

  -- Seed Multi-Client & Alphabetical Clients
  insert into clients (id, name, code, rounding_minutes, billable_default, active) values
    ('10000000-0000-0000-0000-000000000000', 'Multi-Client / Consolidated', 'MULTI', 15, true, true),
    ('10000000-0000-0000-0000-000000000010', 'Apex Logistics', 'APEX', 15, true, true),
    ('10000000-0000-0000-0000-000000000011', 'British Botanicals', 'BBOT', 15, true, true),
    ('10000000-0000-0000-0000-000000000012', 'CCELL Direct', 'CCELL', 0, true, true),
    ('10000000-0000-0000-0000-000000000013', 'Direct Vapor Supplies', 'DVS', 15, true, true),
    ('10000000-0000-0000-0000-000000000014', 'EcoPack Solutions', 'ECO', 15, true, true),
    ('10000000-0000-0000-0000-000000000015', 'Green Smoke UK', 'GSMK', 0, true, true),
    ('10000000-0000-0000-0000-000000000016', 'Highland Herbal', 'HHLD', 15, true, true),
    ('10000000-0000-0000-0000-000000000017', 'KwikFulfil 3PL', 'KWIK', 15, true, true),
    ('10000000-0000-0000-0000-000000000018', 'Nordic Vapour', 'NORD', 0, true, true),
    ('10000000-0000-0000-0000-000000000019', 'Titan Distribution', 'TITN', 15, true, true),
    ('10000000-0000-0000-0000-000000000020', 'Urban Extract Co', 'UBEX', 15, true, true),
    ('10000000-0000-0000-0000-000000000021', 'Vanguard Packaging', 'VNG', 15, true, true),
    ('10000000-0000-0000-0000-000000000022', 'Zenith Health Labs', 'ZNTH', 15, true, true)
  on conflict (id) do update set active = true;

  -- Add bespoke sample tasks for Apex and CCELL Direct so switching clients shows distinct custom tasks
  insert into task_types (
    id, client_id, is_standard, category, name, code,
    standard_minutes, unit_label, billable, rate, barcode, sort_order, active
  ) values
    (
      '20000000-0000-0000-0000-000000000201',
      '10000000-0000-0000-0000-000000000010',
      false,
      'Pick & Pack',
      'Apex Bulky Carton Pick',
      'APEX-BULK',
      2.50,
      'cartons',
      true,
      26.00,
      'BC-APEX-BLK',
      1,
      true
    ),
    (
      '20000000-0000-0000-0000-000000000202',
      '10000000-0000-0000-0000-000000000012',
      false,
      'Kitting & Value Add',
      'CCELL Custom Foam Insert Assembly',
      'CCELL-FOAM',
      0.80,
      'units',
      true,
      28.00,
      'BC-CCELL-FOAM',
      1,
      true
    ),
    (
      '20000000-0000-0000-0000-000000000203',
      '10000000-0000-0000-0000-000000000012',
      false,
      'Pick & Pack',
      'CCELL Wholesale Pallet Pick',
      'CCELL-WHL',
      15.00,
      'pallets',
      true,
      30.00,
      'BC-CCELL-WHL',
      2,
      true
    )
  on conflict (id) do nothing;

  -- Seed Bespoke Project sub-tasks & Cloud9 Internal / Housekeeping standard task
  insert into task_types (
    id, client_id, is_standard, category, project_name, project_color, name, code,
    standard_minutes, unit_label, require_units_on_close, billable, billing_status, rate, barcode, sort_order, active
  ) values
    (
      '20000000-0000-0000-0000-000000000204',
      '10000000-0000-0000-0000-000000000012',
      false,
      'Kitting & Value Add',
      'FSDU Retail Display Build Project',
      'amber',
      'FSDU Stocking & Shelving',
      'CCELL-FSDU-STK',
      2.00,
      'FSDUs',
      true,
      true,
      'needs_billed',
      28.00,
      'BC-CCELL-FSDU2',
      3,
      true
    ),
    (
      '20000000-0000-0000-0000-000000000205',
      '10000000-0000-0000-0000-000000000012',
      false,
      'Kitting & Value Add',
      'FSDU Retail Display Build Project',
      'amber',
      'FSDU Cardboard & Waste Breakdown',
      'CCELL-FSDU-WST',
      1.00,
      'FSDUs',
      true,
      true,
      'needs_billed',
      25.00,
      'BC-CCELL-FSDU3',
      4,
      true
    ),
    (
      '20000000-0000-0000-0000-000000000301',
      null,
      true,
      'Housekeeping',
      null,
      null,
      'Replenishment (Pick-Face & Forward Locations)',
      'INT-REPLEN',
      null,
      'locations',
      false,
      false,
      'our_cost',
      0.00,
      'BC-INT-REPLEN',
      20,
      true
    ),
    (
      '20000000-0000-0000-0000-000000000107',
      null,
      true,
      'Housekeeping',
      null,
      null,
      'Warehouse Sweeping & Aisle Cleaning',
      'STD-CLEAN',
      null,
      'zones',
      false,
      false,
      'our_cost',
      0.00,
      'BC-STD-CLEAN',
      21,
      true
    ),
    (
      '20000000-0000-0000-0000-000000000302',
      null,
      true,
      'Housekeeping',
      null,
      null,
      'Cardboard Clean-Out & Baler Crushing',
      'INT-CARDBOARD',
      null,
      'bales',
      false,
      false,
      'our_cost',
      0.00,
      'BC-INT-CARDBOARD',
      22,
      true
    ),
    (
      '20000000-0000-0000-0000-000000000303',
      null,
      true,
      'Housekeeping',
      null,
      null,
      'Packing Bench Consumables Restock (Boxes, Tape, Void Fill)',
      'INT-CONSUMABLES',
      null,
      'benches',
      false,
      false,
      'our_cost',
      0.00,
      'BC-INT-CONSUM',
      23,
      true
    ),
    (
      '20000000-0000-0000-0000-000000000304',
      null,
      true,
      'Housekeeping',
      null,
      null,
      'Empty Pallet Sorting & Loading Bay Clear-Down',
      'INT-PALLETS',
      null,
      'pallets',
      false,
      false,
      'our_cost',
      0.00,
      'BC-INT-PALLETS',
      24,
      true
    ),
    (
      '20000000-0000-0000-0000-000000000305',
      null,
      true,
      'Housekeeping',
      null,
      null,
      'Forklift / MHE Daily Safety Check & Battery Swap',
      'INT-MHE',
      null,
      'checks',
      false,
      false,
      'our_cost',
      0.00,
      'BC-INT-MHE',
      25,
      true
    ),
    (
      '20000000-0000-0000-0000-000000000306',
      null,
      true,
      'Housekeeping',
      null,
      null,
      'Team Briefing, Shift Handover & Training',
      'INT-BRIEFING',
      null,
      'sessions',
      false,
      false,
      'our_cost',
      0.00,
      'BC-INT-BRIEF',
      26,
      true
    )
  on conflict (id) do nothing;

  update task_types
  set project_name = 'FSDU Retail Display Build Project', project_color = 'amber'
  where id in ('20000000-0000-0000-0000-000000000202', '20000000-0000-0000-0000-000000000003')
    and project_name is null;

  -- Cloud9 Team Roster, Role Tags (job_title), Team Tags (team_name), and Core Warehouse Team flag
  alter table users add column if not exists job_title text;
  alter table users add column if not exists team_name text;
  alter table users add column if not exists is_core_warehouse boolean not null default false;

  drop view if exists users_public;
  create view users_public as
    select
      id,
      display_name,
      role,
      job_title,
      team_name,
      coalesce(is_core_warehouse, false) as is_core_warehouse,
      active,
      created_at,
      updated_at
    from users;

  -- Seed / Update Cloud9 Auth Users (17 Staff Members)
  insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values
    ('00000000-0000-0000-0000-000000000001', 'pin-00000000-0000-0000-0000-000000000001@internal.local', '1111', '{"display_name":"Erica","role":"operative"}'::jsonb),
    ('00000000-0000-0000-0000-000000000002', 'pin-00000000-0000-0000-0000-000000000002@internal.local', '2222', '{"display_name":"Sam","role":"operative"}'::jsonb),
    ('00000000-0000-0000-0000-000000000003', 'pin-00000000-0000-0000-0000-000000000003@internal.local', '3333', '{"display_name":"Alex","role":"operative"}'::jsonb),
    ('00000000-0000-0000-0000-000000000004', 'mark@cloud9fulfilment.co.uk', 'password123', '{"display_name":"Mark","role":"supervisor"}'::jsonb),
    ('00000000-0000-0000-0000-000000000005', 'josh@cloud9fulfilment.co.uk', 'password123', '{"display_name":"Josh","role":"admin"}'::jsonb),
    ('00000000-0000-0000-0000-000000000006', 'edna@cloud9fulfilment.co.uk', 'password123', '{"display_name":"Edna","role":"supervisor"}'::jsonb),
    ('00000000-0000-0000-0000-000000000007', 'pin-00000000-0000-0000-0000-000000000007@internal.local', '1004', '{"display_name":"Mason","role":"operative"}'::jsonb),
    ('00000000-0000-0000-0000-000000000008', 'pin-00000000-0000-0000-0000-000000000008@internal.local', '1005', '{"display_name":"Ben","role":"operative"}'::jsonb),
    ('00000000-0000-0000-0000-000000000009', 'pin-00000000-0000-0000-0000-000000000009@internal.local', '1006', '{"display_name":"Jess","role":"operative"}'::jsonb),
    ('00000000-0000-0000-0000-000000000010', 'pin-00000000-0000-0000-0000-000000000010@internal.local', '1007', '{"display_name":"Sabine","role":"operative"}'::jsonb),
    ('00000000-0000-0000-0000-000000000011', 'pin-00000000-0000-0000-0000-000000000011@internal.local', '1008', '{"display_name":"Dan Igel","role":"operative"}'::jsonb),
    ('00000000-0000-0000-0000-000000000012', 'pin-00000000-0000-0000-0000-000000000012@internal.local', '1009', '{"display_name":"Billy","role":"operative"}'::jsonb),
    ('00000000-0000-0000-0000-000000000013', 'pin-00000000-0000-0000-0000-000000000013@internal.local', '1010', '{"display_name":"Mike","role":"operative"}'::jsonb),
    ('00000000-0000-0000-0000-000000000014', 'pin-00000000-0000-0000-0000-000000000014@internal.local', '1011', '{"display_name":"Ray","role":"operative"}'::jsonb),
    ('00000000-0000-0000-0000-000000000015', 'pin-00000000-0000-0000-0000-000000000015@internal.local', '1012', '{"display_name":"Adrian","role":"operative"}'::jsonb),
    ('00000000-0000-0000-0000-000000000016', 'pin-00000000-0000-0000-0000-000000000016@internal.local', '1013', '{"display_name":"Danny","role":"operative"}'::jsonb),
    ('00000000-0000-0000-0000-000000000017', 'pin-00000000-0000-0000-0000-000000000017@internal.local', '1014', '{"display_name":"Ashton","role":"operative"}'::jsonb)
  on conflict (id) do update set
    email = excluded.email,
    encrypted_password = excluded.encrypted_password,
    raw_user_meta_data = excluded.raw_user_meta_data;

  -- Seed / Update Cloud9 Application Users (17 Staff Members with Role Tags & Team Tags)
  insert into users (id, display_name, role, job_title, team_name, is_core_warehouse, pin_hash, hourly_cost, active) values
    -- Core Warehouse Operatives (Erica, Sam, Alex, Mason)
    ('00000000-0000-0000-0000-000000000001', 'Erica', 'operative', 'Warehouse Operative', 'Core Warehouse Team', true, '1111', 12.50, true),
    ('00000000-0000-0000-0000-000000000002', 'Sam', 'operative', 'Warehouse Operative', 'Core Warehouse Team', true, '2222', 12.80, true),
    ('00000000-0000-0000-0000-000000000003', 'Alex', 'operative', 'Warehouse Operative', 'Core Warehouse Team', true, '3333', 13.00, true),
    ('00000000-0000-0000-0000-000000000007', 'Mason', 'operative', 'Warehouse Operative', 'Core Warehouse Team', true, '1004', 12.80, true),
    -- Core Warehouse Supervisors (Mark, Edna)
    ('00000000-0000-0000-0000-000000000004', 'Mark', 'supervisor', 'Warehouse Supervisor', 'Core Warehouse Team', true, '4444', 16.50, true),
    ('00000000-0000-0000-0000-000000000006', 'Edna', 'supervisor', 'Warehouse Supervisor', 'Core Warehouse Team', true, '4445', 16.50, true),
    -- CEO, Builder & Admin (Josh)
    ('00000000-0000-0000-0000-000000000005', 'Josh', 'admin', 'CEO, Builder & Admin', 'Executive & Leadership', false, '9999', 25.00, true),
    -- CCELL Specialist Operative (Ben)
    ('00000000-0000-0000-0000-000000000008', 'Ben', 'operative', 'CCELL Operative', 'CCELL', false, '1005', 13.00, true),
    -- Warehouse Operatives (Jess, Sabine)
    ('00000000-0000-0000-0000-000000000009', 'Jess', 'operative', 'Warehouse Operative', 'Warehouse Team', false, '1006', 12.50, true),
    ('00000000-0000-0000-0000-000000000010', 'Sabine', 'operative', 'Warehouse Operative', 'Warehouse Team', false, '1007', 12.50, true),
    -- People & Operations / Cross-Department Warehouse Operatives
    ('00000000-0000-0000-0000-000000000011', 'Dan Igel', 'operative', 'Head of People & Operations', 'People & Operations', false, '1008', 18.00, true),
    ('00000000-0000-0000-0000-000000000012', 'Billy', 'operative', 'Operations', 'Operations', false, '1009', 15.00, true),
    -- Sales (Warehouse Support Operatives: Mike, Ray)
    ('00000000-0000-0000-0000-000000000013', 'Mike', 'operative', 'Sales', 'Sales', false, '1010', 15.00, true),
    ('00000000-0000-0000-0000-000000000014', 'Ray', 'operative', 'Sales (Warehouse Support)', 'Sales', false, '1011', 15.00, true),
    -- Marketing & Innovations (Warehouse Operatives: Adrian, Danny, Ashton)
    ('00000000-0000-0000-0000-000000000015', 'Adrian', 'operative', 'Marketing & Innovations', 'Marketing & Innovations', false, '1012', 14.50, true),
    ('00000000-0000-0000-0000-000000000016', 'Danny', 'operative', 'Marketing & Innovations', 'Marketing & Innovations', false, '1013', 14.50, true),
    ('00000000-0000-0000-0000-000000000017', 'Ashton', 'operative', 'Marketing & Innovations', 'Marketing & Innovations', false, '1014', 14.50, true)
  on conflict (id) do update set
    display_name = excluded.display_name,
    role = excluded.role,
    job_title = excluded.job_title,
    team_name = excluded.team_name,
    is_core_warehouse = excluded.is_core_warehouse,
    pin_hash = excluded.pin_hash,
    active = excluded.active;

  -- Seed initial Supervisor-Assigned tasks for Erica so "Assigned to You" tab works out of the box
  insert into assigned_tasks (id, user_id, client_id, task_type_id, order_ref, note, assigned_by, status)
  values
    (
      '70000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000012',
      '20000000-0000-0000-0000-000000000202',
      'PO-CCELL-884',
      'Priority morning FSDU build batch (50 units)',
      '00000000-0000-0000-0000-000000000004',
      'pending'
    ),
    (
      '70000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000002',
      'CONT-PDN-402',
      'Inbound container bay 2',
      '00000000-0000-0000-0000-000000000004',
      'pending'
    ),
    (
      '70000000-0000-0000-0000-000000000003',
      null,
      '10000000-0000-0000-0000-000000000014',
      '20000000-0000-0000-0000-000000000103',
      'URG-ECO-991',
      'OPEN POOL GRAB: Urgent 4-pallet courier dispatch at Bay 4 before 16:00 collection',
      '00000000-0000-0000-0000-000000000004',
      'pending'
    )
  on conflict (id) do nothing;
`;

async function applySchemaAndSeed(pg: PGlite, includeSeed = true, includeStandardTasks = true) {
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '0001_schema_rls_triggers.sql');
  const schemaSql = fs.readFileSync(migrationPath, 'utf8');
  await pg.exec(schemaSql);

  if (includeSeed) {
    const existing = await pg.query<{ count: string }>('select count(*)::text as count from clients');
    const count = parseInt(existing.rows[0]?.count ?? '0', 10);
    if (count === 0) {
      const seedPath = path.join(process.cwd(), 'supabase', 'seed.sql');
      const seedSql = fs.readFileSync(seedPath, 'utf8');
      await pg.exec(seedSql);
    }
  }

  if (includeStandardTasks) {
    await pg.exec(UPGRADE_AND_STANDARD_TASKS_SQL);
  }
}

export async function getDb(): Promise<PGlite> {
  if (!globalForDb.__deeptimePgPromise) {
    globalForDb.__deeptimePgPromise = (async () => {
      const dataDir =
        process.env.PGLITE_DATA_DIR || path.join(process.cwd(), '.data', 'pglite');
      fs.mkdirSync(dataDir, { recursive: true });
      const pg = new PGlite(dataDir);
      await pg.waitReady;
      await applySchemaAndSeed(pg, true, true);
      globalForDb.__deeptimeMigratedV11 = true;
      return pg;
    })();
  } else if (!globalForDb.__deeptimeMigratedV11) {
    const pg = await globalForDb.__deeptimePgPromise;
    await pg.exec(UPGRADE_AND_STANDARD_TASKS_SQL);
    globalForDb.__deeptimeMigratedV11 = true;
  }
  return globalForDb.__deeptimePgPromise;
}

/**
 * Create an isolated in-memory Postgres database with the full Supabase schema,
 * RLS, triggers, and optional seed data for automated database testing.
 */
export async function createTestDb(includeSeed = true): Promise<PGlite> {
  const pg = new PGlite();
  await pg.waitReady;
  await applySchemaAndSeed(pg, includeSeed, true);
  return pg;
}

/**
 * Execute a callback inside a serialized transaction with `app.current_user_id` set
 * so `auth.uid()`, RLS policies, and audit triggers identify the acting user accurately.
 * Re-entrant safe via AsyncLocalStorage.
 */
export async function withDbSession<T>(
  actorUserId: string | null,
  fn: (tx: DbTx) => Promise<T>,
  customPg?: PGlite
): Promise<T> {
  const activeTx = txStorage.getStore();
  if (activeTx && !customPg) {
    return fn(activeTx);
  }

  const run = async (): Promise<T> => {
    const pg = customPg ?? (await getDb());
    return pg.transaction(async (tx) => {
      await tx.query(`select set_config('app.current_user_id', $1, true)`, [actorUserId ?? '']);
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [actorUserId ?? '']);

      const wrappedTx: DbTx = {
        query: async <R = Record<string, any>>(sql: string, params?: any[]) => {
          const res = await tx.query<R>(sql, params);
          return { rows: res.rows };
        },
        exec: async (sql: string) => {
          await tx.exec(sql);
        },
      };

      return txStorage.run(wrappedTx, () => fn(wrappedTx));
    });
  };

  if (customPg) {
    return run();
  }

  const prev = globalForDb.__deeptimeMutex ?? Promise.resolve();
  const next = prev.then(run, run);
  globalForDb.__deeptimeMutex = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

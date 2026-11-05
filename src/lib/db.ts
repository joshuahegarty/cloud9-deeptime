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
  __deeptimeMigratedV20?: boolean;
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
  alter table task_types add column if not exists target_enabled boolean not null default true;
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
    attachments jsonb not null default '[]'::jsonb,
    updates_log jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  alter table feedback_reports add column if not exists attachments jsonb not null default '[]'::jsonb;
  alter table feedback_reports add column if not exists updates_log jsonb not null default '[]'::jsonb;
  alter table feedback_reports add column if not exists device_type text;

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
      false
    ),
    (
      '20000000-0000-0000-0000-000000000118',
      null,
      true,
      'Kitting & Value Add',
      'Barcoding',
      'STD-BARCODING',
      0.50,
      'units',
      true,
      true,
      24.50,
      'BC-STD-BARCODE',
      7,
      true
    )
  on conflict (id) do nothing;

  -- Enforce exact Standard Warehouse Tasks list & order requested by Josh:
  -- 1. Order Pick
  -- 2. Order Pack
  -- 3. Goods In (Containers, Pallets, Boxes)
  -- 4. Put Away
  -- 5. B2B Pick
  -- 6. Rework
  -- 7. Barcoding
  -- 8. Returns Processing
  -- 9. Stock Take
  -- 10. QC Inspection
  update task_types
  set name = 'Order Pick', require_units_on_close = false, target_enabled = false, sort_order = 1, active = true
  where id = '20000000-0000-0000-0000-000000000101';

  update task_types
  set name = 'Order Pack', require_units_on_close = false, target_enabled = false, sort_order = 2, active = true
  where id = '20000000-0000-0000-0000-000000000106';

  update task_types
  set name = 'Goods In (Containers, Pallets, Boxes)', sort_order = 3, active = true
  where id = '20000000-0000-0000-0000-000000000102';

  update task_types
  set name = 'Put Away', sort_order = 4, active = true
  where id = '20000000-0000-0000-0000-000000000112';

  update task_types
  set name = 'B2B Pick', sort_order = 5, active = true
  where id = '20000000-0000-0000-0000-000000000113';

  update task_types
  set name = 'Rework', sort_order = 6, active = true
  where id = '20000000-0000-0000-0000-000000000104';

  update task_types
  set name = 'Barcoding', sort_order = 7, active = true
  where id = '20000000-0000-0000-0000-000000000118';

  update task_types
  set name = 'Returns Processing', sort_order = 8, active = true
  where id = '20000000-0000-0000-0000-000000000115';

  update task_types
  set name = 'Stock Take', sort_order = 9, active = true
  where id = '20000000-0000-0000-0000-000000000105';

  update task_types
  set name = 'QC Inspection', sort_order = 10, active = true
  where id = '20000000-0000-0000-0000-000000000116';

  -- Deactivate removed standard tasks so only the 10 standard warehouse tasks (plus Goods-In sub-tasks) appear
  update task_types
  set active = false
  where code in ('STD-DISPATCH', 'STD-PALLET-BW', 'STD-KITTING', 'STD-LOAD');

  update task_types
  set require_units_on_close = false, target_enabled = false
  where code in ('STD-PICK', 'STD-PACK');

  -- Seed Multi-Client & Official Cloud9 Customer Roster (61 Customers + Multi-Client)
  insert into clients (id, name, code, rounding_minutes, billable_default, active) values
    ('10000000-0000-0000-0000-000000000000', 'Multi-Client / Consolidated', 'MULTI', 15, true, true),
    ('10000000-0000-0000-0000-000000000010', 'Apex Logistics', 'APEX', 15, true, false),
    ('10000000-0000-0000-0000-000000000011', 'British Botanicals', 'BBOT', 15, true, false),
    ('10000000-0000-0000-0000-000000000012', 'Ccell', 'CCELL', 0, true, true),
    ('10000000-0000-0000-0000-000000000013', 'Direct Vapor Supplies', 'DVS', 15, true, false),
    ('10000000-0000-0000-0000-000000000014', 'EcoPack Solutions', 'ECO', 15, true, false),
    ('10000000-0000-0000-0000-000000000015', 'Green Smoke UK', 'GSMK', 0, true, false),
    ('10000000-0000-0000-0000-000000000016', 'Highland Herbal', 'HHLD', 15, true, false),
    ('10000000-0000-0000-0000-000000000017', 'KwikFulfil 3PL', 'KWIK', 15, true, false),
    ('10000000-0000-0000-0000-000000000018', 'Nordic Vapour', 'NORD', 0, true, false),
    ('10000000-0000-0000-0000-000000000019', 'Titan Distribution', 'TITN', 15, true, false),
    ('10000000-0000-0000-0000-000000000020', 'Urban Extract Co.', 'UBEX', 15, true, false),
    ('10000000-0000-0000-0000-000000000021', 'Vanguard Packaging', 'VNG', 15, true, false),
    ('10000000-0000-0000-0000-000000000022', 'Zenith Health Labs', 'ZNTH', 15, true, false),
    ('10000000-0000-0000-0000-000000000101', 'Armfit Store', 'ARMF', 15, true, true),
    ('10000000-0000-0000-0000-000000000102', 'Coroflo', 'CORO', 15, true, true),
    ('10000000-0000-0000-0000-000000000103', 'Avionaut', 'AVIO', 15, true, true),
    ('10000000-0000-0000-0000-000000000104', 'Back To The Office', 'BTTO', 15, true, true),
    ('10000000-0000-0000-0000-000000000105', 'Be Her Co.', 'BHCO', 15, true, true),
    ('10000000-0000-0000-0000-000000000106', 'Beddoes', 'BEDD', 15, true, true),
    ('10000000-0000-0000-0000-000000000107', 'Bentolabs', 'BENT', 15, true, true),
    ('10000000-0000-0000-0000-000000000108', 'Bigfoot Basketball', 'BIGF', 15, true, true),
    ('10000000-0000-0000-0000-000000000109', 'Blue Crow Media', 'BCMD', 15, true, true),
    ('10000000-0000-0000-0000-000000000110', 'Capsicolle', 'CAPS', 15, true, true),
    ('10000000-0000-0000-0000-000000000112', 'Cell Sync', 'CSYN', 15, true, true),
    ('10000000-0000-0000-0000-000000000113', 'CPOMS Systems Limited', 'CPOM', 15, true, true),
    ('10000000-0000-0000-0000-000000000114', 'Dirty Stop Outs', 'DSOU', 15, true, true),
    ('10000000-0000-0000-0000-000000000115', 'Dope Ropes', 'DOPE', 15, true, true),
    ('10000000-0000-0000-0000-000000000116', 'Falkland Island Spirits', 'FISP', 15, true, true),
    ('10000000-0000-0000-0000-000000000117', 'Fight Aesthetic', 'FAES', 15, true, true),
    ('10000000-0000-0000-0000-000000000118', 'Filamentive', 'FILA', 15, true, true),
    ('10000000-0000-0000-0000-000000000119', 'Floship - Loop Mount', 'FLM', 15, true, true),
    ('10000000-0000-0000-0000-000000000120', 'Floship - RN Chikadashi', 'FRNC', 15, true, true),
    ('10000000-0000-0000-0000-000000000121', 'Folium Hair', 'FOLI', 15, true, true),
    ('10000000-0000-0000-0000-000000000122', 'Gallop Shop', 'GALL', 15, true, true),
    ('10000000-0000-0000-0000-000000000123', 'Genuine Terpenes', 'GTER', 15, true, true),
    ('10000000-0000-0000-0000-000000000124', 'Gilo International', 'GILO', 15, true, true),
    ('10000000-0000-0000-0000-000000000125', 'Goat Pets', 'GOAT', 15, true, true),
    ('10000000-0000-0000-0000-000000000126', 'Grubby', 'GRUB', 15, true, true),
    ('10000000-0000-0000-0000-000000000127', 'Gumnuts', 'GUMN', 15, true, true),
    ('10000000-0000-0000-0000-000000000128', 'Gymgrl', 'GYMG', 15, true, true),
    ('10000000-0000-0000-0000-000000000129', 'Haute Dogs', 'HAUT', 15, true, true),
    ('10000000-0000-0000-0000-000000000130', 'Identity Merchandise', 'IDMR', 15, true, true),
    ('10000000-0000-0000-0000-000000000131', 'Intelligent Lilli', 'ILIL', 15, true, true),
    ('10000000-0000-0000-0000-000000000132', 'Island Wine Store', 'IWST', 15, true, true),
    ('10000000-0000-0000-0000-000000000133', 'Jay Birmingham Hair UK', 'JBHU', 15, true, true),
    ('10000000-0000-0000-0000-000000000134', 'Klonari', 'KLON', 15, true, true),
    ('10000000-0000-0000-0000-000000000135', 'Lipera', 'LIPE', 15, true, true),
    ('10000000-0000-0000-0000-000000000136', 'Lunaro Brands', 'LUNA', 15, true, true),
    ('10000000-0000-0000-0000-000000000137', 'Luvele UK Limited', 'LUVE', 15, true, true),
    ('10000000-0000-0000-0000-000000000138', 'Mytii', 'MYTI', 15, true, true),
    ('10000000-0000-0000-0000-000000000139', 'Nackt Limited', 'NACK', 15, true, true),
    ('10000000-0000-0000-0000-000000000140', 'Naybal Beauty', 'NAYB', 15, true, true),
    ('10000000-0000-0000-0000-000000000141', 'Nightingale Hospice', 'NGHT', 15, true, true),
    ('10000000-0000-0000-0000-000000000142', 'Noggin Braincare', 'NOGG', 15, true, true),
    ('10000000-0000-0000-0000-000000000143', 'Norden Beauty', 'NRDB', 15, true, true),
    ('10000000-0000-0000-0000-000000000144', 'Oak And Olivo', 'OAKO', 15, true, true),
    ('10000000-0000-0000-0000-000000000145', 'Onesonic Audio Technologies', 'ONES', 15, true, true),
    ('10000000-0000-0000-0000-000000000146', 'Porij', 'PORI', 15, true, true),
    ('10000000-0000-0000-0000-000000000147', 'Sage And Paige', 'SAGE', 15, true, true),
    ('10000000-0000-0000-0000-000000000148', 'Shane Cooper', 'SHCO', 15, true, true),
    ('10000000-0000-0000-0000-000000000149', 'Slipdoctors', 'SLIP', 15, true, true),
    ('10000000-0000-0000-0000-000000000150', 'Slumba London', 'SLUM', 15, true, true),
    ('10000000-0000-0000-0000-000000000151', 'So Wood', 'SOWD', 15, true, true),
    ('10000000-0000-0000-0000-000000000152', 'Sproushi', 'SPRO', 15, true, true),
    ('10000000-0000-0000-0000-000000000153', 'Squelch Marketplace', 'SQCH', 15, true, true),
    ('10000000-0000-0000-0000-000000000154', 'The Shopfloor Project', 'SHPF', 15, true, true),
    ('10000000-0000-0000-0000-000000000155', 'Tritan BP', 'TRBP', 15, true, true),
    ('10000000-0000-0000-0000-000000000156', 'Urban Publishing', 'URBP', 15, true, true),
    ('10000000-0000-0000-0000-000000000157', 'Velari Brands', 'VELA', 15, true, true),
    ('10000000-0000-0000-0000-000000000158', 'Vet Relieve', 'VETR', 15, true, true),
    ('10000000-0000-0000-0000-000000000159', 'Vitali Life Ltd', 'VITA', 15, true, true),
    ('10000000-0000-0000-0000-000000000160', 'We Got One Holdings', 'WGOH', 15, true, true),
    ('10000000-0000-0000-0000-000000000161', 'XLN', 'XLN', 15, true, true),
    ('10000000-0000-0000-0000-000000000162', 'Zilch Formula', 'ZLCH', 15, true, true)
  on conflict (id) do update set
    name = excluded.name,
    code = excluded.code,
    active = excluded.active;

  -- Deactivate legacy demo placeholder clients (Peak District Nutrition & Steel City Apparel) so only official Cloud9 customers appear in active selectors
  do $$
  begin
    if not exists (select 1 from settings where key = 'cloud9_customers_roster_v1') then
      update clients
      set active = false
      where id in (
        '10000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000010',
        '10000000-0000-0000-0000-000000000011',
        '10000000-0000-0000-0000-000000000013',
        '10000000-0000-0000-0000-000000000014',
        '10000000-0000-0000-0000-000000000015',
        '10000000-0000-0000-0000-000000000016',
        '10000000-0000-0000-0000-000000000017',
        '10000000-0000-0000-0000-000000000018',
        '10000000-0000-0000-0000-000000000019',
        '10000000-0000-0000-0000-000000000020',
        '10000000-0000-0000-0000-000000000021',
        '10000000-0000-0000-0000-000000000022'
      );
      insert into settings (key, value) values ('cloud9_customers_roster_v1', 'true'::jsonb)
      on conflict (key) do nothing;
    end if;
  end $$;

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

  -- Enforce exact Cloud9 Housekeeping Tasks requested by Josh on initial setup, while preserving subsequent supervisor/admin edits:
  do $$
  begin
    if not exists (select 1 from settings where key = 'housekeeping_tasks_initialized') then
      -- Remove Warehouse Floor Sweep & Replen (SCA-REPL)
      update task_types set active = false where code = 'SCA-REPL';

      -- Keep these 7 Cloud9 Housekeeping Tasks with clean names:
      update task_types
      set name = 'Replenishment', category = 'Housekeeping', is_standard = true, client_id = null, billable = false, billing_status = 'our_cost', require_units_on_close = false, sort_order = 20, active = true
      where code = 'INT-REPLEN';

      update task_types
      set name = 'Warehouse Sweeping & Aisle Cleaning', category = 'Housekeeping', is_standard = true, client_id = null, billable = false, billing_status = 'our_cost', require_units_on_close = false, sort_order = 21, active = true
      where code = 'STD-CLEAN';

      update task_types
      set name = 'Cardboard Cleanout', category = 'Housekeeping', is_standard = true, client_id = null, billable = false, billing_status = 'our_cost', require_units_on_close = false, sort_order = 22, active = true
      where code = 'INT-CARDBOARD';

      update task_types
      set name = 'Packing Bench & Consumables Restock', category = 'Housekeeping', is_standard = true, client_id = null, billable = false, billing_status = 'our_cost', require_units_on_close = false, sort_order = 23, active = true
      where code = 'INT-CONSUMABLES';

      update task_types
      set name = 'Empty Pallet Sorting & Loading', category = 'Housekeeping', is_standard = true, client_id = null, billable = false, billing_status = 'our_cost', require_units_on_close = false, sort_order = 24, active = true
      where code = 'INT-PALLETS';

      update task_types
      set name = 'Forklift & Safety Check', category = 'Housekeeping', is_standard = true, client_id = null, billable = false, billing_status = 'our_cost', require_units_on_close = false, sort_order = 25, active = true
      where code = 'INT-MHE';

      update task_types
      set name = 'Team Briefing, Shift Handover & Training', category = 'Housekeeping', is_standard = true, client_id = null, billable = false, billing_status = 'our_cost', require_units_on_close = false, sort_order = 26, active = true
      where code = 'INT-BRIEFING';

      insert into settings (key, value) values ('housekeeping_tasks_initialized', 'true'::jsonb)
      on conflict (key) do nothing;
    end if;
  end $$;

  insert into settings (key, value) values ('helm_api_url', '"https://api.myhelm.app"'::jsonb)
  on conflict (key) do nothing;
  insert into settings (key, value) values ('helm_auto_sync', 'true'::jsonb)
  on conflict (key) do nothing;

  update task_types
  set project_name = 'FSDU Retail Display Build Project', project_color = 'amber'
  where id in ('20000000-0000-0000-0000-000000000202', '20000000-0000-0000-0000-000000000003')
    and project_name is null;

  -- Cloud9 Team Roster, Role Tags (job_title), Team Tags (team_name), Email, Must Change PIN, Hands-Free Voice Mode, and Core Warehouse Team flag
  alter table users add column if not exists job_title text;
  alter table users add column if not exists team_name text;
  alter table users add column if not exists is_core_warehouse boolean not null default false;
  alter table users add column if not exists email text;
  alter table users add column if not exists must_change_pin boolean not null default false;
  alter table users add column if not exists hands_free_voice_enabled boolean not null default false;

  drop view if exists users_public;
  create view users_public as
    select
      id,
      display_name,
      role,
      job_title,
      team_name,
      coalesce(is_core_warehouse, false) as is_core_warehouse,
      email,
      coalesce(must_change_pin, false) as must_change_pin,
      coalesce(hands_free_voice_enabled, false) as hands_free_voice_enabled,
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
    raw_user_meta_data = excluded.raw_user_meta_data;

  -- Seed / Update Cloud9 Application Users (17 Staff Members with single clean Role Tag, Email & Hands-Free Voice default ON only for Josh)
  insert into users (id, display_name, role, job_title, team_name, is_core_warehouse, email, hands_free_voice_enabled, pin_hash, hourly_cost, active) values
    ('00000000-0000-0000-0000-000000000004', 'Mark', 'supervisor', 'Supervisor • Core Warehouse', 'Core Warehouse Team', true, 'mark@cloud9fulfilment.co.uk', false, '4444', 16.50, true),
    ('00000000-0000-0000-0000-000000000006', 'Edna', 'supervisor', 'Supervisor • Core Warehouse', 'Core Warehouse Team', true, 'edna@cloud9fulfilment.co.uk', false, '4445', 16.50, true),
    ('00000000-0000-0000-0000-000000000001', 'Erica', 'operative', 'Core Warehouse Operative', 'Core Warehouse Team', true, 'erica@cloud9fulfilment.co.uk', false, '1111', 12.50, true),
    ('00000000-0000-0000-0000-000000000002', 'Sam', 'operative', 'Core Warehouse Operative', 'Core Warehouse Team', true, 'sam@cloud9fulfilment.co.uk', false, '2222', 12.80, true),
    ('00000000-0000-0000-0000-000000000003', 'Alex', 'operative', 'Core Warehouse Operative', 'Core Warehouse Team', true, 'alex@cloud9fulfilment.co.uk', false, '3333', 13.00, true),
    ('00000000-0000-0000-0000-000000000007', 'Mason', 'operative', 'Core Warehouse Operative', 'Core Warehouse Team', true, 'mason@cloud9fulfilment.co.uk', false, '1004', 12.80, true),
    ('00000000-0000-0000-0000-000000000005', 'Josh', 'admin', 'CEO, Builder & Admin', 'Executive & Leadership', false, 'josh@cloud9fulfilment.co.uk', true, '9999', 25.00, true),
    ('00000000-0000-0000-0000-000000000008', 'Ben', 'operative', 'CCELL Operative', 'CCELL', false, 'ben@cloud9fulfilment.co.uk', false, '1005', 13.00, true),
    ('00000000-0000-0000-0000-000000000009', 'Jess', 'operative', 'Warehouse Operative', 'Warehouse Team', false, 'jess@cloud9fulfilment.co.uk', false, '1006', 12.50, true),
    ('00000000-0000-0000-0000-000000000010', 'Sabine', 'operative', 'Warehouse Operative', 'Warehouse Team', false, 'sabine@cloud9fulfilment.co.uk', false, '1007', 12.50, true),
    ('00000000-0000-0000-0000-000000000011', 'Dan Igel', 'operative', 'Head of People & Operations', 'People & Operations', false, 'dan.igel@cloud9fulfilment.co.uk', false, '1008', 18.00, true),
    ('00000000-0000-0000-0000-000000000012', 'Billy', 'operative', 'Operations', 'Operations', false, 'billy@cloud9fulfilment.co.uk', false, '1009', 15.00, true),
    ('00000000-0000-0000-0000-000000000013', 'Mike', 'operative', 'Sales', 'Sales', false, 'mike@cloud9fulfilment.co.uk', false, '1010', 15.00, true),
    ('00000000-0000-0000-0000-000000000014', 'Ray', 'operative', 'Sales • Warehouse Operative', 'Sales', false, 'ray@cloud9fulfilment.co.uk', false, '1011', 15.00, true),
    ('00000000-0000-0000-0000-000000000015', 'Adrian', 'operative', 'Marketing & Innovations', 'Marketing & Innovations', false, 'adrian@cloud9fulfilment.co.uk', false, '1012', 14.50, true),
    ('00000000-0000-0000-0000-000000000016', 'Danny', 'operative', 'Marketing & Innovations', 'Marketing & Innovations', false, 'danny@cloud9fulfilment.co.uk', false, '1013', 14.50, true),
    ('00000000-0000-0000-0000-000000000017', 'Ashton', 'operative', 'Marketing & Innovations', 'Marketing & Innovations', false, 'ashton@cloud9fulfilment.co.uk', false, '1014', 14.50, true)
  on conflict (id) do update set
    display_name = excluded.display_name,
    role = excluded.role,
    job_title = excluded.job_title,
    team_name = excluded.team_name,
    is_core_warehouse = excluded.is_core_warehouse,
    email = coalesce(users.email, excluded.email),
    pin_hash = coalesce(users.pin_hash, excluded.pin_hash),
    active = excluded.active;

  -- Ensure Josh defaults to hands_free_voice_enabled = true and everyone else = false on initial migration, while preserving any subsequent admin toggles
  do $$
  begin
    if not exists (select 1 from settings where key = 'hands_free_voice_initialized') then
      update users
      set hands_free_voice_enabled = case
        when id = '00000000-0000-0000-0000-000000000005' or lower(display_name) = 'josh' then true
        else false
      end;
      insert into settings (key, value) values ('hands_free_voice_initialized', 'true'::jsonb)
      on conflict (key) do nothing;
    end if;
  end $$;

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
      '10000000-0000-0000-0000-000000000105',
      '20000000-0000-0000-0000-000000000102',
      'CONT-BHCO-402',
      'Inbound container bay 2',
      '00000000-0000-0000-0000-000000000004',
      'pending'
    ),
    (
      '70000000-0000-0000-0000-000000000003',
      null,
      '10000000-0000-0000-0000-000000000101',
      '20000000-0000-0000-0000-000000000103',
      'URG-ARMF-991',
      'OPEN POOL GRAB: Urgent 4-pallet courier dispatch at Bay 4 before 16:00 collection',
      '00000000-0000-0000-0000-000000000004',
      'pending'
    )
  on conflict (id) do update set
    client_id = excluded.client_id,
    task_type_id = excluded.task_type_id,
    order_ref = excluded.order_ref;

  -- Seed initial Feature Requests & Bug Reports so the Feedback & Roadmap Board is populated out of the box
  insert into feedback_reports (
    id, type, severity, device_type, title, description, page_path,
    reporter_user_id, reporter_name, reporter_role, status, admin_note, updates_log
  ) values
    (
      '80000000-0000-0000-0000-000000000001',
      'feature',
      'high',
      null,
      '1-Click Manager Clock In/Out & Undo on Live Tally Counter',
      'Allow supervisors on the Floor page to clock staff in/out in 1 click, and add an Undo button on the +1/+5/+10 Live Tally counter.',
      '/floor',
      '00000000-0000-0000-0000-000000000005',
      'Josh',
      'admin',
      'resolved',
      'Shipped live — 1-click Clock In/Out added to Floor actions column and Undo button added to the Batch/Lap Counter.',
      '[{"id":"upd-1","author_name":"Josh","author_role":"admin","status":"resolved","note":"Shipped live — 1-click Clock In/Out added to Floor actions column and Undo button added to the Batch/Lap Counter.","created_at":"2026-11-03T21:18:00.000Z"}]'::jsonb
    ),
    (
      '80000000-0000-0000-0000-000000000002',
      'feature',
      'high',
      null,
      'Dispatch Cloud Helm Order Pick & Pack Integration',
      'Pull daily Order Pick and Order Pack counts automatically from Dispatch Cloud Helm so operatives never have to type order counts manually.',
      '/now',
      '00000000-0000-0000-0000-000000000005',
      'Josh',
      'admin',
      'resolved',
      'Shipped live — Connected Dispatch Cloud Helm API (https://api.myhelm.app /public-api/orders) with automatic Order Pick & Pack sync on task stop, 1-click Sync Helm WMS Orders, and Helm API settings in /setup/settings.',
      '[{"id":"upd-2","author_name":"Josh","author_role":"admin","status":"in_progress","note":"Phase 1 complete: disabled manual unit prompts and targets on Order Pick & Order Pack. Phase 2: connecting Dispatch Cloud Helm API.","created_at":"2026-11-03T21:10:00.000Z"},{"id":"upd-2b","author_name":"Josh","author_role":"admin","status":"resolved","note":"Shipped live — Connected Dispatch Cloud Helm API (https://api.myhelm.app) with automatic Order Pick & Pack sync on task stop, 1-click Sync Helm WMS Orders, and Helm API configuration in Setup > Settings.","created_at":"2026-11-05T12:20:00.000Z"}]'::jsonb
    ),
    (
      '80000000-0000-0000-0000-000000000003',
      'feature',
      'medium',
      null,
      'First-Time PIN Setup Email Invites for All Staff',
      'Send temporary PIN invites by email so staff members are prompted to choose their own 4-digit PIN the first time they sign in.',
      '/setup/users',
      '00000000-0000-0000-0000-000000000004',
      'Mark',
      'supervisor',
      'resolved',
      'Done — Temp PIN invite generator and first-login Change PIN modal are now live.',
      '[{"id":"upd-3","author_name":"Josh","author_role":"admin","status":"resolved","note":"Done — Temp PIN invite generator and first-login Change PIN modal are now live.","created_at":"2026-11-03T21:05:00.000Z"}]'::jsonb
    ),
    (
      '80000000-0000-0000-0000-000000000004',
      'feature',
      'medium',
      null,
      'V2 Roadmap: Spatial Floor Walking Telemetry & Warehouse Zone/Aisle Heatmaps',
      'Planned for V2: Overlay warehouse zone and aisle walking telemetry (Zones A–E, Goods-In Dock, Pick Tower Aisles, Pack Benches, FSDU Assembly, Bulk Dispatch) with live congestion & travel distance heatmaps.',
      '/floor',
      '00000000-0000-0000-0000-000000000005',
      'Josh',
      'admin',
      'planned',
      'Deferred from V1 to keep the V1 Floor view clean and focused; scheduled in the V2 Roadmap.',
      '[{"id":"upd-4","author_name":"Josh","author_role":"admin","status":"planned","note":"Deferred from V1 to keep the V1 Floor view clean and focused; scheduled in the V2 Roadmap.","created_at":"2026-11-03T23:21:00.000Z"}]'::jsonb
    ),
    (
      '2bd2f1b5-36b9-4bab-8da8-3fc5b8344c32',
      'feature',
      'medium',
      'desktop',
      'Under F8, Screenshot uploading feature needs to allow a simple pasting otpion for screenshots - at the moment, it requires me to ''save'' on my Desktop.',
      'This currently adds a lot of time and admin work to the bug and improvement reporting process.',
      '/now',
      '00000000-0000-0000-0000-000000000017',
      'Ashton',
      'operative',
      'resolved',
      'Shipped live — Added global Ctrl+V / Cmd+V screenshot paste anywhere while F8 is open, a 1-click "📋 Paste Screenshot from Clipboard" button, and drag-and-drop image support so screenshots never need to be saved to Desktop first.',
      '[{"id":"upd-ashton-1","author_name":"Josh","author_role":"admin","status":"resolved","note":"Shipped live — Added global Ctrl+V / Cmd+V screenshot paste anywhere while F8 is open, a 1-click Paste Screenshot from Clipboard button, and drag-and-drop image support.","created_at":"2026-11-05T12:20:00.000Z"}]'::jsonb
    ),
    (
      '4fe7b68e-1eac-4ba6-8ae9-575e78161f19',
      'feature',
      'medium',
      null,
      'Create options for ''Desktop'' ''Android Mobile'', ''iPhone'' and ''Scanner  to categorise bug and improvement reports.',
      'This will help the developer to know what device the UI issue is on. If it is a functional issue accross all devices, than no option is required to be selected.',
      '/now',
      '00000000-0000-0000-0000-000000000017',
      'Ashton',
      'operative',
      'resolved',
      'Shipped live — Added optional device category pills (Desktop, Android Mobile, iPhone, Scanner — or leave unselected for all devices) in F8 and on the /feedback Roadmap Board with device badges and filters.',
      '[{"id":"upd-ashton-2","author_name":"Josh","author_role":"admin","status":"resolved","note":"Shipped live — Added optional device category pills (Desktop, Android Mobile, iPhone, Scanner — or leave unselected for all devices) in F8 and on the /feedback Roadmap Board.","created_at":"2026-11-05T12:20:00.000Z"}]'::jsonb
    ),
    (
      '414da08d-ee1a-4027-a277-8b343b046df5',
      'bug',
      'medium',
      null,
      'At the moment it''s not working to be able to edit housekeeping tasks I need to add an edit and an ad button',
      'Add +',
      '/now',
      '00000000-0000-0000-0000-000000000004',
      'Mark',
      'supervisor',
      'resolved',
      'Shipped live — Added the Edit (pencil) button on every Cloud9 Housekeeping task card, the + button in the 2D section header, and the "Add Housekeeping Task +" card at the bottom of Step 2D.',
      '[{"id":"upd-mark-1","author_name":"Josh","author_role":"admin","status":"resolved","note":"Shipped live — Added the Edit (pencil) button on every Cloud9 Housekeeping task card, the + button in the 2D header bar, and the Add Housekeeping Task + card in Step 2D.","created_at":"2026-11-05T12:20:00.000Z"}]'::jsonb
    )
  on conflict (id) do update set
    status = excluded.status,
    admin_note = excluded.admin_note,
    device_type = coalesce(feedback_reports.device_type, excluded.device_type),
    updates_log = excluded.updates_log,
    updated_at = now();
`;

async function applySchemaAndSeed(pg: PGlite, includeSeed = true, includeStandardTasks = true) {
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '0001_schema_rls_triggers.sql');
  const schemaSql = fs.readFileSync(migrationPath, 'utf8');
  await pg.exec('drop view if exists users_public cascade;');
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
      globalForDb.__deeptimeMigratedV20 = true;
      return pg;
    })().catch((err) => {
      delete globalForDb.__deeptimePgPromise;
      throw err;
    });
  } else if (!globalForDb.__deeptimeMigratedV20) {
    const pg = await globalForDb.__deeptimePgPromise;
    await pg.exec(UPGRADE_AND_STANDARD_TASKS_SQL);
    globalForDb.__deeptimeMigratedV20 = true;
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

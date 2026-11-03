-- =============================================================================
-- Cloud9 Fulfilment — Task Timer
-- Seed Data: Settings, 2 Clients, 6 Task Types, 3 Operatives, 1 Supervisor, 1 Admin
-- =============================================================================

-- 1. Seed Settings
insert into settings (key, value) values
  ('idle_prompt_minutes', '60'::jsonb),
  ('idle_stop_minutes', '120'::jsonb),
  ('shift_end', '"18:00"'::jsonb),
  ('summary_time', '"18:00"'::jsonb),
  ('summary_recipients', '[]'::jsonb),
  ('timezone', '"Europe/London"'::jsonb)
on conflict (key) do nothing;

-- 2. Seed Auth Users
insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'pin-00000000-0000-0000-0000-000000000001@internal.local', '1111', '{"display_name":"Liam Grayson","role":"operative"}'::jsonb),
  ('00000000-0000-0000-0000-000000000002', 'pin-00000000-0000-0000-0000-000000000002@internal.local', '2222', '{"display_name":"Chloe Marsh","role":"operative"}'::jsonb),
  ('00000000-0000-0000-0000-000000000003', 'pin-00000000-0000-0000-0000-000000000003@internal.local', '3333', '{"display_name":"Tariq Mahmood","role":"operative"}'::jsonb),
  ('00000000-0000-0000-0000-000000000004', 'sarah@cloud9fulfilment.co.uk', 'password123', '{"display_name":"Sarah Jenkins","role":"supervisor"}'::jsonb),
  ('00000000-0000-0000-0000-000000000005', 'dan@cloud9fulfilment.co.uk', 'password123', '{"display_name":"Dan Hallam","role":"admin"}'::jsonb)
on conflict (id) do nothing;

-- 3. Seed Application Users
insert into users (id, display_name, role, pin_hash, hourly_cost, active) values
  ('00000000-0000-0000-0000-000000000001', 'Liam Grayson', 'operative', '1111', 12.50, true),
  ('00000000-0000-0000-0000-000000000002', 'Chloe Marsh', 'operative', '2222', 12.80, true),
  ('00000000-0000-0000-0000-000000000003', 'Tariq Mahmood', 'operative', '3333', 13.00, true),
  ('00000000-0000-0000-0000-000000000004', 'Sarah Jenkins', 'supervisor', '4444', 16.50, true),
  ('00000000-0000-0000-0000-000000000005', 'Dan Hallam', 'admin', '9999', 20.00, true)
on conflict (id) do nothing;

-- 4. Seed Clients (2 Clients)
insert into clients (id, name, code, rounding_minutes, billable_default, active) values
  ('10000000-0000-0000-0000-000000000001', 'Peak District Nutrition', 'PDN', 15, true, true),
  ('10000000-0000-0000-0000-000000000002', 'Steel City Apparel', 'SCA', 0, true, true)
on conflict (id) do nothing;

-- 5. Seed Task Types (6 Task Types: 3 per client)
insert into task_types (id, client_id, name, code, standard_minutes, unit_label, billable, rate, barcode, sort_order, active) values
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Pick & Pack D2C',
    'PDN-PICK',
    1.50,
    'orders',
    true,
    24.50,
    'BC-PDN-PICK',
    1,
    true
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'Goods-In Pallet Unload',
    'PDN-GIN',
    20.00,
    'pallets',
    true,
    26.00,
    'BC-PDN-GIN',
    2,
    true
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'Subscription Box Kitting',
    'PDN-KIT',
    2.00,
    'boxes',
    true,
    25.00,
    'BC-PDN-KIT',
    3,
    true
  ),
  (
    '20000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000002',
    'Garment Pick & Fold',
    'SCA-PICK',
    0.75,
    'units',
    true,
    23.50,
    'BC-SCA-PICK',
    1,
    true
  ),
  (
    '20000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000002',
    'Returns Inspection & Steam',
    'SCA-RET',
    3.00,
    'units',
    true,
    24.00,
    'BC-SCA-RET',
    2,
    true
  ),
  (
    '20000000-0000-0000-0000-000000000006',
    '10000000-0000-0000-0000-000000000002',
    'Warehouse Floor Sweep & Replen',
    'SCA-REPL',
    null,
    null,
    false,
    null,
    'BC-SCA-REPL',
    3,
    true
  )
on conflict (id) do nothing;

-- 6. Seed Today's Attendance & Sample Entries for immediate live Floor/Reports visibility
insert into attendance (id, user_id, clock_in, clock_out, auto_closed, reviewed) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', now() - interval '4 hours', null, false, false),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', now() - interval '3 hours 45 minutes', null, false, false),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', now() - interval '3 hours 30 minutes', null, false, false)
on conflict (id) do nothing;

insert into time_entries (
  id, user_id, client_id, task_type_id, order_ref,
  started_at, ended_at, units, billable, source, crew_id, created_by, auto_stopped, note, last_activity_at
) values
  -- Completed entries earlier today for Liam Grayson
  (
    '40000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    'ASN-8841',
    now() - interval '3 hours 50 minutes',
    now() - interval '2 hours 20 minutes',
    8,
    true,
    'scan',
    null,
    '00000000-0000-0000-0000-000000000001',
    false,
    'Morning container offload',
    now() - interval '2 hours 20 minutes'
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000003',
    'KIT-204',
    now() - interval '2 hours 10 minutes',
    now() - interval '45 minutes',
    45,
    true,
    'picked',
    null,
    '00000000-0000-0000-0000-000000000001',
    false,
    null,
    now() - interval '45 minutes'
  ),
  -- Currently running entry for Liam Grayson
  (
    '40000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'BATCH-912',
    now() - interval '38 minutes',
    null,
    null,
    true,
    'scan',
    null,
    '00000000-0000-0000-0000-000000000001',
    false,
    null,
    now() - interval '10 minutes'
  ),
  -- Completed entry earlier today for Chloe Marsh (auto-stopped example for supervisor visibility)
  (
    '40000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000005',
    'RET-551',
    now() - interval '3 hours 30 minutes',
    now() - interval '1 hour 25 minutes',
    42,
    true,
    'typed',
    null,
    '00000000-0000-0000-0000-000000000002',
    true,
    'Auto-stopped after idle threshold',
    now() - interval '1 hour 25 minutes'
  ),
  -- Currently running entry for Chloe Marsh (over 65 minutes so idle warning shows on Floor view)
  (
    '40000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000004',
    'WAVE-409',
    now() - interval '72 minutes',
    null,
    null,
    true,
    'picked',
    null,
    '00000000-0000-0000-0000-000000000002',
    false,
    null,
    now() - interval '72 minutes'
  ),
  -- Completed entry for Tariq Mahmood (currently clocked in with no active task -> shows as idle on Floor)
  (
    '40000000-0000-0000-0000-000000000006',
    '00000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000006',
    null,
    now() - interval '2 hours 30 minutes',
    now() - interval '1 hour 15 minutes',
    null,
    false,
    'picked',
    null,
    '00000000-0000-0000-0000-000000000003',
    false,
    'Aisle B & C pallet tidy',
    now() - interval '1 hour 15 minutes'
  )
on conflict (id) do nothing;

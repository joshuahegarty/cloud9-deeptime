import { withDbSession } from './db';
import {
  AppSettings,
  AssignedTask,
  Attendance,
  AuditEvent,
  Client,
  SavedView,
  TargetChangeRequest,
  TaskType,
  TimeEntry,
  UserAdmin,
  UserPublic,
} from './types';

export async function getSettings(actorUserId: string | null = null): Promise<AppSettings> {
  return withDbSession(actorUserId, async (tx) => {
    const res = await tx.query<{ key: string; value: any }>('select key, value from settings');
    const map: Record<string, any> = {};
    for (const row of res.rows) {
      map[row.key] = row.value;
    }
    return {
      idle_prompt_minutes: Number(map.idle_prompt_minutes ?? 60),
      idle_stop_minutes: Number(map.idle_stop_minutes ?? 120),
      shift_end: String(map.shift_end ?? '19:00').replace(/^"|"$/g, ''),
      summary_time: String(map.summary_time ?? '18:00').replace(/^"|"$/g, ''),
      summary_recipients: Array.isArray(map.summary_recipients) ? map.summary_recipients : [],
      timezone: String(map.timezone ?? 'Europe/London').replace(/^"|"$/g, ''),
      show_targets_to_operatives:
        map.show_targets_to_operatives === true ||
        map.show_targets_to_operatives === 'true',
    };
  });
}

export async function getActiveOperativesAndStaff(): Promise<UserPublic[]> {
  return withDbSession(null, async (tx) => {
    const res = await tx.query<UserPublic>(
      `select id, display_name, role, job_title, team_name, coalesce(is_core_warehouse, false) as is_core_warehouse, email, coalesce(must_change_pin, false) as must_change_pin, active, created_at::text, updated_at::text
       from users_public
       where active = true
       order by
         case
           when lower(display_name) = 'mark' then 1
           when lower(display_name) = 'edna' then 2
           when role = 'supervisor' then 3
           when lower(display_name) = 'erica' then 4
           when lower(display_name) = 'sam' then 5
           when lower(display_name) = 'alex' then 6
           when lower(display_name) = 'mason' then 7
           when coalesce(is_core_warehouse, false) = true then 8
           when role = 'admin' then 9
           else 20
         end,
         display_name asc`
    );
    return res.rows;
  });
}

export async function getActiveClients(actorUserId: string | null = null): Promise<Client[]> {
  return withDbSession(actorUserId, async (tx) => {
    const res = await tx.query<Client>(
      `select
         id, name, code, rounding_minutes, billable_default,
         coalesce(baseline_status, 'learning') as baseline_status,
         coalesce(baseline_approved, false) as baseline_approved,
         baseline_approved_by,
         baseline_approved_at::text,
         baseline_notes,
         coalesce(manager_target_delegated, false) as manager_target_delegated,
         active, created_at::text, updated_at::text
       from clients
       where active = true
       order by name asc`
    );
    return res.rows;
  });
}

export async function getAllClients(actorUserId: string | null = null): Promise<Client[]> {
  return withDbSession(actorUserId, async (tx) => {
    const res = await tx.query<Client>(
      `select
         id, name, code, rounding_minutes, billable_default,
         coalesce(baseline_status, 'learning') as baseline_status,
         coalesce(baseline_approved, false) as baseline_approved,
         baseline_approved_by,
         baseline_approved_at::text,
         baseline_notes,
         coalesce(manager_target_delegated, false) as manager_target_delegated,
         active, created_at::text, updated_at::text
       from clients
       order by name asc`
    );
    return res.rows;
  });
}

export async function getActiveTaskTypes(actorUserId: string | null = null): Promise<TaskType[]> {
  return withDbSession(actorUserId, async (tx) => {
    const res = await tx.query<TaskType>(
      `select
         t.id, t.client_id,
         coalesce(t.is_standard, false) as is_standard,
         coalesce(t.category, 'Fulfilment') as category,
         t.project_name,
         coalesce(t.project_color, 'amber') as project_color,
         coalesce(c.name, 'All Clients (Standard)') as client_name,
         coalesce(c.code, 'STD') as client_code,
         t.name, t.code,
         t.rounding_minutes,
         coalesce(t.min_charge_minutes, 0) as min_charge_minutes,
         t.standard_minutes::float8 as standard_minutes,
         coalesce(t.target_enabled, true) as target_enabled,
         t.unit_label,
         coalesce(t.require_units_on_close, true) as require_units_on_close,
         t.billable,
         coalesce(t.billing_status, case when t.billable = false then 'our_cost' else 'needs_billed' end) as billing_status,
         t.rate::float8 as rate,
         t.barcode, t.sort_order, t.active,
         t.created_at::text, t.updated_at::text
       from task_types t
       left join clients c on c.id = t.client_id
       where t.active = true and (t.is_standard = true or c.active = true)
       order by coalesce(t.is_standard, false) asc, c.name asc nulls last, t.sort_order asc, t.name asc`
    );
    return res.rows;
  });
}

export async function getAllTaskTypes(actorUserId: string | null = null): Promise<TaskType[]> {
  return withDbSession(actorUserId, async (tx) => {
    const res = await tx.query<TaskType>(
      `select
         t.id, t.client_id,
         coalesce(t.is_standard, false) as is_standard,
         coalesce(t.category, 'Fulfilment') as category,
         t.project_name,
         coalesce(t.project_color, 'amber') as project_color,
         coalesce(c.name, 'All Clients (Standard)') as client_name,
         coalesce(c.code, 'STD') as client_code,
         t.name, t.code,
         t.rounding_minutes,
         coalesce(t.min_charge_minutes, 0) as min_charge_minutes,
         t.standard_minutes::float8 as standard_minutes,
         coalesce(t.target_enabled, true) as target_enabled,
         t.unit_label,
         coalesce(t.require_units_on_close, true) as require_units_on_close,
         t.billable,
         coalesce(t.billing_status, case when t.billable = false then 'our_cost' else 'needs_billed' end) as billing_status,
         t.rate::float8 as rate,
         t.barcode, t.sort_order, t.active,
         t.created_at::text, t.updated_at::text
       from task_types t
       left join clients c on c.id = t.client_id
       order by coalesce(t.is_standard, false) asc, c.name asc nulls last, t.sort_order asc, t.name asc`
    );
    return res.rows;
  });
}

export async function getOperativeNowData(userId: string) {
  return withDbSession(userId, async (tx) => {
    // 1. Current running entry
    const runningRes = await tx.query<TimeEntry>(
      `select
         e.id, e.user_id, u.display_name as user_name,
         e.client_id, c.name as client_name, c.code as client_code,
         e.task_type_id, t.name as task_name, t.code as task_code,
         t.unit_label,
         coalesce(t.require_units_on_close, true) as require_units_on_close,
         coalesce(t.target_enabled, true) as target_enabled,
         case when coalesce(t.target_enabled, true) = false then null else t.standard_minutes::float8 end as standard_minutes,
         e.order_ref, e.started_at::text, e.ended_at::text,
         e.units, e.billable,
         coalesce(e.billing_status, case when e.billable = false then 'our_cost' else 'needs_billed' end) as billing_status,
         e.unbilled_reason,
         coalesce(e.billing_review_status, 'pending') as billing_review_status,
         e.billing_review_note,
         e.source, e.crew_id, e.created_by,
         e.auto_stopped, e.note, e.last_activity_at::text,
         e.created_at::text, e.updated_at::text
       from time_entries e
       join users_public u on u.id = e.user_id
       join clients c on c.id = e.client_id
       join task_types t on t.id = e.task_type_id
       where e.user_id = $1 and e.ended_at is null
       limit 1`,
      [userId]
    );

    // 2. Today's entries (Europe/London day)
    const todayEntriesRes = await tx.query<TimeEntry>(
      `select
         e.id, e.user_id, u.display_name as user_name,
         e.client_id, c.name as client_name, c.code as client_code,
         e.task_type_id, t.name as task_name, t.code as task_code,
         t.unit_label,
         coalesce(t.require_units_on_close, true) as require_units_on_close,
         coalesce(t.target_enabled, true) as target_enabled,
         case when coalesce(t.target_enabled, true) = false then null else t.standard_minutes::float8 end as standard_minutes,
         e.order_ref, e.started_at::text, e.ended_at::text,
         e.units, e.billable,
         coalesce(e.billing_status, case when e.billable = false then 'our_cost' else 'needs_billed' end) as billing_status,
         e.unbilled_reason,
         coalesce(e.billing_review_status, 'pending') as billing_review_status,
         e.billing_review_note,
         e.source, e.crew_id, e.created_by,
         e.auto_stopped, e.note, e.last_activity_at::text,
         e.created_at::text, e.updated_at::text
       from time_entries e
       join users_public u on u.id = e.user_id
       join clients c on c.id = e.client_id
       join task_types t on t.id = e.task_type_id
       where e.user_id = $1
         and (e.started_at at time zone 'Europe/London')::date = (now() at time zone 'Europe/London')::date
       order by e.started_at desc`,
      [userId]
    );

    // 3. Last 4 distinct (client, task) pairs used by this operative
    const recentTasksRes = await tx.query<TaskType>(
      `select
         sub.id, sub.client_id, sub.is_standard, sub.category,
         sub.project_name, sub.project_color,
         sub.client_name, sub.client_code,
         sub.name, sub.code, sub.standard_minutes, sub.unit_label,
         sub.require_units_on_close,
         sub.billable, sub.rate, sub.barcode, sub.sort_order, sub.active,
         sub.created_at, sub.updated_at
       from (
         select distinct on (e.client_id, t.id)
           t.id,
           e.client_id as client_id,
           coalesce(t.is_standard, false) as is_standard,
           coalesce(t.category, 'Fulfilment') as category,
           t.project_name,
           coalesce(t.project_color, 'amber') as project_color,
           c.name as client_name,
           c.code as client_code,
           t.name, t.code,
           t.standard_minutes::float8 as standard_minutes,
           t.unit_label,
           coalesce(t.require_units_on_close, true) as require_units_on_close,
           t.billable,
           t.rate::float8 as rate,
           t.barcode, t.sort_order, t.active,
           t.created_at::text as created_at, t.updated_at::text as updated_at,
           max(e.started_at) over (partition by e.client_id, t.id) as last_used
         from time_entries e
         join task_types t on t.id = e.task_type_id
         join clients c on c.id = e.client_id
         where e.user_id = $1 and t.active = true and c.active = true
         order by e.client_id, t.id, e.started_at desc
       ) sub
       order by sub.last_used desc
       limit 4`,
      [userId]
    );

    // 4. Supervisor-Assigned Tasks for this operative + Open Task Pool ("Grab" tasks)
    const assignedTasksRes = await tx.query<AssignedTask>(
      `select
         a.id, a.user_id,
         coalesce(u.display_name, 'Open Pool (Grab)') as user_name,
         (a.user_id is null) as is_open_pool,
         a.client_id, c.name as client_name, c.code as client_code,
         a.task_type_id, t.name as task_name, t.code as task_code,
         t.unit_label, t.standard_minutes::float8 as standard_minutes,
         a.order_ref, a.note, a.assigned_by,
         ab.display_name as assigned_by_name,
         a.status, a.created_at::text
       from assigned_tasks a
       left join users_public u on u.id = a.user_id
       join clients c on c.id = a.client_id
       join task_types t on t.id = a.task_type_id
       left join users_public ab on ab.id = a.assigned_by
       where (a.user_id = $1 or a.user_id is null) and a.status = 'pending'
       order by (a.user_id is null) desc, a.created_at desc`,
      [userId]
    );

    // 5. Open attendance record
    const openAttendanceRes = await tx.query<Attendance>(
      `select id, user_id, clock_in::text, clock_out::text, auto_closed, reviewed, created_at::text, updated_at::text
       from attendance
       where user_id = $1 and clock_out is null
       limit 1`,
      [userId]
    );

    return {
      runningEntry: runningRes.rows[0] ?? null,
      todayEntries: todayEntriesRes.rows,
      last5Tasks: recentTasksRes.rows,
      assignedTasks: assignedTasksRes.rows,
      openAttendance: openAttendanceRes.rows[0] ?? null,
    };
  });
}

export async function getFloorStatus(actorUserId: string | null = null) {
  return withDbSession(actorUserId, async (tx) => {
    const operativesRes = await tx.query<UserPublic>(
      `select id, display_name, role, job_title, team_name, coalesce(is_core_warehouse, false) as is_core_warehouse, email, coalesce(must_change_pin, false) as must_change_pin, active, created_at::text, updated_at::text
       from users_public
       where active = true and role in ('supervisor', 'operative')
       order by
         case
           when lower(display_name) = 'mark' then 1
           when lower(display_name) = 'edna' then 2
           when role = 'supervisor' then 3
           when lower(display_name) = 'erica' then 4
           when lower(display_name) = 'sam' then 5
           when lower(display_name) = 'alex' then 6
           when lower(display_name) = 'mason' then 7
           when coalesce(is_core_warehouse, false) = true then 8
           else 20
         end,
         display_name asc`
    );

    const openAttendanceRes = await tx.query<Attendance>(
      `select id, user_id, clock_in::text, clock_out::text, auto_closed, reviewed, created_at::text, updated_at::text
       from attendance
       where clock_out is null`
    );

    const runningEntriesRes = await tx.query<TimeEntry>(
      `select
         e.id, e.user_id, u.display_name as user_name,
         e.client_id, c.name as client_name, c.code as client_code,
         e.task_type_id, t.name as task_name, t.code as task_code,
         t.unit_label,
         coalesce(t.require_units_on_close, true) as require_units_on_close,
         coalesce(t.target_enabled, true) as target_enabled,
         case when coalesce(t.target_enabled, true) = false then null else t.standard_minutes::float8 end as standard_minutes,
         e.order_ref, e.started_at::text, e.ended_at::text,
         e.units, e.billable,
         coalesce(e.billing_status, case when e.billable = false then 'our_cost' else 'needs_billed' end) as billing_status,
         e.unbilled_reason,
         coalesce(e.billing_review_status, 'pending') as billing_review_status,
         e.billing_review_note,
         e.source, e.crew_id, e.created_by,
         e.auto_stopped, e.note, e.last_activity_at::text,
         e.created_at::text, e.updated_at::text
       from time_entries e
       join users_public u on u.id = e.user_id
       join clients c on c.id = e.client_id
       join task_types t on t.id = e.task_type_id
       where e.ended_at is null`
    );

    const todayCompletedRes = await tx.query<TimeEntry>(
      `select
         e.id, e.user_id, u.display_name as user_name,
         e.client_id, c.name as client_name, c.code as client_code,
         e.task_type_id, t.name as task_name, t.code as task_code,
         t.unit_label,
         coalesce(t.require_units_on_close, true) as require_units_on_close,
         coalesce(t.target_enabled, true) as target_enabled,
         case when coalesce(t.target_enabled, true) = false then null else t.standard_minutes::float8 end as standard_minutes,
         e.order_ref, e.started_at::text, e.ended_at::text,
         e.units, e.billable,
         coalesce(e.billing_status, case when e.billable = false then 'our_cost' else 'needs_billed' end) as billing_status,
         e.unbilled_reason,
         coalesce(e.billing_review_status, 'pending') as billing_review_status,
         e.billing_review_note,
         e.source, e.crew_id, e.created_by,
         e.auto_stopped, e.note, e.last_activity_at::text,
         e.created_at::text, e.updated_at::text
       from time_entries e
       join users_public u on u.id = e.user_id
       join clients c on c.id = e.client_id
       join task_types t on t.id = e.task_type_id
       where e.ended_at is not null
         and (e.started_at at time zone 'Europe/London')::date = (now() at time zone 'Europe/London')::date
       order by e.ended_at desc`
    );

    const settings = await getSettings(actorUserId);

    const attendanceByUser = new Map<string, Attendance>();
    for (const att of openAttendanceRes.rows) {
      attendanceByUser.set(att.user_id, att);
    }

    const runningByUser = new Map<string, TimeEntry>();
    for (const entry of runningEntriesRes.rows) {
      runningByUser.set(entry.user_id, entry);
    }

    const completedByUser = new Map<string, TimeEntry[]>();
    for (const entry of todayCompletedRes.rows) {
      const list = completedByUser.get(entry.user_id) ?? [];
      list.push(entry);
      completedByUser.set(entry.user_id, list);
    }

    const rows = operativesRes.rows.map((op) => {
      const userCompleted = completedByUser.get(op.id) ?? [];
      return {
        operative: op,
        attendance: attendanceByUser.get(op.id) ?? null,
        runningEntry: runningByUser.get(op.id) ?? null,
        lastEndedEntry: userCompleted[0] ?? null,
        todayEntries: userCompleted,
      };
    });

    return {
      rows,
      settings,
      serverNow: new Date().toISOString(),
    };
  });
}

export async function getEntriesForDate(dateStr: string, actorUserId: string | null = null) {
  return withDbSession(actorUserId, async (tx) => {
    const entriesRes = await tx.query<TimeEntry>(
      `select
         e.id, e.user_id, u.display_name as user_name,
         e.client_id, c.name as client_name, c.code as client_code,
         c.rounding_minutes as client_rounding_minutes,
         e.task_type_id, t.name as task_name, t.code as task_code,
         t.rounding_minutes as task_rounding_minutes,
         coalesce(t.min_charge_minutes, 0) as task_min_charge_minutes,
         t.unit_label,
         coalesce(t.target_enabled, true) as target_enabled,
         case when coalesce(t.target_enabled, true) = false then null else t.standard_minutes::float8 end as standard_minutes,
         e.order_ref, e.started_at::text, e.ended_at::text,
         e.units, e.billable,
         coalesce(e.billing_status, case when e.billable = false then 'our_cost' else 'needs_billed' end) as billing_status,
         e.unbilled_reason,
         coalesce(e.billing_review_status, 'pending') as billing_review_status,
         e.billing_review_note,
         e.source, e.crew_id, e.created_by,
         cb.display_name as created_by_name,
         e.auto_stopped, e.note, e.last_activity_at::text,
         e.created_at::text, e.updated_at::text
       from time_entries e
       join users_public u on u.id = e.user_id
       join clients c on c.id = e.client_id
       join task_types t on t.id = e.task_type_id
       left join users_public cb on cb.id = e.created_by
       where (e.started_at at time zone 'Europe/London')::date = $1::date
       order by u.display_name asc, e.started_at desc`,
      [dateStr]
    );

    const entryIds = entriesRes.rows.map((e) => e.id);
    let auditsByEntry: Record<string, AuditEvent[]> = {};

    if (entryIds.length > 0) {
      const auditsRes = await tx.query<AuditEvent>(
        `select
           a.id, a.entry_id, a.changed_by,
           u.display_name as changed_by_name,
           a.changed_at::text, a.field, a.old_value, a.new_value
         from audit_events a
         left join users_public u on u.id = a.changed_by
         where a.entry_id = any($1::uuid[])
         order by a.changed_at desc`,
        [entryIds]
      );
      for (const audit of auditsRes.rows) {
        if (!auditsByEntry[audit.entry_id]) {
          auditsByEntry[audit.entry_id] = [];
        }
        auditsByEntry[audit.entry_id].push(audit);
      }
    }

    const attendanceRes = await tx.query<Attendance>(
      `select
         a.id, a.user_id, u.display_name as user_name,
         a.clock_in::text, a.clock_out::text, a.auto_closed, a.reviewed,
         a.created_at::text, a.updated_at::text
       from attendance a
       join users_public u on u.id = a.user_id
       where (a.clock_in at time zone 'Europe/London')::date = $1::date
       order by a.clock_in desc`,
      [dateStr]
    );

    return {
      entries: entriesRes.rows,
      auditsByEntry,
      attendance: attendanceRes.rows,
    };
  });
}

export async function getReportEntries(params: {
  startDate: string;
  endDate: string;
  clientId?: string;
  taskTypeId?: string;
  userId?: string;
  actorUserId?: string | null;
}) {
  const { startDate, endDate, clientId, taskTypeId, userId, actorUserId = null } = params;

  return withDbSession(actorUserId, async (tx) => {
    const conditions: string[] = [
      `(e.started_at at time zone 'Europe/London')::date >= $1::date`,
      `(e.started_at at time zone 'Europe/London')::date <= $2::date`,
      `e.ended_at is not null`,
    ];
    const values: any[] = [startDate, endDate];

    if (clientId && clientId !== 'all') {
      values.push(clientId);
      conditions.push(`e.client_id = $${values.length}`);
    }
    if (taskTypeId && taskTypeId !== 'all') {
      values.push(taskTypeId);
      conditions.push(`e.task_type_id = $${values.length}`);
    }
    if (userId && userId !== 'all') {
      values.push(userId);
      conditions.push(`e.user_id = $${values.length}`);
    }

    const sql = `
      select
        e.id, e.user_id, u.display_name as user_name,
        e.client_id, c.name as client_name, c.code as client_code,
        c.rounding_minutes as client_rounding_minutes,
        e.task_type_id, t.name as task_name, t.code as task_code,
        t.rounding_minutes as task_rounding_minutes,
        coalesce(t.min_charge_minutes, 0) as task_min_charge_minutes,
        t.unit_label, t.standard_minutes::float8 as standard_minutes,
        e.order_ref, e.started_at::text, e.ended_at::text,
        e.units, e.billable,
        coalesce(e.billing_status, case when e.billable = false then 'our_cost' else 'needs_billed' end) as billing_status,
        e.unbilled_reason,
        coalesce(e.billing_review_status, 'pending') as billing_review_status,
        e.billing_review_note,
        e.source, e.crew_id, e.created_by,
        e.auto_stopped, e.note, e.last_activity_at::text,
        e.created_at::text, e.updated_at::text
      from time_entries e
      join users_public u on u.id = e.user_id
      join clients c on c.id = e.client_id
      join task_types t on t.id = e.task_type_id
      where ${conditions.join(' and ')}
      order by e.started_at desc
    `;

    const res = await tx.query<TimeEntry>(sql, values);
    return res.rows;
  });
}

export async function getSavedViewsForUser(userId: string): Promise<SavedView[]> {
  return withDbSession(userId, async (tx) => {
    const res = await tx.query<SavedView>(
      `select id, user_id, name, filter_json, created_at::text, updated_at::text
       from saved_views
       where user_id = $1
       order by created_at desc`,
      [userId]
    );
    return res.rows;
  });
}

/**
 * Admin-only query to fetch users including hourly_cost and pin_hash.
 * Enforces RLS via actorUserId and verifies admin role.
 */
export async function getAdminUsers(actorUserId: string): Promise<UserAdmin[]> {
  return withDbSession(actorUserId, async (tx) => {
    const res = await tx.query<UserAdmin>(
      `select
         u.id, u.display_name, u.role, u.job_title, u.team_name,
         coalesce(u.is_core_warehouse, false) as is_core_warehouse,
         coalesce(u.must_change_pin, false) as must_change_pin,
         u.pin_hash,
         u.hourly_cost::float8 as hourly_cost,
         u.active, u.created_at::text, u.updated_at::text,
         coalesce(u.email, au.email) as email
       from users u
       left join auth.users au on au.id = u.id
       order by
         case
           when lower(u.display_name) = 'mark' then 1
           when lower(u.display_name) = 'edna' then 2
           when u.role = 'supervisor' then 3
           when lower(u.display_name) = 'erica' then 4
           when lower(u.display_name) = 'sam' then 5
           when lower(u.display_name) = 'alex' then 6
           when lower(u.display_name) = 'mason' then 7
           when coalesce(u.is_core_warehouse, false) = true then 8
           when u.role = 'admin' then 9
           else 20
         end,
         u.display_name asc`
    );
    return res.rows;
  });
}

/**
 * Fetch Target Change Requests for Two-Point Governance review.
 */
export async function getTargetChangeRequests(
  actorUserId: string | null = null,
  statusFilter?: 'pending' | 'approved' | 'rejected' | 'all'
): Promise<TargetChangeRequest[]> {
  return withDbSession(actorUserId, async (tx) => {
    let sql = `
      select
        r.id,
        r.task_type_id,
        t.name as task_name,
        t.code as task_code,
        r.client_id,
        coalesce(c.name, 'All Clients (Standard)') as client_name,
        coalesce(c.code, 'STD') as client_code,
        r.current_standard_minutes::float8 as current_standard_minutes,
        r.proposed_standard_minutes::float8 as proposed_standard_minutes,
        r.observed_pace::float8 as observed_pace,
        r.variance_percent::float8 as variance_percent,
        r.sample_runs,
        r.sample_units,
        r.operatives_count,
        r.reason,
        r.status,
        r.requested_by,
        u_req.display_name as requester_name,
        r.reviewed_by,
        u_rev.display_name as reviewer_name,
        r.reviewed_at::text,
        r.review_note,
        r.created_at::text,
        r.updated_at::text
      from target_change_requests r
      join task_types t on t.id = r.task_type_id
      left join clients c on c.id = r.client_id
      left join users u_req on u_req.id = r.requested_by
      left join users u_rev on u_rev.id = r.reviewed_by
    `;

    const params: any[] = [];
    if (statusFilter && statusFilter !== 'all') {
      sql += ` where r.status = $1`;
      params.push(statusFilter);
    }

    sql += ` order by r.created_at desc`;
    const res = await tx.query<TargetChangeRequest>(sql, params);
    return res.rows;
  });
}

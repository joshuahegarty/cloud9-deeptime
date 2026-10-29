'use server';

import { SESSION_COOKIE_NAME, getCurrentUser, requireRole } from '@/lib/auth';
import { bumpRealtimeVersion, withDbSession } from '@/lib/db';
import { buildAndSendDailySummary } from '@/lib/summary-email';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { AppSettings, EntrySource, OfflineQueueItem, Role, UserPublic } from '@/lib/types';
import { BillingStatus, resolveBillingStatus } from '@/lib/billingStatus';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import crypto from 'crypto';

function setSessionCookie(userId: string) {
  cookies().set(SESSION_COOKIE_NAME, userId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 14, // 14 days
  });
}

function revalidateAllPaths() {
  revalidatePath('/');
  revalidatePath('/now');
  revalidatePath('/kiosk');
  revalidatePath('/floor');
  revalidatePath('/entries');
  revalidatePath('/reports');
  revalidatePath('/reports/billing');
  revalidatePath('/setup');
}

// =============================================================================
// 1. Auth Server Actions
// =============================================================================

export async function loginStaffAction(params: {
  email: string;
  password: string;
}): Promise<{ ok: boolean; error?: string; user?: UserPublic }> {
  const email = params.email.trim().toLowerCase();
  const password = params.password;

  if (!email || !password) {
    return { ok: false, error: 'Please enter both email address and password.' };
  }

  return withDbSession(null, async (tx) => {
    const authRes = await tx.query<{ id: string; encrypted_password: string }>(
      `select id, encrypted_password from auth.users where lower(email) = $1 limit 1`,
      [email]
    );

    const authUser = authRes.rows[0];
    if (!authUser || authUser.encrypted_password !== password) {
      return { ok: false, error: 'Invalid email or password.' };
    }

    const userRes = await tx.query<UserPublic>(
      `select id, display_name, role, active, created_at::text, updated_at::text
       from users_public
       where id = $1 and active = true`,
      [authUser.id]
    );

    const user = userRes.rows[0];
    if (!user) {
      return { ok: false, error: 'Account is inactive or not found.' };
    }

    setSessionCookie(user.id);
    revalidateAllPaths();
    return { ok: true, user };
  });
}

/**
 * Signs in an operative (or staff member) by 4-digit PIN using the generated
 * `pin-<user_id>@internal.local` account convention.
 */
export async function loginByPinAction(params: {
  pin: string;
  userId?: string;
  clockInIfNeeded?: boolean;
}): Promise<{ ok: boolean; error?: string; user?: UserPublic; clockedInNew?: boolean }> {
  const pin = params.pin.trim();
  if (!/^\d{4}$/.test(pin)) {
    return { ok: false, error: 'PIN must be 4 digits.' };
  }

  return withDbSession(null, async (tx) => {
    let targetUserId = params.userId;

    if (targetUserId) {
      // Verify via generated email `pin-<user_id>@internal.local` or users.pin_hash
      const generatedEmail = `pin-${targetUserId}@internal.local`;
      const checkRes = await tx.query<{ id: string }>(
        `select u.id
         from users u
         left join auth.users au on au.id = u.id
         where u.id = $1
           and u.active = true
           and (u.pin_hash = $2 or (au.email = $3 and au.encrypted_password = $2))
         limit 1`,
        [targetUserId, pin, generatedEmail]
      );
      if (checkRes.rows.length === 0) {
        return { ok: false, error: 'Incorrect PIN.' };
      }
    } else {
      const matchRes = await tx.query<{ id: string }>(
        `select id from users where pin_hash = $1 and active = true limit 1`,
        [pin]
      );
      if (matchRes.rows.length === 0) {
        return { ok: false, error: 'No active operative found with that PIN.' };
      }
      targetUserId = matchRes.rows[0].id;
    }

    const userRes = await tx.query<UserPublic>(
      `select id, display_name, role, active, created_at::text, updated_at::text
       from users_public
       where id = $1 and active = true`,
      [targetUserId]
    );
    const user = userRes.rows[0];
    if (!user) {
      return { ok: false, error: 'User not active.' };
    }

    let clockedInNew = false;
    if (params.clockInIfNeeded) {
      const openAtt = await tx.query<{ id: string }>(
        `select id from attendance where user_id = $1 and clock_out is null limit 1`,
        [user.id]
      );
      if (openAtt.rows.length === 0) {
        await tx.query(
          `insert into attendance (user_id, clock_in, auto_closed, reviewed)
           values ($1, now(), false, false)`,
          [user.id]
        );
        clockedInNew = true;
      }
    }

    setSessionCookie(user.id);
    bumpRealtimeVersion();
    revalidateAllPaths();
    return { ok: true, user, clockedInNew };
  });
}

/**
 * Kiosk name-pick action: taps an operative name on the shared kiosk tablet.
 * Clocks the operative in if not already clocked in, sets the active session,
 * and returns so the kiosk can display `/now` for that operative.
 */
export async function kioskTapOperativeAction(params: {
  userId: string;
  pin?: string;
}): Promise<{ ok: boolean; error?: string; user?: UserPublic; clockedInNew?: boolean }> {
  return withDbSession(params.userId, async (tx) => {
    const userRes = await tx.query<UserPublic>(
      `select id, display_name, role, active, created_at::text, updated_at::text
       from users_public
       where id = $1 and active = true`,
      [params.userId]
    );
    const user = userRes.rows[0];
    if (!user) {
      return { ok: false, error: 'Operative not found or inactive.' };
    }

    if (params.pin !== undefined && params.pin !== '') {
      const pinCheck = await tx.query<{ id: string }>(
        `select id from users where id = $1 and pin_hash = $2`,
        [params.userId, params.pin]
      );
      if (pinCheck.rows.length === 0) {
        return { ok: false, error: 'Incorrect 4-digit PIN.' };
      }
    }

    const openAtt = await tx.query<{ id: string }>(
      `select id from attendance where user_id = $1 and clock_out is null limit 1`,
      [user.id]
    );
    let clockedInNew = false;
    if (openAtt.rows.length === 0) {
      await tx.query(
        `insert into attendance (user_id, clock_in, auto_closed, reviewed)
         values ($1, now(), false, false)`,
        [user.id]
      );
      clockedInNew = true;
    }

    setSessionCookie(user.id);
    bumpRealtimeVersion();
    revalidateAllPaths();
    return { ok: true, user, clockedInNew };
  });
}

export async function logoutAction(): Promise<{ ok: boolean }> {
  cookies().delete(SESSION_COOKIE_NAME);
  revalidateAllPaths();
  return { ok: true };
}

/**
 * Quick account switch helper so managers/testers can jump between
 * Operative, Supervisor, and Admin sessions in 1 click.
 */
export async function quickSwitchUserAction(params: {
  userId: string;
}): Promise<{ ok: boolean; user?: UserPublic }> {
  return withDbSession(params.userId, async (tx) => {
    const res = await tx.query<UserPublic>(
      `select id, display_name, role, active, created_at::text, updated_at::text
       from users_public
       where id = $1 and active = true`,
      [params.userId]
    );
    const user = res.rows[0];
    if (!user) return { ok: false };
    setSessionCookie(user.id);
    revalidateAllPaths();
    return { ok: true, user };
  });
}

// =============================================================================
// 2. Task Start / Stop / Barcode / Idle Prompt Actions
// =============================================================================

export async function startTaskAction(params: {
  clientId: string;
  taskTypeId: string;
  orderRef?: string | null;
  units?: number | null;
  source: EntrySource;
  startedAt?: string;
  userId?: string;
  unbilledReason?: string | null;
}): Promise<{ ok: boolean; error?: string; entryId?: string; stoppedPreviousId?: string | null }> {
  const sessionUser = await getCurrentUser();
  const targetUserId = params.userId ?? sessionUser?.id;

  if (!targetUserId) {
    return { ok: false, error: 'Not signed in.' };
  }

  const actorId = sessionUser?.id ?? targetUserId;
  const effectiveStart = params.startedAt ? new Date(params.startedAt).toISOString() : new Date().toISOString();

  try {
    const result = await withDbSession(actorId, async (tx) => {
      // 1. Look up task type & default billable / billing_status flag
      const taskRes = await tx.query<{
        id: string;
        client_id: string;
        billable: boolean;
        billing_status?: string;
        category?: string;
        code?: string;
        name?: string;
        active: boolean;
      }>(
        `select id, client_id, billable,
                coalesce(billing_status, case when billable = false then 'our_cost' else 'needs_billed' end) as billing_status,
                category, code, name, active
         from task_types where id = $1 limit 1`,
        [params.taskTypeId]
      );
      const task = taskRes.rows[0];
      if (!task || !task.active) {
        throw new Error('Selected task type is not available.');
      }

      const effectiveBillingStatus = resolveBillingStatus({
        billingStatus: task.billing_status,
        billable: task.billable,
        category: task.category,
        taskCode: task.code,
        taskName: task.name,
      });
      const effectiveBillable = effectiveBillingStatus !== 'our_cost';

      // 2. Ensure operative is clocked in
      const attRes = await tx.query<{ id: string }>(
        `select id from attendance where user_id = $1 and clock_out is null limit 1`,
        [targetUserId]
      );
      if (attRes.rows.length === 0) {
        await tx.query(
          `insert into attendance (user_id, clock_in, auto_closed, reviewed)
           values ($1, $2::timestamptz, false, false)`,
          [targetUserId, effectiveStart]
        );
      }

      // 3. Stop any currently running entry at the exact same instant
      const runningRes = await tx.query<{ id: string }>(
        `select id from time_entries where user_id = $1 and ended_at is null limit 1`,
        [targetUserId]
      );
      let stoppedPreviousId: string | null = null;
      if (runningRes.rows.length > 0) {
        stoppedPreviousId = runningRes.rows[0].id;
        await tx.query(
          `update time_entries
           set ended_at = $1::timestamptz, last_activity_at = $1::timestamptz
           where id = $2`,
          [effectiveStart, stoppedPreviousId]
        );
      }

      // 4. Insert the new running entry
      const insertRes = await tx.query<{ id: string }>(
        `insert into time_entries (
           user_id, client_id, task_type_id, order_ref,
           started_at, ended_at, units, billable, billing_status, unbilled_reason,
           source, crew_id, created_by, auto_stopped, last_activity_at
         ) values (
           $1, $2, $3, $4,
           $5::timestamptz, null, $6, $7, $8, $9,
           $10::entry_source, null, $11, false, $5::timestamptz
         ) returning id`,
        [
          targetUserId,
          params.clientId,
          params.taskTypeId,
          params.orderRef?.trim() || null,
          effectiveStart,
          params.units ?? null,
          effectiveBillable,
          effectiveBillingStatus,
          effectiveBillingStatus === 'our_cost' ? (params.unbilledReason?.trim() || null) : null,
          params.source,
          actorId,
        ]
      );

      return {
        entryId: insertRes.rows[0].id,
        stoppedPreviousId,
      };
    });

    bumpRealtimeVersion();
    revalidateAllPaths();
    return { ok: true, ...result };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to start task.' };
  }
}

export async function startTaskByBarcodeAction(params: {
  barcode: string;
  orderRef?: string | null;
  startedAt?: string;
}): Promise<{
  ok: boolean;
  error?: string;
  taskType?: { id: string; client_id: string | null; is_standard: boolean; name: string; code: string; client_name: string };
}> {
  const cleanCode = params.barcode.trim();
  if (!cleanCode) {
    return { ok: false, error: 'Barcode is empty.' };
  }

  const found = await withDbSession(null, async (tx) => {
    const res = await tx.query<{
      id: string;
      client_id: string | null;
      is_standard: boolean;
      name: string;
      code: string;
      client_name: string;
    }>(
      `select t.id, t.client_id, coalesce(t.is_standard, false) as is_standard,
              t.name, t.code, coalesce(c.name, 'All Clients (Standard)') as client_name
       from task_types t
       left join clients c on c.id = t.client_id
       where t.active = true and (t.is_standard = true or c.active = true)
         and (upper(t.barcode) = upper($1) or upper(t.code) = upper($1))
       limit 1`,
      [cleanCode]
    );
    return res.rows[0] ?? null;
  });

  if (!found) {
    return { ok: false, error: `No active task matches barcode "${cleanCode}".` };
  }

  return { ok: true, taskType: found };
}

/**
 * Allows an operative to start a task that is not yet in the catalogue ("Task Not Listed")
 * by selecting the client and typing the task title.
 */
export async function startUnlistedTaskAction(params: {
  clientId: string;
  customTaskTitle: string;
  category?: string;
  orderRef?: string | null;
  unitLabel?: string | null;
  startedAt?: string;
  userId?: string;
  billingStatus?: BillingStatus | string | null;
  unbilledReason?: string | null;
}): Promise<{ ok: boolean; error?: string; entryId?: string; taskTypeId?: string }> {
  const sessionUser = await getCurrentUser();
  const targetUserId = params.userId ?? sessionUser?.id;
  if (!targetUserId) {
    return { ok: false, error: 'Not signed in.' };
  }

  const cleanTitle = params.customTaskTitle.trim();
  if (!cleanTitle) {
    return { ok: false, error: 'Please type a task title.' };
  }
  if (!params.clientId) {
    return { ok: false, error: 'Please select a client.' };
  }

  const actorId = sessionUser?.id ?? targetUserId;

  try {
    const taskTypeId = await withDbSession(actorId, async (tx) => {
      // Check if an active task with this exact name already exists for this client
      const existingRes = await tx.query<{ id: string }>(
        `select id from task_types
         where client_id = $1 and lower(name) = lower($2) and active = true
         limit 1`,
        [params.clientId, cleanTitle]
      );
      if (existingRes.rows.length > 0) {
        return existingRes.rows[0].id;
      }

      const clientRes = await tx.query<{ code: string; billable_default: boolean }>(
        `select code, billable_default from clients where id = $1 limit 1`,
        [params.clientId]
      );
      const clientCode = clientRes.rows[0]?.code ?? 'CUST';
      const billableDefault = clientRes.rows[0]?.billable_default ?? true;

      const slug = cleanTitle
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '')
        .slice(0, 6) || 'TASK';
      const randomSuffix = Math.floor(100 + Math.random() * 900);
      const generatedCode = `${clientCode}-${slug}-${randomSuffix}`;

      const effectiveBillingStatus = resolveBillingStatus({
        billingStatus: params.billingStatus,
        billable: billableDefault,
        category: params.category,
        taskName: cleanTitle,
      });
      const effectiveBillable = effectiveBillingStatus !== 'our_cost';

      const insertTaskRes = await tx.query<{ id: string }>(
        `insert into task_types (
           client_id, is_standard, category, name, code,
           standard_minutes, unit_label, billable, billing_status, rate, barcode, sort_order, active
         ) values (
           $1, false, $2, $3, $4,
           null, $5, $6, $7, null, null, 50, true
         ) returning id`,
        [
          params.clientId,
          params.category?.trim() || 'Ad-Hoc / Unlisted',
          cleanTitle,
          generatedCode,
          params.unitLabel?.trim() || null,
          effectiveBillable,
          effectiveBillingStatus,
        ]
      );

      return insertTaskRes.rows[0].id;
    });

    const startRes = await startTaskAction({
      clientId: params.clientId,
      taskTypeId,
      orderRef: params.orderRef,
      source: 'typed',
      startedAt: params.startedAt,
      userId: targetUserId,
      unbilledReason: params.unbilledReason,
    });

    if (!startRes.ok) {
      return { ok: false, error: startRes.error };
    }

    return { ok: true, entryId: startRes.entryId, taskTypeId };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to start unlisted task.' };
  }
}

export async function stopTaskAction(params: {
  entryId?: string;
  units?: number | null;
  endedAt?: string;
  userId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const sessionUser = await getCurrentUser();
  const targetUserId = params.userId ?? sessionUser?.id;

  if (!targetUserId && !params.entryId) {
    return { ok: false, error: 'Not signed in.' };
  }

  const actorId = sessionUser?.id ?? targetUserId!;
  const effectiveEnd = params.endedAt ? new Date(params.endedAt).toISOString() : new Date().toISOString();

  try {
    await withDbSession(actorId, async (tx) => {
      let targetEntryId = params.entryId;
      if (!targetEntryId) {
        const runningRes = await tx.query<{ id: string }>(
          `select id from time_entries where user_id = $1 and ended_at is null limit 1`,
          [targetUserId]
        );
        if (runningRes.rows.length === 0) {
          return; // Already stopped (e.g., by supervisor or shift-end job)
        }
        targetEntryId = runningRes.rows[0].id;
      }

      // Check if still running (conflict resolution: if already stopped on server, server state wins)
      const currentRes = await tx.query<{ id: string; ended_at: string | null; units: number | null }>(
        `select id, ended_at::text, units from time_entries where id = $1 limit 1`,
        [targetEntryId]
      );
      const current = currentRes.rows[0];
      if (!current || current.ended_at !== null) {
        // Server state wins if already stopped
        return;
      }

      const finalUnits = params.units !== undefined ? params.units : current.units;
      await tx.query(
        `update time_entries
         set ended_at = $1::timestamptz,
             units = $2,
             last_activity_at = $1::timestamptz
         where id = $3`,
        [effectiveEnd, finalUnits, targetEntryId]
      );
    });

    bumpRealtimeVersion();
    revalidateAllPaths();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to stop task.' };
  }
}

export async function confirmStillOnTaskAction(params: {
  entryId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return { ok: false, error: 'Not signed in.' };
  }

  try {
    await withDbSession(sessionUser.id, async (tx) => {
      await tx.query(
        `update time_entries
         set last_activity_at = now()
         where id = $1 and ended_at is null`,
        [params.entryId]
      );
    });
    bumpRealtimeVersion();
    revalidateAllPaths();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to confirm activity.' };
  }
}

// =============================================================================
// 3. Attendance / Clock In & Out Actions
// =============================================================================

export async function clockInAction(params?: {
  userId?: string;
  timestamp?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const sessionUser = await getCurrentUser();
  const targetUserId = params?.userId ?? sessionUser?.id;
  if (!targetUserId) {
    return { ok: false, error: 'Not signed in.' };
  }

  const effectiveTime = params?.timestamp
    ? new Date(params.timestamp).toISOString()
    : new Date().toISOString();

  await withDbSession(sessionUser?.id ?? targetUserId, async (tx) => {
    const openRes = await tx.query<{ id: string }>(
      `select id from attendance where user_id = $1 and clock_out is null limit 1`,
      [targetUserId]
    );
    if (openRes.rows.length === 0) {
      await tx.query(
        `insert into attendance (user_id, clock_in, auto_closed, reviewed)
         values ($1, $2::timestamptz, false, false)`,
        [targetUserId, effectiveTime]
      );
    }
  });

  bumpRealtimeVersion();
  revalidateAllPaths();
  return { ok: true };
}

export async function clockOutAction(params?: {
  userId?: string;
  units?: number | null;
  timestamp?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const sessionUser = await getCurrentUser();
  const targetUserId = params?.userId ?? sessionUser?.id;
  if (!targetUserId) {
    return { ok: false, error: 'Not signed in.' };
  }

  const effectiveTime = params?.timestamp
    ? new Date(params.timestamp).toISOString()
    : new Date().toISOString();

  await withDbSession(sessionUser?.id ?? targetUserId, async (tx) => {
    // Clocking out stops any running entry
    const runningRes = await tx.query<{ id: string; units: number | null }>(
      `select id, units from time_entries where user_id = $1 and ended_at is null limit 1`,
      [targetUserId]
    );
    if (runningRes.rows.length > 0) {
      const entry = runningRes.rows[0];
      const finalUnits = params?.units !== undefined ? params.units : entry.units;
      await tx.query(
        `update time_entries
         set ended_at = $1::timestamptz,
             units = $2,
             last_activity_at = $1::timestamptz
         where id = $3`,
        [effectiveTime, finalUnits, entry.id]
      );
    }

    // Close open attendance
    await tx.query(
      `update attendance
       set clock_out = $1::timestamptz
       where user_id = $2 and clock_out is null`,
      [effectiveTime, targetUserId]
    );
  });

  bumpRealtimeVersion();
  revalidateAllPaths();
  return { ok: true };
}

export async function markAttendanceReviewedAction(params: {
  attendanceId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireRole(['supervisor', 'admin']);
  await withDbSession(actor.id, async (tx) => {
    await tx.query(`update attendance set reviewed = true where id = $1`, [params.attendanceId]);
  });
  bumpRealtimeVersion();
  revalidateAllPaths();
  return { ok: true };
}

// =============================================================================
// 4. Crew Start & Stop Actions (Supervisor / Admin)
// =============================================================================

export async function startCrewAction(params: {
  operativeIds: string[];
  clientId: string;
  taskTypeId: string;
  orderRef?: string | null;
}): Promise<{ ok: boolean; error?: string; crewId?: string; count?: number }> {
  try {
    const actor = await requireRole(['supervisor', 'admin']);
    if (!params.operativeIds || params.operativeIds.length === 0) {
      return { ok: false, error: 'Select at least one operative for crew start.' };
    }

    const crewId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    await withDbSession(actor.id, async (tx) => {
      const taskRes = await tx.query<{ id: string; client_id: string; billable: boolean }>(
        `select id, client_id, billable from task_types where id = $1 limit 1`,
        [params.taskTypeId]
      );
      const task = taskRes.rows[0];
      if (!task) {
        throw new Error('Task type not found.');
      }

      for (const opId of params.operativeIds) {
        // Ensure clocked in
        const openAtt = await tx.query<{ id: string }>(
          `select id from attendance where user_id = $1 and clock_out is null limit 1`,
          [opId]
        );
        if (openAtt.rows.length === 0) {
          await tx.query(
            `insert into attendance (user_id, clock_in, auto_closed, reviewed)
             values ($1, $2::timestamptz, false, false)`,
            [opId, nowIso]
          );
        }

        // Stop any running entry for this operative
        await tx.query(
          `update time_entries
           set ended_at = $1::timestamptz, last_activity_at = $1::timestamptz
           where user_id = $2 and ended_at is null`,
          [nowIso, opId]
        );

        // Create new crew entry
        await tx.query(
          `insert into time_entries (
             user_id, client_id, task_type_id, order_ref,
             started_at, ended_at, units, billable,
             source, crew_id, created_by, auto_stopped, last_activity_at
           ) values (
             $1, $2, $3, $4,
             $5::timestamptz, null, null, $6,
             'crew', $7::uuid, $8, false, $5::timestamptz
           )`,
          [
            opId,
            params.clientId,
            params.taskTypeId,
            params.orderRef?.trim() || null,
            nowIso,
            task.billable,
            crewId,
            actor.id,
          ]
        );
      }
    });

    bumpRealtimeVersion();
    revalidateAllPaths();
    return { ok: true, crewId, count: params.operativeIds.length };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to start crew.' };
  }
}

export async function stopCrewAction(params: {
  crewId: string;
}): Promise<{ ok: boolean; error?: string; stoppedCount?: number }> {
  try {
    const actor = await requireRole(['supervisor', 'admin']);
    const nowIso = new Date().toISOString();

    const stoppedCount = await withDbSession(actor.id, async (tx) => {
      const res = await tx.query<{ id: string }>(
        `update time_entries
         set ended_at = $1::timestamptz, last_activity_at = $1::timestamptz
         where crew_id = $2::uuid and ended_at is null
         returning id`,
        [nowIso, params.crewId]
      );
      return res.rows.length;
    });

    bumpRealtimeVersion();
    revalidateAllPaths();
    return { ok: true, stoppedCount };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to stop crew.' };
  }
}

// =============================================================================
// 5. Supervisor Entries Edit & Manual Entry Actions
// =============================================================================

export async function updateTimeEntryAction(params: {
  entryId: string;
  clientId: string;
  taskTypeId: string;
  orderRef: string | null;
  startedAt: string;
  endedAt: string | null;
  units: number | null;
  billable?: boolean;
  billingStatus?: BillingStatus | string | null;
  unbilledReason?: string | null;
  note: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const actor = await requireRole(['supervisor', 'admin']);
    const effectiveBillingStatus = resolveBillingStatus({
      billingStatus: params.billingStatus,
      billable: params.billable,
    });
    const effectiveBillable = effectiveBillingStatus !== 'our_cost';

    if (effectiveBillingStatus === 'our_cost') {
      const trimmedReason = (params.unbilledReason || '').trim();
      if (!trimmedReason) {
        return {
          ok: false,
          error:
            'A mandatory justification is required when unbilling or marking a task as Our Cost.',
        };
      }
    }

    await withDbSession(actor.id, async (tx) => {
      await tx.query(
        `update time_entries
         set client_id = $1,
             task_type_id = $2,
             order_ref = $3,
             started_at = $4::timestamptz,
             ended_at = $5::timestamptz,
             units = $6,
             billable = $7,
             billing_status = $8,
             unbilled_reason = $9,
             note = $10
         where id = $11`,
        [
          params.clientId,
          params.taskTypeId,
          params.orderRef?.trim() || null,
          new Date(params.startedAt).toISOString(),
          params.endedAt ? new Date(params.endedAt).toISOString() : null,
          params.units,
          effectiveBillable,
          effectiveBillingStatus,
          effectiveBillingStatus === 'our_cost'
            ? params.unbilledReason?.trim() || null
            : null,
          params.note?.trim() || null,
          params.entryId,
        ]
      );
    });

    bumpRealtimeVersion();
    revalidateAllPaths();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to update time entry.' };
  }
}

export async function createManualEntryAction(params: {
  userId: string;
  clientId: string;
  taskTypeId: string;
  orderRef?: string | null;
  startedAt: string;
  endedAt?: string | null;
  units?: number | null;
  billable?: boolean;
  billingStatus?: BillingStatus | string | null;
  unbilledReason?: string | null;
  note?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const actor = await requireRole(['supervisor', 'admin']);
    const startIso = new Date(params.startedAt).toISOString();
    const endIso = params.endedAt ? new Date(params.endedAt).toISOString() : null;

    const effectiveBillingStatus = resolveBillingStatus({
      billingStatus: params.billingStatus,
      billable: params.billable,
    });
    const effectiveBillable = effectiveBillingStatus !== 'our_cost';

    if (effectiveBillingStatus === 'our_cost') {
      const trimmedReason = (params.unbilledReason || '').trim();
      if (!trimmedReason) {
        return {
          ok: false,
          error:
            'A mandatory justification is required when unbilling or marking a task as Our Cost.',
        };
      }
    }

    await withDbSession(actor.id, async (tx) => {
      if (!endIso) {
        // If creating a running manual entry, stop any currently running entry for that operative
        await tx.query(
          `update time_entries
           set ended_at = $1::timestamptz, last_activity_at = $1::timestamptz
           where user_id = $2 and ended_at is null`,
          [startIso, params.userId]
        );
      }

      await tx.query(
        `insert into time_entries (
           user_id, client_id, task_type_id, order_ref,
           started_at, ended_at, units, billable, billing_status, unbilled_reason,
           source, crew_id, created_by, auto_stopped, note, last_activity_at
         ) values (
           $1, $2, $3, $4,
           $5::timestamptz, $6::timestamptz, $7, $8, $9, $10,
           'manual', null, $11, false, $12, coalesce($6::timestamptz, now())
         )`,
        [
          params.userId,
          params.clientId,
          params.taskTypeId,
          params.orderRef?.trim() || null,
          startIso,
          endIso,
          params.units ?? null,
          effectiveBillable,
          effectiveBillingStatus,
          effectiveBillingStatus === 'our_cost'
            ? params.unbilledReason?.trim() || null
            : null,
          actor.id,
          params.note?.trim() || null,
        ]
      );
    });

    bumpRealtimeVersion();
    revalidateAllPaths();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to create manual entry.' };
  }
}

// =============================================================================
// 6. Scheduled Jobs (Idle Auto-Stop, Shift-End Close, Daily Summary Email)
// =============================================================================

export async function runIdleAutoStopJobAction(): Promise<{
  ok: boolean;
  stoppedEntryIds: string[];
}> {
  const stoppedEntryIds = await withDbSession(null, async (tx) => {
    const settingRes = await tx.query<{ value: any }>(
      `select value from settings where key = 'idle_stop_minutes' limit 1`
    );
    const idleStopMinutes = Number(settingRes.rows[0]?.value ?? 120);

    // Stop entries whose last_activity_at is older than idle_stop_minutes.
    // Crucial spec requirement: ended_at = the time of the last known activity, not the time the job ran!
    const res = await tx.query<{ id: string }>(
      `update time_entries
       set ended_at = last_activity_at,
           auto_stopped = true
       where ended_at is null
         and last_activity_at <= now() - ($1 || ' minutes')::interval
       returning id`,
      [String(idleStopMinutes)]
    );
    return res.rows.map((r) => r.id);
  });

  if (stoppedEntryIds.length > 0) {
    bumpRealtimeVersion();
    revalidateAllPaths();
  }
  return { ok: true, stoppedEntryIds };
}

export async function runShiftEndJobAction(): Promise<{
  ok: boolean;
  stoppedEntries: number;
  closedAttendances: number;
}> {
  const result = await withDbSession(null, async (tx) => {
    const nowIso = new Date().toISOString();

    const stoppedRes = await tx.query<{ id: string }>(
      `update time_entries
       set ended_at = $1::timestamptz,
           auto_stopped = true,
           last_activity_at = $1::timestamptz
       where ended_at is null
       returning id`,
      [nowIso]
    );

    const closedAttRes = await tx.query<{ id: string }>(
      `update attendance
       set clock_out = $1::timestamptz,
           auto_closed = true,
           reviewed = false
       where clock_out is null
       returning id`,
      [nowIso]
    );

    return {
      stoppedEntries: stoppedRes.rows.length,
      closedAttendances: closedAttRes.rows.length,
    };
  });

  bumpRealtimeVersion();
  revalidateAllPaths();
  return { ok: true, ...result };
}

export async function triggerDailySummaryEmailAction(dateStr?: string) {
  await requireRole(['supervisor', 'admin']);
  const summary = await buildAndSendDailySummary(dateStr, true);
  return { ok: true, summary };
}

// =============================================================================
// 7. Reports Saved Views Actions
// =============================================================================

export async function saveReportViewAction(params: {
  name: string;
  filterJson: Record<string, any>;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const actor = await requireRole(['supervisor', 'admin']);
    const cleanName = params.name.trim();
    if (!cleanName) {
      return { ok: false, error: 'View name is required.' };
    }

    await withDbSession(actor.id, async (tx) => {
      await tx.query(
        `insert into saved_views (user_id, name, filter_json)
         values ($1, $2, $3::jsonb)`,
        [actor.id, cleanName, JSON.stringify(params.filterJson)]
      );
    });

    revalidatePath('/reports');
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to save view.' };
  }
}

export async function deleteReportViewAction(params: {
  viewId: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const actor = await requireRole(['supervisor', 'admin']);
    await withDbSession(actor.id, async (tx) => {
      await tx.query(`delete from saved_views where id = $1 and user_id = $2`, [
        params.viewId,
        actor.id,
      ]);
    });
    revalidatePath('/reports');
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to delete saved view.' };
  }
}

// =============================================================================
// 8. Admin Setup Actions (Clients, Task Catalogue, Users, Settings)
// =============================================================================

export async function upsertClientAction(params: {
  id?: string;
  name: string;
  code: string;
  roundingMinutes: number;
  billableDefault: boolean;
  baselineStatus?: 'learning' | 'established' | 'bossing_it';
  baselineNotes?: string;
  managerTargetDelegated?: boolean;
  active: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const actor = await requireRole(['supervisor', 'admin']);
    const name = params.name.trim();
    const code = params.code.trim().toUpperCase();
    if (!name || !code) {
      return { ok: false, error: 'Client name and code are required.' };
    }

    const isAdmin = actor.role === 'admin';

    await withDbSession(actor.id, async (tx) => {
      if (params.id) {
        if (isAdmin && params.baselineStatus !== undefined) {
          const isApproved =
            params.baselineStatus === 'bossing_it' ||
            params.baselineStatus === 'established';
          await tx.query(
            `update clients
             set name = $1, code = $2, rounding_minutes = $3, billable_default = $4,
                 baseline_status = $5, baseline_approved = $6,
                 baseline_approved_by = case when $6 then coalesce(baseline_approved_by, $7::uuid) else null end,
                 baseline_approved_at = case when $6 then coalesce(baseline_approved_at, now()) else null end,
                 baseline_notes = $8,
                 manager_target_delegated = coalesce($9, manager_target_delegated),
                 active = $10
             where id = $11`,
            [
              name,
              code,
              params.roundingMinutes,
              params.billableDefault,
              params.baselineStatus,
              isApproved,
              actor.id,
              params.baselineNotes ?? null,
              params.managerTargetDelegated,
              params.active,
              params.id,
            ]
          );
        } else {
          await tx.query(
            `update clients
             set name = $1, code = $2, rounding_minutes = $3, billable_default = $4, active = $5
             where id = $6`,
            [name, code, params.roundingMinutes, params.billableDefault, params.active, params.id]
          );
        }
      } else {
        const baselineStatus = isAdmin && params.baselineStatus ? params.baselineStatus : 'learning';
        const isApproved = baselineStatus === 'bossing_it' || baselineStatus === 'established';
        await tx.query(
          `insert into clients (
             name, code, rounding_minutes, billable_default,
             baseline_status, baseline_approved, baseline_approved_by, baseline_approved_at,
             baseline_notes, manager_target_delegated, active
           )
           values ($1, $2, $3, $4, $5, $6, $7, case when $6 then now() else null end, $8, $9, $10)`,
          [
            name,
            code,
            params.roundingMinutes,
            params.billableDefault,
            baselineStatus,
            isApproved,
            isApproved ? actor.id : null,
            params.baselineNotes ?? null,
            Boolean(params.managerTargetDelegated),
            params.active,
          ]
        );
      }
    });

    revalidateAllPaths();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to save client.' };
  }
}

export async function upsertTaskTypeAction(params: {
  id?: string;
  clientId: string | null;
  isStandard?: boolean;
  category?: string;
  name: string;
  code: string;
  roundingMinutes?: number | null;
  standardMinutes: number | null;
  unitLabel: string | null;
  billable?: boolean;
  billingStatus?: BillingStatus | string | null;
  rate: number | null;
  barcode: string | null;
  sortOrder: number;
  active: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const actor = await requireRole(['supervisor', 'admin']);
    const name = params.name.trim();
    const code = params.code.trim().toUpperCase();
    const isStandard = Boolean(params.isStandard);
    const effectiveClientId = isStandard ? null : params.clientId || null;
    const category = params.category?.trim() || 'Fulfilment';
    const barcode = params.barcode?.trim() ? params.barcode.trim().toUpperCase() : null;
    const unitLabel = params.unitLabel?.trim() ? params.unitLabel.trim() : null;
    const roundingMinutes =
      params.roundingMinutes === null || params.roundingMinutes === undefined
        ? null
        : Number(params.roundingMinutes);

    if (!name || !code || (!isStandard && !effectiveClientId)) {
      return { ok: false, error: 'Task name, code, and client (unless Standard) are required.' };
    }

    const effectiveBillingStatus = resolveBillingStatus({
      billingStatus: params.billingStatus,
      billable: params.billable,
      category,
      taskCode: code,
      taskName: name,
    });
    const effectiveBillable = effectiveBillingStatus !== 'our_cost';

    await withDbSession(actor.id, async (tx) => {
      if (params.id) {
        let standardMinutesToSave = params.standardMinutes;
        if (actor.role !== 'admin') {
          const prevRes = await tx.query<{ standard_minutes: number | null; client_id: string | null }>(
            `select standard_minutes::float8 as standard_minutes, client_id from task_types where id = $1`,
            [params.id]
          );
          const prev = prevRes.rows[0];
          if (prev && prev.standard_minutes !== params.standardMinutes) {
            let delegated = false;
            if (prev.client_id) {
              const cRes = await tx.query<{ manager_target_delegated: boolean }>(
                `select coalesce(manager_target_delegated, false) as manager_target_delegated from clients where id = $1`,
                [prev.client_id]
              );
              delegated = Boolean(cRes.rows[0]?.manager_target_delegated);
            }
            if (!delegated) {
              standardMinutesToSave = prev.standard_minutes;
              if (params.standardMinutes !== null && params.standardMinutes > 0) {
                await tx.query(
                  `insert into target_change_requests (
                     task_type_id, client_id, current_standard_minutes, proposed_standard_minutes,
                     reason, status, requested_by
                   ) values ($1, $2, $3, $4, $5, 'pending', $6)`,
                  [
                    params.id,
                    effectiveClientId,
                    prev.standard_minutes,
                    params.standardMinutes,
                    'Target adjustment proposed via Task Catalogue edit (Admin two-point sign-off required)',
                    actor.id,
                  ]
                );
              }
            }
          }
        }

        await tx.query(
          `update task_types
           set client_id = $1, is_standard = $2, category = $3, name = $4, code = $5,
               rounding_minutes = $6, standard_minutes = $7, unit_label = $8,
               billable = $9, billing_status = $10, rate = $11, barcode = $12,
               sort_order = $13, active = $14
           where id = $15`,
          [
            effectiveClientId,
            isStandard,
            category,
            name,
            code,
            roundingMinutes,
            standardMinutesToSave,
            unitLabel,
            effectiveBillable,
            effectiveBillingStatus,
            params.rate,
            barcode,
            params.sortOrder,
            params.active,
            params.id,
          ]
        );
      } else {
        await tx.query(
          `insert into task_types (
             client_id, is_standard, category, name, code, rounding_minutes, standard_minutes, unit_label,
             billable, billing_status, rate, barcode, sort_order, active
           ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            effectiveClientId,
            isStandard,
            category,
            name,
            code,
            roundingMinutes,
            params.standardMinutes,
            unitLabel,
            effectiveBillable,
            effectiveBillingStatus,
            params.rate,
            barcode,
            params.sortOrder,
            params.active,
          ]
        );
      }
    });

    revalidateAllPaths();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to save task type.' };
  }
}

export async function upsertUserAction(params: {
  id?: string;
  displayName: string;
  role: Role;
  pin?: string | null;
  hourlyCost: number | null;
  active: boolean;
  email?: string | null;
  password?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const actor = await requireRole(['admin']);
    const displayName = params.displayName.trim();
    if (!displayName) {
      return { ok: false, error: 'Display name is required.' };
    }

    const pin = params.pin?.trim() || null;
    if (pin && !/^\d{4}$/.test(pin)) {
      return { ok: false, error: 'PIN must be exactly 4 digits.' };
    }

    await withDbSession(actor.id, async (tx) => {
      if (params.id) {
        if (pin) {
          await tx.query(
            `update users
             set display_name = $1, role = $2::role, pin_hash = $3, hourly_cost = $4, active = $5
             where id = $6`,
            [displayName, params.role, pin, params.hourlyCost, params.active, params.id]
          );
          await tx.query(
            `update auth.users set encrypted_password = $1 where id = $2 and email like 'pin-%@internal.local'`,
            [pin, params.id]
          );
        } else {
          await tx.query(
            `update users
             set display_name = $1, role = $2::role, hourly_cost = $3, active = $4
             where id = $5`,
            [displayName, params.role, params.hourlyCost, params.active, params.id]
          );
        }

        if (params.email?.trim()) {
          await tx.query(`update auth.users set email = $1 where id = $2`, [
            params.email.trim().toLowerCase(),
            params.id,
          ]);
        }
        if (params.password?.trim()) {
          await tx.query(`update auth.users set encrypted_password = $1 where id = $2`, [
            params.password.trim(),
            params.id,
          ]);
        }
      } else {
        const newUserId = crypto.randomUUID();
        const effectivePin = pin || '0000';
        const email =
          params.email?.trim().toLowerCase() || `pin-${newUserId}@internal.local`;
        const password = params.password?.trim() || effectivePin;

        // If external Supabase Admin is configured, also provision in Supabase Auth
        const sbAdmin = getSupabaseAdminClient();
        if (sbAdmin) {
          await sbAdmin.auth.admin.createUser({
            id: newUserId,
            email,
            password,
            email_confirm: true,
            user_metadata: { display_name: displayName, role: params.role },
          });
        }

        await tx.query(
          `insert into auth.users (id, email, encrypted_password, raw_user_meta_data)
           values ($1, $2, $3, $4::jsonb)`,
          [newUserId, email, password, JSON.stringify({ display_name: displayName, role: params.role })]
        );

        await tx.query(
          `insert into users (id, display_name, role, pin_hash, hourly_cost, active)
           values ($1, $2, $3::role, $4, $5, $6)`,
          [newUserId, displayName, params.role, effectivePin, params.hourlyCost, params.active]
        );
      }
    });

    revalidateAllPaths();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to save user.' };
  }
}

export async function updateSettingsAction(
  settings: Partial<AppSettings>
): Promise<{ ok: boolean; error?: string }> {
  try {
    const actor = await requireRole(['admin']);

    await withDbSession(actor.id, async (tx) => {
      const entries: Array<[string, any]> = [];
      if (settings.idle_prompt_minutes !== undefined) {
        entries.push(['idle_prompt_minutes', Number(settings.idle_prompt_minutes)]);
      }
      if (settings.idle_stop_minutes !== undefined) {
        entries.push(['idle_stop_minutes', Number(settings.idle_stop_minutes)]);
      }
      if (settings.shift_end !== undefined) {
        entries.push(['shift_end', settings.shift_end]);
      }
      if (settings.summary_time !== undefined) {
        entries.push(['summary_time', settings.summary_time]);
      }
      if (settings.summary_recipients !== undefined) {
        entries.push(['summary_recipients', settings.summary_recipients]);
      }
      if (settings.timezone !== undefined) {
        entries.push(['timezone', settings.timezone]);
      }

      for (const [k, v] of entries) {
        await tx.query(
          `insert into settings (key, value)
           values ($1, $2::jsonb)
           on conflict (key) do update set value = excluded.value`,
          [k, JSON.stringify(v)]
        );
      }
    });

    revalidateAllPaths();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to update settings.' };
  }
}

// =============================================================================
// 9. Offline Queue Replay Action
// =============================================================================

export async function replayOfflineQueueAction(
  items: OfflineQueueItem[]
): Promise<{ ok: boolean; processed: number; discarded: number }> {
  const sorted = [...items].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  let processed = 0;
  let discarded = 0;

  for (const item of sorted) {
    try {
      if (item.action === 'start_task') {
        const p = item.payload as any;
        const res = await startTaskAction({
          clientId: p.clientId,
          taskTypeId: p.taskTypeId,
          orderRef: p.orderRef,
          units: p.units,
          source: p.source || 'picked',
          startedAt: p.startedAt || item.createdAt,
          userId: p.userId,
        });
        if (res.ok) processed++;
        else discarded++;
      } else if (item.action === 'stop_task') {
        const p = item.payload as any;
        const res = await stopTaskAction({
          entryId: p.entryId,
          units: p.units,
          endedAt: p.endedAt || item.createdAt,
          userId: p.userId,
        });
        if (res.ok) processed++;
        else discarded++;
      } else if (item.action === 'clock_in') {
        const p = item.payload as any;
        const res = await clockInAction({
          userId: p.userId,
          timestamp: p.timestamp || item.createdAt,
        });
        if (res.ok) processed++;
        else discarded++;
      } else if (item.action === 'clock_out') {
        const p = item.payload as any;
        const res = await clockOutAction({
          userId: p.userId,
          units: p.units,
          timestamp: p.timestamp || item.createdAt,
        });
        if (res.ok) processed++;
        else discarded++;
      }
    } catch {
      // Server state wins on conflict; discard failed replay item
      discarded++;
    }
  }

  return { ok: true, processed, discarded };
}

// =============================================================================
// 10. Intelligent Billing Review Actions (for K & Finance)
// =============================================================================

export async function reviewBillingEntryAction(params: {
  entryId: string;
  reviewStatus: 'agreed' | 'disputed' | 'pending';
  billingStatus?: BillingStatus;
  unbilledReason?: string | null;
  reviewNote?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const actor = await requireRole(['supervisor', 'admin']);
    await withDbSession(actor.id, async (tx) => {
      const sets: string[] = [
        'billing_review_status = $1',
        'billing_review_note = $2',
      ];
      const values: any[] = [params.reviewStatus, params.reviewNote?.trim() || null];

      if (params.billingStatus) {
        const effectiveBillable = params.billingStatus !== 'our_cost';
        values.push(params.billingStatus);
        sets.push(`billing_status = $${values.length}`);
        values.push(effectiveBillable);
        sets.push(`billable = $${values.length}`);

        if (params.billingStatus === 'our_cost') {
          values.push(params.unbilledReason?.trim() || null);
          sets.push(`unbilled_reason = $${values.length}`);
        }
      }

      values.push(params.entryId);
      await tx.query(
        `update time_entries
         set ${sets.join(', ')}
         where id = $${values.length}`,
        values
      );
    });

    bumpRealtimeVersion();
    revalidateAllPaths();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to review billing entry.' };
  }
}

export async function bulkReviewBillingEntriesAction(params: {
  entryIds: string[];
  reviewStatus: 'agreed';
}): Promise<{ ok: boolean; count?: number; error?: string }> {
  try {
    const actor = await requireRole(['supervisor', 'admin']);
    if (!params.entryIds || params.entryIds.length === 0) {
      return { ok: true, count: 0 };
    }

    await withDbSession(actor.id, async (tx) => {
      await tx.query(
        `update time_entries
         set billing_review_status = $1
         where id = any($2::uuid[])`,
        [params.reviewStatus, params.entryIds]
      );
    });

    bumpRealtimeVersion();
    revalidateAllPaths();
    return { ok: true, count: params.entryIds.length };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to bulk review billing entries.' };
  }
}

// =============================================================================
// 10. Intelligent Target Engine & Two-Point Approval Actions
// =============================================================================

/**
 * Admin signs off customer baseline maturity ("bossing it for that customer")
 * Unlocks intelligent target adjustment suggestions and optionally delegates direct
 * target decision authority to managers.
 */
export async function signOffCustomerBaselineAction(params: {
  clientId: string;
  status: 'learning' | 'established' | 'bossing_it';
  notes?: string;
  managerDelegated?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const actor = await requireRole(['admin']);
    const isApproved =
      params.status === 'bossing_it' || params.status === 'established';

    await withDbSession(actor.id, async (tx) => {
      await tx.query(
        `update clients
         set baseline_status = $1,
             baseline_approved = $2,
             baseline_approved_by = case when $2 then coalesce(baseline_approved_by, $3::uuid) else null end,
             baseline_approved_at = case when $2 then coalesce(baseline_approved_at, now()) else null end,
             baseline_notes = $4,
             manager_target_delegated = coalesce($5, manager_target_delegated)
         where id = $6`,
        [
          params.status,
          isApproved,
          actor.id,
          params.notes ?? null,
          params.managerDelegated,
          params.clientId,
        ]
      );
    });

    bumpRealtimeVersion();
    revalidateAllPaths();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to sign off customer baseline.' };
  }
}

/**
 * Manager or Supervisor submits a Target Change Request based on observed pace variance.
 * If customer authority is delegated to the manager, the target updates immediately.
 * Otherwise, the request is submitted for Admin two-point sign-off.
 */
export async function requestTargetChangeAction(params: {
  taskTypeId: string;
  proposedStandardMinutes: number;
  reason: string;
}): Promise<{ ok: boolean; status?: 'pending' | 'approved'; message?: string; error?: string }> {
  try {
    const actor = await requireRole(['supervisor', 'admin']);
    const proposed = Number(params.proposedStandardMinutes);
    if (!proposed || proposed <= 0) {
      return { ok: false, error: 'Proposed target must be greater than 0 minutes.' };
    }
    const reason = params.reason.trim();
    if (!reason || reason.length < 3) {
      return { ok: false, error: 'Please provide a clear operational reason for the target adjustment.' };
    }

    const res = await withDbSession(actor.id, async (tx) => {
      // 1. Fetch task and client info
      const taskRes = await tx.query<{
        id: string;
        name: string;
        client_id: string | null;
        is_standard: boolean;
        standard_minutes: number | null;
      }>(
        `select id, name, client_id, coalesce(is_standard, false) as is_standard, standard_minutes::float8 as standard_minutes
         from task_types where id = $1`,
        [params.taskTypeId]
      );
      const task = taskRes.rows[0];
      if (!task) {
        return { ok: false, error: 'Task not found.' };
      }

      // 2. Fetch observed metrics from time entries
      const metricsRes = await tx.query<{
        runs: number;
        units: number;
        operatives: number;
        total_minutes: number;
      }>(
        `select
           count(*)::int as runs,
           coalesce(sum(units), 0)::int as units,
           count(distinct user_id)::int as operatives,
           coalesce(sum(extract(epoch from (ended_at - started_at)) / 60), 0)::float8 as total_minutes
         from time_entries
         where task_type_id = $1 and ended_at is not null and units > 0`,
        [params.taskTypeId]
      );
      const metrics = metricsRes.rows[0] ?? { runs: 0, units: 0, operatives: 0, total_minutes: 0 };
      const observedPace = metrics.units > 0 ? Number((metrics.total_minutes / metrics.units).toFixed(2)) : null;
      const currentStandard = task.standard_minutes !== null ? Number(task.standard_minutes) : null;
      const variancePercent =
        currentStandard && observedPace
          ? Number((((currentStandard - observedPace) / currentStandard) * 100).toFixed(1))
          : null;

      // 3. Check client delegation
      let delegated = false;
      if (task.client_id) {
        const clientRes = await tx.query<{ manager_target_delegated: boolean }>(
          `select coalesce(manager_target_delegated, false) as manager_target_delegated from clients where id = $1`,
          [task.client_id]
        );
        delegated = Boolean(clientRes.rows[0]?.manager_target_delegated);
      }

      const isAdmin = actor.role === 'admin';
      if (isAdmin || delegated) {
        // Direct update applied
        await tx.query(
          `update task_types set standard_minutes = $1 where id = $2`,
          [proposed, task.id]
        );

        await tx.query(
          `insert into target_change_requests (
             task_type_id, client_id, current_standard_minutes, proposed_standard_minutes,
             observed_pace, variance_percent, sample_runs, sample_units, operatives_count,
             reason, status, requested_by, reviewed_by, reviewed_at, review_note
           ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'approved', $11, $11, now(), $12)`,
          [
            task.id,
            task.client_id,
            currentStandard,
            proposed,
            observedPace,
            variancePercent,
            metrics.runs,
            metrics.units,
            metrics.operatives,
            reason,
            actor.id,
            isAdmin
              ? 'Directly updated by Administrator'
              : 'Directly applied under authorized customer target delegation',
          ]
        );

        return {
          ok: true,
          status: 'approved' as const,
          message: `Target updated directly to ${proposed.toFixed(2)}m (${(60 / proposed).toFixed(1)} units/hr).`,
        };
      }

      // Two-point governance: insert pending request for Admin review
      await tx.query(
        `insert into target_change_requests (
           task_type_id, client_id, current_standard_minutes, proposed_standard_minutes,
           observed_pace, variance_percent, sample_runs, sample_units, operatives_count,
           reason, status, requested_by
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11)`,
        [
          task.id,
          task.client_id,
          currentStandard,
          proposed,
          observedPace,
          variancePercent,
          metrics.runs,
          metrics.units,
          metrics.operatives,
          reason,
          actor.id,
        ]
      );

      return {
        ok: true,
        status: 'pending' as const,
        message: `Target Change Request (${proposed.toFixed(2)}m) submitted for Admin two-point approval.`,
      };
    });

    bumpRealtimeVersion();
    revalidateAllPaths();
    return res;
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to submit target change request.' };
  }
}

/**
 * Admin two-point review: approve or reject a pending Target Change Request.
 */
export async function reviewTargetChangeAction(params: {
  requestId: string;
  action: 'approve' | 'reject';
  reviewNote?: string;
}): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const actor = await requireRole(['admin']);
    const reviewNote = params.reviewNote?.trim() ?? null;

    const res = await withDbSession(actor.id, async (tx) => {
      const reqRes = await tx.query<{
        id: string;
        task_type_id: string;
        proposed_standard_minutes: number;
        status: string;
      }>(
        `select id, task_type_id, proposed_standard_minutes::float8 as proposed_standard_minutes, status
         from target_change_requests where id = $1`,
        [params.requestId]
      );
      const req = reqRes.rows[0];
      if (!req) {
        return { ok: false, error: 'Target change request not found.' };
      }
      if (req.status !== 'pending') {
        return { ok: false, error: `This request has already been ${req.status}.` };
      }

      if (params.action === 'approve') {
        await tx.query(
          `update task_types set standard_minutes = $1 where id = $2`,
          [req.proposed_standard_minutes, req.task_type_id]
        );

        await tx.query(
          `update target_change_requests
           set status = 'approved', reviewed_by = $1, reviewed_at = now(), review_note = $2
           where id = $3`,
          [actor.id, reviewNote ?? 'Approved by Admin', req.id]
        );

        return {
          ok: true,
          message: `Target change approved! Standard updated to ${req.proposed_standard_minutes.toFixed(2)}m.`,
        };
      } else {
        await tx.query(
          `update target_change_requests
           set status = 'rejected', reviewed_by = $1, reviewed_at = now(), review_note = $2
           where id = $3`,
          [actor.id, reviewNote ?? 'Rejected by Admin', req.id]
        );

        return {
          ok: true,
          message: 'Target change request rejected.',
        };
      }
    });

    bumpRealtimeVersion();
    revalidateAllPaths();
    return res;
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to review target change request.' };
  }
}

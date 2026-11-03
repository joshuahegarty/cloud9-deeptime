import { cookies } from 'next/headers';
import { withDbSession } from './db';
import { Role, UserPublic } from './types';

export const SESSION_COOKIE_NAME = 'c9_task_timer_uid';

export async function getSessionUserId(): Promise<string | null> {
  try {
    const cookieStore = cookies();
    return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<UserPublic | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;

  return withDbSession(userId, async (tx) => {
    const res = await tx.query<UserPublic>(
      `select id, display_name, role, job_title, team_name, coalesce(is_core_warehouse, false) as is_core_warehouse, email, coalesce(must_change_pin, false) as must_change_pin, coalesce(hands_free_voice_enabled, false) as hands_free_voice_enabled, active, created_at::text, updated_at::text
       from users_public
       where id = $1 and active = true`,
      [userId]
    );
    return res.rows[0] ?? null;
  });
}

export async function requireRole(allowedRoles: Role[]): Promise<UserPublic> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Authentication required');
  }
  if (!allowedRoles.includes(user.role)) {
    throw new Error(`Insufficient permissions. Required role: ${allowedRoles.join(' or ')}`);
  }
  return user;
}

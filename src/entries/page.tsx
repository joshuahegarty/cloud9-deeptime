import { requireRole } from '@/lib/auth';
import { getLondonDateString } from '@/lib/calculations';
import {
  getActiveClients,
  getActiveOperativesAndStaff,
  getActiveTaskTypes,
  getEntriesForDate,
} from '@/lib/queries';
import { EntriesClient } from '@/components/EntriesClient';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function EntriesPage({
  searchParams,
}: {
  searchParams?: { date?: string };
}) {
  let user;
  try {
    user = await requireRole(['supervisor', 'admin', 'operative']);
  } catch {
    redirect('/login');
  }

  const dateStr = searchParams?.date || getLondonDateString();

  const [dayData, clients, taskTypes, allUsers] = await Promise.all([
    getEntriesForDate(dateStr, user.id),
    getActiveClients(user.id),
    getActiveTaskTypes(user.id),
    getActiveOperativesAndStaff(),
  ]);

  const operatives = allUsers.filter((u) => u.role === 'operative');

  return (
    <EntriesClient
      dateStr={dateStr}
      entries={dayData.entries}
      auditsByEntry={dayData.auditsByEntry}
      attendance={dayData.attendance}
      clients={clients}
      taskTypes={taskTypes}
      operatives={operatives}
      currentUser={user}
    />
  );
}

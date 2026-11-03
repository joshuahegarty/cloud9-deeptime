import { requireRole } from '@/lib/auth';
import { getLondonDateString } from '@/lib/calculations';
import {
  getActiveClients,
  getActiveOperativesAndStaff,
  getActiveTaskTypes,
  getReportEntries,
  getSavedViewsForUser,
  getTargetChangeRequests,
} from '@/lib/queries';
import { ReportsClient } from '@/components/ReportsClient';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: {
    start?: string;
    end?: string;
    client?: string;
    task?: string;
    operative?: string;
    tab?: 'client_task' | 'operative' | 'league' | 'targets';
  };
}) {
  let user;
  try {
    user = await requireRole(['supervisor', 'admin']);
  } catch {
    redirect('/login');
  }

  const today = getLondonDateString();
  const startDate = searchParams?.start || today;
  const endDate = searchParams?.end || today;
  const clientId = searchParams?.client || 'all';
  const taskTypeId = searchParams?.task || 'all';
  const operativeId = searchParams?.operative || 'all';
  const activeTab = searchParams?.tab || 'client_task';

  const [entries, clients, taskTypes, users, savedViews, targetChangeRequests] =
    await Promise.all([
      getReportEntries({
        startDate,
        endDate,
        clientId,
        taskTypeId,
        userId: operativeId,
        actorUserId: user.id,
      }),
      getActiveClients(user.id),
      getActiveTaskTypes(user.id),
      getActiveOperativesAndStaff(),
      getSavedViewsForUser(user.id),
      getTargetChangeRequests(user.id),
    ]);

  const operatives = users.filter((u) => u.role === 'operative');

  return (
    <ReportsClient
      startDate={startDate}
      endDate={endDate}
      clientId={clientId}
      taskTypeId={taskTypeId}
      operativeId={operativeId}
      initialTab={activeTab}
      entries={entries}
      clients={clients}
      taskTypes={taskTypes}
      operatives={operatives}
      savedViews={savedViews}
      targetChangeRequests={targetChangeRequests}
      currentUser={user}
    />
  );
}

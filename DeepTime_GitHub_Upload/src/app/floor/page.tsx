import { requireRole } from '@/lib/auth';
import { getActiveClients, getActiveTaskTypes, getFloorStatus } from '@/lib/queries';
import { FloorClient } from '@/components/FloorClient';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function FloorPage() {
  let user;
  try {
    user = await requireRole(['supervisor', 'admin']);
  } catch {
    redirect('/login');
  }

  const [floor, clients, taskTypes] = await Promise.all([
    getFloorStatus(user.id),
    getActiveClients(user.id),
    getActiveTaskTypes(user.id),
  ]);

  return (
    <FloorClient
      initialRows={floor.rows}
      settings={floor.settings}
      clients={clients}
      taskTypes={taskTypes}
    />
  );
}

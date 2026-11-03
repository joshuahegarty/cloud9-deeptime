import { requireRole } from '@/lib/auth';
import {
  getAdminUsers,
  getAllClients,
  getAllTaskTypes,
  getSettings,
} from '@/lib/queries';
import { SetupClient } from '@/components/SetupClient';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function SetupPage({
  params,
}: {
  params?: { section?: string[] };
}) {
  let user;
  try {
    user = await requireRole(['supervisor', 'admin']);
  } catch {
    redirect('/login');
  }

  const isAdmin = user.role === 'admin';
  const rawSection = params?.section?.[0] || 'clients';
  const activeSection = ['clients', 'tasks', 'users', 'settings'].includes(rawSection)
    ? (rawSection as 'clients' | 'tasks' | 'users' | 'settings')
    : 'clients';

  const [clients, taskTypes, users, settings] = await Promise.all([
    getAllClients(user.id),
    getAllTaskTypes(user.id),
    isAdmin ? getAdminUsers(user.id) : Promise.resolve([]),
    getSettings(user.id),
  ]);

  return (
    <SetupClient
      initialSection={activeSection}
      isAdmin={isAdmin}
      clients={clients}
      taskTypes={taskTypes}
      users={users}
      settings={settings}
    />
  );
}

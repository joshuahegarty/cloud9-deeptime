import { getCurrentUser } from '@/lib/auth';
import {
  getActiveClients,
  getActiveTaskTypes,
  getOperativeNowData,
  getSettings,
} from '@/lib/queries';
import { NowClient } from '@/components/NowClient';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function NowPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const [nowData, clients, taskTypes, settings] = await Promise.all([
    getOperativeNowData(user.id),
    getActiveClients(user.id),
    getActiveTaskTypes(user.id),
    getSettings(user.id),
  ]);

  return (
    <NowClient
      user={user}
      initialRunningEntry={nowData.runningEntry}
      initialTodayEntries={nowData.todayEntries}
      last5Tasks={nowData.last5Tasks}
      openAttendance={nowData.openAttendance}
      clients={clients}
      taskTypes={taskTypes}
      settings={settings}
    />
  );
}

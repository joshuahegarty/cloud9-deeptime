import { getCurrentUser } from '@/lib/auth';
import { getFloorStatus } from '@/lib/queries';
import { KioskClient } from '@/components/KioskClient';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function KioskPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect('/now');
  }

  const floor = await getFloorStatus(null);

  return <KioskClient rows={floor.rows} />;
}

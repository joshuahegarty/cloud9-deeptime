import { getFloorStatus } from '@/lib/queries';
import { KioskClient } from '@/components/KioskClient';

export const dynamic = 'force-dynamic';

export default async function KioskPage() {
  const floor = await getFloorStatus(null);

  return <KioskClient rows={floor.rows} />;
}

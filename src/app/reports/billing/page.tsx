import { requireRole } from '@/lib/auth';
import { getLondonDateString } from '@/lib/calculations';
import { getReportEntries } from '@/lib/queries';
import { BillingExportClient } from '@/components/BillingExportClient';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function BillingExportPage({
  searchParams,
}: {
  searchParams?: { start?: string; end?: string };
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

  const entries = await getReportEntries({
    startDate,
    endDate,
    actorUserId: user.id,
  });

  // Completed entries (both billable and unbilled for K's intelligent review)
  const completedEntries = entries.filter((e) => Boolean(e.ended_at));

  return (
    <BillingExportClient
      startDate={startDate}
      endDate={endDate}
      entries={completedEntries}
      currentUser={user}
    />
  );
}

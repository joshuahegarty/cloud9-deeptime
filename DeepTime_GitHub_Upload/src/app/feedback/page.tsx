import { getFeedbackReportsAction } from '@/app/actions';
import { FeedbackBoardClient } from '@/components/FeedbackBoardClient';
import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function FeedbackPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const res = await getFeedbackReportsAction();

  return (
    <FeedbackBoardClient
      initialReports={res.reports ?? []}
      user={user}
    />
  );
}

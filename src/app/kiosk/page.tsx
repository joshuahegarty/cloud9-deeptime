import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function KioskPage() {
  const user = await getCurrentUser();
  if (user) {
    if (user.role === 'supervisor' || user.role === 'admin') {
      redirect('/floor');
    }
    redirect('/now');
  }

  redirect('/login');
}

import { getActiveOperativesAndStaff } from '@/lib/queries';
import { LoginClient } from '@/components/LoginClient';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const users = await getActiveOperativesAndStaff();
  const operatives = users.filter((u) => u.role === 'operative');

  return <LoginClient operatives={operatives} />;
}

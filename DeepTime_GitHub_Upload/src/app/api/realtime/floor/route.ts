import { getRealtimeVersion } from '@/lib/db';
import { getFloorStatus } from '@/lib/queries';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const floor = await getFloorStatus(null);
  return NextResponse.json({
    version: getRealtimeVersion(),
    ...floor,
  });
}

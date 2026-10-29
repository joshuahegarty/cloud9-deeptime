import { buildAndSendDailySummary } from '@/lib/summary-email';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const summary = await buildAndSendDailySummary(undefined, true);
  return NextResponse.json({ ok: true, summary });
}

export async function POST() {
  const summary = await buildAndSendDailySummary(undefined, true);
  return NextResponse.json({ ok: true, summary });
}

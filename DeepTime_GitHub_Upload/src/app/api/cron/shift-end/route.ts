import { runShiftEndJobAction } from '@/app/actions';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const res = await runShiftEndJobAction();
  return NextResponse.json(res);
}

export async function POST() {
  const res = await runShiftEndJobAction();
  return NextResponse.json(res);
}

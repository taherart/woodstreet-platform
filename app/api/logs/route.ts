import { NextResponse } from 'next/server';
import { getCreditLogs } from '@/lib/credits';

export async function GET() {
  const logs = getCreditLogs(50);
  return NextResponse.json({ logs });
}

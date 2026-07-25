import { NextResponse } from 'next/server';
import { getAvailableCredits, getCreditInfo } from '@/lib/credits';

export async function GET() {
  const available = getAvailableCredits();
  const info = getCreditInfo();
  return NextResponse.json({
    available,
    total: info?.total_credits || 0,
    used: info?.used_credits || 0,
  });
}

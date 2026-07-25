import { NextRequest, NextResponse } from 'next/server';
import { setMonthlyCredits } from '@/lib/credits';

export async function POST(request: NextRequest) {
  try {
    const { amount } = await request.json();
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'مبلغ غير صالح' }, { status: 400 });
    }
    setMonthlyCredits(amount);
    return NextResponse.json({ success: true, amount });
  } catch {
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

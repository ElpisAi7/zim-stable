import { NextRequest, NextResponse } from 'next/server';
import { getWallet, normalisePhone } from '@/lib/wallet-store';

/**
 * GET /api/wallet/lookup?phone=+263771234567
 * Returns the Celo address registered for a Zimbabwe phone number.
 */
export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get('phone');
  if (!phone) {
    return NextResponse.json({ error: 'phone param required' }, { status: 400 });
  }

  const normalised = normalisePhone(phone);
  const address = await getWallet(normalised);

  if (!address) {
    return NextResponse.json({ address: null }, { status: 404 });
  }

  return NextResponse.json({ address, phone: normalised });
}

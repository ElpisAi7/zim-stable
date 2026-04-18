import { NextRequest, NextResponse } from 'next/server';
import { getWallet, setWallet, normalisePhone } from '@/lib/wallet-store';

/**
 * POST /api/ussd/register
 * Body: { phone: string, wallet: string }
 *
 * Links an E.164 Zimbabwe phone number to a Celo wallet address.
 * Called from the web app after the user connects their wallet.
 */
export async function POST(request: NextRequest) {
  try {
    const { phone, wallet } = await request.json();

    if (!phone || !wallet) {
      return NextResponse.json(
        { success: false, error: 'phone and wallet are required' },
        { status: 400 },
      );
    }

    if (!phone.match(/^\+263\d{9}$/)) {
      return NextResponse.json(
        { success: false, error: 'Phone must be in +263XXXXXXXXX format' },
        { status: 400 },
      );
    }

    if (!wallet.match(/^0x[0-9a-fA-F]{40}$/)) {
      return NextResponse.json(
        { success: false, error: 'Invalid Celo wallet address' },
        { status: 400 },
      );
    }

    await setWallet(phone, wallet);

    return NextResponse.json({
      success: true,
      phone: normalisePhone(phone),
      wallet,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid request' },
      { status: 400 },
    );
  }
}

/**
 * GET /api/ussd/register?phone=+263771234567
 * Returns the wallet registered for a phone number.
 */
export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get('phone');
  if (!phone) {
    return NextResponse.json({ success: false, error: 'phone is required' }, { status: 400 });
  }
  const wallet = getWallet(phone);
  if (!wallet) {
    return NextResponse.json({ success: false, error: 'No wallet registered for this number' }, { status: 404 });
  }
  return NextResponse.json({ success: true, phone, wallet });
}

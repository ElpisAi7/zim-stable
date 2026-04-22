import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

/**
 * Paynow Transaction Status Check
 * GET /api/paynow/status?pollUrl=<url>
 *
 * Fetches the Paynow pollUrl and returns normalised status.
 * The pollUrl is returned by the remotetransaction endpoint on initiation.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const pollUrl = searchParams.get('pollUrl');

  if (!pollUrl) {
    return NextResponse.json({ error: 'pollUrl query param is required' }, { status: 400 });
  }

  try {
    const response = await fetch(pollUrl, { cache: 'no-store' });
    const rawText = await response.text();
    const result = Object.fromEntries(new URLSearchParams(rawText));

    // Paynow status values: created, sent, cancelled, disputed, failed,
    //                        refunded, delivered, paid, awaiting delivery
    const raw = (result.status || '').toLowerCase();
    const status = raw === 'paid' ? 'paid'
      : raw === 'failed' || raw === 'cancelled' ? 'failed'
      : 'pending';

    return NextResponse.json({
      status,
      rawStatus: result.status,
      amount: result.amount,
      reference: result.reference,
      paynowReference: result.paynowreference,
    });
  } catch (error: any) {
    console.error('[Paynow] Status poll error:', error?.message);
    return NextResponse.json({ error: 'Status check failed' }, { status: 500 });
  }
}


/**
 * Paynow Transaction Status Check API Route
 * POST /api/paynow/status
 * Checks the status of a Paynow transaction
 */

interface StatusCheckRequest {
  reference: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: StatusCheckRequest = await request.json();

    if (!body.reference) {
      return NextResponse.json(
        { error: 'Reference is required' },
        { status: 400 }
      );
    }

    const paynowIntegrationKey = process.env.PAYNOW_INTEGRATION_KEY;
    const paynowStatusUrl = process.env.PAYNOW_STATUS_URL || 'https://www.paynow.co.zw/api/status';

    if (!paynowIntegrationKey) {
      return NextResponse.json(
        { error: 'Paynow integration key not configured' },
        { status: 500 }
      );
    }

    // Check status from Paynow
    const response = await axios.get(paynowStatusUrl, {
      params: {
        reference: body.reference,
        integrationkey: paynowIntegrationKey,
      },
    });

    const txData = response.data;

    return NextResponse.json({
      reference: body.reference,
      status: txData.status === 'Paid' ? 'completed' : txData.status === 'Failed' ? 'failed' : 'pending',
      amount: txData.amount || 0,
      timestamp: new Date().toISOString(),
      paymentMethod: txData.method || 'other',
    });
  } catch (error) {
    console.error('[Paynow] Status check error:', error);
    return NextResponse.json(
      { error: 'Status check failed' },
      { status: 500 }
    );
  }
}

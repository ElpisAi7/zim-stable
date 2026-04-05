import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

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

import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

/**
 * Yellow Card Swap Status API Route
 * POST /api/yellowcard/status
 * Checks the status of an ongoing swap
 */

interface StatusRequest {
  transactionId: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: StatusRequest = await request.json();

    if (!body.transactionId) {
      return NextResponse.json(
        { error: 'Transaction ID is required' },
        { status: 400 }
      );
    }

    const yellowcardApiKey = process.env.YELLOWCARD_API_KEY;
    const yellowcardBaseUrl = process.env.YELLOWCARD_API_URL || 'https://api.yellowcard.io/v2';

    if (!yellowcardApiKey) {
      return NextResponse.json(
        { error: 'Yellow Card API key not configured' },
        { status: 500 }
      );
    }

    // Get swap status from Yellow Card
    const response = await axios.get(`${yellowcardBaseUrl}/swaps/${body.transactionId}`, {
      headers: {
        Authorization: `Bearer ${yellowcardApiKey}`,
        'Content-Type': 'application/json',
      },
    });

    return NextResponse.json({
      transactionId: body.transactionId,
      status: response.data.status || 'pending',
      hash: response.data.tx_hash || undefined,
      estimatedTime: response.data.estimated_time_ms || 300000,
    });
  } catch (error) {
    console.error('[YellowCard] Status check error:', error);
    return NextResponse.json(
      { error: 'Status check failed' },
      { status: 500 }
    );
  }
}

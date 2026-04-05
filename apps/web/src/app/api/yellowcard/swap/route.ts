import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

/**
 * Yellow Card Swap Execution API Route
 * POST /api/yellowcard/swap
 * Executes a currency swap and initiates blockchain transfer
 */

interface SwapRequest {
  quoteId: string;
  fromAddress?: string;
  toAddress: string;
  destinationTag?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: SwapRequest = await request.json();

    if (!body.quoteId || !body.toAddress) {
      return NextResponse.json(
        { error: 'Missing required fields' },
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

    // Execute swap via Yellow Card
    const response = await axios.post(
      `${yellowcardBaseUrl}/swaps`,
      {
        quote_id: body.quoteId,
        destination_address: body.toAddress,
        destination_tag: body.destinationTag,
      },
      {
        headers: {
          Authorization: `Bearer ${yellowcardApiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('[YellowCard] Swap executed:', {
      transactionId: response.data.id,
      status: response.data.status,
      toAddress: body.toAddress,
    });

    return NextResponse.json({
      transactionId: response.data.id,
      status: response.data.status || 'pending',
      hash: response.data.tx_hash || undefined,
      estimatedTime: response.data.estimated_time_ms || 300000,
    });
  } catch (error) {
    console.error('[YellowCard] Swap error:', error);
    return NextResponse.json(
      { error: 'Swap execution failed', transactionId: '', status: 'failed' },
      { status: 500 }
    );
  }
}

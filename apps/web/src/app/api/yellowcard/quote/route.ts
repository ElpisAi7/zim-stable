import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

/**
 * Yellow Card Quote API Route
 * POST /api/yellowcard/quote
 * Gets real-time exchange rate & fee quote from Yellow Card
 */

interface QuoteRequest {
  fromCurrency: string;
  toCurrency: string;
  amount: number;
  paymentMethod?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: QuoteRequest = await request.json();

    if (!body.fromCurrency || !body.toCurrency || !body.amount) {
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

    // Get quote from Yellow Card
    const response = await axios.get(`${yellowcardBaseUrl}/quotes`, {
      params: {
        from_currency: body.fromCurrency,
        to_currency: body.toCurrency,
        amount: body.amount,
      },
      headers: {
        Authorization: `Bearer ${yellowcardApiKey}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('[YellowCard] Quote generated:', {
      fromCurrency: body.fromCurrency,
      toCurrency: body.toCurrency,
      amount: body.amount,
      rate: response.data.rate,
    });

    return NextResponse.json({
      quoteId: response.data.id,
      fromAmount: body.amount,
      fromCurrency: body.fromCurrency,
      toAmount: response.data.to_amount,
      toCurrency: body.toCurrency,
      rate: response.data.rate,
      expiresAt: response.data.expires_at,
      fee: response.data.fee || 0,
    });
  } catch (error) {
    console.error('[YellowCard] Quote error:', error);
    return NextResponse.json(
      { error: 'Failed to get quote' },
      { status: 500 }
    );
  }
}

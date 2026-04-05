import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getConfig } from '@/lib/config';

/**
 * Yellow Card Payout Handler - Direct Liquidity Execution
 * POST /api/yellowcard/payout
 * Executes instant swap of EcoCash payment to stablecoin on Celo
 * 
 * Called automatically after Paynow payment confirmation
 */

interface PayoutRequest {
  paymentReference: string;
  amount: number;
  fromCurrency: string; // ZWL
  toCurrency: string; // cUSD or USDC
  toAddress: string; // Celo wallet address (0x...)
}

export async function POST(request: NextRequest) {
  try {
    const body: PayoutRequest = await request.json();

    console.log('[YellowCard] Payout request:', {
      reference: body.paymentReference,
      amount: body.amount,
      from: body.fromCurrency,
      to: body.toCurrency,
      wallet: body.toAddress?.slice(0, 10) + '...',
    });

    const config = getConfig();
    const yellowCardApiKey = config.yellowcard.apiKey;

    if (!yellowCardApiKey) {
      console.error('[YellowCard] API key not configured');
      return NextResponse.json(
        { error: 'Yellow Card API not configured' },
        { status: 500 }
      );
    }

    // Step 1: Get quote from Yellow Card
    const quoteResponse = await axios.post(
      'https://api.yellowcard.io/v2/quotes',
      {
        fromCurrency: body.fromCurrency,
        toCurrency: body.toCurrency,
        amount: body.amount,
        paymentMethod: 'ecocash',
      },
      {
        headers: {
          Authorization: `Bearer ${yellowCardApiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const quote = quoteResponse.data;
    console.log('[YellowCard] Quote received:', {
      quoteId: quote.quoteId,
      rate: quote.rate,
      toAmount: quote.toAmount,
    });

    // Step 2: Execute swap using the quote
    const swapResponse = await axios.post(
      'https://api.yellowcard.io/v2/orders',
      {
        quoteId: quote.quoteId,
        destinationAddress: body.toAddress,
        externalReference: body.paymentReference,
      },
      {
        headers: {
          Authorization: `Bearer ${yellowCardApiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const order = swapResponse.data;
    console.log('[YellowCard] Order created:', {
      orderId: order.orderId,
      status: order.status,
      toAmount: order.toAmount,
    });

    return NextResponse.json({
      success: true,
      transactionId: order.orderId,
      status: order.status,
      toAmount: order.toAmount,
      toCurrency: body.toCurrency,
      message: `Payout of ${order.toAmount} ${body.toCurrency} initiated to ${body.toAddress}`,
    });
  } catch (error) {
    console.error('[YellowCard] Payout error:', error);
    const errorMessage = error instanceof axios.AxiosError 
      ? error.response?.data?.message || error.message
      : error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        error: 'Payout failed',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
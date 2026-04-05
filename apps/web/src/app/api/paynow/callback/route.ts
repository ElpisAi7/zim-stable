import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

/**
 * Paynow Callback Handler - Direct Liquidity Bridge
 * POST /api/paynow/callback
 * Receives payment confirmation from Paynow and triggers Yellow Card payout instantly
 * 
 * Flow:
 * 1. User sends EcoCash via Paynow
 * 2. Paynow confirms payment
 * 3. Server receives callback
 * 4. Server calls Yellow Card API to swap ZWL → cUSD/USDC
 * 5. Stablecoins land instantly in user's Celo wallet
 */

interface PaynowCallbackPayload {
  id: string;
  reference: string;
  amount: number;
  status: string;
  pollurl: string;
}

interface LiquidityTransaction {
  paymentReference: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'processing' | 'completed' | 'failed';
  caloWalletAddress?: string;
  yellowCardTxId?: string;
  timestamp: Date;
}

// In-memory store (replace with database in production)
const transactionLog = new Map<string, LiquidityTransaction>();

export async function POST(request: NextRequest) {
  try {
    const body: PaynowCallbackPayload = await request.json();

    console.log('[Liquidity] Paynow callback received:', {
      reference: body.reference,
      id: body.id,
      status: body.status,
      amount: body.amount,
    });

    // Verify the transaction with Paynow
    const verifyResponse = await axios.get(body.pollurl);

    if (verifyResponse.data.status === 'Paid') {
      console.log('[Liquidity] Payment confirmed:', body.reference);

      // Extract wallet address from reference (format: "reference_walletAddress")
      const [paymentRef, walletAddress] = body.reference.split('_');
      
      if (!walletAddress || !walletAddress.startsWith('0x')) {
        console.error('[Liquidity] Invalid wallet address in reference:', body.reference);
        return NextResponse.json(
          { error: 'Invalid wallet address' },
          { status: 400 }
        );
      }

      // Create transaction record
      const transaction: LiquidityTransaction = {
        paymentReference: body.reference,
        amount: body.amount,
        currency: 'ZWL',
        status: 'paid',
        caloWalletAddress: walletAddress,
        timestamp: new Date(),
      };

      // Store transaction
      transactionLog.set(body.reference, transaction);

      // Trigger Yellow Card swap immediately
      try {
        const yellowCardResponse = await fetch('/api/yellowcard/payout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentReference: body.reference,
            amount: body.amount,
            fromCurrency: 'ZWL',
            toCurrency: 'cUSD',
            toAddress: walletAddress,
          }),
        });

        if (!yellowCardResponse.ok) {
          throw new Error(`Yellow Card error: ${yellowCardResponse.statusText}`);
        }

        const yellowCardData = await yellowCardResponse.json();
        console.log('[Liquidity] Yellow Card payout initiated:', yellowCardData);

        // Update transaction with Yellow Card ID
        transaction.yellowCardTxId = yellowCardData.transactionId;
        transaction.status = 'processing';
        transactionLog.set(body.reference, transaction);

        return NextResponse.json({
          confirmed: true,
          reference: body.reference,
          yellowCardTxId: yellowCardData.transactionId,
          message: 'Payment received. Processing stablecoin payout...',
        });
      } catch (yellowCardError) {
        console.error('[Liquidity] Yellow Card payout failed:', yellowCardError);
        transaction.status = 'failed';
        transactionLog.set(body.reference, transaction);

        // TODO: Trigger refund to user's EcoCash wallet
        return NextResponse.json(
          {
            confirmed: true,
            reference: body.reference,
            error: 'Payout processing failed. Refund will be initiated.',
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      confirmed: false,
      reference: body.reference,
      message: 'Payment not yet confirmed',
    });
  } catch (error) {
    console.error('[Liquidity] Callback error:', error);
    return NextResponse.json(
      { error: 'Callback processing failed' },
      { status: 500 }
    );
  }
}

// Helper endpoint to check transaction status
export async function GET(request: NextRequest) {
  try {
    const reference = request.nextUrl.searchParams.get('reference');
    if (!reference) {
      return NextResponse.json({ error: 'Reference required' }, { status: 400 });
    }

    const transaction = transactionLog.get(reference);
    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    return NextResponse.json(transaction);
  } catch (error) {
    console.error('[Liquidity] Status check error:', error);
    return NextResponse.json({ error: 'Status check failed' }, { status: 500 });
  }
}

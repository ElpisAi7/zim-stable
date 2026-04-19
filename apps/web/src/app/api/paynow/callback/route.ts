import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getWallet } from '@/lib/wallet-store';

/**
 * Paynow Callback Handler - Direct Liquidity Bridge
 * POST /api/paynow/callback
 * Receives payment confirmation from Paynow and triggers Yellow Card payout instantly
 *
 * Paynow sends application/x-www-form-urlencoded POST:
 *   reference, amount, status, pollurl, paynowreference, hash
 *
 * Flow:
 * 1. User sends EcoCash via Paynow
 * 2. Paynow confirms payment via this callback
 * 3. Server verifies with pollurl
 * 4. Server calls Yellow Card API to swap ZWL → cUSD/USDC
 * 5. Stablecoins land in user's Celo wallet
 */

interface LiquidityTransaction {
  paymentReference: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'processing' | 'completed' | 'failed';
  celoWalletAddress?: string;
  yellowCardTxId?: string;
  timestamp: Date;
}

// In-memory store (replace with database in production)
const transactionLog = new Map<string, LiquidityTransaction>();

export async function POST(request: NextRequest) {
  try {
    // Paynow sends application/x-www-form-urlencoded
    const rawBody = await request.text();
    const params = new URLSearchParams(rawBody);
    const body = {
      reference: params.get('reference') || '',
      amount: parseFloat(params.get('amount') || '0'),
      status: params.get('status') || '',
      pollurl: params.get('pollurl') || '',
    };

    console.log('[Liquidity] Paynow callback received:', {
      reference: body.reference,
      status: body.status,
      amount: body.amount,
    });

    // Verify the transaction with Paynow by polling
    const verifyResponse = await axios.get(body.pollurl);
    // Paynow poll returns URL-encoded text; axios may parse it as a string
    let verifiedStatus: string;
    if (typeof verifyResponse.data === 'string') {
      const pollParams = new URLSearchParams(verifyResponse.data);
      verifiedStatus = pollParams.get('status') || '';
    } else {
      verifiedStatus = verifyResponse.data.status || '';
    }

    if (verifiedStatus.toLowerCase() === 'paid') {
      console.log('[Liquidity] Payment confirmed:', body.reference);

      // Extract wallet address from reference.
      // Web flow format:  "<timestamp>_<0xWallet>" → last segment is wallet
      // USSD flow format: "USSD_<timestamp>_<phoneDigits>" → look up from wallet store
      const parts = body.reference.split('_');
      let walletAddress: string | null = null;

      const lastPart = parts[parts.length - 1];
      if (lastPart.startsWith('0x')) {
        walletAddress = lastPart;
      } else {
        // USSD flow: phone digits are in the last part — look up registered wallet
        const phoneDigits = lastPart;
        const phone = `+${phoneDigits}`;
        walletAddress = await getWallet(phone);
        if (!walletAddress) {
          console.error('[Liquidity] No wallet registered for phone', phone);
          return NextResponse.json({ error: 'No wallet registered for this phone' }, { status: 400 });
        }
      }

      // Create transaction record
      const transaction: LiquidityTransaction = {
        paymentReference: body.reference,
        amount: body.amount,
        currency: 'ZWL',
        status: 'paid',
        celoWalletAddress: walletAddress,
        timestamp: new Date(),
      };

      // Store transaction
      transactionLog.set(body.reference, transaction);

      // Trigger Yellow Card swap immediately
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://zim-stable-web.vercel.app';
      try {
        const yellowCardResponse = await fetch(`${appUrl}/api/yellowcard/payout`, {
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

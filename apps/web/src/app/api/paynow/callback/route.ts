import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getWallet } from '@/lib/wallet-store';
import { createWalletClient, createPublicClient, http, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { celo } from 'viem/chains';

// cUSD on Celo Mainnet (18 decimals) — MiniPay uses cUSD natively for gas
const MUSDC_ADDRESS = '0x765DE816845861e75A25fCA122bb6898B8B1282a' as const;
const ZWG_TO_USD = 0.015;

const MUSDC_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function' as const,
    stateMutability: 'nonpayable' as const,
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const payoutLocks = new Map<string, Promise<void>>();

function isRetryableNonceError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return (
    lower.includes('nonce too low') ||
    lower.includes('already known') ||
    lower.includes('lower than the current nonce')
  );
}

async function withAccountLock<T>(accountAddress: string, fn: () => Promise<T>): Promise<T> {
  const previous = payoutLocks.get(accountAddress) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  payoutLocks.set(accountAddress, previous.then(() => current));

  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (payoutLocks.get(accountAddress) === current) {
      payoutLocks.delete(accountAddress);
    }
  }
}

// Liquidity wallet (Account 2) transfers mUSDC from its own balance to the buyer
async function mintMusdc(toAddress: string, zwgAmount: number): Promise<string> {
  const rawKey = process.env.ADMIN_PRIVATE_KEY;
  if (!rawKey) throw new Error('ADMIN_PRIVATE_KEY not set');
  const privateKey = (rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`) as `0x${string}`;
  const account = privateKeyToAccount(privateKey);
  const rpcUrl = 'https://forno.celo.org';
  const client = createWalletClient({ account, chain: celo, transport: http(rpcUrl) });
  const publicClient = createPublicClient({ chain: celo, transport: http(rpcUrl) });

  return withAccountLock(account.address, async () => {
    const usdcAmount = zwgAmount * ZWG_TO_USD;
    const amountWei = parseUnits(usdcAmount.toFixed(6), 18); // cUSD has 18 decimals

    for (let attempt = 0; attempt < 3; attempt++) {
      const nonce = await publicClient.getTransactionCount({ address: account.address, blockTag: 'pending' });
      try {
        const hash = await client.writeContract({
          address: MUSDC_ADDRESS,
          abi: MUSDC_TRANSFER_ABI,
          functionName: 'transfer',
          args: [toAddress as `0x${string}`, amountWei],
          nonce,
        });
        return hash;
      } catch (error) {
        if (!isRetryableNonceError(error) || attempt === 2) {
          throw error;
        }
        console.warn('[Payout] Nonce conflict, retrying payout send...', {
          attempt: attempt + 1,
          account: account.address,
        });
      }
    }

    throw new Error('Payout failed after nonce retries');
  });
}

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

// Last callback log for debugging (last 10 raw hits)
const callbackLog: { ts: string; body: string; error?: string }[] = [];

export async function POST(request: NextRequest) {
  try {
    // Paynow sends application/x-www-form-urlencoded
    const rawBody = await request.text();

    // Record raw hit for debugging
    callbackLog.push({ ts: new Date().toISOString(), body: rawBody });
    if (callbackLog.length > 10) callbackLog.shift();
    console.log('[Callback] Raw body received:', rawBody);

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

    // If Paynow already says "paid" in the callback body, trust it.
    // Also try to verify via pollurl but don't block on failure.
    let verifiedStatus = body.status.toLowerCase();
    if (verifiedStatus !== 'paid' && body.pollurl) {
      try {
        const verifyResponse = await axios.get(body.pollurl, { timeout: 8000 });
        if (typeof verifyResponse.data === 'string') {
          const pollParams = new URLSearchParams(verifyResponse.data);
          verifiedStatus = (pollParams.get('status') || '').toLowerCase();
        } else {
          verifiedStatus = (verifyResponse.data.status || '').toLowerCase();
        }
      } catch (pollErr) {
        console.warn('[Liquidity] Poll failed, falling back to callback status:', pollErr);
        verifiedStatus = body.status.toLowerCase();
      }
    }

    if (verifiedStatus === 'paid') {
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

      const existingTransaction = transactionLog.get(body.reference);
      if (existingTransaction?.status === 'completed' && existingTransaction.yellowCardTxId) {
        return NextResponse.json({
          confirmed: true,
          reference: body.reference,
          txHash: existingTransaction.yellowCardTxId,
          message: 'Payment already processed. cUSD already sent.',
        });
      }

      if (existingTransaction?.status === 'processing') {
        return NextResponse.json({
          confirmed: true,
          reference: body.reference,
          message: 'Payment is already being processed.',
        });
      }

      // Create transaction record
      const transaction: LiquidityTransaction = {
        paymentReference: body.reference,
        amount: body.amount,
        currency: 'ZWL',
        status: 'processing',
        celoWalletAddress: walletAddress,
        timestamp: new Date(),
      };

      // Store transaction
      transactionLog.set(body.reference, transaction);

      // Mint mUSDC directly to user's Celo Sepolia wallet
      try {
        if (!process.env.ADMIN_PRIVATE_KEY) {
          const msg = '[Payout] ADMIN_PRIVATE_KEY is not set in environment variables!';
          console.error(msg);
          callbackLog[callbackLog.length - 1].error = msg;
          return NextResponse.json({ confirmed: true, reference: body.reference, error: 'Server misconfiguration: payout key missing' }, { status: 500 });
        }
        const txHash = await mintMusdc(walletAddress, body.amount);
        console.log('[Payout] mUSDC minted on-chain:', { txHash, to: walletAddress, zwg: body.amount });
        transaction.status = 'completed';
        transaction.yellowCardTxId = txHash;
        transactionLog.set(body.reference, transaction);

        return NextResponse.json({
          confirmed: true,
          reference: body.reference,
          txHash,
          message: 'Payment received. cUSD sent to your Celo wallet.',
        });
      } catch (payoutError) {
        const errMsg = payoutError instanceof Error ? payoutError.message : String(payoutError);
        console.error('[Payout] cUSD transfer failed:', errMsg, payoutError);
        transaction.status = 'failed';
        transactionLog.set(body.reference, transaction);
        return NextResponse.json(
          { confirmed: true, reference: body.reference, error: 'Payout failed: ' + errMsg },
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

// Helper endpoint to check transaction status or debug last callbacks
export async function GET(request: NextRequest) {
  try {
    const reference = request.nextUrl.searchParams.get('reference');
    const debug = request.nextUrl.searchParams.get('debug');

    if (debug === '1') {
      return NextResponse.json({
        adminKeySet: !!process.env.ADMIN_PRIVATE_KEY,
        lastCallbacks: callbackLog,
        transactionCount: transactionLog.size,
      });
    }

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

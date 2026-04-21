import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createWalletClient, http, createPublicClient } from 'viem';import { privateKeyToAccount } from 'viem/accounts';
import { celo } from 'viem/chains';

/**
 * POST /api/sell/release
 *
 * Called by the frontend after the user has deposited USDC into ZimEscrow.
 * Steps:
 *  1. Initiate a Paynow EcoCash push to the user's phone (ZWG payout)
 *  2. Poll Paynow until paid (up to 2 minutes)
 *  3. Admin wallet calls releaseFunds(escrowId) on ZimEscrow → USDC goes back to liquidity wallet
 *
 * Body: { escrowId, phone, amountUsdc, txHash }
 *   - escrowId   : on-chain escrow ID (number)
 *   - phone      : seller phone in E.164 (+263XXXXXXXXX)
 *   - amountUsdc : human-readable USDC amount (e.g. "1.25")
 *   - txHash     : deposit tx hash (for logging)
 */

const ZIM_ESCROW_ADDRESS = '0x433154056a8dbbdb81d278a421754833044ce487' as const;
const USD_TO_ZWG = 1 / 0.015; // 1 ZWG = 0.015 USD → 1 USD = 66.67 ZWG

const RELEASE_ABI = [
  {
    name: 'adminRelease',
    type: 'function' as const,
    stateMutability: 'nonpayable' as const,
    inputs: [{ name: '_escrowId', type: 'uint256' }],
    outputs: [],
  },
] as const;

function buildSignature(fields: Record<string, string>, integrationKey: string): string {
  const values = Object.values(fields).join('');
  return crypto.createHash('sha512').update(values + integrationKey).digest('hex').toUpperCase();
}

async function initiatePaynowPush(phone: string, zwgAmount: number, reference: string): Promise<string> {
  const integrationId = process.env.PAYNOW_INTEGRATION_ID!;
  const integrationKey = process.env.PAYNOW_INTEGRATION_KEY!;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://zim-stable-web.vercel.app';
  const resultUrl = `${appUrl}/api/paynow/callback`;
  const returnUrl = `${appUrl}/success`;
  const email = process.env.PAYNOW_MERCHANT_EMAIL || '';
  const amountStr = zwgAmount.toFixed(2);
  const description = `ZimStable ZWG payout`;
  const items = `${description}:${amountStr},`;

  const hashFields: Record<string, string> = {
    resulturl: resultUrl,
    returnurl: returnUrl,
    reference,
    amount: amountStr,
    id: integrationId,
    additionalinfo: description,
    authemail: email,
    status: 'Message',
    items,
    phone,
    method: 'ecocash',
  };

  const hash = buildSignature(hashFields, integrationKey);
  const body = new URLSearchParams({ ...hashFields, hash });
  const res = await fetch('https://www.paynow.co.zw/interface/remotetransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const text = await res.text();
  const params = new URLSearchParams(text);
  if ((params.get('status') || '').toLowerCase() !== 'ok') {
    throw new Error(`Paynow initiation failed: ${text}`);
  }
  return params.get('pollurl') || '';
}

async function pollUntilPaid(pollUrl: string, maxAttempts = 40): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const res = await fetch(pollUrl, { signal: AbortSignal.timeout(8000) });
      const text = await res.text();
      const params = new URLSearchParams(text);
      const status = (params.get('status') || '').toLowerCase();
      if (status === 'paid') return true;
      if (status === 'failed' || status === 'cancelled') return false;
    } catch { /* keep polling */ }
  }
  return false;
}

async function releaseFundsOnChain(escrowId: bigint, sellerAddress: string): Promise<string> {
  const rawKey = process.env.ADMIN_PRIVATE_KEY!;
  const privateKey = (rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`) as `0x${string}`;
  const account = privateKeyToAccount(privateKey);

  const walletClient = createWalletClient({ account, chain: celo, transport: http('https://forno.celo.org') });
  const publicClient = createPublicClient({ chain: celo, transport: http('https://forno.celo.org') });

  const hash = await walletClient.writeContract({
    address: ZIM_ESCROW_ADDRESS,
    abi: RELEASE_ABI,
    functionName: 'adminRelease',
    args: [escrowId],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function POST(request: NextRequest) {
  try {
    const { escrowId, phone, amountUsdc, txHash } = await request.json();

    if (!escrowId && escrowId !== 0) return NextResponse.json({ error: 'escrowId required' }, { status: 400 });
    if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 });
    if (!amountUsdc) return NextResponse.json({ error: 'amountUsdc required' }, { status: 400 });

    if (!process.env.PAYNOW_INTEGRATION_ID || !process.env.PAYNOW_INTEGRATION_KEY) {
      return NextResponse.json({ error: 'Paynow credentials not configured' }, { status: 500 });
    }
    if (!process.env.ADMIN_PRIVATE_KEY) {
      return NextResponse.json({ error: 'ADMIN_PRIVATE_KEY not configured' }, { status: 500 });
    }

    const zwgAmount = parseFloat(amountUsdc) * USD_TO_ZWG;
    const reference = `SELL_${Date.now()}_${phone.replace(/\D/g, '')}`;

    console.log('[SellRelease] Initiating EcoCash push', { phone, zwgAmount: zwgAmount.toFixed(2), reference });

    // Step 1: Push EcoCash to user's phone
    const pollUrl = await initiatePaynowPush(phone, zwgAmount, reference);

    console.log('[SellRelease] Polling Paynow...', pollUrl);

    // Step 2: Poll until paid (runs server-side, max ~2 min)
    const paid = await pollUntilPaid(pollUrl);

    if (!paid) {
      return NextResponse.json(
        { error: 'EcoCash payment was not confirmed within 2 minutes. Please try again.' },
        { status: 408 }
      );
    }

    console.log('[SellRelease] EcoCash confirmed, releasing escrow', escrowId);

    // Step 3: Release USDC from escrow
    const releaseResult = await releaseFundsOnChain(BigInt(escrowId), '');

    return NextResponse.json({
      success: true,
      ecocashPaid: true,
      releaseTxHash: releaseResult,
      message: `ZWG ${zwgAmount.toFixed(2)} sent via EcoCash. USDC released on-chain.`,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[SellRelease] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

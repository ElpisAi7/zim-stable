import { NextRequest, NextResponse } from 'next/server';
import { createWalletClient, http, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { celo } from 'viem/chains';

// Only available in non-production environments
const CUSD_ADDRESS = '0x765DE816845861e75A25fCA122bb6898B8B1282a' as const;

const TRANSFER_ABI = [
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

/**
 * DEV ONLY — simulate a confirmed Paynow payout
 * POST /api/paynow/test-payout
 * Body: { "to": "0x...", "zwg": 10 }
 *
 * Transfers cUSD from the ADMIN liquidity wallet to `to`.
 * Rate: zwg * 0.015 = cUSD amount
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  let body: { to?: string; zwg?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { to, zwg } = body;

  if (!to || !/^0x[0-9a-fA-F]{40}$/.test(to)) {
    return NextResponse.json({ error: 'Invalid "to" address' }, { status: 400 });
  }
  if (!zwg || isNaN(Number(zwg)) || Number(zwg) <= 0) {
    return NextResponse.json({ error: 'Invalid "zwg" amount' }, { status: 400 });
  }

  const rawKey = process.env.ADMIN_PRIVATE_KEY;
  if (!rawKey) {
    return NextResponse.json({ error: 'ADMIN_PRIVATE_KEY not set in .env.local' }, { status: 500 });
  }

  const privateKey = (rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`) as `0x${string}`;
  const account = privateKeyToAccount(privateKey);
  const client = createWalletClient({
    account,
    chain: celo,
    transport: http('https://forno.celo.org'),
  });

  const ZWG_TO_USD = 0.015;
  const usdAmount = Number(zwg) * ZWG_TO_USD;
  const amountWei = parseUnits(usdAmount.toFixed(6), 18);

  try {
    const txHash = await client.writeContract({
      address: CUSD_ADDRESS,
      abi: TRANSFER_ABI,
      functionName: 'transfer',
      args: [to as `0x${string}`, amountWei],
    });

    console.log(`[test-payout] Sent ${usdAmount} cUSD to ${to} | tx: ${txHash}`);

    return NextResponse.json({
      success: true,
      to,
      zwg: Number(zwg),
      cUSD: usdAmount,
      txHash,
      celoscan: `https://celoscan.io/tx/${txHash}`,
    });
  } catch (err: any) {
    console.error('[test-payout] Transfer failed:', err);
    return NextResponse.json(
      { error: err?.shortMessage || err?.message || 'Transfer failed' },
      { status: 500 }
    );
  }
}

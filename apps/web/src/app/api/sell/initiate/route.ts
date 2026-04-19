import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

/**
 * Sell / Off-Ramp Initiation
 * POST /api/sell/initiate
 *
 * Called after the user has deposited cUSD into the ZimEscrow contract on-chain.
 * Body:
 *   escrowId    — on-chain escrow ID returned by depositEscrow()
 *   txHash      — the transaction hash of the deposit
 *   wallet      — user's Celo wallet address
 *   phone       — user's EcoCash number in E.164 (+263XXXXXXXXX)
 *   amountCusd  — cUSD amount the user locked (as a string, e.g. "5.00")
 *
 * The server records the sell request.  An admin cron job (or Defender
 * autotask) monitors the escrow, releases the tokens, and sends ZWG via
 * EcoCash to the user's phone.
 */

const PREFIX = 'zimstable:sell:';

let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) redis = new Redis({ url, token });
  return redis;
}

// In-memory fallback for local dev
const memStore = new Map<string, object>();

async function storeSell(id: string, data: object) {
  const r = getRedis();
  if (r) {
    await r.set(PREFIX + id, JSON.stringify(data));
  } else {
    memStore.set(id, data);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { escrowId, txHash, wallet, phone, amountCusd } = await request.json();

    if (!escrowId || !txHash || !wallet || !phone || !amountCusd) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!wallet.startsWith('0x') || wallet.length !== 42) {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
    }

    if (!/^\+263\d{9}$/.test(phone)) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
    }

    const sellId = `sell_${Date.now()}_${wallet.slice(2, 8)}`;
    const record = {
      sellId,
      escrowId: String(escrowId),
      txHash,
      wallet,
      phone,
      amountCusd: String(amountCusd),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    await storeSell(sellId, record);

    console.log('[Sell] Off-ramp request recorded:', { sellId, wallet: wallet.slice(0, 10), amountCusd });

    return NextResponse.json({
      success: true,
      sellId,
      message: `Sell request received. ${amountCusd} cUSD is locked in escrow. ZWG will be sent to ${phone} within 10 minutes.`,
    });
  } catch (error) {
    console.error('[Sell] Error recording sell request:', error);
    return NextResponse.json({ error: 'Failed to record sell request' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getWallet } from '@/lib/wallet-store';
import { triggerPaynowRemote, zwlToUsd } from '@/lib/paynow-remote';

/**
 * Africa's Talking USSD Gateway
 * POST /api/ussd
 *
 * AT sends a URL-encoded POST body every time the user dials or responds:
 *   sessionId    — unique per session
 *   serviceCode  — the short code they dialled (*XXX#)
 *   phoneNumber  — caller's E.164 number (+263771234567)
 *   text         — accumulated input joined by *, empty on first dial
 *
 * Respond with plain text:
 *   CON <message>  → show message, keep session open
 *   END <message>  → show message, close session
 *
 * Menu tree:
 *   [] → main menu
 *   [1] → Buy cUSD: enter ZWG amount
 *   [1, amount] → confirm quote
 *   [1, amount, 1] → confirmed → trigger Paynow EcoCash push
 *   [1, amount, 2] → cancel
 *   [2] → My wallet: show registered address or instructions to register
 *   [3] → Check balance: show cUSD balance for registered wallet
 */

const CELO_RPC = 'https://alfajores-forno.celo-testnet.org';
const CUSD_ADDRESS = '0x6473f8816d7380d140ff289bf5c5c147048fb252'; // MockUSDC on Celo Sepolia
// ERC-20 balanceOf(address) selector
const BALANCE_OF_SELECTOR = '0x70a08231';

async function getCusdBalance(wallet: string): Promise<string> {
  // Pad address to 32 bytes
  const padded = wallet.toLowerCase().replace('0x', '').padStart(64, '0');
  const data = BALANCE_OF_SELECTOR + padded;
  const res = await fetch(CELO_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_call',
      params: [{ to: CUSD_ADDRESS, data }, 'latest'],
      id: 1,
    }),
  });
  const json = await res.json();
  if (!json.result || json.result === '0x') return '0.0000';
  const wei = BigInt(json.result);
  const whole = wei / BigInt(1e18);
  const fraction = ((wei % BigInt(1e18)) * BigInt(10000)) / BigInt(1e18);
  return `${whole}.${fraction.toString().padStart(4, '0')}`;
}

function con(msg: string) {
  return new NextResponse(`CON ${msg}`, { headers: { 'Content-Type': 'text/plain' } });
}
function end(msg: string) {
  return new NextResponse(`END ${msg}`, { headers: { 'Content-Type': 'text/plain' } });
}

export async function POST(request: NextRequest) {
  try {
    // Parse body manually — request.formData() can hang in Next.js App Router
    // for application/x-www-form-urlencoded payloads sent by Africa's Talking
    const rawBody = await request.text();
    const params = new URLSearchParams(rawBody);
    const phone = params.get('phoneNumber') || '';
    const text = params.get('text') || '';

    const steps = text ? text.split('*') : [];
    const level = steps.length;

  // ── Main menu ────────────────────────────────────────────────────────────
  if (level === 0) {
    return con(`Welcome to ZimStable\nConvert ZWG to cUSD instantly\n\n1. Buy cUSD\n2. My wallet\n3. Check balance`);
  }

  // ── Buy cUSD flow ─────────────────────────────────────────────────────────
  if (steps[0] === '1') {
    // Step 1: ask for amount
    if (level === 1) {
      const wallet = await getWallet(phone);
      if (!wallet) {
        return end(
          `No wallet registered for ${phone}.\n\nVisit zim-stable-web.vercel.app and connect your wallet to register it, then try again.`,
        );
      }
      return con(`Enter ZWG amount to send:`);
    }

    // Step 2: show quote and ask to confirm
    if (level === 2) {
      const amount = parseFloat(steps[1]);
      if (isNaN(amount) || amount <= 0) {
        return end(`Invalid amount. Please dial again.`);
      }
      const cUSD = zwlToUsd(amount);
      const wallet = (await getWallet(phone))!;
      const shortWallet = `${wallet.slice(0, 8)}...${wallet.slice(-4)}`;
      return con(
        `Summary:\n${amount} ZWG → ${cUSD} cUSD\nTo wallet: ${shortWallet}\n\n1. Confirm\n2. Cancel`,
      );
    }

    // Step 3: process confirmation
    if (level === 3) {
      if (steps[2] !== '1') {
        return end(`Payment cancelled.`);
      }

      const amount = parseFloat(steps[1]);
      const cUSD = zwlToUsd(amount);
      // Include phone digits in reference so callback can look up wallet
      const phoneDigits = phone.replace(/\D/g, '');
      const reference = `USSD_${Date.now()}_${phoneDigits}`;

      try {
        const result = await triggerPaynowRemote({
          phone,
          method: 'ecocash',
          amount,
          reference,
          description: `ZimStable USSD: ${amount} ZWG`,
        });

        if (result.ok) {
          return end(
            `Payment initiated!\nApprove the EcoCash prompt on your phone.\n${cUSD} cUSD will arrive in your Celo wallet shortly.`,
          );
        } else {
          return end(`Payment failed: ${result.error}\nPlease try again.`);
        }
      } catch {
        return end(`Service error. Please try again later.`);
      }
    }
  }

  // ── My wallet flow ────────────────────────────────────────────────────────
  if (steps[0] === '2') {
    const wallet = await getWallet(phone);
    if (wallet) {
      return end(`Your registered wallet:\n${wallet}`);
    } else {
      return end(
        `No wallet registered.\n\nVisit zim-stable-web.vercel.app, connect your wallet and register ${phone} to use this service.`,
      );
    }
  }

  // ── Check balance flow ────────────────────────────────────────────────────
  if (steps[0] === '3') {
    const wallet = await getWallet(phone);
    if (!wallet) {
      return end(
        `No wallet registered.\n\nVisit zim-stable-web.vercel.app and connect your wallet first.`,
      );
    }
    try {
      const balance = await getCusdBalance(wallet);
      const shortWallet = `${wallet.slice(0, 8)}...${wallet.slice(-4)}`;
      return end(`Wallet: ${shortWallet}\n\nmUSDC Balance:\n${balance} mUSDC`);
    } catch {
      return end(`Could not fetch balance. Please try again later.`);
    }
  }

  return end(`Invalid option. Please try again.`);
  } catch {
    return end(`Service error. Please dial again.`);
  }
}


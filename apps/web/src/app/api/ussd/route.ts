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
 *   [1] → Buy cUSD: enter ZWL amount
 *   [1, amount] → confirm quote
 *   [1, amount, 1] → confirmed → trigger Paynow EcoCash push
 *   [1, amount, 2] → cancel
 *   [2] → My wallet: show registered address or instructions to register
 */

function con(msg: string) {
  return new NextResponse(`CON ${msg}`, { headers: { 'Content-Type': 'text/plain' } });
}
function end(msg: string) {
  return new NextResponse(`END ${msg}`, { headers: { 'Content-Type': 'text/plain' } });
}

export async function POST(request: NextRequest) {
  const body = await request.formData();
  const phone = (body.get('phoneNumber') as string) || '';
  const text = (body.get('text') as string) || '';

  const steps = text ? text.split('*') : [];
  const level = steps.length;

  // ── Main menu ────────────────────────────────────────────────────────────
  if (level === 0) {
    return con(`Welcome to ZimStable\nConvert ZWL to cUSD instantly\n\n1. Buy cUSD\n2. My wallet`);
  }

  // ── Buy cUSD flow ─────────────────────────────────────────────────────────
  if (steps[0] === '1') {
    // Step 1: ask for amount
    if (level === 1) {
      const wallet = getWallet(phone);
      if (!wallet) {
        return end(
          `No wallet registered for ${phone}.\n\nVisit zim-stable-web.vercel.app and connect your wallet to register it, then try again.`,
        );
      }
      return con(`Enter ZWL amount to send:`);
    }

    // Step 2: show quote and ask to confirm
    if (level === 2) {
      const amount = parseFloat(steps[1]);
      if (isNaN(amount) || amount <= 0) {
        return end(`Invalid amount. Please dial again.`);
      }
      const cUSD = zwlToUsd(amount);
      const wallet = getWallet(phone)!;
      const shortWallet = `${wallet.slice(0, 8)}...${wallet.slice(-4)}`;
      return con(
        `Summary:\n${amount} ZWL → ${cUSD} cUSD\nTo wallet: ${shortWallet}\n\n1. Confirm\n2. Cancel`,
      );
    }

    // Step 3: process confirmation
    if (level === 3) {
      if (steps[2] !== '1') {
        return end(`Payment cancelled.`);
      }

      const amount = parseFloat(steps[1]);
      const cUSD = zwlToUsd(amount);
      const reference = `USSD_${Date.now()}_${phone.replace(/\D/g, '')}`;

      try {
        const result = await triggerPaynowRemote({
          phone,
          method: 'ecocash',
          amount,
          reference,
          description: `ZimStable USSD: ${amount} ZWL`,
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
    const wallet = getWallet(phone);
    if (wallet) {
      return end(`Your registered wallet:\n${wallet}`);
    } else {
      return end(
        `No wallet registered.\n\nVisit zim-stable-web.vercel.app, connect your wallet and register ${phone} to use this service.`,
      );
    }
  }

  return end(`Invalid option. Please try again.`);
}

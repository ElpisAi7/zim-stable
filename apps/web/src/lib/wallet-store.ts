/**
 * Phone → Celo wallet mapping store.
 *
 * Production note: This in-memory Map resets on every cold start on Vercel.
 * Swap `walletStore` for Vercel KV / Upstash Redis / PlanetScale to persist
 * registrations across serverless invocations.
 *
 * Quick Vercel KV swap:
 *   import { kv } from '@vercel/kv';
 *   await kv.set(`wallet:${phone}`, address);
 *   await kv.get(`wallet:${phone}`);
 */

const walletStore = new Map<string, string>();

/** Normalise phone to E.164 (+263XXXXXXXXX) */
export function normalisePhone(phone: string): string {
  return phone.startsWith('+') ? phone : `+${phone}`;
}

export function getWallet(phone: string): string | undefined {
  return walletStore.get(normalisePhone(phone));
}

export function setWallet(phone: string, address: string): void {
  walletStore.set(normalisePhone(phone), address);
}

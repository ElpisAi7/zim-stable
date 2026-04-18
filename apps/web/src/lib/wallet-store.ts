/**
 * Phone → Celo wallet mapping store — backed by Upstash Redis.
 *
 * Setup (one-time):
 *   1. Go to https://console.upstash.com → create a free Redis database
 *   2. Copy "UPSTASH_REDIS_REST_URL" and "UPSTASH_REDIS_REST_TOKEN"
 *   3. Add both to Vercel → Settings → Environment Variables
 *
 * Falls back to an in-memory Map when env vars are absent (local dev / CI).
 */

import { Redis } from '@upstash/redis';

const PREFIX = 'zimstable:wallet:';

// Lazy singleton — only constructed when env vars are present
let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    redis = new Redis({ url, token });
  }
  return redis;
}

// In-memory fallback (ephemeral — only used in local dev)
const memStore = new Map<string, string>();

/** Normalise phone to E.164 (+263XXXXXXXXX) */
export function normalisePhone(phone: string): string {
  return phone.startsWith('+') ? phone : `+${phone}`;
}

export async function getWallet(phone: string): Promise<string | null> {
  const key = PREFIX + normalisePhone(phone);
  const r = getRedis();
  if (r) return r.get<string>(key);
  return memStore.get(normalisePhone(phone)) ?? null;
}

export async function setWallet(phone: string, address: string): Promise<void> {
  const key = PREFIX + normalisePhone(phone);
  const r = getRedis();
  if (r) {
    await r.set(key, address);
  } else {
    memStore.set(normalisePhone(phone), address);
  }
}

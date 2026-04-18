import crypto from 'crypto';

const ZWL_TO_USD = 0.015;

export function zwlToUsd(zwl: number): string {
  return (zwl * ZWL_TO_USD).toFixed(2);
}

export function buildPaynowSignature(
  fields: Record<string, string>,
  integrationKey: string,
): string {
  const values = Object.values(fields).join('');
  return crypto
    .createHash('sha512')
    .update(values + integrationKey)
    .digest('hex')
    .toUpperCase();
}

export async function triggerPaynowRemote({
  phone,
  method,
  amount,
  reference,
  description,
}: {
  phone: string;
  method: 'ecocash' | 'onemoney' | 'innbucks';
  amount: number;
  reference: string;
  description: string;
}): Promise<{ ok: boolean; pollUrl?: string; error?: string }> {
  const integrationId = process.env.PAYNOW_INTEGRATION_ID;
  const integrationKey = process.env.PAYNOW_INTEGRATION_KEY;

  if (!integrationId || !integrationKey) {
    return { ok: false, error: 'Paynow credentials not configured' };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://zim-stable-web.vercel.app';
  const resultUrl = `${appUrl}/api/paynow/callback`;
  const returnUrl = `${appUrl}/success`;
  const email = process.env.PAYNOW_MERCHANT_EMAIL || '';
  const amountStr = amount.toFixed(2);
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
    method,
  };

  const hash = buildPaynowSignature(hashFields, integrationKey);
  const formData = new URLSearchParams({ ...hashFields, hash });

  const res = await fetch('https://www.paynow.co.zw/interface/remotetransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  });

  const raw = await res.text();
  const result = Object.fromEntries(new URLSearchParams(raw));

  if (result.status?.toLowerCase() !== 'ok') {
    return { ok: false, error: result.error || result.status || 'Paynow rejected the request' };
  }

  return { ok: true, pollUrl: result.pollurl };
}

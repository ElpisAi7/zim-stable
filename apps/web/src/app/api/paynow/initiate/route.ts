import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Paynow Mobile (Remote) Transaction API Route
 * POST /api/paynow/initiate
 *
 * Uses Paynow's remotetransaction endpoint to push a USSD payment prompt
 * directly to the user's EcoCash / OneMoney / InnBucks number.
 * No Paynow account or browser redirect required.
 *
 * Docs: https://developers.paynow.co.zw/docs/express_checkout.html
 */

interface PaynowInitiateRequest {
  amount: number;
  reference: string;
  description: string;
  phone: string;
  method: 'ecocash' | 'onemoney' | 'innbucks';
  resultUrl?: string;
  returnUrl?: string;
  email?: string;
}

/**
 * Paynow SHA512 signature — concatenate all field VALUES in order, append
 * the integration key, then SHA512 (uppercase hex).
 */
function buildSignature(fields: Record<string, string>, integrationKey: string): string {
  const values = Object.values(fields).join('');
  return crypto
    .createHash('sha512')
    .update(values + integrationKey)
    .digest('hex')
    .toUpperCase();
}

export async function POST(request: NextRequest) {
  try {
    const body: PaynowInitiateRequest = await request.json();

    if (!body.amount || !body.reference || !body.phone || !body.method) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: amount, reference, phone, method' },
        { status: 400 }
      );
    }

    const integrationId = process.env.PAYNOW_INTEGRATION_ID;
    const integrationKey = process.env.PAYNOW_INTEGRATION_KEY;

    if (!integrationId || !integrationKey) {
      return NextResponse.json(
        { success: false, error: 'Paynow credentials not configured' },
        { status: 500 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://zim-stable-web.vercel.app';
    const resultUrl = body.resultUrl || `${appUrl}/api/paynow/callback`;
    const returnUrl = body.returnUrl || `${appUrl}/success`;
    const email = body.email || process.env.PAYNOW_MERCHANT_EMAIL || '';
    const amountStr = parseFloat(String(body.amount)).toFixed(2);
    const items = `${body.description}:${amountStr},`;

    // Field order mirrors Paynow PHP SDK remotetransaction hash computation
    const hashFields: Record<string, string> = {
      resulturl: resultUrl,
      returnurl: returnUrl,
      reference: body.reference,
      amount: amountStr,
      id: integrationId,
      additionalinfo: body.description,
      authemail: email,
      status: 'Message',
      items,
      phone: body.phone,
      method: body.method,
    };

    const signature = buildSignature(hashFields, integrationKey);

    const formData = new URLSearchParams({
      ...hashFields,
      hash: signature,
    });

    console.log('[Paynow] Initiating mobile payment:', {
      reference: body.reference,
      amount: amountStr,
      method: body.method,
      phone: body.phone.slice(0, 4) + '****',
    });

    const response = await fetch('https://www.paynow.co.zw/interface/remotetransaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    const rawText = await response.text();
    console.log('[Paynow] Raw response:', rawText);

    const result = Object.fromEntries(new URLSearchParams(rawText));

    if (result.status?.toLowerCase() !== 'ok') {
      console.error('[Paynow] Error response:', result);
      return NextResponse.json(
        { success: false, error: result.error || result.status || 'Paynow rejected the request' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      pollUrl: result.pollurl,
      paynowReference: result.paynowreference,
    });
  } catch (error: any) {
    console.error('[Paynow] Initiation error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Payment initiation failed' },
      { status: 500 }
    );
  }
}

/**
 * Paynow Initiate Payment API Route
 * POST /api/paynow/initiate
 *
 * Paynow API docs: https://developers.paynow.co.zw/docs/initiate_transaction.html
 * The API expects URL-encoded form data (application/x-www-form-urlencoded)
 * and a SHA512 HMAC signature built from concatenated field values.
 */

interface PaynowInitiateRequest {
  email?: string;
  phone?: string;
  amount: number;
  currency?: string;
  reference: string;
  description: string;
  returnUrl: string;
  notifyUrl?: string;
  resultUrl?: string;
}

/**
 * Build Paynow signature.
 * Concatenate all field values (in the exact order they appear in the payload)
 * then append the integration key, and SHA512 hash the result (uppercase hex).
 */
function buildSignature(fields: Record<string, string>, integrationKey: string): string {
  const values = Object.values(fields).join('');
  return crypto
    .createHash('sha512')
    .update(values + integrationKey)
    .digest('hex')
    .toUpperCase();
}

export async function POST(request: NextRequest) {
  try {
    const body: PaynowInitiateRequest = await request.json();

    if (!body.amount || !body.reference) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: amount and reference' },
        { status: 400 }
      );
    }

    const integrationId = process.env.PAYNOW_INTEGRATION_ID;
    const integrationKey = process.env.PAYNOW_INTEGRATION_KEY;

    if (!integrationId || !integrationKey) {
      return NextResponse.json(
        { success: false, error: 'Paynow credentials not configured' },
        { status: 500 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://zim-stable-web.vercel.app';
    const resultUrl = body.notifyUrl || body.resultUrl || `${appUrl}/api/paynow/callback`;
    const returnUrl = body.returnUrl || `${appUrl}/success`;
    const email = body.email || process.env.PAYNOW_MERCHANT_EMAIL || '';
    const amountStr = parseFloat(String(body.amount)).toFixed(2);

    // Paynow items format: "item name:amount," (trailing comma, matches PHP SDK)
    const items = `${body.description}:${amountStr},`;

    // items is added to the fields array BEFORE hash is computed in the PHP SDK
    const hashFields: Record<string, string> = {
      resulturl: resultUrl,
      returnurl: returnUrl,
      reference: body.reference,
      amount: amountStr,
      id: integrationId,
      additionalinfo: body.description,
      authemail: email,
      status: 'Message',
      items,
    };

    const signature = buildSignature(hashFields, integrationKey);

    // Send all fields + hash
    const formData = new URLSearchParams({
      ...hashFields,
      hash: signature,
    });

    console.log('[Paynow] Initiating payment:', {
      reference: body.reference,
      amount: amountStr,
      resultUrl,
    });

    const response = await fetch('https://www.paynow.co.zw/interface/initiatetransaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    const rawText = await response.text();
    console.log('[Paynow] Raw response:', rawText);

    // Paynow responds with URL-encoded key=value pairs
    const result = Object.fromEntries(new URLSearchParams(rawText));

    if (result.status?.toLowerCase() !== 'ok') {
      console.error('[Paynow] Error response:', result);
      return NextResponse.json(
        { success: false, error: result.error || result.status || 'Paynow rejected the request' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      paymentUrl: result.browserurl,
      redirectUrl: result.browserurl,
      pollUrl: result.pollurl,
      hash: result.hash,
    });
  } catch (error: any) {
    console.error('[Paynow] Initiation error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Payment initiation failed' },
      { status: 500 }
    );
  }
}

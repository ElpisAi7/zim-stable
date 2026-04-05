import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import crypto from 'crypto';

/**
 * Paynow Initiate Payment API Route
 * POST /api/paynow/initiate
 * Initiates a payment through Paynow (EcoCash/OneMoney)
 */

interface PaynowInitiateRequest {
  email: string;
  phone: string;
  amount: number;
  currency: 'ZWL' | 'USD';
  reference: string;
  description: string;
  returnUrl: string;
  notifyUrl: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: PaynowInitiateRequest = await request.json();

    // Validate required fields
    if (!body.email || !body.phone || !body.amount || !body.reference) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const paynowIntegrationKey = process.env.PAYNOW_INTEGRATION_KEY;
    const paynowApiUrl = process.env.PAYNOW_API_URL || 'https://www.paynow.co.zw/api/initiate';

    if (!paynowIntegrationKey) {
      return NextResponse.json(
        { success: false, error: 'Paynow integration key not configured' },
        { status: 500 }
      );
    }

    // Build Paynow request
    const paynowPayload = {
      resulturl: body.notifyUrl,
      returnurl: body.returnUrl,
      reference: body.reference,
      email: body.email,
      items: {
        name: body.description,
        amount: body.amount,
      },
      phonenumber: body.phone,
    };

    // Sign the request (Paynow uses HMAC-SHA512)
    const signature = getPaynowSignature(paynowPayload, paynowIntegrationKey);

    // Make request to Paynow
    const response = await axios.post(paynowApiUrl, {
      ...paynowPayload,
      signature,
    });

    console.log('[Paynow] Payment initiated:', {
      reference: body.reference,
      amount: body.amount,
      status: response.data.status,
    });

    return NextResponse.json({
      success: response.data.status === 'ok',
      redirectUrl: response.data.link,
      hash: response.data.hash,
      error: response.data.error || undefined,
    });
  } catch (error) {
    console.error('[Paynow] Initiation error:', error);
    return NextResponse.json(
      { success: false, error: 'Payment initiation failed' },
      { status: 500 }
    );
  }
}

/**
 * Helper function to generate Paynow signature
 */
function getPaynowSignature(payload: any, integrationKey: string): string {
  const dataString = JSON.stringify(payload);
  return crypto
    .createHmac('sha512', integrationKey)
    .update(dataString)
    .digest('hex');
}

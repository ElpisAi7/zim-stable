/**
 * Paynow Integration for ZimStable
 * Handles EcoCash/OneMoney payments for fiat on-ramp
 * Using Paynow API v3.x
 */

export interface PaynowPaymentRequest {
  email: string;
  phone: string;
  amount: number;
  currency: 'ZWL' | 'USD';
  reference: string;
  description: string;
  returnUrl: string;
  notifyUrl: string;
}

export interface PaynowPaymentResponse {
  success: boolean;
  redirectUrl?: string;
  hash?: string;
  error?: string;
}

export interface PaynowTransactionStatus {
  reference: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  amount: number;
  timestamp: string;
  paymentMethod: 'ecocash' | 'onemoney' | 'other';
}

/**
 * Initialize Paynow payment
 * Returns redirect URL for payment processing
 */
export async function initiatePaynowPayment(
  paymentRequest: PaynowPaymentRequest
): Promise<PaynowPaymentResponse> {
  try {
    const response = await fetch('/api/paynow/initiate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(paymentRequest),
    });

    if (!response.ok) {
      throw new Error(`Paynow API error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[Paynow] Initiation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check transaction status from Paynow
 */
export async function checkPaynowTransactionStatus(
  reference: string
): Promise<PaynowTransactionStatus | null> {
  try {
    const response = await fetch('/api/paynow/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reference }),
    });

    if (!response.ok) {
      throw new Error(`Status check error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[Paynow] Status check error:', error);
    return null;
  }
}

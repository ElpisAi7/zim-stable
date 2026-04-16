/**
 * Yellow Card API Integration for ZimStable
 * Handles liquidity provision: fiat↔stablecoin swaps and off-ramp to Celo/AUDD
 * Using Yellow Card API v2.x
 */

export interface YellowCardQuoteRequest {
  fromCurrency: string; // e.g., 'ZWL', 'USD', 'NGN'
  toCurrency: string; // e.g., 'cUSD', 'AUDD'
  amount: number;
  paymentMethod?: 'bank_transfer' | 'mobile_money' | 'ecocash' | 'onemoney';
}

export interface YellowCardQuote {
  quoteId: string;
  fromAmount: number;
  fromCurrency: string;
  toAmount: number;
  toCurrency: string;
  rate: number;
  expiresAt: string;
  fee: number;
}

export interface YellowCardSwapRequest {
  quoteId: string;
  fromAddress?: string; // Wallet address for on-chain transactions
  toAddress: string; // Recipient address on Celo
  destinationTag?: string;
}

export interface YellowCardSwapResponse {
  transactionId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  hash?: string; // Blockchain tx hash
  estimatedTime: number; // milliseconds
  error?: string;
}

/**
 * Get real-time quote from Yellow Card
 */
export async function getYellowCardQuote(
  request: YellowCardQuoteRequest
): Promise<YellowCardQuote | null> {
  try {
    const response = await fetch('/api/yellowcard/quote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Quote error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[YellowCard] Quote error:', error);
    return null;
  }
}

/**
 * Execute a swap via Yellow Card
 */
export async function executeYellowCardSwap(
  request: YellowCardSwapRequest
): Promise<YellowCardSwapResponse> {
  try {
    const response = await fetch('/api/yellowcard/swap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Swap error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[YellowCard] Swap error:', error);
    return {
      transactionId: '',
      status: 'failed',
      estimatedTime: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get swap status
 */
export async function getYellowCardSwapStatus(
  transactionId: string
): Promise<YellowCardSwapResponse | null> {
  try {
    const response = await fetch('/api/yellowcard/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ transactionId }),
    });

    if (!response.ok) {
      throw new Error(`Status error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[YellowCard] Status error:', error);
    return null;
  }
}

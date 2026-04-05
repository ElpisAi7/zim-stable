'use client';

import React, { useState, useEffect } from 'react';
import { Loader2, ArrowRightLeft, TrendingDown } from 'lucide-react';
import {
  getYellowCardQuote,
  executeYellowCardSwap,
  getYellowCardSwapStatus,
} from '@/lib/yellowcard';
import { useAccount } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface YellowCardSwapProps {
  initialFromCurrency?: string;
  initialToCurrency?: string;
  onSwapSuccess?: (transactionId: string) => void;
  onSwapError?: (error: string) => void;
}

export default function YellowCardSwap({
  initialFromCurrency = 'ZWL',
  initialToCurrency = 'cUSD',
  onSwapSuccess,
  onSwapError,
}: YellowCardSwapProps) {
  const { address: walletAddress } = useAccount();

  const [fromCurrency, setFromCurrency] = useState(initialFromCurrency);
  const [toCurrency, setToCurrency] = useState(initialToCurrency);
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<any>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [swapState, setSwapState] = useState<'idle' | 'quoting' | 'swapping' | 'completed'>('idle');
  const [lastSwapId, setLastSwapId] = useState<string | null>(null);
  const [swapStatus, setSwapStatus] = useState<string | null>(null);

  // Fetch quote when amount changes
  useEffect(() => {
    if (!amount || parseFloat(amount) <= 0) {
      setQuote(null);
      return;
    }

    const fetchQuote = async () => {
      setIsLoadingQuote(true);
      try {
        const q = await getYellowCardQuote({
          fromCurrency,
          toCurrency,
          amount: parseFloat(amount),
        });
        setQuote(q);
      } catch (error) {
        console.error('Quote fetch error:', error);
      } finally {
        setIsLoadingQuote(false);
      }
    };

    const debounceTimer = setTimeout(fetchQuote, 500);
    return () => clearTimeout(debounceTimer);
  }, [amount, fromCurrency, toCurrency]);

  const handleExecuteSwap = async () => {
    if (!walletAddress || !quote) {
      alert('Wallet not connected or quote expired');
      return;
    }

    setIsExecuting(true);
    setSwapState('swapping');

    try {
      const result = await executeYellowCardSwap({
        quoteId: quote.quoteId,
        toAddress: walletAddress,
      });

      if (result.status !== 'failed') {
        setLastSwapId(result.transactionId);
        setSwapStatus(result.status);
        onSwapSuccess?.(result.transactionId);
        
        // Poll for status updates
        pollSwapStatus(result.transactionId);
      } else {
        onSwapError?.(result.error || 'Swap failed');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      onSwapError?.(errorMsg);
    } finally {
      setIsExecuting(false);
    }
  };

  const pollSwapStatus = async (transactionId: string) => {
    let attempts = 0;
    const maxAttempts = 30;

    const interval = setInterval(async () => {
      attempts++;
      try {
        const status = await getYellowCardSwapStatus(transactionId);
        if (status) {
          setSwapStatus(status.status);
          if (status.status === 'completed' || attempts >= maxAttempts) {
            clearInterval(interval);
            if (status.status === 'completed') {
              setSwapState('completed');
            }
          }
        }
      } catch (error) {
        console.error('Status poll error:', error);
      }
    }, 2000);
  };

  const currencies = [
    { code: 'ZWL', name: 'Zimbabwean Dollar' },
    { code: 'USD', name: 'US Dollar' },
    { code: 'NGN', name: 'Nigerian Naira' },
    { code: 'cUSD', name: 'Celo Dollar' },
    { code: 'AUDD', name: 'Australian Dollar Digital' },
  ];

  return (
    <Card className="w-full max-w-md p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">Swap & Off-Ramp</h2>
      <p className="text-sm text-gray-600 mb-4">
        Liquidity via Yellow Card: Fiat ↔ Stablecoin
      </p>

      <div className="space-y-4">
        {/* From Currency */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            From Currency
          </label>
          <select
            value={fromCurrency}
            onChange={(e) => setFromCurrency(e.target.value)}
            disabled={isExecuting}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
          >
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} - {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Amount
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100"
            step="0.01"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-400"
            disabled={isExecuting}
          />
        </div>

        {/* To Currency */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            To Currency
          </label>
          <select
            value={toCurrency}
            onChange={(e) => setToCurrency(e.target.value)}
            disabled={isExecuting}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
          >
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} - {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Quote Display */}
        {quote && (
          <div className="bg-blue-50 p-4 rounded-md border border-blue-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">You get:</span>
              <span className="text-lg font-bold text-blue-600">
                {quote.toAmount.toFixed(2)} {quote.toCurrency}
              </span>
            </div>
            <div className="text-xs text-gray-600 space-y-1">
              <p>Rate: 1 {fromCurrency} = {quote.rate.toFixed(4)} {toCurrency}</p>
              <p>Fee: {quote.fee.toFixed(2)} {quote.toCurrency}</p>
              <p>Expires: {new Date(quote.expiresAt).toLocaleTimeString()}</p>
            </div>
          </div>
        )}

        {isLoadingQuote && (
          <div className="flex items-center justify-center py-2">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600 mr-2" />
            <span className="text-sm text-gray-600">Fetching quote...</span>
          </div>
        )}

        {/* Swap Button */}
        <Button
          type="button"
          onClick={handleExecuteSwap}
          disabled={isExecuting || !quote || !walletAddress}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold"
        >
          {isExecuting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing Swap...
            </>
          ) : (
            <>
              <ArrowRightLeft className="w-4 h-4 mr-2" />
              Execute Swap
            </>
          )}
        </Button>

        {/* Status Display */}
        {lastSwapId && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-sm font-medium text-gray-700 mb-2">
              Transaction ID: {lastSwapId.slice(0, 12)}...
            </p>
            <p className="text-sm text-gray-600">
              Status: <span className="font-semibold text-blue-600">{swapStatus || 'pending'}</span>
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

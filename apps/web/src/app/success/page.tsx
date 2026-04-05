'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2, AlertCircle, Clock, Home } from 'lucide-react';

interface TransactionStatus {
  status: 'processing' | 'completed' | 'failed' | 'pending';
  amount: number;
  currency: string;
  toAmount?: number;
  toCurrency?: string;
  timestamp: string;
  yellowCardTxId?: string;
  caloWalletAddress?: string;
  message?: string;
}

export default function PaynowSuccess() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [transactionStatus, setTransactionStatus] = useState<TransactionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const txId = searchParams.get('txId');

  useEffect(() => {
    if (!txId) {
      setError('No transaction ID provided');
      setIsLoading(false);
      return;
    }

    // Poll transaction status
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/paynow/callback?reference=${txId}`);
        if (response.ok) {
          const data = await response.json();
          setTransactionStatus(data);
        } else {
          setError('Transaction not found');
        }
      } catch (err) {
        console.error('Failed to fetch transaction status:', err);
        setError('Failed to fetch status');
      } finally {
        setIsLoading(false);
      }
    };

    checkStatus();

    // Poll every 3 seconds for 30 seconds
    const interval = setInterval(checkStatus, 3000);
    const timeout = setTimeout(() => clearInterval(interval), 30000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [txId]);

  const getStatusIcon = () => {
    switch (transactionStatus?.status) {
      case 'completed':
        return <CheckCircle2 className="w-16 h-16 text-green-500" />;
      case 'processing':
        return <Clock className="w-16 h-16 text-blue-500 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-16 h-16 text-red-500" />;
      default:
        return <Clock className="w-16 h-16 text-yellow-500 animate-pulse" />;
    }
  };

  const getStatusMessage = () => {
    switch (transactionStatus?.status) {
      case 'completed':
        return 'Payment received! Stablecoins sent to your wallet.';
      case 'processing':
        return 'Processing your payment... Your stablecoins will arrive shortly.';
      case 'failed':
        return 'Payment failed. Your EcoCash will be refunded.';
      default:
        return 'Waiting for payment confirmation...';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800 p-4 flex items-center justify-center">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-center">
          <p className="text-white text-sm font-semibold uppercase tracking-wide">
            Liquidity Bridge
          </p>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6 text-center">
          
          {/* Icon */}
          <div className="flex justify-center">
            {getStatusIcon()}
          </div>

          {/* Status Title */}
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white capitalize">
              {transactionStatus?.status || 'Processing'}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
              {getStatusMessage()}
            </p>
          </div>

          {/* Transaction Details */}
          {transactionStatus && (
            <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-4 text-left space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-slate-600 dark:text-slate-400">Sent</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                  {transactionStatus.amount} {transactionStatus.currency}
                </span>
              </div>
              
              {transactionStatus.toAmount && (
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Received</span>
                  <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                    {transactionStatus.toAmount} {transactionStatus.toCurrency}
                  </span>
                </div>
              )}

              {transactionStatus.caloWalletAddress && (
                <div className="flex justify-between items-start">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Wallet</span>
                  <span className="text-xs font-mono text-slate-900 dark:text-slate-300 text-right break-all">
                    {transactionStatus.caloWalletAddress.slice(0, 10)}...
                    {transactionStatus.caloWalletAddress.slice(-8)}
                  </span>
                </div>
              )}

              {transactionStatus.yellowCardTxId && (
                <div className="flex justify-between items-start">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Yellow Card TX</span>
                  <span className="text-xs font-mono text-slate-900 dark:text-slate-300 text-right break-all">
                    {transactionStatus.yellowCardTxId.slice(0, 16)}...
                  </span>
                </div>
              )}

              <div className="flex justify-between text-xs border-t border-slate-300 dark:border-slate-600 pt-3">
                <span className="text-slate-600 dark:text-slate-400">Time</span>
                <span className="text-slate-900 dark:text-slate-100">
                  {new Date(transactionStatus.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-sm text-red-700 dark:text-red-300 font-semibold">
                {error}
              </p>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center space-x-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Checking transaction...
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={() => router.push('/')}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition"
            >
              <Home className="w-4 h-4" />
              Back Home
            </button>
          </div>

          {/* Info */}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Your stablecoins should arrive in your Celo wallet within minutes.
          </p>
        </div>
      </div>
    </div>
  );
}
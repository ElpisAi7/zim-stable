'use client';

import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import { Loader2 } from 'lucide-react';
import { getConfig } from '@/lib/config';
import { UserBalance } from './user-balance';

/**
 * LiquidityGateway Component
 * Direct Liquidity Bridge: EcoCash → cUSD (Instant Settlement)
 * 
 * User Flow:
 * 1. Connect wallet
 * 2. Enter EcoCash amount (ZWL)
 * 3. See exchange rate and receive amount (cUSD)
 * 4. Click 'Get cUSD via EcoCash'
 * 5. PayNow redirects to EcoCash payment
 * 6. Upon confirmation → Automatic Yellow Card payout to wallet
 */

interface ExchangeRate {
  zwlToUsd: number;
  lastUpdated: Date;
}

export default function LiquidityGateway() {
  const { address: userAccount } = useAccount();
  const [amount, setAmount] = useState('');
  const [receiveToken, setReceiveToken] = useState('cUSD');
  const [isLoading, setIsLoading] = useState(false);
  const [paymentInitiated, setPaymentInitiated] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate>({
    zwlToUsd: 0.015, // Default rate: 1 ZWL ≈ 0.015 USD
    lastUpdated: new Date(),
  });

  const estimatedReceive = amount ? (parseFloat(amount) * exchangeRate.zwlToUsd).toFixed(2) : '0.00';

  const handleInitiatePayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!userAccount) {
      alert('Please connect your wallet first');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    setIsLoading(true);

    try {
      // Create payment reference with wallet address
      const paymentReference = `${Date.now()}_${userAccount}`;

      // Initiate Paynow payment
      const response = await fetch('/api/paynow/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(amount),
          currency: 'ZWL',
          reference: paymentReference,
          description: `Liquidity Bridge: ${amount} ZWL → ${estimatedReceive} ${receiveToken}`,
          resultUrl: `${new URL(window.location.href).origin}/api/paynow/callback`,
          returnUrl: `${new URL(window.location.href).origin}/success?txId=${paymentReference}`,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to initiate payment');
      }

      const data = await response.json();
      if (data.paymentUrl) {
        setPaymentInitiated(true);
        // Redirect to Paynow/EcoCash
        window.location.href = data.paymentUrl;
      }
    } catch (error) {
      console.error('Payment initiation failed:', error);
      alert('Failed to initiate payment. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const isFormValid = userAccount && amount && parseFloat(amount) > 0 && !isLoading;

  return (
    <div className="flex justify-center items-center min-h-screen p-4 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl p-8 w-full max-w-md border border-slate-200 dark:border-slate-700">
        
        {/* Balance Card */}
        <UserBalance />

        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            💱 Liquidity Bridge
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Convert EcoCash to stablecoins instantly
          </p>
        </div>

        {/* Status */}
        {!userAccount && (
          <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              🔗 Connect your wallet to get started
            </p>
          </div>
        )}

        {paymentInitiated && (
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-200 font-semibold">
              📱 Redirecting to EcoCash payment...
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
              Your stablecoins will be sent to {userAccount?.slice(0, 10)}... once payment confirms
            </p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleInitiatePayment} className="space-y-6">
          
          {/* Input Currency Badge */}
          <div className="bg-gradient-to-r from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 rounded-lg p-4 border border-amber-200 dark:border-amber-700">
            <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold uppercase">From</p>
            <p className="text-2xl font-bold text-amber-900 dark:text-amber-200">ZWL</p>
            <p className="text-xs text-amber-700 dark:text-amber-400">Zimbabwean Dollar (EcoCash)</p>
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
              Amount in ZWL
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={!userAccount || isLoading}
              placeholder="Enter amount"
              className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {amount && (
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Exchange Rate: 1 ZWL = {exchangeRate.zwlToUsd.toFixed(4)} USD
              </p>
            )}
          </div>

          {/* Receive Token Selection */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
              Receive as
            </label>
            <select
              value={receiveToken}
              onChange={(e) => setReceiveToken(e.target.value)}
              disabled={!userAccount || isLoading}
              className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="cUSD">cUSD (Celo)</option>
              <option value="USDC">USDC (Celo)</option>
            </select>
          </div>

          {/* Quote Display */}
          {amount && (
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-4 border border-green-200 dark:border-green-700">
              <div className="flex justify-between items-center mb-2">
                <p className="text-sm font-semibold text-green-900 dark:text-green-200">You'll receive</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {estimatedReceive}
                </p>
              </div>
              <p className="text-xs text-green-700 dark:text-green-300">
                {receiveToken} on your Celo wallet
              </p>
            </div>
          )}

          {/* Wallet Address */}
          {userAccount && (
            <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-600 dark:text-slate-400 uppercase font-semibold mb-1">
                Payment destination
              </p>
              <p className="text-sm font-mono text-slate-900 dark:text-slate-100">
                {userAccount.slice(0, 6)}...{userAccount.slice(-4)}
              </p>
            </div>
          )}

          {/* Flow Description */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
            <p className="text-xs font-semibold text-blue-900 dark:text-blue-200 mb-2 uppercase">Flow</p>
            <ol className="text-xs text-blue-800 dark:text-blue-300 space-y-1 list-decimal list-inside">
              <li>Click button to initiate payment</li>
              <li>Complete EcoCash payment on Paynow</li>
              <li>Stablecoins sent instantly to your wallet</li>
            </ol>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!isFormValid}
            className={`w-full py-3 px-4 rounded-lg font-semibold transition flex items-center justify-center gap-2 ${
              isFormValid
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white cursor-pointer shadow-lg'
                : 'bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-500 cursor-not-allowed'
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                💱 Get {estimatedReceive} {receiveToken}
              </>
            )}
          </button>

          {/* disclaimer */}
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
            Powered by PayNow + Yellow Card. Instant settlement to Celo blockchain.
          </p>
        </form>
      </div>
    </div>
  );
}
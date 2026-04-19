'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAccount, useBalance, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';
import { Loader2, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { UserBalance } from './user-balance';
import { ZIM_ESCROW_ADDRESS, ZIM_ESCROW_ABI } from '@/lib/contracts';

const CUSD_ADDRESS = '0x765DE816845861e75A05fA979517178a0586e3f3' as const;
// ERC-20 approve ABI (minimal)
const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

interface ExchangeRate {
  zwlToUsd: number;
  lastUpdated: Date;
}

type PaymentMethod = 'ecocash' | 'onemoney' | 'innbucks';
type PaymentState = 'idle' | 'loading' | 'awaiting_approval' | 'paid' | 'failed';

const METHOD_LABELS: Record<PaymentMethod, string> = {
  ecocash: 'EcoCash',
  onemoney: 'OneMoney',
  innbucks: 'InnBucks',
};

export default function LiquidityGateway() {
  const { address: userAccount } = useAccount();
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');

  // ── Buy state ────────────────────────────────────────────────────────────
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('ecocash');
  const [receiveToken, setReceiveToken] = useState('cUSD');
  const [paymentState, setPaymentState] = useState<PaymentState>('idle');
  const [pollUrl, setPollUrl] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [refetchTrigger, setRefetchTrigger] = useState(0);
  const [registered, setRegistered] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // ── Sell state ───────────────────────────────────────────────────────────
  const [sellAmount, setSellAmount] = useState('');
  const [sellPhone, setSellPhone] = useState('');
  const [sellState, setSellState] = useState<'idle' | 'approving' | 'depositing' | 'recording' | 'done' | 'failed'>('idle');
  const [sellMessage, setSellMessage] = useState('');
  const [sellId, setSellId] = useState('');

  const { data: cusdBalance, refetch: refetchCusd } = useBalance({ address: userAccount, token: CUSD_ADDRESS, query: { refetchInterval: 10_000 } });

  // Refetch when user returns to tab after USSD/Paynow payment
  React.useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refetchCusd(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { writeContractAsync: approveAsync } = useWriteContract();
  const { writeContractAsync: depositAsync } = useWriteContract();

  const [exchangeRate] = useState<ExchangeRate>({
    zwlToUsd: 0.015,
    lastUpdated: new Date(),
  });

  const estimatedReceive = amount ? (parseFloat(amount) * exchangeRate.zwlToUsd).toFixed(2) : '0.00';

  // Stop polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // Register phone → wallet for USSD service whenever both are known
  useEffect(() => {
    if (!userAccount || !phone.match(/^\+263\d{9}$/) || registered) return;
    fetch('/api/ussd/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, wallet: userAccount }),
    }).then((r) => { if (r.ok) setRegistered(true); }).catch(() => {});
  }, [userAccount, phone, registered]);

  const startPolling = (url: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    let attempts = 0;
    const MAX_ATTEMPTS = 40; // 2 minutes at 3s intervals

    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/paynow/status?pollUrl=${encodeURIComponent(url)}`);
        const data = await res.json();

        if (data.status === 'paid' || data.status === 'Paid') {
          clearInterval(pollRef.current!);
          setPaymentState('paid');
          setStatusMessage('Payment received! Your cUSD will arrive shortly.');
          setRefetchTrigger((n) => n + 1);
        } else if (data.status === 'failed' || data.status === 'Failed') {
          clearInterval(pollRef.current!);
          setPaymentState('failed');
          setStatusMessage('Payment was declined or cancelled.');
        }
      } catch (_) {
        // swallow polling errors, keep trying
      }

      if (attempts >= MAX_ATTEMPTS) {
        clearInterval(pollRef.current!);
        if (paymentState === 'awaiting_approval') {
          setPaymentState('failed');
          setStatusMessage('Payment timed out. Please try again.');
        }
      }
    }, 3000);
  };

  const handleInitiatePayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!userAccount) { alert('Please connect your wallet first'); return; }
    if (!amount || parseFloat(amount) <= 0) { alert('Please enter a valid amount'); return; }
    if (!phone.match(/^\+2637\d{8}$/)) { alert('Enter a valid Zimbabwean mobile number (e.g. +263771234567)'); return; }

    setPaymentState('loading');

    try {
      const paymentReference = `${Date.now()}_${userAccount}`;
      const origin = window.location.origin;

      const response = await fetch('/api/paynow/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(amount),
          reference: paymentReference,
          description: `ZimStable: ${amount} ZWL to ${receiveToken}`,
          phone,
          method,
          resultUrl: `${origin}/api/paynow/callback`,
          returnUrl: `${origin}/success?txId=${paymentReference}`,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to initiate payment');
      }

      setPollUrl(data.pollUrl);
      setPaymentState('awaiting_approval');
      startPolling(data.pollUrl);
    } catch (error: any) {
      console.error('Payment initiation failed:', error);
      setPaymentState('failed');
      setStatusMessage(error?.message || 'Failed to initiate payment. Please try again.');
    }
  };

  const reset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setPaymentState('idle');
    setStatusMessage('');
    setPollUrl('');
    setAmount('');
    setPhone('');
  };

  const handleSell = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userAccount) { alert('Please connect your wallet first'); return; }
    if (!sellAmount || parseFloat(sellAmount) <= 0) { alert('Enter a valid cUSD amount'); return; }
    if (!sellPhone.match(/^\+2637\d{8}$/)) { alert('Enter a valid Zimbabwean mobile number (e.g. +263771234567)'); return; }

    const amountUnits = parseUnits(sellAmount, 18);

    try {
      // Step 1: Approve escrow to spend cUSD
      setSellState('approving');
      setSellMessage('Step 1/2: Approve cUSD spend in your wallet…');
      const approveTxHash = await approveAsync({
        address: CUSD_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [ZIM_ESCROW_ADDRESS, amountUnits],
      });

      // Step 2: Deposit into escrow
      setSellState('depositing');
      setSellMessage('Step 2/2: Lock cUSD in escrow…');
      const depositTxHash = await depositAsync({
        address: ZIM_ESCROW_ADDRESS,
        abi: ZIM_ESCROW_ABI,
        functionName: 'depositEscrow',
        args: [CUSD_ADDRESS, amountUnits, sellPhone],
      });

      // Step 3: Notify backend
      setSellState('recording');
      setSellMessage('Recording sell request…');
      const res = await fetch('/api/sell/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          escrowId: 0, // will be read from event log by admin; placeholder
          txHash: depositTxHash,
          wallet: userAccount,
          phone: sellPhone,
          amountCusd: sellAmount,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Backend error');

      setSellId(data.sellId);
      setSellState('done');
      setSellMessage(data.message);
      setRefetchTrigger((n) => n + 1);
    } catch (err: any) {
      console.error('[Sell] Error:', err);
      setSellState('failed');
      setSellMessage(err?.shortMessage || err?.message || 'Transaction failed. Please try again.');
    }
  };

  const resetSell = () => {
    setSellState('idle');
    setSellMessage('');
    setSellAmount('');
    setSellPhone('');
    setSellId('');
  };

  const isSellFormValid = userAccount && sellAmount && parseFloat(sellAmount) > 0 &&
    parseFloat(sellAmount) <= parseFloat(cusdBalance?.formatted || '0') &&
    sellPhone && sellState === 'idle';
  const zwgEstimate = sellAmount ? (parseFloat(sellAmount) / 0.015).toFixed(2) : '0.00';

  const isFormValid = userAccount && amount && parseFloat(amount) > 0 && phone && paymentState === 'idle';

  // ── Post-submission screens ──────────────────────────────────────────────
  if (paymentState === 'awaiting_approval') {
    return (
      <div className="flex justify-center items-center min-h-screen p-4 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl p-8 w-full max-w-md border border-slate-200 dark:border-slate-700 text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
              <Clock className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-pulse" />
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Check your phone</h2>
            <p className="text-slate-600 dark:text-slate-400 mt-2">
              A payment prompt has been sent to <span className="font-semibold">{phone}</span> via{' '}
              <span className="font-semibold">{METHOD_LABELS[method]}</span>.
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">
              Approve the <strong>{METHOD_LABELS[method]}</strong> prompt on your phone to send{' '}
              <strong>{amount} ZWL</strong> and receive{' '}
              <strong>{estimatedReceive} {receiveToken}</strong>.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Waiting for approval…
          </div>
          <button onClick={reset} className="text-sm text-red-500 hover:underline">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (paymentState === 'paid') {
    return (
      <div className="flex justify-center items-center min-h-screen p-4 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl p-8 w-full max-w-md border border-slate-200 dark:border-slate-700 text-center space-y-6">
          <div className="flex justify-center">
            <CheckCircle2 className="w-16 h-16 text-green-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Payment received!</h2>
            <p className="text-slate-600 dark:text-slate-400 mt-2">{statusMessage}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">
              {estimatedReceive} {receiveToken} will be sent to your Celo wallet shortly.
            </p>
          </div>
          <button onClick={reset} className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition">
            Make another payment
          </button>
        </div>
      </div>
    );
  }

  if (paymentState === 'failed') {
    return (
      <div className="flex justify-center items-center min-h-screen p-4 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl p-8 w-full max-w-md border border-slate-200 dark:border-slate-700 text-center space-y-6">
          <div className="flex justify-center">
            <AlertCircle className="w-16 h-16 text-red-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Payment failed</h2>
            <p className="text-slate-600 dark:text-slate-400 mt-2">{statusMessage}</p>
          </div>
          <button onClick={reset} className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition">
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ── Main form ────────────────────────────────────────────────────────────
  return (
    <div className="flex justify-center items-center min-h-screen p-4 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl p-8 w-full max-w-md border border-slate-200 dark:border-slate-700">

<UserBalance refetchTrigger={refetchTrigger} />

        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">💱 Liquidity Bridge</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Convert between mobile money and stablecoins</p>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden mb-6">
          <button
            onClick={() => setActiveTab('buy')}
            className={`flex-1 py-2 text-sm font-semibold transition ${
              activeTab === 'buy'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            📥 Buy (On-Ramp)
          </button>
          <button
            onClick={() => setActiveTab('sell')}
            className={`flex-1 py-2 text-sm font-semibold transition ${
              activeTab === 'sell'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            📤 Sell (Off-Ramp)
          </button>
        </div>

        {!userAccount && (
          <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">🔗 Connect your wallet to get started</p>
          </div>
        )}

        {/* ── SELL TAB ─────────────────────────────────────────────────── */}
        {activeTab === 'sell' && (
          <>
            {sellState === 'done' && (
              <div className="text-center space-y-4">
                <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Sell request submitted!</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">{sellMessage}</p>
                <p className="text-xs text-slate-400 font-mono">Ref: {sellId}</p>
                <button onClick={resetSell} className="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition">
                  Sell more
                </button>
              </div>
            )}

            {sellState === 'failed' && (
              <div className="text-center space-y-4">
                <AlertCircle className="w-14 h-14 text-red-500 mx-auto" />
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Transaction failed</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">{sellMessage}</p>
                <button onClick={resetSell} className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition">
                  Try again
                </button>
              </div>
            )}

            {(sellState === 'approving' || sellState === 'depositing' || sellState === 'recording') && (
              <div className="text-center space-y-4">
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto" />
                <p className="text-slate-600 dark:text-slate-400 font-medium">{sellMessage}</p>
              </div>
            )}

            {sellState === 'idle' && (
              <form onSubmit={handleSell} className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">cUSD amount to sell</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={sellAmount}
                    onChange={(e) => setSellAmount(e.target.value)}
                    disabled={!userAccount}
                    placeholder="e.g. 5.00"
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-50"
                  />
                  {cusdBalance && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Available: {parseFloat(cusdBalance.formatted).toFixed(4)} cUSD
                    </p>
                  )}
                  {sellAmount && parseFloat(sellAmount) > parseFloat(cusdBalance?.formatted || '0') && (
                    <p className="text-xs text-red-500">Insufficient cUSD balance</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Receive ZWG on (EcoCash/OneMoney)</label>
                  <input
                    type="tel"
                    value={sellPhone}
                    onChange={(e) => setSellPhone(e.target.value)}
                    disabled={!userAccount}
                    placeholder="+263771234567"
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-50"
                  />
                </div>

                {sellAmount && parseFloat(sellAmount) > 0 && (
                  <div className="bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 rounded-lg p-4 border border-emerald-200 dark:border-emerald-700">
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">You&apos;ll receive ≈</p>
                      <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{zwgEstimate} ZWG</p>
                    </div>
                    <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">Sent to your mobile money within 10 minutes</p>
                  </div>
                )}

                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    ⚠️ This locks your cUSD in a smart contract escrow on Celo. ZWG is released to your mobile money after on-chain confirmation. Requires two wallet signatures (approve + deposit).
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={!isSellFormValid}
                  className={`w-full py-3 px-4 rounded-lg font-semibold transition flex items-center justify-center gap-2 ${
                    isSellFormValid
                      ? 'bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white cursor-pointer shadow-lg'
                      : 'bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-500 cursor-not-allowed'
                  }`}
                >
                  💸 Sell {sellAmount || '0'} cUSD → ZWG
                </button>
              </form>
            )}
          </>
        )}

        {/* ── BUY TAB ──────────────────────────────────────────────────── */}
        {activeTab === 'buy' && (
          <>
        <div className="mb-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
          <p className="text-xs font-bold text-indigo-800 dark:text-indigo-200 uppercase mb-1">📞 No internet? Use USSD</p>
          <p className="text-sm font-mono font-bold text-indigo-900 dark:text-indigo-100">*384*28561#</p>
          <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">Works on any phone — enter your number below first to link this wallet</p>
          {registered && <p className="text-xs text-green-600 dark:text-green-400 mt-1 font-semibold">✓ USSD registered for {phone}</p>}
        </div>

        {process.env.NEXT_PUBLIC_APP_ENVIRONMENT !== 'production' && (
          <div className="mb-4 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
            <p className="text-xs font-bold text-purple-800 dark:text-purple-200 uppercase mb-2">🧪 Test mode — use these phone numbers</p>
            <ul className="text-xs text-purple-700 dark:text-purple-300 space-y-1">
              <li><span className="font-mono font-semibold">+263771111111</span> — Payment succeeds</li>
              <li><span className="font-mono font-semibold">+263772222222</span> — Delayed success</li>
              <li><span className="font-mono font-semibold">+263773333333</span> — Payment fails</li>
            </ul>
          </div>
        )}

        <form onSubmit={handleInitiatePayment} className="space-y-5">

          {/* Payment method */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Payment method</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`py-2 px-3 rounded-lg text-sm font-semibold border transition ${
                    method === m
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-blue-400'
                  }`}
                >
                  {METHOD_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          {/* Phone number */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
              {METHOD_LABELS[method]} phone number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={!userAccount}
              placeholder="+263771234567"
              className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Amount (ZWL)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={!userAccount}
              placeholder="Enter amount"
              className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {amount && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Rate: 1 ZWL = {exchangeRate.zwlToUsd.toFixed(4)} USD
              </p>
            )}
          </div>

          {/* Receive token */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Receive as</label>
            <select
              value={receiveToken}
              onChange={(e) => setReceiveToken(e.target.value)}
              disabled={!userAccount}
              className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="cUSD">cUSD (Celo)</option>
              <option value="USDC">USDC (Celo)</option>
            </select>
          </div>

          {/* Quote */}
          {amount && parseFloat(amount) > 0 && (
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-4 border border-green-200 dark:border-green-700">
              <div className="flex justify-between items-center">
                <p className="text-sm font-semibold text-green-900 dark:text-green-200">You'll receive</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{estimatedReceive} {receiveToken}</p>
              </div>
              <p className="text-xs text-green-700 dark:text-green-300 mt-1">Sent to your connected Celo wallet</p>
            </div>
          )}

          {/* Destination */}
          {userAccount && (
            <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold mb-1">Destination wallet</p>
              <p className="text-sm font-mono text-slate-900 dark:text-slate-100">
                {userAccount.slice(0, 6)}...{userAccount.slice(-4)}
              </p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!isFormValid}
            className={`w-full py-3 px-4 rounded-lg font-semibold transition flex items-center justify-center gap-2 ${
              isFormValid
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white cursor-pointer shadow-lg'
                : 'bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-500 cursor-not-allowed'
            }`}
          >
            {paymentState === 'loading' ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Sending prompt…</>
            ) : (
              <>📱 Pay {amount || '0'} ZWL via {METHOD_LABELS[method]}</>
            )}
          </button>

          <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
            No Paynow account needed. You'll get a {METHOD_LABELS[method]} prompt on your phone.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
            No smartphone? Dial <span className="font-mono font-semibold">*384*28561#</span> from any phone.
          </p>
        </form>
        </>
        )}
      </div>
    </div>
  );
}

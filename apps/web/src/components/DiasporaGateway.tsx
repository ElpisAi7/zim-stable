'use client';

import React, { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useBalance } from 'wagmi';
import { parseUnits, isAddress, formatUnits } from 'viem';
import { Loader2, CheckCircle2, Send, Copy, ExternalLink, Search } from 'lucide-react';

// Celo Mainnet
const USDC_ADDRESS = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C' as const;
const CUSD_ADDRESS = '0x765DE816845861e75A25fCA122bb6898B8B1282a' as const;

const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function' as const,
    stateMutability: 'nonpayable' as const,
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

type Token = 'USDC' | 'cUSD';
type Mode = 'send' | 'receive';

const TOKEN_INFO: Record<Token, { address: `0x${string}`; decimals: number; label: string }> = {
  USDC: { address: USDC_ADDRESS, decimals: 6, label: 'USDC' },
  cUSD: { address: CUSD_ADDRESS, decimals: 18, label: 'cUSD' },
};

export default function DiasporaGateway() {
  const { address: userAccount } = useAccount();
  const [mode, setMode] = useState<Mode>('send');
  const [token, setToken] = useState<Token>('cUSD');
  const [phone, setPhone] = useState('');
  const [resolvedAddress, setResolvedAddress] = useState('');
  const [lookupState, setLookupState] = useState<'idle' | 'loading' | 'found' | 'notfound'>('idle');
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);

  const { data: senderBalance } = useBalance({
    address: userAccount,
    token: TOKEN_INFO[token].address,
    query: { refetchInterval: 15_000 },
  });

  const { writeContractAsync } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  async function lookupPhone() {
    const normalized = phone.trim().startsWith('+') ? phone.trim() : `+${phone.trim()}`;
    setLookupState('loading');
    setResolvedAddress('');
    try {
      const res = await fetch(`/api/wallet/lookup?phone=${encodeURIComponent(normalized)}`);
      const data = await res.json();
      if (data.address) {
        setResolvedAddress(data.address);
        setLookupState('found');
      } else {
        setLookupState('notfound');
      }
    } catch {
      setLookupState('notfound');
    }
  }

  const amountValid = amount !== '' && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0;
  const canSend = lookupState === 'found' && resolvedAddress && amountValid && userAccount && step === 'idle';

  async function handleSend() {
    if (!canSend) return;
    setStep('sending');
    setErrorMsg('');
    try {
      const { address: tokenAddress, decimals } = TOKEN_INFO[token];
      const amountWei = parseUnits(amount, decimals);
      const hash = await writeContractAsync({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [resolvedAddress as `0x${string}`, amountWei],
      });
      setTxHash(hash);
      setStep('done');
    } catch (err: any) {
      setErrorMsg(err?.shortMessage || err?.message || 'Transaction failed');
      setStep('error');
    }
  }

  function copyAddress() {
    if (!userAccount) return;
    navigator.clipboard.writeText(userAccount);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function reset() {
    setStep('idle');
    setTxHash(undefined);
    setErrorMsg('');
    setPhone('');
    setResolvedAddress('');
    setLookupState('idle');
    setAmount('');
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Send className="w-5 h-5 text-green-600" />
        <h2 className="text-lg font-bold text-gray-900">Diaspora Remittance</h2>
      </div>
      <p className="text-xs text-gray-500 mb-5">
        Send stablecoins directly to a Zimbabwean's MiniPay wallet using their phone number
      </p>

      {/* Mode tabs */}
      <div className="flex bg-gray-100 rounded-lg p-1 mb-5">
        {(['send', 'receive'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {m === 'send' ? '💸 Send' : '📲 Receive'}
          </button>
        ))}
      </div>

      {mode === 'send' && (
        <>
          {/* Token selector */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">Token to send</label>
            <div className="flex gap-2">
              {(Object.keys(TOKEN_INFO) as Token[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setToken(t)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    token === t ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {TOKEN_INFO[t].label}
                </button>
              ))}
            </div>
            {senderBalance && (
              <p className="text-xs text-gray-400 mt-1 text-right">
                Balance: {parseFloat(formatUnits(senderBalance.value, senderBalance.decimals)).toFixed(4)} {senderBalance.symbol}
              </p>
            )}
          </div>

          {/* Phone number lookup */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Recipient Zimbabwe phone number
            </label>
            <div className="flex gap-2">
              <input
                type="tel"
                placeholder="+263771234567"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setLookupState('idle'); setResolvedAddress(''); }}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
              <button
                onClick={lookupPhone}
                disabled={phone.trim().length < 8 || lookupState === 'loading'}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white px-3 rounded-lg transition-colors"
              >
                {lookupState === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </div>

            {lookupState === 'found' && (
              <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-xs text-green-700 font-medium">✓ Wallet found</p>
                <p className="text-xs text-gray-400 font-mono truncate">{resolvedAddress}</p>
              </div>
            )}
            {lookupState === 'notfound' && (
              <p className="mt-1 text-xs text-red-500">
                No wallet registered for this number. Ask the recipient to register via the app first.
              </p>
            )}
          </div>

          {/* Amount */}
          <div className="mb-5">
            <label className="block text-xs font-medium text-gray-600 mb-1">Amount (USD)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="number"
                min="0"
                step="any"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
          </div>

          {step === 'idle' || step === 'error' ? (
            <>
              {!userAccount && <p className="text-center text-sm text-gray-400 mb-3">Connect your wallet to send</p>}
              <button
                onClick={handleSend}
                disabled={!canSend}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-colors"
              >
                Send {token}
              </button>
              {step === 'error' && <p className="mt-2 text-xs text-red-500 text-center">{errorMsg}</p>}
            </>
          ) : step === 'sending' || isConfirming ? (
            <div className="flex flex-col items-center gap-2 py-4">
              <Loader2 className="w-7 h-7 text-green-500 animate-spin" />
              <p className="text-sm text-gray-600">
                {step === 'sending' ? 'Confirm in your wallet…' : 'Waiting for confirmation…'}
              </p>
            </div>
          ) : isConfirmed ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
              <p className="font-semibold text-gray-800">Sent!</p>
              <p className="text-xs text-gray-500 text-center">
                ${amount} {TOKEN_INFO[token].label} delivered to {phone}
              </p>
              {txHash && (
                <a
                  href={`https://celoscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-green-600 hover:underline"
                >
                  View on Celoscan <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <button onClick={reset} className="mt-1 text-sm text-green-600 hover:underline">
                Send another
              </button>
            </div>
          ) : null}
        </>
      )}

      {mode === 'receive' && (
        <div className="flex flex-col items-center gap-4 py-4">
          {userAccount ? (
            <>
              <p className="text-sm text-gray-600 text-center">
                Share your MiniPay address with someone overseas to receive stablecoins.
              </p>
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 w-full text-center">
                <p className="text-xs text-gray-400 font-mono break-all">{userAccount}</p>
              </div>
              <button
                onClick={copyAddress}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
              >
                <Copy className="w-4 h-4" />
                {copied ? 'Copied!' : 'Copy Address'}
              </button>
              <p className="text-xs text-gray-400 text-center">
                Make sure you've registered your phone number in the Zimbabwe tab so senders can find you by number.
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-400">Connect your MiniPay wallet to see your address</p>
          )}
        </div>
      )}
    </div>
  );
}

import { useAccount, useWriteContract, useWaitForTransactionReceipt, useBalance } from 'wagmi';
import { parseUnits, isAddress, formatUnits } from 'viem';
import { Loader2, CheckCircle2, Send, Copy, ExternalLink } from 'lucide-react';

// Celo Mainnet
const USDC_ADDRESS = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C' as const; // native USDC on Celo mainnet
const CUSD_ADDRESS = '0x765DE816845861e75A25fCA122bb6898B8B1282a' as const; // cUSD mainnet

const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function' as const,
    stateMutability: 'nonpayable' as const,
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function' as const,
    stateMutability: 'view' as const,
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

type Token = 'USDC' | 'cUSD';
type Mode = 'send' | 'receive';

const TOKEN_INFO: Record<Token, { address: `0x${string}`; decimals: number; label: string }> = {
  USDC: { address: USDC_ADDRESS, decimals: 6, label: 'USDC' },
  cUSD: { address: CUSD_ADDRESS, decimals: 18, label: 'cUSD' },
};

export default function DiasporaGateway() {
  const { address: userAccount } = useAccount();
  const [mode, setMode] = useState<Mode>('send');
  const [token, setToken] = useState<Token>('cUSD');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);

  const { data: senderBalance } = useBalance({
    address: userAccount,
    token: TOKEN_INFO[token].address,
    query: { refetchInterval: 15_000 },
  });

  const { writeContractAsync } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const recipientValid = recipient.trim() !== '' && isAddress(recipient.trim());
  const amountValid = amount !== '' && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0;
  const canSend = recipientValid && amountValid && userAccount && step === 'idle';

  async function handleSend() {
    if (!canSend) return;
    setStep('sending');
    setErrorMsg('');
    try {
      const { address: tokenAddress, decimals } = TOKEN_INFO[token];
      const amountWei = parseUnits(amount, decimals);
      const hash = await writeContractAsync({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [recipient.trim() as `0x${string}`, amountWei],
      });
      setTxHash(hash);
      setStep('done');
    } catch (err: any) {
      setErrorMsg(err?.shortMessage || err?.message || 'Transaction failed');
      setStep('error');
    }
  }

  function copyAddress() {
    if (!userAccount) return;
    navigator.clipboard.writeText(userAccount);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function reset() {
    setStep('idle');
    setTxHash(undefined);
    setErrorMsg('');
    setRecipient('');
    setAmount('');
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Send className="w-5 h-5 text-green-600" />
        <h2 className="text-lg font-bold text-gray-900">Diaspora Remittance</h2>
      </div>
      <p className="text-xs text-gray-500 mb-5">
        Send stablecoins directly to any Zimbabwean MiniPay wallet
      </p>

      {/* Mode tabs */}
      <div className="flex bg-gray-100 rounded-lg p-1 mb-5">
        {(['send', 'receive'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {m === 'send' ? '💸 Send' : '📲 Receive'}
          </button>
        ))}
      </div>

      {mode === 'send' && (
        <>
          {/* Token selector */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">Token to send</label>
            <div className="flex gap-2">
              {(Object.keys(TOKEN_INFO) as Token[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setToken(t)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    token === t
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {TOKEN_INFO[t].label}
                </button>
              ))}
            </div>
            {senderBalance && (
              <p className="text-xs text-gray-400 mt-1 text-right">
                Balance: {parseFloat(formatUnits(senderBalance.value, senderBalance.decimals)).toFixed(4)} {senderBalance.symbol}
              </p>
            )}
          </div>

          {/* Recipient address */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Recipient MiniPay address (0x…)
            </label>
            <input
              type="text"
              placeholder="0x..."
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 ${
                recipient && !recipientValid ? 'border-red-300' : 'border-gray-200'
              }`}
            />
            {recipient && !recipientValid && (
              <p className="text-xs text-red-500 mt-1">Enter a valid 0x address</p>
            )}
          </div>

          {/* Amount */}
          <div className="mb-5">
            <label className="block text-xs font-medium text-gray-600 mb-1">Amount (USD)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="number"
                min="0"
                step="any"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
          </div>

          {/* Send button / status */}
          {step === 'idle' || step === 'error' ? (
            <>
              {!userAccount && (
                <p className="text-center text-sm text-gray-400 mb-3">Connect your wallet to send</p>
              )}
              <button
                onClick={handleSend}
                disabled={!canSend}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-colors"
              >
                Send {token}
              </button>
              {step === 'error' && (
                <p className="mt-2 text-xs text-red-500 text-center">{errorMsg}</p>
              )}
            </>
          ) : step === 'sending' || isConfirming ? (
            <div className="flex flex-col items-center gap-2 py-4">
              <Loader2 className="w-7 h-7 text-green-500 animate-spin" />
              <p className="text-sm text-gray-600">
                {step === 'sending' ? 'Confirm in your wallet…' : 'Waiting for confirmation…'}
              </p>
            </div>
          ) : isConfirmed ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
              <p className="font-semibold text-gray-800">Sent!</p>
              <p className="text-xs text-gray-500 text-center">
                {amount} {TOKEN_INFO[token].label} delivered to recipient's MiniPay wallet.
              </p>
              {txHash && (
                <a
                  href={`https://celoscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-green-600 hover:underline"
                >
                  View on Celoscan <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <button
                onClick={reset}
                className="mt-1 text-sm text-green-600 hover:underline"
              >
                Send another
              </button>
            </div>
          ) : null}
        </>
      )}

      {mode === 'receive' && (
        <div className="flex flex-col items-center gap-4 py-4">
          {userAccount ? (
            <>
              <p className="text-sm text-gray-600 text-center">
                Share your MiniPay address with someone overseas to receive stablecoins.
              </p>
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 w-full text-center">
                <p className="text-xs text-gray-400 font-mono break-all">{userAccount}</p>
              </div>
              <button
                onClick={copyAddress}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
              >
                <Copy className="w-4 h-4" />
                {copied ? 'Copied!' : 'Copy Address'}
              </button>
              <p className="text-xs text-gray-400 text-center">
                This is your Celo wallet address. Anyone on Celo (including MiniPay users) can send USDC or cUSD here.
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-400">Connect your MiniPay wallet to see your address</p>
          )}
        </div>
      )}
    </div>
  );
}

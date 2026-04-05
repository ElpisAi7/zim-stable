'use client';

import React, { useState } from 'react';
import { Loader2, Send, RefreshCw } from 'lucide-react';
import { initiatePaynowPayment, checkPaynowTransactionStatus } from '@/lib/paynow';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface PaynowGatewayProps {
  onPaymentSuccess?: (reference: string, amount: number) => void;
  onPaymentError?: (error: string) => void;
}

export default function PaynowGateway({
  onPaymentSuccess,
  onPaymentError,
}: PaynowGatewayProps) {
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('+263');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('ZimStable Remittance');
  const [isLoading, setIsLoading] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<string | null>(null);
  const [lastReference, setLastReference] = useState<string | null>(null);

  const handleInitiatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !phoneNumber || !amount) {
      alert('Please fill all fields');
      return;
    }

    setIsLoading(true);
    const reference = `ZIM-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

    try {
      const result = await initiatePaynowPayment({
        email,
        phone: phoneNumber,
        amount: parseFloat(amount),
        currency: 'USD',
        reference,
        description,
        returnUrl: `${window.location.origin}/paynow/return`,
        notifyUrl: `${window.location.origin}/api/paynow/callback`,
      });

      if (result.success && result.redirectUrl) {
        setLastReference(reference);
        console.log('[Paynow] Redirecting to payment...');
        window.location.href = result.redirectUrl;
      } else {
        const errorMsg = result.error || 'Payment initiation failed';
        onPaymentError?.(errorMsg);
        alert(`Error: ${errorMsg}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      onPaymentError?.(errorMsg);
      alert(`Error: ${errorMsg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckStatus = async () => {
    if (!lastReference) {
      alert('No transaction reference available');
      return;
    }

    setIsLoading(true);
    try {
      const status = await checkPaynowTransactionStatus(lastReference);
      if (status) {
        setTransactionStatus(status.status);
        if (status.status === 'completed') {
          onPaymentSuccess?.(lastReference, status.amount);
        }
      }
    } catch (error) {
      console.error('Status check error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">Fiat On-Ramp</h2>
      <p className="text-sm text-gray-600 mb-4">
        Pay via EcoCash/OneMoney (Zimbabwe) to load stablecoins
      </p>

      <form onSubmit={handleInitiatePayment} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-400"
            disabled={isLoading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Phone Number
          </label>
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+263..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-400"
            disabled={isLoading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Amount (USD)
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100.00"
            step="0.01"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-400"
            disabled={isLoading}
          />
        </div>

        <Button
          type="submit"
          disabled={isLoading}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" />
              Pay with Paynow
            </>
          )}
        </Button>
      </form>

      {lastReference && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-sm text-gray-600 mb-2">Reference: {lastReference}</p>
          {transactionStatus && (
            <p className="text-sm font-medium text-gray-700 mb-2">
              Status: <span className="text-blue-600">{transactionStatus}</span>
            </p>
          )}
          <Button
            type="button"
            onClick={handleCheckStatus}
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Check Status
              </>
            )}
          </Button>
        </div>
      )}
    </Card>
  );
}

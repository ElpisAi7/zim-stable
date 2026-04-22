'use client';

import React, { useState, useEffect } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useReadContract, useWatchContractEvent } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { ZIM_ESCROW_ADDRESS, ZIM_ESCROW_ABI, MOCK_USDC_ABI, TEST_USDC_ADDRESS, PRICE_ORACLE_ADDRESS, PRICE_ORACLE_ABI, TOKEN_ADDRESSES } from "@/lib/contracts";
import { Loader2, Settings, X, Globe } from "lucide-react";

const CUSD_FEE_CURRENCY = TOKEN_ADDRESSES.cUSD as `0x${string}`;

function formatEscrowError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();

  if (
    lower.includes('insufficient funds for gas') &&
    lower.includes('feecurrency 0xbf1441ea57f43f35f713431001f35742c88071c7'.toLowerCase())
  ) {
    return 'MiniPay is using a fee token with zero balance. In MiniPay settings, switch transaction fee token to cUSD or CELO, then retry.';
  }

  return raw;
}

export default function P2PGateway() {
  const { address: userAccount } = useAccount();
  
  // Remittance Mode: Send from Australia or Receive in Zimbabwe
  const [remittanceMode, setRemittanceMode] = useState<'send-australia' | 'receive-zimbabwe'>('send-australia');
  
  // Compliance tracking
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [kycStatus, setKycStatus] = useState('pending'); // pending, verified, failed
  
  const [countryCode, setCountryCode] = useState("+61"); // Australia default for AUDDapt
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("PayID");
  const [receiveToken, setReceiveToken] = useState("cUSD");
  const [amount, setAmount] = useState("");
  const [mintAmount, setMintAmount] = useState("100");
  const [inputMode, setInputMode] = useState<"local" | "usd">("local");
  const [userEscrows, setUserEscrows] = useState<any[]>([]);
  const [isLoadingEscrows, setIsLoadingEscrows] = useState(false);
  const [availableEscrows, setAvailableEscrows] = useState<any[]>([]);
  const [isLoadingAvailable, setIsLoadingAvailable] = useState(false);
  const [escrowStep, setEscrowStep] = useState<'idle' | 'approving' | 'depositing'>('idle');
  const [pendingDepositInfo, setPendingDepositInfo] = useState<{ tokenAddress: string; amountInWei: bigint } | null>(null);
  const [showDevSettings, setShowDevSettings] = useState(false);
  const [activityTab, setActivityTab] = useState<'active' | 'history'>('active');
  const [successEscrow, setSuccessEscrow] = useState<any>(null);

  // Read total escrows count
  const { data: totalEscrows } = useReadContract({
    address: ZIM_ESCROW_ADDRESS,
    abi: ZIM_ESCROW_ABI,
    functionName: "getTotalEscrows",
  });

  // Read exchange rate from oracle
  const { data: exchangeRate, isLoading: isLoadingRate } = useReadContract({
    address: PRICE_ORACLE_ADDRESS,
    abi: PRICE_ORACLE_ABI,
    functionName: "getAudToUsdRate",
  });

  // Calculate USD amount for escrow
  const getUsdAmount = () => {
    if (!amount) return 0;
    let usdAmount = parseFloat(amount);
    if (inputMode === "local" && countryCode === "+61") {
      usdAmount = usdAmount * audToUsdRate;
    }
    return usdAmount;
  };

  // Calculate AUD/USD spread with 1% fee for AUDDapt
  const calculateAudToUsdWithFee = () => {
    if (!exchangeRate) return 0.65; // Fallback
    const baseRate = Number(formatUnits(exchangeRate, 6));
    const feePercentage = 0.01; // 1% fee
    return baseRate * (1 + feePercentage); // Apply 1% spread
  };

  // Get token address for allowance check
  const getTokenAddress = () => {
    return TOKEN_ADDRESSES[receiveToken as keyof typeof TOKEN_ADDRESSES] || TEST_USDC_ADDRESS;
  };

  // Check allowance for the escrow contract
  const { data: currentAllowance, refetch: refetchAllowance } = useReadContract({
    address: getTokenAddress(),
    abi: MOCK_USDC_ABI,
    functionName: "allowance",
    args: userAccount && ZIM_ESCROW_ADDRESS ? [userAccount, ZIM_ESCROW_ADDRESS] : undefined,
    query: {
      enabled: !!userAccount && !!getTokenAddress(),
    },
  });

  // Wagmi contract interaction hooks
  const { writeContract: writeEscrow, isPending: isPendingEscrow, data: escrowHash, error: escrowError, isError: isEscrowError } = useWriteContract();
  const { isLoading: isConfirmingEscrow, isSuccess: isSuccessEscrow } = useWaitForTransactionReceipt({
    hash: escrowHash,
  });

  const { writeContract: writeMint, isPending: isPendingMint, data: mintHash } = useWriteContract();
  const { isLoading: isConfirmingMint, isSuccess: isSuccessMint } = useWaitForTransactionReceipt({
    hash: mintHash,
  });

  const { writeContract: writeSignalPayment, isPending: isPendingSignal, data: signalHash, reset: resetSignal, isError: isErrorSignal } = useWriteContract();
  const { isLoading: isConfirmingSignal, isSuccess: isSuccessSignal } = useWaitForTransactionReceipt({
    hash: signalHash,
  });

  const { writeContract: writeApprove, isPending: isPendingApprove, data: approveHash, error: approveError, isError: isApproveError } = useWriteContract();
  const { isLoading: isConfirmingApprove, isSuccess: isSuccessApprove } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  // Calculate exchange rate display with 1% fee spread for AUDDapt
  const baseAudToUsdRate = exchangeRate ? Number(formatUnits(exchangeRate, 6)) : 0.65;
  const audToUsdRate = calculateAudToUsdWithFee(); // Includes 1% fee
  const usdToAudRate = audToUsdRate > 0 ? 1 / audToUsdRate : 1.54;
  const audFeePercentage = ((audToUsdRate - baseAudToUsdRate) / baseAudToUsdRate) * 100;

  // Combined transaction pending state
  const isAnyTransactionPending = isPendingEscrow || isConfirmingEscrow || isPendingMint || isConfirmingMint || isPendingSignal || isConfirmingSignal || isPendingApprove || isConfirmingApprove;
  const isTransactionPendingEscrow = isPendingEscrow || isConfirmingEscrow;
  const isTransactionPendingMint = isPendingMint || isConfirmingMint;
  const isTransactionPendingApprove = isPendingApprove || isConfirmingApprove;

  // Calculate converted amounts
  const getConvertedAmount = (inputAmount: string, fromMode: "local" | "usd") => {
    if (!inputAmount || !exchangeRate) return "0";

    const amountNum = parseFloat(inputAmount);
    if (fromMode === "local" && countryCode === "+61") {
      // AUD to USD conversion
      return (amountNum * audToUsdRate).toFixed(2);
    } else if (fromMode === "usd" && countryCode === "+61") {
      // USD to AUD conversion
      return (amountNum * usdToAudRate).toFixed(2);
    }
    return inputAmount; // No conversion for ZWD
  };

  // Fetch user escrows
  const fetchUserEscrows = async () => {
    if (!userAccount || !totalEscrows) return;

    setIsLoadingEscrows(true);
    const escrows = [];

    // Check last 50 escrows (adjust as needed)
    const startId = Math.max(0, Number(totalEscrows) - 50);
    const endId = Number(totalEscrows);

    for (let i = startId; i < endId; i++) {
      try {
        const escrow = await readEscrow(i);
        if (escrow && (escrow.seller === userAccount || escrow.buyer === userAccount)) {
          escrows.push({ id: i, ...escrow });
        }
      } catch (error) {
        // Skip invalid escrows
        continue;
      }
    }

    setUserEscrows(escrows);
    setIsLoadingEscrows(false);
  };

  // Fetch available escrows for buying
  const fetchAvailableEscrows = async () => {
    if (!totalEscrows) {
      console.log('[DEBUG] fetchAvailableEscrows: totalEscrows is not loaded yet', totalEscrows);
      return;
    }

    setIsLoadingAvailable(true);
    const escrows = [];
    const totalCount = Number(totalEscrows);

    console.log('[DEBUG] fetchAvailableEscrows: Starting fetch. Total escrows:', totalCount);

    // Check last 50 escrows (adjust as needed)
    const startId = Math.max(0, totalCount - 50);
    const endId = totalCount;

    console.log('[DEBUG] fetchAvailableEscrows: Checking escrow range', startId, 'to', endId);

    for (let i = startId; i < endId; i++) {
      try {
        const escrow = await readEscrow(i);
        
        // Handle both numeric status (0, 1, 2...) and potentially named status
        const escrowStatus = typeof escrow?.status === 'object' ? 0 : Number(escrow?.status);
        const isBuyerZero = escrow?.buyer === '0x0000000000000000000000000000000000000000' || 
                           escrow?.buyer?.toLowerCase() === '0x0000000000000000000000000000000000000000';
        const isStatusActive = escrowStatus === 0;
        
        console.log(`[DEBUG] Escrow ${i}:`, {
          found: !!escrow,
          buyer: escrow?.buyer,
          status: escrow?.status,
          statusNum: escrowStatus,
          isBuyerZero,
          isStatusActive,
          shouldAdd: isBuyerZero && isStatusActive,
        });
        
        const isSelfEscrow = escrow?.seller?.toLowerCase() === userAccount?.toLowerCase();
        if (escrow && isBuyerZero && isStatusActive && !isSelfEscrow) {
          console.log(`[DEBUG] Escrow ${i} is available, adding to list`);
          escrows.push({ id: i, ...escrow });
        }
      } catch (error) {
        console.log(`[DEBUG] Error reading escrow ${i}:`, error);
        // Skip invalid escrows
        continue;
      }
    }

    console.log('[DEBUG] fetchAvailableEscrows: Found', escrows.length, 'available escrows');
    setAvailableEscrows(escrows);
    setIsLoadingAvailable(false);
  };

  // Helper function to read escrow data
  const readEscrow = async (escrowId: number) => {
    try {
      const result = await fetch('/api/read-escrow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ escrowId }),
      });
      
      if (!result.ok) {
        console.log(`[DEBUG] readEscrow ${escrowId}: API returned status ${result.status}`);
        return null;
      }
      
      const data = await result.json();
      console.log(`[DEBUG] readEscrow ${escrowId}: Received data`, data);
      return data;
    } catch (error) {
      console.error('Error reading escrow:', error);
      return null;
    }
  };

  // Reset function for navigation and error handling
  const resetEscrowState = () => {
    setEscrowStep('idle');
    setIsPhoneVerified(false);
    setAmount("");
    setPhoneNumber("");
  };

  // Effect to continue from approval to deposit on success
  useEffect(() => {
    if (escrowStep === 'approving' && isSuccessApprove) {
      setEscrowStep('depositing');
      refetchAllowance();

      const payload = pendingDepositInfo;
      if (payload) {
        performDeposit(payload.tokenAddress, payload.amountInWei);
      } else {
        const tokenAddress = getTokenAddress();
        const usdAmount = getUsdAmount();
        const amountInWei = parseUnits(usdAmount.toString(), 18);
        performDeposit(tokenAddress, amountInWei);
      }
      setPendingDepositInfo(null);
    }
  }, [escrowStep, isSuccessApprove, pendingDepositInfo]);

  // Effect to reset on transaction failure
  useEffect(() => {
    if (escrowStep === 'approving' && isApproveError && approveError) {
      alert(formatEscrowError(approveError));
      setEscrowStep('idle');
      setPendingDepositInfo(null);
      return;
    }

    if (escrowStep === 'depositing' && isEscrowError && escrowError) {
      alert(formatEscrowError(escrowError));
      setEscrowStep('idle');
      return;
    }

    if (escrowStep === 'approving' && !isPendingApprove && !isConfirmingApprove && !isSuccessApprove && approveHash) {
      // Approval failed
      alert('Approval failed. Please retry.');
      setEscrowStep('idle');
    }
    if (escrowStep === 'depositing' && !isPendingEscrow && !isConfirmingEscrow && !isSuccessEscrow && escrowHash) {
      // Deposit failed
      alert('Escrow deposit failed. Please retry.');
      setEscrowStep('idle');
    }
  }, [
    escrowStep,
    isApproveError,
    approveError,
    isEscrowError,
    escrowError,
    isPendingApprove,
    isConfirmingApprove,
    isSuccessApprove,
    approveHash,
    isPendingEscrow,
    isConfirmingEscrow,
    isSuccessEscrow,
    escrowHash,
  ]);

  // Watch for escrow events to refresh data
  useWatchContractEvent({
    address: ZIM_ESCROW_ADDRESS,
    abi: ZIM_ESCROW_ABI,
    eventName: 'EscrowCreated' as any,
    onLogs: () => {
      fetchUserEscrows();
      fetchAvailableEscrows();
    },
  });

  useWatchContractEvent({
    address: ZIM_ESCROW_ADDRESS,
    abi: ZIM_ESCROW_ABI,
    eventName: 'PaymentSignaled' as any,
    onLogs: () => {
      fetchUserEscrows();
      fetchAvailableEscrows();
    },
  });

  // Effect to fetch escrows when totalEscrows changes
  useEffect(() => {
    fetchUserEscrows();
    fetchAvailableEscrows();
  }, [totalEscrows, userAccount]);

  const handleVerifyPhone = () => {
    if (phoneNumber.trim()) {
      setIsPhoneVerified(true);
    }
  };

  const handleCreateEscrow = async () => {
    if (!isPhoneVerified || !phoneNumber.trim() || !amount.trim()) {
      alert("Please verify phone and enter amount");
      return;
    }

    if (escrowStep !== 'idle') return; // Prevent multiple calls

    try {
      // Get the selected token address
      const tokenAddress = getTokenAddress();
      if (!tokenAddress) {
        alert("Invalid token selected");
        return;
      }

      // Calculate the USD amount for escrow (what user will receive)
      const usdAmount = getUsdAmount();

      // Parse USD amount with 18 decimals (standard for cUSD/USDC)
      const amountInWei = parseUnits(usdAmount.toString(), 18);

      // Check current allowance
      const allowance = currentAllowance ? Number(formatUnits(currentAllowance, 18)) : 0;
      const requiredAmount = usdAmount;

      const isQuickApproved = allowance >= 50; // Smart approval threshold per request
      const needsApproval = allowance < requiredAmount && !isQuickApproved;

      if (needsApproval) {
        // Need to approve first
        setEscrowStep('approving');
        setPendingDepositInfo({ tokenAddress, amountInWei });
        writeApprove({
          address: tokenAddress as `0x${string}`,
          abi: MOCK_USDC_ABI,
          functionName: "approve",
          args: [ZIM_ESCROW_ADDRESS, amountInWei],
          feeCurrency: CUSD_FEE_CURRENCY,
        } as any);
      } else {
        // Already approved (or retrospectively high allowance); skip approval
        setEscrowStep('depositing');
        performDeposit(tokenAddress, amountInWei);
      }
    } catch (err) {
      console.error("Error in escrow creation:", err);
      alert("Failed to start escrow process. Please try again.");
      setEscrowStep('idle');
    }
  };

  // Separate function for deposit
  const performDeposit = (tokenAddress: string, amountInWei: bigint) => {
    // Combine country code with phone number and payment method
    const fullPhoneNumber = `${countryCode} ${phoneNumber} | ${paymentMethod}`;

    writeEscrow({
      address: ZIM_ESCROW_ADDRESS,
      abi: ZIM_ESCROW_ABI,
      functionName: "depositEscrow",
      args: [tokenAddress as `0x${string}`, amountInWei, fullPhoneNumber],
      feeCurrency: CUSD_FEE_CURRENCY,
    } as any);
  };

  // Effect to reset step on success
  useEffect(() => {
    if (isSuccessEscrow) {
      setEscrowStep('idle');
    }
  }, [isSuccessEscrow]);

  const handleSignalPayment = async (escrowId: number) => {
    try {
      writeSignalPayment({
        address: ZIM_ESCROW_ADDRESS,
        abi: ZIM_ESCROW_ABI,
        functionName: "signalPayment" as any,
        args: [escrowId] as any,
      });
    } catch (err) {
      console.error("Error signaling payment:", err);
      alert("Failed to signal payment. Please try again.");
    }
  };

  const handleBuyEscrow = async (escrowId: number, sellerAddress?: string) => {
    if (!userAccount) {
      alert("Please connect your wallet first");
      return;
    }

    if (sellerAddress && sellerAddress.toLowerCase() === userAccount.toLowerCase()) {
      alert("You cannot buy your own escrow.");
      return;
    }

    // Reset any previous error state so the button is not stuck
    resetSignal();

    console.log('[DEBUG] handleBuyEscrow: signalPayment for escrow', escrowId, 'buyer', userAccount);
    writeSignalPayment({
      address: ZIM_ESCROW_ADDRESS,
      abi: ZIM_ESCROW_ABI,
      functionName: "signalPayment",
      args: [BigInt(escrowId)],
    });
  };

  const handleReleaseFunds = async (escrowId: number) => {
    try {
      console.log('[DEBUG] handleReleaseFunds: Attempting to release funds for escrow', escrowId);
      
      if (!userAccount) {
        alert("Please connect your wallet first");
        return;
      }

      writeSignalPayment({
        address: ZIM_ESCROW_ADDRESS,
        abi: ZIM_ESCROW_ABI,
        functionName: "releaseFunds",
        args: [BigInt(escrowId)],
      });
      
      console.log('[DEBUG] handleReleaseFunds: releaseFunds transaction initiated');
    } catch (err) {
      console.error('Error releasing funds:', err);
      alert("Failed to release funds. Please try again.");
    }
  };

  const handleMintTestTokens = async () => {
    if (!userAccount) {
      alert("Please connect your wallet first");
      return;
    }

    if (!mintAmount.trim() || parseFloat(mintAmount) <= 0) {
      alert("Please enter a valid amount to mint");
      return;
    }

    try {
      const amountInWei = parseUnits(mintAmount, 18);

      writeMint({
        address: TEST_USDC_ADDRESS as `0x${string}`,
        abi: MOCK_USDC_ABI,
        functionName: "mint",
        args: [userAccount, amountInWei],
      });
    } catch (err) {
      console.error("Error minting tokens:", err);
      alert("Failed to mint tokens. Make sure the test token is deployed.");
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg p-8 w-full max-w-md">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Buy cUSD</h2>
          <button
            onClick={resetEscrowState}
            className="text-sm text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            Reset
          </button>
        </div>

        {/* Test Token Minter - Only when TEST_USDC_ADDRESS is set */}
        {TEST_USDC_ADDRESS && (
          <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-200 mb-3">
              🧪 Test Mode: Mint Mock AUDD (AUD-backed stablecoin)
            </p>
            <div className="flex gap-2">
              <input
                type="number"
                value={mintAmount}
                onChange={e => setMintAmount(e.target.value)}
                disabled={isTransactionPendingMint}
                className="flex-1 rounded-lg border border-yellow-300 dark:border-yellow-700 bg-yellow-100 dark:bg-yellow-900/50 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500 disabled:opacity-50"
                placeholder="100"
                min="1"
              />
              <button
                onClick={handleMintTestTokens}
                disabled={isTransactionPendingMint || !userAccount}
                className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:bg-zinc-400 disabled:cursor-not-allowed transition font-semibold flex items-center gap-2"
              >
                {isTransactionPendingMint ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Minting...
                  </>
                ) : (
                  "Mint Mock AUDD"
                )}
              </button>
            </div>
            {isSuccessMint && (
              <p className="text-xs text-green-700 dark:text-green-300 mt-2">
                ✓ Mock AUDD tokens minted! Tx: {mintHash?.slice(0, 10)}...
              </p>
            )}
          </div>
        )}

        {/* Success Message */}
        {isSuccessEscrow && (
          <div className="mb-4 p-4 bg-green-100 dark:bg-green-900 border border-green-400 dark:border-green-600 rounded-lg">
            <p className="text-green-800 dark:text-green-200 font-semibold">
              ✓ Escrow created successfully!
            </p>
            <p className="text-sm text-green-700 dark:text-green-300 mt-1">
              Transaction: {escrowHash?.slice(0, 10)}...
            </p>
            <p className="text-sm text-green-700 dark:text-green-300 mt-1">
              Payment Method: {paymentMethod}
            </p>
            <p className="text-sm text-green-700 dark:text-green-300 mt-1">
              Phone: {countryCode} {phoneNumber}
            </p>
          </div>
        )}

        {/* Payment Signaled Success Message with Instructions */}
        {isSuccessSignal && successEscrow && (
          <div className="mb-4 space-y-3">
            <div className="p-4 bg-green-100 dark:bg-green-900 border border-green-400 dark:border-green-600 rounded-lg">
              <p className="text-green-800 dark:text-green-200 font-semibold">
                ✓ Payment signaled successfully!
              </p>
              <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                Transaction: {signalHash?.slice(0, 10)}...
              </p>
            </div>

            {/* Payment Instructions for Buyer */}
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-400 dark:border-amber-600 rounded-lg">
              <p className="text-amber-900 dark:text-amber-100 font-bold mb-3 text-lg">📨 Payment Instructions</p>
              <div className="space-y-2 text-sm text-amber-900 dark:text-amber-200">
                <p>Please send payment using the details below:</p>
                <div className="bg-white dark:bg-zinc-900 p-3 rounded border border-amber-300 dark:border-amber-700 space-y-2">
                  <p><span className="font-semibold">Amount:</span> ${Number((successEscrow.amount || 0) / 10**18).toFixed(2)} AUD</p>
                  <p><span className="font-semibold">Payment Method:</span> {paymentMethod}</p>
                  <p><span className="font-semibold">Reference:</span> <code className="bg-amber-100 dark:bg-amber-900 px-2 py-1 rounded font-mono">Escrow #{successEscrow.id}</code></p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
                    ⚠️ The seller is waiting for your payment. Send payment and wait for confirmation to release funds.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {isSuccessSignal && !successEscrow && (
          <div className="mb-4 p-4 bg-blue-100 dark:bg-blue-900 border border-blue-400 dark:border-blue-600 rounded-lg">
            <p className="text-blue-800 dark:text-blue-200 font-semibold">
              ✓ Payment signaled successfully!
            </p>
            <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
              Transaction: {signalHash?.slice(0, 10)}...
            </p>
            <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
              The seller will be notified to release the funds.
            </p>
          </div>
        )}

        {/* AUDDapt Remittance Mode Toggle */}
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-3 flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Remittance Mode
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setRemittanceMode('send-australia')}
              className={`p-3 rounded-lg font-medium text-sm transition ${
                remittanceMode === 'send-australia'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-blue-200 dark:border-blue-700'
              }`}
            >
              📤 Send from Australia
            </button>
            <button
              onClick={() => setRemittanceMode('receive-zimbabwe')}
              className={`p-3 rounded-lg font-medium text-sm transition ${
                remittanceMode === 'receive-zimbabwe'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-blue-200 dark:border-blue-700'
              }`}
            >
              📥 Receive in Zimbabwe
            </button>
          </div>
        </div>

        {/* Phone Number Input - Mobile First */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2" htmlFor="phone-number">
            Phone Number <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <select
              value={countryCode}
              onChange={e => {
                setCountryCode(e.target.value);
                setIsPhoneVerified(false);
              }}
              disabled={isAnyTransactionPending || escrowStep !== 'idle'}
              className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="+263">🇿🇼 Zimbabwe (+263)</option>
              <option value="+61">🇦🇺 Australia (+61)</option>
            </select>
            <input
              id="phone-number"
              type="tel"
              value={phoneNumber}
              onChange={e => {
                setPhoneNumber(e.target.value);
                setIsPhoneVerified(false);
              }}
              disabled={isAnyTransactionPending || escrowStep !== 'idle'}
              className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder={countryCode === "+263" ? "77 123 4567" : "4 1234 5678"}
              required
            />
            <button
              onClick={handleVerifyPhone}
              disabled={!phoneNumber.trim() || isAnyTransactionPending || escrowStep !== 'idle'}
              className={`px-4 py-2 rounded-lg font-semibold transition whitespace-nowrap ${
                isPhoneVerified
                  ? "bg-green-500 text-white cursor-default"
                  : "bg-blue-500 text-white hover:bg-blue-600 disabled:bg-zinc-400 disabled:cursor-not-allowed"
              }`}
            >
              {isPhoneVerified ? "Verified" : "Verify"}
            </button>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2" htmlFor="payment-method">
            Payment Method
          </label>
          <select
            id="payment-method"
            value={paymentMethod}
            onChange={e => setPaymentMethod(e.target.value)}
            disabled={isAnyTransactionPending || escrowStep !== 'idle'}
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {remittanceMode === 'send-australia' ? (
              <>
                <option value="PayID">PayID (Australian Bank Transfer)</option>
                <option value="Bank Transfer">Direct Bank Transfer (AU)</option>
                <option value="Wise">Wise Transfer</option>
              </>
            ) : (
              <>
                <option value="EcoCash">EcoCash (Zimbabwe Mobile Money)</option>
                <option value="InnBucks">InnBucks (Zimbabwe USD Transfer)</option>
                <option value="ZIPIT">ZIPIT / Bank Transfer (Zimbabwe)</option>
              </>
            )}
          </select>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2" htmlFor="amount">
            Amount {inputMode === "local" ? `in ${countryCode === "+61" ? "AUD" : "Local Currency"}` : "in USD"}
          </label>

          {/* Exchange Rate Display with Fee Breakdown */}
          {countryCode === "+61" && (
            <div className="mb-2 p-3 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-purple-700 rounded text-sm">
              <div className="flex justify-between items-center mb-2">
                <span className="text-blue-900 dark:text-blue-100 font-semibold">
                  AUDDapt Exchange Rate
                </span>
                <button
                  onClick={() => setInputMode(inputMode === "local" ? "usd" : "local")}
                  className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded hover:bg-blue-200 dark:hover:bg-blue-700 transition"
                >
                  Switch to {inputMode === "local" ? "USD" : "AUD"} input
                </button>
              </div>
              <div className="space-y-1 text-xs text-blue-700 dark:text-blue-300">
                <p>Base Rate: 1 AUD = {baseAudToUsdRate.toFixed(4)} USD</p>
                <p className="text-purple-700 dark:text-purple-300">Fee: +{audFeePercentage.toFixed(2)}%</p>
                <p className="font-semibold text-blue-900 dark:text-blue-100">You'll get: 1 AUD = {audToUsdRate.toFixed(4)} USDC</p>
              </div>
              {amount && (
                <div className="mt-2 p-2 bg-white dark:bg-zinc-900/50 rounded border border-blue-100 dark:border-blue-800">
                  {inputMode === "local"
                    ? <p className="text-blue-900 dark:text-blue-200">💰 You'll receive: <span className="font-semibold">{getConvertedAmount(amount, "local")} USDC</span> for {amount} AUD</p>
                    : <p className="text-blue-900 dark:text-blue-200">💰 You'll pay: <span className="font-semibold">{getConvertedAmount(amount, "usd")} AUD</span> to get {amount} USDC</p>
                  }
                </div>
              )}
            </div>
          )}

          <input
            id="amount"
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            disabled={isAnyTransactionPending}
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder={`Enter amount in ${inputMode === "local" ? (countryCode === "+61" ? "AUD" : "local currency") : "USD"}`}
          />
        </div>

        {/* Receive Token Dropdown */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2" htmlFor="receive-token">
            Receive Token
          </label>
          <select
            id="receive-token"
            value={receiveToken}
            onChange={e => setReceiveToken(e.target.value)}
            disabled={isAnyTransactionPending || escrowStep !== 'idle'}
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="cUSD">cUSD</option>
            <option value="USDC">Mock USDC (Test)</option>
            <option value="USDT">USDT</option>
          </select>
        </div>

        {/* Main Button with Transaction Pending State */}
        <button
          onClick={handleCreateEscrow}
          disabled={
            !isPhoneVerified ||
            !phoneNumber.trim() ||
            !amount.trim() ||
            isAnyTransactionPending ||
            escrowStep !== 'idle'
          }
          className="w-full bg-primary text-white font-semibold py-3 rounded-lg shadow hover:bg-primary/90 disabled:bg-zinc-400 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
        >
          {escrowStep === 'approving' ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Step 1: Approving USDC...
            </>
          ) : escrowStep === 'depositing' ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Step 2: Creating Escrow...
            </>
          ) : isTransactionPendingEscrow ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {isPendingEscrow ? "Confirm in Wallet..." : "Processing..."}
            </>
          ) : (
            "Link Phone & Request Escrow"
          )}
        </button>

        {/* Transaction Hash Display */}
        {escrowHash && (
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm">
            <p className="text-blue-900 dark:text-blue-200 font-mono break-all">
              Tx: {escrowHash}
            </p>
          </div>
        )}
      </div>

      {/* Available Escrows Section */}
      <div className="mt-8 p-6 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700">
        <h3 className="text-lg font-semibold mb-4 text-green-900 dark:text-green-100">
          Available Escrows to Buy
        </h3>

        {/* Debug Info */}
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-xs font-mono">
          <div className="text-blue-900 dark:text-blue-200 flex justify-between items-start">
            <div>
              <p>DEBUG - Total Escrows: {totalEscrows ? Number(totalEscrows) : 'Loading...'}</p>
              <p>DEBUG - Available Count: {availableEscrows.length}</p>
              <p>DEBUG - Loading: {isLoadingAvailable ? 'yes' : 'no'}</p>
              <p className="text-xs mt-2">Check browser console (F12) for detailed logs with [DEBUG] prefix</p>
            </div>
            <button
              onClick={() => fetchAvailableEscrows()}
              disabled={isLoadingAvailable}
              className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-700 disabled:opacity-50 ml-2 whitespace-nowrap"
            >
              {isLoadingAvailable ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {isLoadingAvailable ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-green-500" />
            <span className="ml-2 text-green-700 dark:text-green-300">Loading available escrows...</span>
          </div>
        ) : availableEscrows.length === 0 ? (
          <p className="text-green-700 dark:text-green-300 text-center py-8">
            No escrows available for purchase at the moment.
          </p>
        ) : (
          <div className="space-y-3">
            {availableEscrows.map((escrow) => {
              // Handle both BigInt and string amount values from API
              const amountValue = typeof escrow.amount === 'string' 
                ? BigInt(escrow.amount)
                : escrow.amount;
              const amount = formatUnits(amountValue, 18);
              const paymentMethod = escrow.sellerPhoneNumber.split('|')[1]?.trim() || 'Unknown';
              const phoneNumber = escrow.sellerPhoneNumber.split('|')[0]?.trim() || 'Unknown';

              return (
                <div key={escrow.id} className="p-4 bg-white dark:bg-green-800/50 rounded-lg border border-green-200 dark:border-green-600">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium text-green-900 dark:text-green-100">
                        Escrow #{escrow.id}
                      </p>
                      <p className="text-sm text-green-700 dark:text-green-300">
                        Amount: ${amount}
                      </p>
                      <p className="text-sm text-green-700 dark:text-green-300">
                        Payment Method: {paymentMethod}
                      </p>
                      <p className="text-sm text-green-700 dark:text-green-300">
                        Seller Phone: {phoneNumber}
                      </p>
                    </div>
                    <span className="px-2 py-1 rounded-full text-xs font-medium text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-800">
                      Available
                    </span>
                  </div>

                  <button
                    onClick={() => handleBuyEscrow(escrow.id, escrow.seller)}
                    disabled={isPendingSignal}
                    className="w-full mt-3 bg-green-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-600 disabled:bg-zinc-400 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                  >
                    {isPendingSignal ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      `Buy ${amount} USDC`
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* My Activity Section */}
      <div className="mt-8 p-6 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700">
        <h3 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-zinc-100">
          My Activity
        </h3>

        {isLoadingEscrows ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
            <span className="ml-2 text-zinc-500">Loading escrows...</span>
          </div>
        ) : userEscrows.length === 0 ? (
          <p className="text-zinc-500 text-center py-8">
            No escrows found. Create your first escrow above.
          </p>
        ) : (
          <div className="space-y-3">
            {userEscrows.map((escrow) => {
              const statusText = escrow.status === 0 ? "Active" :
                               escrow.status === 1 ? "Payment Sent" :
                               escrow.status === 2 ? "Completed" :
                               escrow.status === 3 ? "Disputed" : "Cancelled";

              const statusColor = escrow.status === 0 ? "text-yellow-600 bg-yellow-100" :
                                escrow.status === 1 ? "text-blue-600 bg-blue-100" :
                                escrow.status === 2 ? "text-green-600 bg-green-100" :
                                escrow.status === 3 ? "text-red-600 bg-red-100" : "text-gray-600 bg-gray-100";

              const amount = formatUnits(escrow.amount, 18);
              const paymentMethod = escrow.sellerPhoneNumber.split('|')[1]?.trim() || 'Unknown';
              const isBuyer = escrow.buyer === userAccount;
              const isSeller = escrow.seller === userAccount;

              return (
                <div key={escrow.id} className="p-4 bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-600">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-zinc-100">
                        Escrow #{escrow.id}
                      </p>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Amount: ${amount}
                      </p>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Payment: {paymentMethod}
                      </p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor}`}>
                      {statusText}
                    </span>
                  </div>

                  {isBuyer && escrow.status === 0 && (
                    <button
                      onClick={() => handleSignalPayment(escrow.id)}
                      disabled={isPendingSignal}
                      className="w-full mt-3 bg-blue-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-600 disabled:bg-zinc-400 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                    >
                      {isPendingSignal ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Confirming...
                        </>
                      ) : (
                        "Confirm Payment Sent"
                      )}
                    </button>
                  )}

                  {isSeller && escrow.status === 1 && (
                    <button
                      onClick={() => handleReleaseFunds(escrow.id)}
                      disabled={isPendingSignal}
                      className="w-full mt-3 bg-green-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-600 disabled:bg-zinc-400 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                    >
                      {isPendingSignal ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Releasing Funds...
                        </>
                      ) : (
                        "Release Funds"
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* AUDDapt Compliance Footer */}
      <div className="mt-8 pt-6 border-t border-zinc-300 dark:border-zinc-700">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-zinc-600 dark:text-zinc-400">
          {/* Transaction ID Section */}
          <div className="p-3 bg-zinc-50 dark:bg-zinc-900/20 rounded-lg">
            <p className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Transaction ID</p>
            {transactionId ? (
              <p className="font-mono text-xs break-all">{transactionId}</p>
            ) : (
              <p className="text-zinc-500">No active transaction</p>
            )}
          </div>

          {/* KYC Status Section */}
          <div className="p-3 bg-zinc-50 dark:bg-zinc-900/20 rounded-lg">
            <p className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1">KYC Compliance Status</p>
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  kycStatus === 'verified'
                    ? 'bg-green-500'
                    : kycStatus === 'failed'
                    ? 'bg-red-500'
                    : 'bg-yellow-500'
                }`}
              />
              <span className="capitalize">
                {kycStatus === 'verified' ? 'Verified' : kycStatus === 'failed' ? 'Failed' : 'Pending Verification'}
              </span>
            </div>
          </div>
        </div>

        {/* Compliance Notice */}
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg text-xs">
          <p className="text-blue-900 dark:text-blue-200 mb-1">
            <span className="font-semibold">🔐 Compliance Notice:</span>
          </p>
          <p className="text-blue-800 dark:text-blue-300">
            AUDDapt is committed to supporting remittance sendersand receivers while maintaining regulatory compliance.
            All transactions are monitored for suspicious activity. KYC verification is required for transactions exceeding AUD 1,000.
          </p>
        </div>
      </div>
    </div>
  );
}

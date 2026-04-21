"use client";

import React from "react";
import { useAccount, useBalance } from "wagmi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const CUSD_ADDRESS = "0x765DE816845861e75A25fCA122bb6898B8B1282a";
const USDC_ADDRESS = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";
const USDT_ADDRESS = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e";

function BalanceDisplay({ address, token, symbol, refetchTrigger }: { address: `0x${string}`, token?: `0x${string}`, symbol: string, refetchTrigger?: number }) {
  const { data, isLoading, refetch } = useBalance({
    address,
    token,
    query: { refetchInterval: 10_000 },
  });

  React.useEffect(() => {
    if (refetchTrigger) refetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetchTrigger]);

  // Refetch immediately when the user returns to the tab (e.g. after paying via USSD/Paynow)
  React.useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refetch(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground">{symbol}</span>
      <span className="font-medium">
        {isLoading ? "Loading..." : `${parseFloat(data?.formatted || '0').toFixed(4)}`}
      </span>
    </div>
  );
}

export function UserBalance({ refetchTrigger }: { refetchTrigger?: number } = {}) {
  const { address, isConnected } = useAccount();

  if (!isConnected || !address) {
    return null;
  }

  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;

  return (
    <Card className="w-full max-w-md mx-auto mb-8">
      <CardHeader>
        <CardTitle className="text-lg font-medium">Welcome, {shortAddress}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 pt-2 border-t">
          <BalanceDisplay address={address} symbol="CELO" token={undefined} refetchTrigger={refetchTrigger} />
          <BalanceDisplay address={address} token={CUSD_ADDRESS as `0x${string}`} symbol="cUSD" refetchTrigger={refetchTrigger} />
          <BalanceDisplay address={address} token={USDC_ADDRESS} symbol="USDC" refetchTrigger={refetchTrigger} />
          <BalanceDisplay address={address} token={USDT_ADDRESS} symbol="USDT" refetchTrigger={refetchTrigger} />
        </div>
      </CardContent>
    </Card>
  );
}

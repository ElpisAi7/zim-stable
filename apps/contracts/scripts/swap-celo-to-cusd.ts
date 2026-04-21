/**
 * Swap CELO → cUSD using Mento Broker on Celo Mainnet
 * Run: npx hardhat run scripts/swap-celo-to-cusd.ts --network celo
 */
import hre from "hardhat";
import { createWalletClient, createPublicClient, http, parseEther, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";

// Mento Broker v2 on Celo Mainnet
const BROKER_ADDRESS = "0x777A8255cA72412f0d706dc03C9D1987306B4CaD" as const;
// CELO/cUSD exchange pool
const EXCHANGE_PROVIDER = "0x22d9db95E6Ae61c104A7B6F6C78D7993B94ec901" as const;
const EXCHANGE_ID = "0x3135b662c38265d0655177091f1b647b4fef511103d06c016efdf18b46930d2c" as const;

const CELO_TOKEN = "0x471EcE3750Da237f93B8E339c536989b8978a438" as const;
const CUSD_ADDRESS = "0x765DE816845861e75A25fCA122bb6898B8B1282a" as const;

const BROKER_ABI = [
  {
    name: "swapIn",
    type: "function" as const,
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "exchangeProvider", type: "address" },
      { name: "exchangeId", type: "bytes32" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    name: "getAmountOut",
    type: "function" as const,
    stateMutability: "view" as const,
    inputs: [
      { name: "exchangeProvider", type: "address" },
      { name: "exchangeId", type: "bytes32" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

const ERC20_ABI = [
  { name: "approve", type: "function" as const, stateMutability: "nonpayable" as const, inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { name: "balanceOf", type: "function" as const, stateMutability: "view" as const, inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

async function main() {
  const rawKey = process.env.PRIVATE_KEY || process.env.ADMIN_PRIVATE_KEY;
  if (!rawKey) throw new Error("PRIVATE_KEY not set");
  const privateKey = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`;
  const account = privateKeyToAccount(privateKey);

  const publicClient = createPublicClient({ chain: celo, transport: http("https://forno.celo.org") });
  const walletClient = createWalletClient({ account, chain: celo, transport: http("https://forno.celo.org") });

  const sellAmount = parseEther("2"); // swap 2 CELO

  let expectedOut: bigint;
  try {
    expectedOut = await publicClient.readContract({
      address: BROKER_ADDRESS,
      abi: BROKER_ABI,
      functionName: "getAmountOut",
      args: [EXCHANGE_PROVIDER, EXCHANGE_ID, CELO_TOKEN, CUSD_ADDRESS, sellAmount],
    });
    console.log(`Swapping 3 CELO → ~${formatUnits(expectedOut, 18)} cUSD`);
  } catch {
    console.log("getAmountOut failed, using conservative estimate");
    expectedOut = parseEther("0.5"); // very conservative min
  }

  const minBuyAmount = (expectedOut * 95n) / 100n;

  // Approve CELO token for broker
  console.log("Approving CELO...");
  const approveTx = await walletClient.writeContract({
    address: CELO_TOKEN,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [BROKER_ADDRESS, sellAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveTx });

  // Execute swap
  console.log("Swapping...");
  const swapTx = await walletClient.writeContract({
    address: BROKER_ADDRESS,
    abi: BROKER_ABI,
    functionName: "swapIn",
    args: [EXCHANGE_PROVIDER, EXCHANGE_ID, CELO_TOKEN, CUSD_ADDRESS, sellAmount, minBuyAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: swapTx });
  console.log("Swap tx:", swapTx);

  const newBalance = await publicClient.readContract({
    address: CUSD_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account.address],
  });
  console.log(`✅ Done! cUSD balance: ${formatUnits(newBalance, 18)}`);
}

main().catch(console.error);

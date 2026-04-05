import hre from "hardhat";

async function main() {
  console.log("Deploying MockUSDC test token to Celo Sepolia...");

  // Get the deployer signer
  const [deployer] = await hre.viem.getWalletClients();
  const publicClient = await hre.viem.getPublicClient();

  const deployerAddress = deployer.account?.address;
  console.log(`Deploying from: ${deployerAddress}`);

  // Get contract artifact
  const { artifacts } = hre;
  const artifact = artifacts.readArtifactSync("MockUSDC");

  // Deploy the contract (no constructor parameters)
  const txHash = await deployer.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode as `0x${string}`,
  });

  console.log(`Transaction hash: ${txHash}`);
  console.log("Waiting for deployment...");

  // Wait for the transaction
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  if (receipt.contractAddress) {
    console.log(`✓ MockUSDC deployed successfully!`);
    console.log(`Contract address: ${receipt.contractAddress}`);
    console.log(
      `Add this address to apps/web/src/lib/contracts.ts as TEST_USDC_ADDRESS`
    );
    console.log(
      `View on Celoscan: https://sepolia.celoscan.io/address/${receipt.contractAddress}`
    );
  } else {
    console.error("Deployment failed!");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

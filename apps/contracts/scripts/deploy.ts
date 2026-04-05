import hre from "hardhat";
import { artifacts } from "hardhat";
import { getAddress } from "viem";

async function main() {
  console.log("Deploying ZimEscrow contract to Celo Sepolia...");

  // Get the signer (account that will deploy)
  const [deployer] = await hre.viem.getWalletClients();

  // Get the public client for reading state
  const publicClient = await hre.viem.getPublicClient();

  // Get contract bytecode and ABI
  const artifact = artifacts.readArtifactSync("ZimEscrow");

  const deployerAddress = deployer.account?.address;
  console.log(`Deploying from account: ${deployerAddress}`);
  console.log(`Setting ${deployerAddress} as admin for dispute resolution`);

  // Encode the constructor arguments
  const abiCoder = require("ethers").AbiCoder.defaultAbiCoder();
  const constructorArgs = abiCoder.encode(["address"], [deployerAddress]);

  // Combine bytecode with encoded constructor arguments
  const fullBytecode = (artifact.bytecode as string) + constructorArgs.slice(2);

  // Deploy the contract
  const txHash = await deployer.deployContract({
    abi: artifact.abi,
    bytecode: fullBytecode as `0x${string}`,
  });

  console.log(`Transaction hash: ${txHash}`);
  console.log("Waiting for deployment confirmation...");

  // Wait for the transaction
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  if (receipt.contractAddress) {
    console.log(`✓ ZimEscrow deployed successfully!`);
    console.log(`Contract address: ${receipt.contractAddress}`);
    console.log(
      `View on Celoscan: https://sepolia.celoscan.io/address/${receipt.contractAddress}`
    );
  } else {
    console.error("Deployment failed: No contract address in receipt");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

// This updates supabase tables whenever a user claims from the daily faucet
import { ethers } from "ethers";
import "dotenv/config";
import { supabase } from "./client";
import { getLastProcessedBlock, saveLastProcessedBlock } from "./syncShared.ts";
import FaucetTokenArtifact from "../artifacts/contracts/FaucetToken.sol/FaucetToken.json" assert { type: "json" };

const RPC_URL = process.env.SEPOLIA_RPC_URL
const POLL_INTERVAL_MS = 15_000; // check every 15 seconds
const SYNC_ID = "faucet-claims-sync"; // a name for this listener's progress row

const provider = new ethers.JsonRpcProvider(RPC_URL);

const faucetToken = new ethers.Contract(
  process.env.FAUCET_TOKEN_ADDRESS || "",
  FaucetTokenArtifact.abi,
  provider
);

console.log(`Polling for TokensClaimed events on ${process.env.FAUCET_TOKEN_ADDRESS}...`);


async function checkForNewClaims() {
  const lastProcessed = await getLastProcessedBlock(supabase, provider, SYNC_ID);
  const currentBlock = await provider.getBlockNumber();

  if (currentBlock <= lastProcessed) {
    return; // no new blocks since last check
  }

  const fromBlock = lastProcessed + 1;
  const toBlock = currentBlock;

  const filter = faucetToken.filters.TokensClaimed();
  const events = await faucetToken.queryFilter(filter, fromBlock, toBlock);

  for (const event of events) {
    // event.args holds the same values your old (user, amount, timestamp) did
    const [user, amount, timestamp] = (event as ethers.EventLog).args;

    console.log(`New claim from ${user}: ${amount.toString()}`);

    await insertClaimWithRetry({
      wallet_address: user,
      amount: amount.toString(),
      tx_hash: event.transactionHash,
      claimed_at: new Date(Number(timestamp) * 1000).toISOString(),
    });
  }

  await saveLastProcessedBlock(supabase, SYNC_ID, toBlock);
}

async function insertClaimWithRetry(claimData: any, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const { error } = await supabase.from("claims").insert(claimData);
    if (!error) {
      console.log("Claim recorded successfully");
      return;
    }
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  console.error("All retry attempts failed for claim:", claimData);
}

// Run once immediately, then repeat every 15 seconds
checkForNewClaims().catch((err) => console.error("Poll error:", err));
setInterval(() => {
  checkForNewClaims().catch((err) => console.error("Poll error:", err));
}, POLL_INTERVAL_MS);
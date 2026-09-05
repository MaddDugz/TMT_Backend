import { ethers } from "ethers";
import "dotenv/config";
import { supabase } from "./client";
import { getLastProcessedBlock, saveLastProcessedBlock } from "./syncShared.ts";
import NFTartifacts from "../artifacts/contracts/nftToken.sol/NFTToken.json" assert { type: "json" };

const RPC_URL = process.env.SEPOLIA_RPC_URL
const NFTaddress = process.env.NFT_TOKEN_ADDRESS || "";
const POLL_INTERVAL_MS = 15_000;
const SYNC_ID = "nft-contract-sync";

const provider = new ethers.JsonRpcProvider(RPC_URL);
const NFT = new ethers.Contract(NFTaddress, NFTartifacts.abi, provider);

const GRADE_NAMES = ["Free", "Bronze", "Silver", "Gold"] as const;
function gradeToName(index: number): string {
  return GRADE_NAMES[Number(index)] ?? "Unknown";
}

type ParsedEvent = ethers.LogDescription & {
  transactionHash: string;
  blockNumber: number;
  index: number;
};

const WATCHED_EVENTS = ["NFTCreated", "NFTPriceUpdated", "NFTMinted", "Transfer"];

async function getLogsWithRetry(provider: ethers.JsonRpcProvider, params: any, maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await provider.getLogs(params);
    } catch (err: any) {
      const is429 = err?.error?.code === 429 || err?.info?.error?.code === -32003;
      if (is429 && attempt < maxRetries) {
        const wait = 500 * attempt;
        console.warn(`Rate limited, retrying in ${wait}ms (attempt ${attempt})`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
  throw new Error("getLogsWithRetry: exhausted retries");
}

// Single combined pass over all 4 event types (address-only filter, no topics),
// checkpointing progress after every chunk so a crash mid-scan doesn't wipe it out.
async function getAllLogsInChunks(
  provider: ethers.JsonRpcProvider,
  contract: ethers.Contract,
  fromBlock: number,
  toBlock: number,
  onChunkDone: (lastBlockDone: number) => Promise<void>,
  chunkSize = 1000,
  delayMs = 200
): Promise<ParsedEvent[]> {
  const allEvents: ParsedEvent[] = [];
  const address = await contract.getAddress();

  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = Math.min(start + chunkSize - 1, toBlock);

    const logs = await getLogsWithRetry(provider, { address, fromBlock: start, toBlock: end });

    for (const log of logs ?? []) {
      const parsed = contract.interface.parseLog(log);
      if (parsed && WATCHED_EVENTS.includes(parsed.name)) {
        allEvents.push({
          ...parsed,
          transactionHash: log.transactionHash,
          blockNumber: log.blockNumber,
          index: log.index,
        } as ParsedEvent);
      }
    }

    // Persist progress after each chunk — not just at the very end
    await onChunkDone(end);

    if (start + chunkSize <= toBlock) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return allEvents;
}

console.log(`Polling for NFT contract events on ${NFTaddress}`);

async function checkForNewEvents() {
  const lastProcessed = await getLastProcessedBlock(supabase, provider, SYNC_ID);
  const currentBlock = await provider.getBlockNumber();
  console.log(`Last processed block: ${lastProcessed}, current block: ${currentBlock}`);
  if (currentBlock <= lastProcessed) return;

  const fromBlock = lastProcessed + 1;
  const toBlock = currentBlock;

  const allLogs = await getAllLogsInChunks(
    provider,
    NFT,
    fromBlock,
    toBlock,
    async (lastBlockDone) => {
      await saveLastProcessedBlock(supabase, SYNC_ID, lastBlockDone);
    }
  );

  // Logs come back already ordered by block/logIndex within each chunk,
  // but re-sort defensively since we no longer merge 4 separately-fetched arrays.
  const tagged = allLogs
    .map((e) => ({ type: e.name as (typeof WATCHED_EVENTS)[number], event: e }))
    .sort((a, b) =>
      a.event.blockNumber !== b.event.blockNumber
        ? a.event.blockNumber - b.event.blockNumber
        : a.event.index - b.event.index
    );

  for (const { type, event } of tagged) {
    try {
      if (type === "NFTCreated") await handleNFTCreated(event);
      else if (type === "NFTPriceUpdated") await handleNFTPriceUpdated(event);
      else if (type === "NFTMinted") await handleNFTMinted(event);
      else if (type === "Transfer") await handleTransfer(event);
    } catch (err) {
      console.error(`Error handling ${type} event:`, err);
    }
  }
}

async function handleNFTCreated(event: ParsedEvent) {
  const [type_id, grade, quantity, metadataURI] = event.args;
  const gradeName = gradeToName(Number(grade));
  console.log(`New NFT created of price ${gradeName} and quantity ${quantity}`);

  await insertNFTWithRetry(
    {
      type_id: Number(type_id),
      nft_price: gradeName,
      quantity: Number(quantity),
      metadata_uri: metadataURI,
      created_at: new Date().toISOString(),
    },
    "nft_created"
  );
}

async function handleNFTPriceUpdated(event: ParsedEvent) {
  const [grade, price] = event.args;
  const gradeName = gradeToName(Number(grade));

  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await supabase
      .from("nft_prices")
      .upsert(
        { nft_price: gradeName, price: price.toString(), updated_at: new Date().toISOString() },
        { onConflict: "nft_price" }
      );

    if (!error) {
      console.log(`${gradeName} graded NFTs are now ${price} to mint`);
      return;
    }
    console.error(`Error updating ${gradeName} price:`, error.message);
    if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

async function handleNFTMinted(event: ParsedEvent) {
  const [user, type_id, remainingQuantity, mintedIds, amount] = event.args;
  console.log(`New mint from ${user}: ${amount} NFT(s), IDs: ${mintedIds}`);

  const rows = mintedIds.map((tokenId: bigint) => ({
    tx_hash: event.transactionHash,
    owner_address: user,
    token_id: Number(tokenId),
    type_id: Number(type_id),
    quantity_remaining: Number(remainingQuantity),
    minted_at: new Date().toISOString(),
  }));

  const { error: insertError } = await supabase.from("nft_mints").insert(rows);
  if (insertError) {
    console.error(`Error inserting mint rows for tx ${event.transactionHash}:`, insertError.message);
  }

  const { error } = await supabase
    .from("nft_created")
    .update({ quantity: Number(remainingQuantity) })
    .eq("type_id", Number(type_id));
  if (error) console.error(`Error updating quantity for type_id ${type_id}:`, error.message);
}

async function handleTransfer(event: ParsedEvent) {
  const [from, to, tokenId] = event.args;

  if (from === "0x0000000000000000000000000000000000000000") return; // mint, already handled above
  if (to === "0x0000000000000000000000000000000000000000") {
    console.log(`Token ${tokenId} was burned by ${from}`);
    return;
  }

  console.log(`Token ${tokenId} transferred from ${from} to ${to}`);
  await updateOwnerWithRetry(Number(tokenId), to, event.transactionHash);
}

async function updateOwnerWithRetry(tokenId: number, newOwner: string, txHash: string, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const { error } = await supabase.from("nft_mints").update({ owner_address: newOwner }).eq("token_id", tokenId);
    if (!error) {
      console.log(`Updated owner of token ${tokenId} to ${newOwner}`);
      return;
    }
    console.error(`Attempt ${attempt} failed updating owner for token ${tokenId} (tx ${txHash}):`, error.message);
    if (attempt < maxRetries) await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
  console.error(`All retry attempts failed updating owner for token ${tokenId} (tx ${txHash})`);
}

async function insertNFTWithRetry(claimData: any, table: string, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const { error } = await supabase.from(table).insert(claimData);
    if (!error) {
      console.log("Recorded successfully");
      return;
    }
    console.error(`Attempt ${attempt} failed:`, error.message);
    if (attempt < maxRetries) await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
  console.error("All retry attempts failed for inserting:", claimData);
}

checkForNewEvents().catch((err) => console.error("Poll error:", err));
setInterval(() => {
  checkForNewEvents().catch((err) => console.error("Poll error:", err));
}, POLL_INTERVAL_MS);
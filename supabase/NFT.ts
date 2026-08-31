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

console.log(`Polling for NFT contract events on ${NFTaddress}`);

async function checkForNewEvents() {
  const lastProcessed = await getLastProcessedBlock(supabase, provider, SYNC_ID);
  const currentBlock = await provider.getBlockNumber();
  if (currentBlock <= lastProcessed) return;

  const fromBlock = lastProcessed + 1;
  const toBlock = currentBlock;

  const [created, priceUpdated, minted, transfers] = await Promise.all([
    NFT.queryFilter(NFT.filters.NFTCreated(), fromBlock, toBlock),
    NFT.queryFilter(NFT.filters.NFTPriceUpdated(), fromBlock, toBlock),
    NFT.queryFilter(NFT.filters.NFTMinted(), fromBlock, toBlock),
    NFT.queryFilter(NFT.filters.Transfer(), fromBlock, toBlock),
  ]);

  // Merge all 4 lists and sort by when they happened, so e.g. a mint
  // is handled before a transfer that occurred right after it
  const tagged = [
    ...created.map((e) => ({ type: "NFTCreated" as const, event: e as ethers.EventLog })),
    ...priceUpdated.map((e) => ({ type: "NFTPriceUpdated" as const, event: e as ethers.EventLog })),
    ...minted.map((e) => ({ type: "NFTMinted" as const, event: e as ethers.EventLog })),
    ...transfers.map((e) => ({ type: "Transfer" as const, event: e as ethers.EventLog })),
  ].sort((a, b) =>
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

  await saveLastProcessedBlock(supabase, SYNC_ID, toBlock);
}

async function handleNFTCreated(event: ethers.EventLog) {
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

async function handleNFTPriceUpdated(event: ethers.EventLog) {
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

async function handleNFTMinted(event: ethers.EventLog) {
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

async function handleTransfer(event: ethers.EventLog) {
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
import { SupabaseClient } from "@supabase/supabase-js";
import { ethers } from "ethers";

export async function getLastProcessedBlock(
  supabase: SupabaseClient,
  provider: ethers.JsonRpcProvider,
  syncId: string
): Promise<number> {
  const { data } = await supabase
    .from("sync_state")
    .select("last_block")
    .eq("id", syncId)
    .single();

  if (data) return data.last_block;

  const currentBlock = await provider.getBlockNumber();
  await supabase.from("sync_state").insert({ id: syncId, last_block: currentBlock });
  return currentBlock;
}

export async function saveLastProcessedBlock(
  supabase: SupabaseClient,
  syncId: string,
  blockNumber: number
): Promise<void> {
  await supabase.from("sync_state").update({ last_block: blockNumber }).eq("id", syncId);
}
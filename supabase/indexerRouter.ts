// Test for faucet Token claim on indexer.ts
import { ethers } from "ethers";
import "dotenv/config";
import FaucetTokenArtifact from "../artifacts/contracts/FaucetToken.sol/FaucetToken.json" assert { type : "json" };
import {Router} from "express";
const router = Router();

const RPC_URL = process.env.SEPOLIA_RPC_URL


const provider = new ethers.JsonRpcProvider(RPC_URL);


const ownerWallet = new ethers.Wallet(
  process.env.SEPOLIA_PRIVATE_KEY,  // using owner private key #0
  provider
)


const faucetToken = new ethers.Contract(
  process.env.FAUCET_TOKEN_ADDRESS || "",
  FaucetTokenArtifact.abi,
  ownerWallet
);

router.post("/setCooldown-faucet", async (req, res) => { //set cooldown time for faucetToken claim, only owner can do this
  const { newCooldown } = req.body; //cooldown must be in seconds, e.g. 300 for 5 minutes
  try {
    const tx = await faucetToken.setClaimCooldown(BigInt(newCooldown));
    await tx.wait();
    res.json({ success: true, hash: tx.hash, newCooldown: newCooldown });
  } catch (err) {
    console.log(err);
    res.json({ success: false, error: err.message });
  }
})

router.post("/setDailyClaimAmount-faucet", async (req, res) => { //set daily claim amount for faucetToken
  const { newDailyClaimAmount } = req.body; 
  try{
    const tx = await faucetToken.setDailyClaimAmount(BigInt(newDailyClaimAmount));
    await tx.wait();
    res.json({ success: true, hash: tx.hash, newDailyClaimAmount: newDailyClaimAmount });
  }catch (err) {
    console.log(err);
    res.json({ success: false, error: err.message });
  }
})

export default router;
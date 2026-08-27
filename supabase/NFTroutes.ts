// test for NFT minting storage and creation
import "dotenv/config";
import {ethers} from 'ethers'
import {uploadImage} from "../metaData/metaData.js"
import { presets } from "../metaData/presets.js"
import NFTartifacts from "../artifacts/contracts/nftToken.sol/NFTToken.json" assert { type: "json" };
import {Router} from "express";
const router = Router();


const RPC_URL = process.env.SEPOLIA_RPC_URL
const NFTaddress = process.env.NFT_TOKEN_ADDRESS || "";
const provider = new ethers.JsonRpcProvider(RPC_URL);

// convert grade names index into grade names
const GRADE_NAMES = ["Free", "Bronze", "Silver", "Gold"] as const;
  function gradeToName(index: number | bigint): string {
    return GRADE_NAMES[Number(index)] ?? "Unknown";
  }


const ownerWallet = new ethers.Wallet(
 process.env.SEPOLIA_PRIVATE_KEY,  // using #0 account private key cause owner priviledges
provider
)


const NFT = new ethers.Contract(
    NFTaddress,
    NFTartifacts.abi,
    ownerWallet
)



router.post("/create-nft", async (req, res) => { //create a new NFT, only owner can do this
  const { presetName, nftPrice, quantity } = req.body;
  try {
    const preset = presets[presetName];
    if (!preset) {
      return res.status(400).json({ error: "Invalid preset name" });
    }
    const metaDataURI = await uploadImage(preset);
    const tx = await NFT.createNFT({ nftPrice: BigInt(nftPrice), quantity: BigInt(quantity), metadataURI: metaDataURI });
    await tx.wait();
    res.json({ success: true, hash: tx.hash });
  } catch (err: any) {
    res.status(500).json({ error: err.reason || err.message });
  }
});


router.post("/update-nft-price", async(req, res) => { //change the price of a grade, only owner can do this
  const { gradeIndex, newPrice } = req.body;
  try {
    const tx = await NFT.setGrade(gradeIndex, BigInt(newPrice));
    await tx.wait();
    const grade = gradeToName(gradeIndex);
    res.json({ success: true, hash: tx.hash, grade, newPrice: newPrice });
  } catch (err: any) {
    res.status(500).json({ error: err.reason || err.message });
  }
})

export default router;





//generate address after every localhost deploy
import { readFileSync } from "fs";
import path from "path";

const deployedAddresses = JSON.parse(
  readFileSync(
    path.resolve(process.cwd(), "ignition/deployments/chain-31337/deployed_addresses.json"),
    "utf-8"
  )
);

export const nftTokenAddress = deployedAddresses["NFTTokenModule#NFTToken"];
export const faucetTokenAddress = deployedAddresses["NFTTokenModule#FaucetToken"];
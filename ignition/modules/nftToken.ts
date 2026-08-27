import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("NFTTokenModule", (m) => {
  const faucetToken = m.contractAt("FaucetToken", "0x692FF2BA87Dd3F9B75eB4E2dd9523f835E76be19");
  const nftToken = m.contract("NFTToken", [faucetToken]);

  return { faucetToken, nftToken };
});
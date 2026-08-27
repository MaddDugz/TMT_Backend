import { network } from "hardhat";
import { expect } from "chai";

const {ethers, provider} = await network.create();
const GoldPrice = 150n * 10n ** 18n; // 500 tokens with 18 decimals
const SilverPrice = 50n * 10n ** 18n; // 150 tokens with 18 decimals
const BronzePrice = 25n * 10n ** 18n; // 70 tokens with 18 decimals

async function getTokenId(nftToken: any): Promise<bigint> {
   const newTypeId = (await nftToken.typeId()) - 1n;
   return newTypeId;
}
async function getNFTid(nftToken: any): Promise<bigint> {
   const newNFTId = (await nftToken.NFTId()) - 1n;
   return newNFTId;
}


async function setUp(){
    const [owner, user1, user2] = await ethers.getSigners();
    const faucetToken = await ethers.deployContract("FaucetToken");
    const faucetTokenAddress = await faucetToken.getAddress();

    const nftToken = await ethers.deployContract("NFTToken", [faucetTokenAddress]);

    // Owner creates the 3 templates
    await nftToken.connect(owner).createNFT({  nftPrice: 0n, quantity: 1000n, metadataURI : "ipfs://metaData-placeholder" });
    const bronzeTypeId = await getTokenId(nftToken);
    await nftToken.connect(owner).createNFT({  nftPrice: 1n, quantity: 300n, metadataURI : "ipfs://metaData-placeholder" });
    const silverTypeId = await getTokenId(nftToken);
    await nftToken.connect(owner).createNFT({  nftPrice: 2n, quantity: 50n, metadataURI : "ipfs://metaData-placeholder" });
    const goldTypeId = await getTokenId(nftToken);
    await nftToken.connect(owner).createNFT({  nftPrice: 1n, quantity: 1n, metadataURI : "ipfs://metaData-placeholder"});
    const soldOutTypeId = await getTokenId(nftToken);

    // Owner sets prices per grade
    await nftToken.connect(owner).setGrade(0n, BronzePrice);
    await nftToken.connect(owner).setGrade(1n, SilverPrice);
    await nftToken.connect(owner).setGrade(2n, GoldPrice);

    return { faucetToken, nftToken, owner, user1, user2, bronzeTypeId, silverTypeId, goldTypeId , soldOutTypeId };
}

describe("NFTToken", function () {
    it("Should allow users to mint NFTs if they have enough FaucetTokens", async () => {
        const { faucetToken, nftToken,  user1, bronzeTypeId, silverTypeId, goldTypeId } = await setUp();
        await faucetToken.connect(user1).claim(); // user1 claims 100 FaucetTokens
        const nftTokenAddress = await nftToken.getAddress();
        await faucetToken.connect(user1).approve(nftTokenAddress, BronzePrice); // grant permission

        await nftToken.connect(user1).mintNFT(bronzeTypeId, 1n); // user1 mints Bronze NFT
        const MintedNFTId = await getNFTid(nftToken); // get id of the minted NFT
        expect(await nftToken.ownerOf(MintedNFTId)).to.equal(user1.address, "User1 should own the minted Bronze NFT");
        expect(await faucetToken.balanceOf(user1.address)).to.equal(100n * 10n ** 18n - BronzePrice, "User1's FaucetToken balance should decrease by the price of the Bronze NFT");
    })

    it("Should revert if user tries to mint without enough FaucetTokens", async () => {
        //Minting without claiming FaucetTokens first should revert
        const { faucetToken, nftToken, user2,user1, bronzeTypeId, silverTypeId, goldTypeId } = await setUp();
        const nftTokenAddress = await nftToken.getAddress();
        await faucetToken.connect(user2).approve(nftTokenAddress, SilverPrice); // grant permission
        await expect(nftToken.connect(user2).mintNFT(silverTypeId, 1n)).to.be.revertedWithCustomError(faucetToken, "ERC20InsufficientBalance");

        //Minting an NFT above your balance should revert
        await faucetToken.connect(user1).claim(); // user1 claims 100 FaucetTokens
        await faucetToken.connect(user1).approve(nftTokenAddress, GoldPrice); // grant permission
        await expect(nftToken.connect(user1).mintNFT(goldTypeId, 1n)).to.be.revertedWithCustomError(faucetToken, "ERC20InsufficientBalance");

        //Minting more than one NFT at a time without enough balance should revert
        await faucetToken.connect(user1).approve(nftTokenAddress, SilverPrice*3n); // grant permission
        await expect(nftToken.connect(user1).mintNFT(silverTypeId, 3n)).to.be.revertedWithCustomError(faucetToken, "ERC20InsufficientBalance");

    })

    it("User can't mint if NFT is sold out", async () => {
        //Minting an NFT that is sold out should revert
        const { faucetToken, nftToken, user1, soldOutTypeId } = await setUp();
        await faucetToken.connect(user1).claim(); // user1 claims 100 FaucetTokens
        const nftTokenAddress = await nftToken.getAddress();

        await faucetToken.connect(user1).approve(nftTokenAddress, SilverPrice); // grant permission
        await nftToken.connect(user1).mintNFT(soldOutTypeId, 1n); // user1 mints the only available Sold Out NFT
        await expect(nftToken.connect(user1).mintNFT(soldOutTypeId, 1n)).to.be.revertedWith("NFT is sold out."); //can't mint again since it's sold out
    })

    it("Only owner can set NFT prices and and createNFT ", async () => {
        //Only owner can set NFT prices
        const { nftToken, owner, user1, bronzeTypeId } = await setUp();
        await expect(nftToken.connect(owner).setGrade(2, 200n * 10n ** 18n)).to.emit(nftToken, 'NFTPriceUpdated').withArgs(2, 200n * 10n ** 18n);
        await expect(nftToken.connect(user1).setGrade(2, 300n * 10n ** 18n)).to.be.revertedWithCustomError( nftToken, "OwnableUnauthorizedAccount");

        //Only owner can createNFT
        await expect(nftToken.connect(owner).createNFT({  nftPrice: 0n, quantity: 10n, metadataURI: "ipfs://metaData-placeholder" })).to.emit(nftToken, 'NFTCreated');
        await expect(nftToken.connect(user1).createNFT({  nftPrice: 0n, quantity: 10n, metadataURI: "ipfs://metaData-placeholder" })).to.be.revertedWithCustomError( nftToken, "OwnableUnauthorizedAccount");
    })
})


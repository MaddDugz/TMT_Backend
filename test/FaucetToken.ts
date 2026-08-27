import { expect } from "chai";
import { network } from "hardhat";

const {ethers, provider} = await network.create()
const dailyClaimAmount = 100n * 10n ** 18n; // 100 tokens with 18 decimals
const claimCooldown = 60 * 60 * 24; // 24 hours in seconds

describe("FaucetToken", function () {
    it("Should mint tokens only on first claim ", async () => {
        const token = await ethers.deployContract("FaucetToken")
        const [owner, user2] = await ethers.getSigners()
    
        await token.connect(owner).claim()
        expect(await token.balanceOf(owner.address)).to.equal(dailyClaimAmount, "Owner should have dailyClaimAmount tokens after first claim")
        await expect(token.connect(owner).claim()).to.be.revertedWith("Claim cooldown has not passed yet.")
    })

    it("Only Owner can call setClaimAmount and setClaimInterval and it should be emitted", async () => {
        const token = await ethers.deployContract("FaucetToken")
        const [owner, user2] = await ethers.getSigners()

        await expect(token.connect(owner).setDailyClaimAmount(dailyClaimAmount * 2n)).to.emit(token, 'DailyClaimAmountUpdated').withArgs(dailyClaimAmount * 2n)
        await expect(token.connect(owner).setClaimCooldown(claimCooldown * 2)).to.emit(token, 'ClaimCooldownUpdated').withArgs(claimCooldown * 2)

        await expect(token.connect(user2).setDailyClaimAmount(dailyClaimAmount * 2n)).to.be.revert(ethers)
        await expect(token.connect(user2).setClaimCooldown(claimCooldown * 2)).to.be.revert(ethers)
    })

    it("Claim after cooldown period should work", async () => {
        const token = await ethers.deployContract("FaucetToken")
        const [owner, user2] = await ethers.getSigners()

        await token.connect(owner).claim() //first claim

        await provider.send("evm_increaseTime", [claimCooldown + 1]) // Increase time by claimCooldown and 1 second
        await provider.send("evm_mine") // Mine a new block to reflect the time change

        await token.connect(owner).claim() //second claim after cooldown
        expect(await token.balanceOf(owner.address)).to.equal(dailyClaimAmount * 2n, "Owner should have dailyClaimAmount * 2 tokens after second claim")
    })

    it("setDailyClaimAmount should actually change the amount minted", async () => {
        const token = await ethers.deployContract("FaucetToken")
        const [owner, user2] = await ethers.getSigners()

        await token.connect(owner).setDailyClaimAmount(dailyClaimAmount * 3n) // Change daily claim amount to 300 tokens
        await token.connect(owner).claim() //first claim with new amount
        expect(await token.balanceOf(owner.address)).to.equal(dailyClaimAmount * 3n, "Owner should have dailyClaimAmount * 3 tokens after claim with new amount")
    })

     it("setClaimCooldown should actually change the cooldown period", async () => {
        const token = await ethers.deployContract("FaucetToken")
        const [owner, user2] = await ethers.getSigners()

        await token.connect(owner).setClaimCooldown(claimCooldown * 2) // Change claim cooldown to 48 hours
        await token.connect(owner).claim() //first claim
        await provider.send("evm_increaseTime", [claimCooldown + 1]) // Increase time by original claimCooldown and 1 second
        await provider.send("evm_mine") // Mine a new block to reflect the time change

        await expect(token.connect(owner).claim()).to.be.revert(ethers)

        expect(await token.balanceOf(owner.address)).to.equal(dailyClaimAmount, "Owner should have only dailyClaimAmount tokens after second claim with new cooldown")
        await provider.send("evm_increaseTime", [claimCooldown + 1]) // Increase time by original claimCooldown and 1 second
        await provider.send("evm_mine") // Mine a new block to reflect the time change

        await token.connect(owner).claim() //second claim after new cooldown
        expect(await token.balanceOf(owner.address)).to.equal(dailyClaimAmount * 2n, "Owner should have dailyClaimAmount * 2 tokens after second claim with new cooldown")

    })
    it("Different users should have independent claim cooldowns", async () => {
        const token = await ethers.deployContract("FaucetToken")
        const [owner, user2] = await ethers.getSigners()

        await token.connect(owner).claim() //first claim by owner
        await token.connect(user2).claim() //first claim by user2

        expect(await token.balanceOf(owner.address)).to.equal(dailyClaimAmount, "Owner should have dailyClaimAmount tokens after first claim")
        expect(await token.balanceOf(user2.address)).to.equal(dailyClaimAmount, "User2 should have dailyClaimAmount tokens after first claim")

        await expect(token.connect(owner).claim()).to.be.revertedWith("Claim cooldown has not passed yet.")
        await expect(token.connect(user2).claim()).to.be.revertedWith("Claim cooldown has not passed yet.")

        await provider.send("evm_increaseTime", [claimCooldown + 1]) // Increase time by claimCooldown and 1 second
        await provider.send("evm_mine") // Mine a new block to reflect the time change

        await token.connect(owner).claim() //second claim by owner after cooldown
        await token.connect(user2).claim() //second claim by user2 after cooldown

        expect(await token.balanceOf(owner.address)).to.equal(dailyClaimAmount * 2n, "Owner should have dailyClaimAmount * 2 tokens after second claim")
        expect(await token.balanceOf(user2.address)).to.equal(dailyClaimAmount * 2n, "User2 should have dailyClaimAmount * 2 tokens after second claim")
    })

})




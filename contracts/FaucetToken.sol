// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable} from  "@openzeppelin/contracts/access/Ownable.sol";


contract FaucetToken is ERC20, ERC20Burnable, Ownable {
    constructor() ERC20("TurtleToken", "TMT") ERC20Burnable() Ownable(msg.sender) {} //run when contract is deployed 

    uint public dailyClaimAmount = 100 * 10 ** 18; // 100 tokens with 18 decimals
    uint public claimCooldown = 1 days; // 24 hours in seconds

    mapping(address => uint) public claimedTimestamps; // Track the last claim timestamp for each address
    event DailyClaimAmountUpdated(uint newAmount); // Event emitted when daily claim amount is updated
    event ClaimCooldownUpdated(uint newCooldown); // Event emitted when claim cooldown is updated
    event TokensClaimed(address indexed user, uint amount, uint timestamp); // Event emitted when tokens are claimed

    function setDailyClaimAmount(uint _amount) public onlyOwner {
        dailyClaimAmount = _amount;
        emit DailyClaimAmountUpdated(_amount);
    }
    function setClaimCooldown(uint _cooldown) public onlyOwner {
        claimCooldown = _cooldown;
        emit ClaimCooldownUpdated(_cooldown);
    }
    
    function getClaimClaimedTimestamp(address _user) public view returns (uint) {
        return claimedTimestamps[_user];
    }

    function claim() public {
        require(claimedTimestamps[msg.sender] + claimCooldown <= block.timestamp, "Claim cooldown has not passed yet.");
        _mint(msg.sender, dailyClaimAmount);
        claimedTimestamps[msg.sender] = block.timestamp; // Update the last claim timestamp
        emit TokensClaimed(msg.sender, dailyClaimAmount, block.timestamp); // Emit an event for the claim
    } 
}
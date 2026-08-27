// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./FaucetToken.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract NFTToken is Ownable, ERC721, ReentrancyGuard {

    FaucetToken public faucetToken;

    constructor(address _faucetToken) ERC721("TurtleNFT", "TMTNFT") Ownable(msg.sender) { // Initialize the ERC721 contract with a name and symbol
        faucetToken = FaucetToken(_faucetToken);

        typePrice[NFTPrice.Free] = 0; //update free price
        emit NFTPriceUpdated(NFTPrice.Free, 0);
        
        typePrice[NFTPrice.Bronze] = 20 * 10**18; //update bronze price   
        emit NFTPriceUpdated(NFTPrice.Bronze, 20 * 10**18);

        typePrice[NFTPrice.Silver] = 50 * 10**18; //update silver price
        emit NFTPriceUpdated(NFTPrice.Silver,  50 * 10**18);


        typePrice[NFTPrice.Gold] = 100 * 10**18; //update gold price
        emit NFTPriceUpdated(NFTPrice.Gold, 100 * 10**18);
      

    }
    enum NFTPrice { Free, Bronze, Silver, Gold } // Define an enum for different NFT types

    uint public typeId = 0; // Counter for NFTtypes created
    uint public NFTId = 0; // Counter for individual NFT IDs from the types created

    struct NFT { // Define a struct to represent an NFT
        NFTPrice nftPrice;
        uint256 quantity; // Quantity of the NFT
        string metadataURI; // URI for the NFT metadata(picture, description, name etc.)
    }

    mapping(NFTPrice => uint256) public typePrice;
    mapping(uint256 => NFT) public nfts;
    mapping(uint256 => uint256) public nftIdtoType; // Mapping from NFT ID to NFTtype ID

    event NFTCreated(uint256 typeId, NFTPrice nftPrice, uint256 quantity, string metadataURI); // Event emitted when a new NFT is created
    event NFTMinted(address indexed user, uint256 typeId, uint256 quantity, uint256[] mintedIds, uint256 amount); // Event emitted when an NFT is minted
    event NFTPriceUpdated(NFTPrice indexed nftPrice, uint256 newPrice); // Event emitted when the price of an NFTtype is updated

    function setGrade(NFTPrice _nftPrice, uint256 _price) external onlyOwner {
        typePrice[_nftPrice] = _price;  
        emit NFTPriceUpdated(_nftPrice, _price); // Emit an event for the updated price
    }

    function createNFT(NFT memory _nft) external onlyOwner{
        emit NFTCreated(typeId,  _nft.nftPrice, _nft.quantity, _nft.metadataURI );
        nfts[typeId] = _nft;
        typeId++; // Increment the NFTtype ID counter
    }

    function getPrice(uint256 _typeId) external view returns (uint256) {
    return typePrice[nfts[_typeId].nftPrice];
}

    function mintNFT(uint _typeId, uint256 _amount) external nonReentrant{
        NFT memory _nft =  nfts[_typeId];
        require(_amount > 0, "Amount must be greater than 0.");
        require(_nft.quantity >= _amount, "NFT is sold out.");
        uint price = typePrice[_nft.nftPrice] * _amount;
        nfts[_typeId].quantity -= _amount; // Decrease the quantity of the NFTtype

        uint256[] memory mintedIds = new uint256[](_amount); //reate an array to store the minted NFT IDs
        for(uint i = 0; i < _amount; i++) {
            uint _nftId = NFTId; // Assign the current NFT ID to a local variable
            NFTId++; // Increment the NFT ID counter for the next minting

            nftIdtoType[_nftId] = _typeId; // Map the NFT ID to its corresponding NFTtype ID
            _safeMint(msg.sender, _nftId); // Mint the NFT to the user's address
              mintedIds[i] = _nftId;
        }
    
        faucetToken.burnFrom(msg.sender, price); // Burn the required amount of FaucetTokens from the user's balance

        emit NFTMinted(msg.sender,  _typeId, nfts[_typeId].quantity, mintedIds,  _amount); // Emit an event for the minted NFT
    }
} 
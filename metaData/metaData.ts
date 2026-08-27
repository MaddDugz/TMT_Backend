import "dotenv/config";
import { PinataSDK } from "pinata";
import sharp from "sharp";
import fs from "fs";

const PINATA_JWT = process.env.PINATA_JWT!;
const PINATA_GATEWAY = process.env.PINATA_GATEWAY!;

const pinata = new PinataSDK({
    pinataJwt : PINATA_JWT,
    pinataGateway : PINATA_GATEWAY
})

//upload images to pinata and get back ipfs
export const uploadImage = async (_presets: any, maxRetries = 3) => {

    // Resize/crop the image to match your card's aspect ratio before uploading
    const resizedBuffer = await sharp(fs.readFileSync(_presets.image))
        .resize(554, 832) // match your target box ratio
        .jpeg({ quality: 90 })
        .toBuffer();

    const blob = new Blob([resizedBuffer]);
    const file = new File([blob], _presets.name, {type : "image/jpeg"} )

    for(let attempt = 1; attempt<= maxRetries; attempt++){
        try{        
        const imageUpload = await pinata.upload.public.file(file); // Upload the image to Pinata's public gateway
        const imageCID = imageUpload.cid;   // Get the CID of the uploaded image
        const ipfs = `ipfs://${imageCID}`
        // console.log(ipfs)

            if(ipfs){ //set image to image ipfs
                _presets.image = ipfs;
               const metaDataURI =  await getMetaData(_presets)
                return metaDataURI
            }    
        return 
        }catch(err: any){
            console.error(err.message)
            if(attempt < maxRetries){
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt)); // wait a bit before retrying
            }
        }
    }
}


// now use the ipfs of the uploaded image to get the metaData URI
 const getMetaData = async( body: any, maxRetries = 3) =>{
    for(let attempt = 1; attempt<= maxRetries; attempt++){
        try{   
            const upload = await pinata.upload.public.json(body)
            const CID = upload.cid
            const metaDataURI = `ipfs://${CID}`
            return metaDataURI 

        }catch(err: any){
             console.error(err.message)
            if(attempt < maxRetries){
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt)); // wait a bit before retrying
            }
        }
    }
}



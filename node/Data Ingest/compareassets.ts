import { AssetStatus, DataEndpoint, EyePop, PredictedKeyPoint, PredictedKeyPoints, PredictedObject, Prediction } from '@eyepop.ai/eyepop';
import 'dotenv/config';

const asset_good = "0684d9dd5b4376208000985e9c67df7b"
const asset_bad = "0684da0230ba7413800087b477d95532"



async function createEyepopClient() {
    const client = await EyePop.dataEndpoint({
        auth: {
            secretKey: process.env.EYEPOP_API_KEY || 'YOUR_API_KEY',
        }
    }).connect();
    console.log('Connected to EyePop Data Endpoint');
    return client;
}

// get each asset and print them
async function getAsset(client: DataEndpoint, assetId: string) {
    const asset = await client.getAsset(assetId);
    console.log(`Asset ID: ${assetId}`);
    console.dir(asset, { depth: null });
}

const client = await createEyepopClient();
const assetA = await client.getAsset(asset_good,undefined,undefined,true);
console.log('Asset Good:', assetA.annotations[0].annotation);
const assetB = await client.getAsset(asset_bad,undefined,undefined,true);
console.log('Asset BAD:', assetB.annotations[0].annotation);
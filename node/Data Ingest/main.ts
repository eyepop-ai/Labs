import { AssetStatus, EyePop, PredictedKeyPoint, PredictedKeyPoints, PredictedObject, Prediction } from '@eyepop.ai/eyepop';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

import { fileURLToPath } from 'url';
import { dirname } from 'path';
import imageSize from 'image-size';

const getImageDimensions = (buffer: Buffer): { width: number; height: number } => {
    const dimensions = imageSize(buffer);
    if (!dimensions.width || !dimensions.height) throw new Error('Could not determine image size');
    return { width: dimensions.width, height: dimensions.height };
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ✅ Get command-line arguments
const [, , accountUUID, datasetUUID] = process.argv;

if (!accountUUID || !datasetUUID) {
    console.error('Usage: ts-node main.ts <accountUUID> <datasetUUID>');
    process.exit(1);
}

// ✅ Define an image file to upload
const filePath = path.resolve(__dirname, './input/sample.jpeg'); // 📌 Replace or parameterize this
const file = fs.readFileSync(filePath);
const fileName = path.basename(filePath);

// Read the file as a Buffer
const buffer = fs.readFileSync(filePath);

const { width, height } = getImageDimensions(buffer);

// Convert the Buffer to a Blob
const blob = new Blob([buffer], { type: 'image/jpeg' });

// ⛔ Need clarification on how to fetch datasetVersion – SDK docs assume it's already known
const datasetVersion = undefined; // undefined or a specific version string
async function run() {
    let client;
    try {
        let client = await EyePop.dataEndpoint({
            auth: {
                secretKey: process.env.EYEPOP_API_KEY || 'YOUR_API_KEY',
            }
        }).connect();

        // ✅ Upload asset
        const uploadResult = await client.uploadAsset(datasetUUID, datasetVersion, blob, fileName);
        console.log('Asset uploaded. UUID:', uploadResult.uuid);

        //wait for the upload to complete
        while (true) {
            const asset = await client.getAsset(uploadResult.uuid, datasetUUID, datasetVersion);
            if (asset.status === AssetStatus.accepted) {
                console.log('Asset upload completed:', asset);
                break;
            }
            console.log('Asset upload in progress:', asset);
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds before checking again
        }
        console.log('Asset upload completed:', uploadResult);

        // ✅ Store ground truth label
        const points: PredictedKeyPoint[] = [{
            x: 0.5,
            y: 0.5,
            z: undefined,
            id: 0,
            confidence: 1,
            visible: true,
            classLabel: 'example',
            category: 'example'
        }];

        const keypoints: PredictedKeyPoints[] = [{
            category: "example_keypoint",
            type: "custom-keypoints",
            points: points,
        }];

        const objects: PredictedObject[] = [{
            id: 1,
            confidence: 1,
            classLabel: 'example',
            category: 'example',
            traceId: undefined,
            x: 100,
            y: 100,
            width: 200,
            height: 200,
            orientation: 0,
            outline: undefined,
            contours: undefined,
            mask: undefined,
            objects: undefined,
            classes: undefined,
            texts: undefined,
            meshs: undefined,
            keyPoints: keypoints,
        }];

        const objectLabel: Prediction = {
            source_width: width,
            source_height: height,
            objects: objects,
        };

        await client.updateAssetGroundTruth(uploadResult.uuid, datasetUUID, datasetVersion, objectLabel);
        console.log('Ground truth added for asset:', uploadResult.uuid);

        // Pull the asset to verify
        const asset = await client.getAsset(uploadResult.uuid, datasetUUID, datasetVersion, true);
        console.log('Asset pulled:', asset);
        console.log('Asset UUID:', asset.uuid);
        console.dir(asset.annotations, { depth: null });

        client.disconnect();
        console.log('Client disconnected');
        process.exit(0);
    } catch (err) {
        if (err instanceof Error) {
            console.error('Error during ingestion:', err.message);
            console.error(err.stack);
        } else {
            console.error('Unknown error during ingestion:', JSON.stringify(err, null, 2));
        }
    }
}

run();
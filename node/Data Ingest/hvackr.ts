import { AssetStatus, EyePop, PredictedKeyPoint, PredictedKeyPoints, PredictedObject, Prediction } from '@eyepop.ai/eyepop';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

import { fileURLToPath } from 'url';
import { dirname } from 'path';
import imageSize from 'image-size';
import axios from 'axios';
import sharp from 'sharp';



const getImageDimensions = (buffer: Buffer): { width: number; height: number } => {
    const dimensions = imageSize(buffer);
    if (!dimensions.width || !dimensions.height) throw new Error('Could not determine image size');
    return { width: dimensions.width, height: dimensions.height };
};

function getDatasetVersion(): string | undefined {
    // ⛔ Need clarification on how to fetch datasetVersion – SDK docs assume it's already known
    return undefined; // undefined or a specific version string
}

async function createEyepopClient() {
    const client = await EyePop.dataEndpoint({
        auth: {
            secretKey: process.env.EYEPOP_API_KEY || 'YOUR_API_KEY',
        }
    }).connect();
    return client;
}

async function uploadAndWaitForAsset(client: any, datasetUUID: string, datasetVersion: string | undefined, blob: Blob, fileName: string) {
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
    return uploadResult;
}

function buildGroundTruth(width: number, height: number): Prediction {
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
    return objectLabel;
}

async function printAssetDetails(client: any, assetUUID: string, datasetUUID: string, datasetVersion: string | undefined) {
    const asset = await client.getAsset(assetUUID, datasetUUID, datasetVersion, true);
    console.log('Asset pulled:', asset);
    console.log('Asset UUID:', asset.uuid);
    console.dir(asset.annotations, { depth: null });
}

function fetchAssetData(basePath: string, filePath: string) {
    // read ./input/exampleHVAKRTrainingData.json into a variable
    const trainingDataPath = path.resolve(basePath, filePath);
    const trainingData = JSON.parse(fs.readFileSync(trainingDataPath, 'utf-8'));
    console.log('Training data loaded:', trainingData);

    return trainingData;
}

function prepareAsset(outputPath: string): { blob: Blob; fileName: string; width: number; height: number } {
    const file = fs.readFileSync(outputPath);
    const fileName = path.basename(outputPath);

    // Read the file as a Buffer
    const buffer = fs.readFileSync(outputPath);

    const { width, height } = getImageDimensions(buffer);

    // Convert the Buffer to a Blob
    const blob = new Blob([buffer], { type: 'image/jpeg' });

    return { blob, fileName, width, height };
}

function createGroundTruthFromPolygons(entry: any, image: any, width: number, height: number): Prediction {
    if (!entry.polygons || entry.polygons.length === 0) {
        console.warn('No polygons found for entry:', entry);
        return {
            source_width: width,
            source_height: height,
            objects: [],
        };
    }

    const objects: PredictedObject[] = [];

    const cropBoxX = image.cropBox?.x1 ?? 0;
    const cropBoxY = image.cropBox?.y1 ?? 0;

    console.log(`Processing polygons for entry: ${entry.id}`);
    for (const polygon of entry.polygons) {
        const normalizedPoints: PredictedKeyPoint[] = polygon.map((point: { x: any; y: any }) => ({
            x: point.x - image.position.x - cropBoxX,
            y: point.y - image.position.y - cropBoxY,
            z: undefined,
            id: 0,
            confidence: 1,
            visible: true,
            classLabel: 'room',
            category: 'room'
        }));

        const minX = Math.min(...normalizedPoints.map(p => p.x));
        const minY = Math.min(...normalizedPoints.map(p => p.y));
        const maxX = Math.max(...normalizedPoints.map(p => p.x));
        const maxY = Math.max(...normalizedPoints.map(p => p.y));
        const polygonWidth = maxX - minX;
        const polygonHeight = maxY - minY;

        const keypoints: PredictedKeyPoints[] = [{
            category: "example_keypoint",
            type: "custom-keypoints",
            points: normalizedPoints,
        }];

        objects.push({
            id: 1,
            confidence: 1,
            classLabel: 'room',
            category: 'room',
            traceId: undefined,
            x: minX,
            y: minY,
            width: polygonWidth,
            height: polygonHeight,
            orientation: 0,
            outline: undefined,
            contours: undefined,
            mask: undefined,
            objects: undefined,
            classes: undefined,
            texts: undefined,
            meshs: undefined,
            keyPoints: keypoints,
        });
    }

    return {
        source_width: width,
        source_height: height,
        objects: objects,
    };
}

async function run() {
    try {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);

        // ✅ Get command-line arguments
        const [, , accountUUID, datasetUUID] = process.argv;

        if (!accountUUID || !datasetUUID) {
            console.error('Usage: ts-node main.ts <accountUUID> <datasetUUID>');
            process.exit(1);
        }

        console.log('Starting ingestion process...');
        const client = await createEyepopClient();
        const datasetVersion = undefined; // getDatasetVersion();

        const trainingData = fetchAssetData(__dirname, './input/exampleHVAKRTrainingData.json');
        console.log('Training data:', trainingData);

        // For each trainingData.data.images.src, download the image, and prep the asset
        for (const entry of trainingData.data) {
            for (const image of entry.images) {
                if (!image.src) {
                    console.warn('Image source is missing:', image);
                    continue;
                }

                const imageUrl = image.src;
                const imageFileName = path.basename(imageUrl);
                const outputPath = path.resolve(__dirname, './input', imageFileName);

                console.log(`Downloading image from ${imageUrl}...`);
                const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                fs.writeFileSync(outputPath, response.data);
                console.log(`Image saved to ${outputPath}`);

                let { blob, fileName, width, height } = prepareAsset(outputPath);
                console.log(`Preparing asset: ${fileName} (${width}x${height})`);

                //crop the image to the cropbox
                if (image.cropBox) {
                    const cropbox = image.cropBox;

                    console.log('Crop box found:', cropbox);

                    const cropX = Math.floor(Math.min(cropbox.x1, cropbox.x2));
                    const cropY = Math.floor(Math.min(cropbox.y1, cropbox.y2));
                    const cropboxWidth = Math.floor(Math.abs(cropbox.x2 - cropbox.x1));
                    const cropboxHeight = Math.floor(Math.abs(cropbox.y2 - cropbox.y1));

                    console.log(`Cropping image to (${cropX}, ${cropY}, ${cropboxWidth}, ${cropboxHeight})...`);

                    const croppedOutputPath = path.resolve(__dirname, './input', path.basename(outputPath, path.extname(outputPath)) + '_crop.jpg');
                    await sharp(outputPath)
                        .extract({ left: cropX, top: cropY, width: cropboxWidth, height: cropboxHeight })
                        .toFile(croppedOutputPath);
                    console.log(`Image cropped and saved to ${croppedOutputPath}`);

                    const croppedBuffer = fs.readFileSync(croppedOutputPath);
                    const croppedDimensions = getImageDimensions(croppedBuffer);
                    blob = new Blob([croppedBuffer], { type: 'image/jpeg' });
                    fileName = path.basename(croppedOutputPath);
                    width = croppedDimensions.width;
                    height = croppedDimensions.height;

                } else {
                    console.log('No crop box found, using original image');
                }

                const uploadResult = await uploadAndWaitForAsset(client, datasetUUID, datasetVersion, blob, fileName);

                const groundTruth = createGroundTruthFromPolygons(entry, image, width, height);
                await client.updateAssetGroundTruth(uploadResult.uuid, datasetUUID, datasetVersion, groundTruth);
                console.log('Ground truth added for asset:', uploadResult.uuid);
                await printAssetDetails(client, uploadResult.uuid, datasetUUID, datasetVersion);
            }
        }



        await client.disconnect();
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
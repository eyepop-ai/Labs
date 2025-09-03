import { AssetStatus, EyePop, PredictedKeyPoint, PredictedKeyPoints, PredictedObject, Prediction, PopComponentType, ForwardOperatorType, Asset, Annotation, UserReview, DataEndpoint } from '@eyepop.ai/eyepop';
import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';
import { createCanvas, loadImage } from 'canvas';
import { get } from 'http';
import { Transform } from 'stream';
import { exit } from 'process';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const classLabelToSplit = 'cash';
const newLabelsArray = ["$1", "$5", "$10", "$20", "$50", "$100", "unknown"];
const promptTemplate = "What denomination is the top most currency bill in this image? (" + newLabelsArray.join(", ") + "). If you cannot tell, say 'unknown'.";

// Command line arguments
const [, , accountUUID, datasetUUID] = process.argv;
if (!accountUUID || !datasetUUID) {
    console.error('Usage: ts-node main.ts <accountUUID> <datasetUUID>');
    process.exit(1);
}

//Functions
async function createEyepopDataClient() {
    const client = await EyePop.dataEndpoint({
        accountId: accountUUID,
        auth: {
            secretKey: process.env.EYEPOP_API_KEY || 'YOUR_API_KEY',
        }
    }).connect();
    return client;
}

async function createEyepopClient() {
    const client = await EyePop.workerEndpoint({
        auth: {
            secretKey: process.env.EYEPOP_API_KEY || 'YOUR_API_KEY',
        }
    }).connect();


    const pop_definition = {
        components: [
            {
                type: PopComponentType.INFERENCE,
                ability: 'eyepop.image-contents:latest',
                params: {
                    prompts: [{
                        //prompt: "Describe the contents of this image in a concise manner.",
                        prompt: promptTemplate,
                    }]
                }
            }
        ]
    };

    await client.changePop(
        pop_definition
    );

    return client;
}

async function downloadAssetToFile(client: DataEndpoint, asset: any, cacheDir: string, datasetUUID?: string, datasetVersion?: number): Promise<string | null> {
    const imagePath = path.join(cacheDir, 'images', `${asset.uuid}.jpg`);

    if (fs.existsSync(imagePath)) {
        console.log('Asset already downloaded:', imagePath);
        return imagePath;
    }

    const image = await client.downloadAsset(asset.uuid, datasetUUID, datasetVersion);
    //console.log('Downloaded asset:', image);

    // Ensure target directory exists (recursively)
    const imagesDir = path.dirname(imagePath);
    if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
    }

    // Some environments return a Blob; others may return a Buffer/Uint8Array/stream-like.
    // Handle Blob first via streaming for memory efficiency; fall back to Buffer conversion.
    if (typeof (image as any)?.stream === 'function') {
        // Blob case: stream to disk
        await pipeline((image as any).stream(), fs.createWriteStream(imagePath));
    } else if (typeof (image as any)?.arrayBuffer === 'function') {
        const arrayBuffer = await (image as any).arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        fs.writeFileSync(imagePath, buffer);
    } else if (Buffer.isBuffer(image) || image instanceof Uint8Array) {
        fs.writeFileSync(imagePath, image as Buffer);
    } else {
        throw new Error('Unsupported image type returned by downloadAsset');
    }

    console.log(`Saved asset ${asset.uuid} to:`, imagePath);
    return imagePath;
}

function makeCacheDirIfNotExists(cacheDir: string) {
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }
    // make .cache/images directory if it doesn't exist
    const imagesDir = path.join(cacheDir, 'images');
    if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
    }
}

function getVisualizePath(imagePath: string): string {
    const ext = path.extname(imagePath);
    const base = imagePath.slice(0, -ext.length);
    return `${base}_visualize.jpg`;
}

async function visualizePredictionsOnImage(imagePath: string, predictions: Prediction[]): Promise<string> {
    const img = await loadImage(imagePath);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');

    // Draw the original image
    ctx.drawImage(img, 0, 0);

    // Drawing styles
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#00FF00';
    ctx.font = '20px sans-serif';

    // Iterate predictions and draw boxes/labels
    for (const pred of predictions) {
        const objects = (pred as any)?.objects || [];
        for (const obj of objects) {
            const x = Math.max(0, Math.round(obj.x || 0));
            const y = Math.max(0, Math.round(obj.y || 0));
            const w = Math.max(0, Math.round(obj.width || 0));
            const h = Math.max(0, Math.round(obj.height || 0));

            // Box
            ctx.strokeRect(x, y, w, h);

            // Label text (prefer nested class if present)
            let label = obj.classLabel || obj.category || 'object';
            if (Array.isArray(obj.classes) && obj.classes.length > 0) {
                const top = obj.classes[0];
                const topLabel = top.classLabel || top.category || '';
                const conf = typeof top.confidence === 'number' ? ` ${(top.confidence * 100).toFixed(1)}%` : '';
                label = `${label} · ${topLabel}${conf}`;
            } else if (typeof obj.confidence === 'number') {
                label = `${label} ${(obj.confidence * 100).toFixed(1)}%`;
            }

            // Label background
            const paddingX = 6;
            const paddingY = 4;
            const textWidth = ctx.measureText(label).width;
            const labelX = x;
            const labelY = Math.max(0, y - 26);

            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(labelX, labelY, textWidth + paddingX * 2, 24 + paddingY * 2);

            // Label text
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(label, labelX + paddingX, labelY + 20);
        }
    }

    const outPath = getVisualizePath(imagePath);
    await pipeline(canvas.createJPEGStream({ quality: 0.9 }), fs.createWriteStream(outPath));
    return outPath;
}

function getGroundTruthAnnotationForAsset(asset: Asset): Prediction | null {
    const annotations = asset.annotations || [];
    for (const ann of annotations) {
        if (ann.user_review === UserReview.approved) {
            return ann.annotation;
        }
    }
    return null;
}

async function cropImageToObject(imagePath: string, obj: PredictedObject): Promise<string> {
    const x = Math.max(0, Math.round(obj.x || 0));
    const y = Math.max(0, Math.round(obj.y || 0));
    const w = Math.max(1, Math.round(obj.width || 0));
    const h = Math.max(1, Math.round(obj.height || 0));
    const cropPath = path.join(path.dirname(imagePath), `${obj.classLabel || 'object'}_${obj.x}_${obj.y}_${obj.width}_${obj.height}_cropped.jpg`);

    if (fs.existsSync(cropPath)) {
        // console.log('Cropped image already exists:', cropPath);
        return cropPath;
    }

    const img = await loadImage(imagePath);
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, x, y, w, h, 0, 0, w, h);

    await pipeline(canvas.createJPEGStream({ quality: 0.95 }), fs.createWriteStream(cropPath));
    return cropPath;
}

async function getAssets(dataClient: any, cacheDir: string, datasetUUID: string, datasetVersion: any): Promise<Asset[]> {
    // File cache for assets list
    const assetsCacheDir = path.join(cacheDir, 'json');
    const assetsCachePath = path.join(assetsCacheDir, `assets_${datasetUUID}.json`);
    if (!fs.existsSync(assetsCacheDir)) {
        fs.mkdirSync(assetsCacheDir, { recursive: true });
    }

    let assets: Asset[];
    if (fs.existsSync(assetsCachePath)) {
        assets = JSON.parse(fs.readFileSync(assetsCachePath, 'utf-8'));
        console.log(`Loaded ${assets.length} assets from cache:`, assetsCachePath);
    } else {
        assets = await dataClient.listAssets(datasetUUID, datasetVersion, true);
        fs.writeFileSync(assetsCachePath, JSON.stringify(assets, null, 2));
        console.log(`Fetched and cached ${assets.length} assets to:`, assetsCachePath);
    }
    return assets;
}

async function getOrProcessPrediction(asset: Asset, obj: PredictedObject, cropPath: string, cacheDir: string, workerClient: any): Promise<Prediction[]> {
    const jsonDir = path.join(cacheDir, 'json');
    const jsonPath = path.join(
        jsonDir,
        `${asset.uuid}_${obj.x}_${obj.y}_${obj.width}_${obj.height}.json`
    );
    if (fs.existsSync(jsonPath)) {
        return JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as Prediction[];
    }

    let buffer: Prediction[] = [];
    let maxRetries = 3;
    let attempt = 0;
    let success = false;

    while (attempt < maxRetries && !success) {
        try {
            let results = await workerClient.process({
                path: cropPath
            });

            buffer = [];
            for await (let result of results) {
                buffer.push(result);
            }
            success = true;
        } catch (error) {
            attempt++;
            console.warn(`Error during workerClient.process (attempt ${attempt}):`, error);
            if (attempt >= maxRetries) {
                console.error('Max retries reached. Skipping this crop.');
            } else {
                await new Promise(res => setTimeout(res, 1000 * attempt)); // Exponential backoff
            }
        }
    }

    fs.writeFileSync(jsonPath, JSON.stringify(buffer, null, 2));
    //console.log('Saved prediction to cache:', jsonPath);
    return buffer;
}

async function uploadAssetWithGroundTruth(
    dataClient: any,
    writeDataset: any,
    imagePath: string,
    groundTruth: Prediction
): Promise<any> {
    const imageBuffer = fs.readFileSync(imagePath);
    const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' });

    let newAsset;
    let uploadAttempts = 0;
    const maxUploadRetries = 3;
    while (uploadAttempts < maxUploadRetries) {
        try {
            newAsset = await dataClient.uploadAsset(writeDataset.uuid, undefined, imageBlob);
            break;
        } catch (error) {
            uploadAttempts++;
            console.warn(`Error during uploadAsset (attempt ${uploadAttempts}):`, error);
            if (uploadAttempts >= maxUploadRetries) {
                console.error('Max retries reached for uploadAsset. Skipping this asset.');
                break;
            }
            await new Promise(res => setTimeout(res, 1000 * uploadAttempts)); // Exponential backoff
        }
    }
    if (!newAsset) return null;
    await dataClient.updateAssetGroundTruth(newAsset.uuid, undefined, undefined, groundTruth);
    return newAsset;
}


async function run() {
    try {
        const cacheDir = path.join(__dirname, '.cache');
        makeCacheDirIfNotExists(cacheDir);

        const dataClient = await createEyepopDataClient();
        console.log('Data client connected');
        const datasetVersion = undefined; // getDatasetVersion();
        const dataset = await dataClient.getDataset(datasetUUID, datasetVersion);
        console.log('Dataset:', dataset.uuid, dataset.name);

        // make a new dataset to avoid modifying production data
        const candidateLabels = [
            ...(dataset.auto_annotate_params?.candidate_labels || []),
            ...newLabelsArray
        ];

        // const writeDataset = await dataClient.createDataset({
        //     name: `${dataset.name} - Processed with Image Contents ${new Date().toISOString()}`,
        //     description: dataset.description,
        //     tags: [...(dataset.tags || []), 'processed', 'image-contents'],
        //     auto_annotate_params: {
        //         candidate_labels: candidateLabels,
        //     }
        // });
        // console.log('Created new dataset for processed assets:', writeDataset);

        const assets = await getAssets(dataClient, cacheDir, datasetUUID, datasetVersion);
        // assets = assets.slice(0, 10); // limit to first 10 assets for demo purposes        
        console.log(`Processing ${assets.length} assets...`);

        // get asset with uuid = 068a3aafcbcd71d78000cb4aa1ca4e52 in assets
        // const testAsset = assets.find(a => a.uuid === '068a3aafcbcd71d78000cb4aa1ca4e52');
        // if (testAsset) {
        //     console.log('Testing with single asset:', testAsset);
        // } else {
        //     console.log('Test asset not found, processing all assets.');
        // }    
        //exit(0);

        const workerClient = await createEyepopClient();

        for (const asset of assets) {
            const assetProcess_start = Date.now();

            if (asset.status !== AssetStatus.accepted) {
                console.log('Skipping inactive asset:', asset.uuid);
                continue;
            }

            const groundTruth = getGroundTruthAnnotationForAsset(asset);
            if (!groundTruth) {
                console.log('Skipping asset with no approved ground truth:', asset.uuid);
                continue;
            }
            console.log('Ground Truth time: ', (Date.now() - assetProcess_start) / 1000);

            //console.log('Asset:', asset);
            const imagePath = await downloadAssetToFile(dataClient, asset, cacheDir, datasetUUID, datasetVersion);

            if (!imagePath) {
                // console.log('Skipping asset, missing:', asset.uuid);
                continue;
            }

            console.log('Download time: ', (Date.now() - assetProcess_start) / 1000);

            console.log(`Processing asset ${assets.indexOf(asset) + 1} of ${assets.length}: ${asset.uuid} with ${groundTruth?.objects?.length || 0} ground truth objects`);
            const objectCounts = groundTruth?.objects?.reduce((acc, obj) => {
                acc[obj.classLabel] = (acc[obj.classLabel] || 0) + 1;
                return acc;
            }, {} as Record<string, number>) || {};
            console.log('Ground Truth object counts:', objectCounts);

            // Limit parallel processing of groundTruth objects
            const MAX_PARALLEL = 4; // adjust as needed
            const objects = groundTruth?.objects || [];
            for (let i = 0; i < objects.length; i += MAX_PARALLEL) {
                const batch = objects.slice(i, i + MAX_PARALLEL);
                await Promise.all(
                    batch.map(async (obj) => {
                        if (obj.classLabel && obj.classLabel.toLowerCase() !== classLabelToSplit) {
                            return; // skip objects that already have a classLabel
                        }

                        // Crop image to object bounding box
                        const cropPath = await cropImageToObject(imagePath, obj);
                        console.log('Crop time: ', (Date.now() - assetProcess_start) / 1000);

                        // Check for cached predictions
                        const buffer = await getOrProcessPrediction(asset, obj, cropPath, cacheDir, workerClient);
                        obj.classLabel = buffer?.[0]?.classes?.[0]?.classLabel || obj.classLabel;
                        console.log('Inference time: ', (Date.now() - assetProcess_start) / 1000);
                    })
                );
            }

            const vizPath = await visualizePredictionsOnImage(imagePath, [groundTruth]);
            console.log('Visualization time: ', (Date.now() - assetProcess_start) / 1000);

            // Upload new asset with updated ground truth
            // const newAsset = await uploadAssetWithGroundTruth(dataClient, writeDataset, imagePath, groundTruth);
            // console.log('Upload time: ', (Date.now() - assetProcess_start) / 1000);

            console.log(`Finished processing asset ${assets.indexOf(asset) + 1} of ${assets.length}`);
        }

        await dataClient.disconnect();
        await workerClient.disconnect();
        console.log('Clients disconnected');
    } catch (err) {
        // any error write to an error log with timestamp, err.stack, and any other useful info
        const errorLogPath = path.join(__dirname, 'error_log.txt');
        const errorMessage = `[${new Date().toISOString()}] ${err.stack || err}\n`;
        fs.appendFileSync(errorLogPath, errorMessage);
        console.error('Error occurred, details logged to:', errorLogPath);
        process.exit(1);
    }
}

run();
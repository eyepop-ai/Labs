import { AssetStatus, EyePop, PredictedKeyPoint, PredictedKeyPoints, PredictedObject, Prediction, PopComponentType, ForwardOperatorType } from '@eyepop.ai/eyepop';
import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';
import { createCanvas, loadImage } from 'canvas';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Command line arguments
const [, , accountUUID, datasetUUID] = process.argv;
if (!accountUUID || !datasetUUID) {
    console.error('Usage: ts-node main.ts <accountUUID> <datasetUUID>');
    process.exit(1);
}
const customModelUUID = process.env.customModelUUID;

//Functions
async function createEyepopDataClient() {
    const client = await EyePop.dataEndpoint({
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
                modelUuid: customModelUUID,
                categoryName: 'custom_model',
                confidenceThreshold: 0.7,
                forward: {
                    operator: {
                        type: ForwardOperatorType.CROP,
                        crop: {
                            boxPadding: 0.5
                        }
                    },
                    targets: [{
                        type: PopComponentType.INFERENCE,
                        ability: 'eyepop.image-contents:latest',
                        params: {
                            prompts: [{
                                prompt: "Describe the contents of this image in a concise manner.",
                            }]
                        }
                    }]
                }
            },
        ]
    }


    await client.changePop(
        pop_definition
    );

    return client;
}

async function downloadAssetToFile(client: any, asset: any, cacheDir: string) {
    const imagePath = path.join(cacheDir, 'images', `${asset.uuid}.jpg`);

    if (fs.existsSync(imagePath)) {
        console.log('Asset already downloaded:', imagePath);
        return imagePath;
    }

    const image = await client.downloadAsset(asset.uuid);
    console.log('Downloaded asset:', image);

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

    console.log('Saved asset to:', imagePath);
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

async function run() {
    try {

        // make .cache directory if it doesn't exist
        const cacheDir = path.join(__dirname, '.cache');
        makeCacheDirIfNotExists(cacheDir);

        const dataClient = await createEyepopDataClient();
        const datasetVersion = undefined; // getDatasetVersion();
        const dataset = await dataClient.getDataset(datasetUUID, datasetVersion);
        console.log('Dataset:', dataset);

        let assets = await dataClient.listAssets(datasetUUID, datasetVersion, true);
        assets = assets.slice(0, 10); // limit to first 10 assets for demo purposes        
        console.log(`Processing ${assets.length} assets...`);

        const workerClient = await createEyepopClient();

        for (const asset of assets) {
            console.log('Asset:', asset);
            const imagePath = await downloadAssetToFile(dataClient, asset, cacheDir);

            if(!imagePath) {
                console.log('Skipping asset, missing:', asset.uuid);
                continue;
            }

            let results = await workerClient.process({
                path: imagePath
            })

            let buffer: Prediction[] = [];

            for await (let result of results) {
                buffer.push(result)                
            }

            console.log('Predictions:', JSON.stringify(buffer, null, 2));

            const vizPath = await visualizePredictionsOnImage(imagePath, buffer);
            console.log('Saved visualization to:', vizPath);
            
        }

        await dataClient.disconnect();
        await workerClient.disconnect();
        console.log('Clients disconnected');
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
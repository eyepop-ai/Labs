#!/usr/bin/env node
const { ForwardOperatorType, PopComponentType, EyePop } = require("@eyepop.ai/eyepop");
const fs = require('fs');
const path = require('path');
const { augmentVideoWithBoxes } = require('./draw.js');

let endpoint = null;
let api_key = process.env.EYEPOP_API_KEY;

async function processVideo(inputFilePath, outputFilePath, popDefinition) {
    //check if inputFilePath+".json" exists    
    const inputJsonPath = inputFilePath + ".json";
    let buffer = [];

    if (fs.existsSync(inputJsonPath)) {
        console.log("Using cached data from:", inputJsonPath);
        const cachedData = JSON.parse(fs.readFileSync(inputJsonPath, 'utf8'));
        buffer = cachedData;
    } else {

        if (!endpoint) {
            endpoint = await EyePop.workerEndpoint({
                auth: {
                    secretKey: api_key,
                }
            }).connect()

            console.log("Connected to EyePop endpoint:", endpoint);
            console.log("Setting pop definition:", JSON.stringify(popDefinition, null, 2));
            await endpoint.changePop(
                popDefinition
            );
        }

        console.log("Processing...");
        let results = await endpoint.process({
            path: inputFilePath
        })

        console.log("Awaiting results...");
        console.log(results)
        for await (let result of results) {
            console.log("Received result", result);
            buffer.push(result)
            console.log("Processing... ", result.timestamp / 1000000000);

            if ('event' in result && result.event.type === 'error') {
                console.log("VIDEO RESULT", result.event.message)
            }
        }

        console.log("Processing complete. Buffer length:", buffer.length);
        // Save the buffer to a JSON file
        fs.writeFileSync(inputJsonPath, JSON.stringify(buffer, null, 2));
    }

    // take the output buffer and frame be frame augment the video
    await augmentVideoWithBoxes(inputFilePath, outputFilePath, buffer);
}

pop_definition = {
    components: [
        // Test with standard models first - comment out custom pickleball models for now
        // {
        //     type: PopComponentType.INFERENCE,
        //     model: 'eyepop.person:latest',
        //     categoryName: 'person',
        //     forward: {
        //         operator: {
        //             type: ForwardOperatorType.CROP,
        //             crop: {
        //                 boxPadding: 0.25,
        //                 maxItems: 128,
        //             }
        //         },
        //         targets: [{
        //             type: PopComponentType.INFERENCE,
        //             model: 'eyepop.person.palm:latest',
        //             forward: {
        //                 operator: {
        //                     type: ForwardOperatorType.CROP,
        //                     crop: {
        //                         includeClasses: ['hand circumference'],
        //                         orientationTargetAngle: -90.0,
        //                     }
        //                 },
        //                 targets: [{
        //                     type: PopComponentType.INFERENCE,
        //                     model: 'eyepop.person.3d-hand-points:latest',
        //                     categoryName: '3d-hand-points'
        //                 }]
        //             }
        //         }]
        //     }
        // },
        {
            type: PopComponentType.INFERENCE,
            //Bobby model
            modelUuid: '068c064ed1877074800061f101857215',

            //No cash
            // modelUuid: '068d48f996a97db78000ea4ca825c22a',

            //Cash more epochs
            // modelUuid: '068d48df48e87f4f80004e10ffc47aea',
            categoryName: 'cash_drawer',
            confidenceThreshold: 0.7,
            forward: {
                "targets": [
                {
                    "type": "tracing"
                }
                ],
                "operator": {
                    "type": "crop"
                }
            },
        },
    ],
}

console.log("Pop definition created:", pop_definition);

// grab the list of mp4 files from ./input_video

const inputDir = path.join(__dirname, 'input_video');
const outputDir = path.join(__dirname, 'output_video');

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}
const files = fs.readdirSync(inputDir).filter(file =>
    file.toLowerCase().endsWith('.mov') || file.toLowerCase().endsWith('.mp4')
);
console.log("Found video files:", files);

(async () => {
    for (const file of files) {
        const inputFilePath = path.join(inputDir, file);
        const baseName = path.parse(file).name;
        const outputFilePath = path.join(outputDir, baseName + '_output.mp4');

        console.log(`Processing file: ${inputFilePath}`);

        await processVideo(inputFilePath, outputFilePath, pop_definition);

        console.log(`Output will be saved to: ${outputFilePath}`);
    }
})();

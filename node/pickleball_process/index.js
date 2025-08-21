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
        }

        await endpoint.changePop(
            popDefinition
        );

        let results = await endpoint.process({
            path: inputFilePath
        })


        for await (let result of results) {
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
        {
            type: PopComponentType.INFERENCE,
            modelUuid: '068080d5b5da79d88000fe5676e26017',
            categoryName: 'ball',
            confidenceThreshold: 0.7,
        },
        {
            type: PopComponentType.INFERENCE,
            modelUuid: '0686ec711e6d7d5c80008d2b8ecca4b6',
            categoryName: 'paddle_spine',
            confidenceThreshold: 0.7,
        },
        {
            type: PopComponentType.INFERENCE,
            model: 'eyepop.person:latest',
            categoryName: 'person',
            confidenceThreshold: 0.9,
            forward: {
                operator: {
                    type: ForwardOperatorType.CROP,
                    crop: {
                        boxPadding: 0.5
                    }
                },
                targets: [{
                    type: PopComponentType.INFERENCE,
                    model: 'eyepop.person.pose:latest',
                    hidden: true,
                    forward: {
                        operator: {
                            type: ForwardOperatorType.CROP,
                            crop: {
                                boxPadding: 0.5,
                                orientationTargetAngle: -90.0,
                            }
                        },
                        targets: [{
                            type: PopComponentType.INFERENCE,
                            model: 'eyepop.person.3d-body-points.heavy:latest',
                            categoryName: '3d-body-points',
                            confidenceThreshold: 0.25
                        }]
                    }
                }]
            }

        }
    ],
}

console.log("Pop definition created:", pop_definition);

// grab the list of mp4 files from ./input_video

const inputDir = path.join(__dirname, 'input_video');
const outputDir = path.join(__dirname, 'output_video');

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

const files = fs.readdirSync(inputDir).filter(file => file.endsWith('.mp4'));
console.log("Found video files:", files);

for (const file of files) {
    const inputFilePath = path.join(inputDir, file);
    const outputFilePath = path.join(outputDir, file.replace('.mp4', '_output.mp4'));

    console.log(`Processing file: ${inputFilePath}`);

    processVideo(inputFilePath, outputFilePath, pop_definition);

    console.log(`Output will be saved to: ${outputFilePath}`);
}

#!/usr/bin/env node

const path = require('path');
const { EyePop } = require('@eyepop.ai/eyepop');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const apiKey = process.env.EYEPOP_API_KEY;
const videoPath = process.argv[2];

if (!apiKey) {
  console.error('Missing EYEPOP_API_KEY');
  process.exit(1);
}

if (!videoPath) {
  console.error('Usage: node run_video.js <video-file>');
  process.exit(1);
}

const pop_definition = {
  "components": [
    {
      "type": "inference",
      "model": "eyepop.person:latest",
      "forward": {
        "targets": [
          {
            "type": "tracing",
            "reidModel": "eyepop.person.reid:latest"
          }
        ],
        "operator": {
          "type": "crop"
        }
      },
      "categoryName": "person",
      "confidenceThreshold": 0.8
    },
    {
      "type": "inference",
      "model": "eyepop.vehicle:latest",
      "forward": {
        "targets": [
          {
            "type": "tracking",
            "maxAgeSeconds": 5.0,
            "iouThreshold": 0.2,
          }
        ],
        "operator": {
          "type": "crop"
        }
      },
      "categoryName": "common-objects",
      "confidenceThreshold": 0.8
    }
  ]
};

(async () => {
  const endpoint = await EyePop.workerEndpoint({
    auth: { secretKey: apiKey }
  }).connect();

  await endpoint.changePop(pop_definition);

  const results = await endpoint.process({
    path: videoPath
  });

  const allResults = [];

  for await (const result of results) {
    allResults.push(result);
  }

  console.log(JSON.stringify(allResults, null, 2));

  await endpoint.disconnect();
})();
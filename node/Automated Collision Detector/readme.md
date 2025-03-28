# Automated Collision Detector

The Automated Collision Detector is a project that utilizes the EyePop.ai platform to detect vehicle collisions or accidents in videos. It takes in a video URL and processes it using an EyePop.ai endpoint. The detection is based on simple physics calculations using bounding boxes of vehicles to identify sudden changes in acceleration, which are indicative of collisions.

Please note that this project is purely a demonstration of what is possible based on the existing vehicle model in the EyePop.ai library. A custom dataset with greatly improve results. Also, much of the the logic found in this project is done to filter data noise - which also is much less necessary for a properly trained model.


## Getting Started

#### Default data
Fastest method:
1. Install and open the `demo.json` file

Upload your own video file:
1. Sign up for EyePop.ai and create a Pop (refer to the developer documentation for more details).
2. Place your Pop UUID inside the `hook/EyePopContext.jsx` file:

```javascript
    EyePop.endpoint({
         popId: '<POP_UUID>',
         auth: {
              oAuth2: true
         }
    })
```

3. Enter a video URL in the top left text box and click "Start Inference". It is recommended to use a short video as this demo is not optimized for large files.
4. Once the inference is completed, save the JSON data file to save on inference time.

## Running

1. Install and run a development server by running the following commands:

    ```shell
    npm install
    npm run dev
    ```

2. Launch `http://localhost:8000` in your browser.

## Debugging

For debugging purposes, open your browser's inspector console (right-click -> inspect) to view progress and messages.

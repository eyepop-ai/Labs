import Processor from './processor';
import EyePop from '@eyepop.ai/eyepop';
import Render2d from '@eyepop.ai/eyepop-render-2d'
import { ComposablePops } from './composable_pops';


class PickleballFullProcessor extends Processor {
    buffer = [];

    constructor() {
        super();
        // Additional initialization if needed
    }

    async setCanvasContext(canvasContext, stream) {
        const api_key = process.env.NEXT_PUBLIC_PADDLE_MODEL_API_KEY;
        if (!api_key) {
            console.error("Configuration Error: NEXT_PUBLIC_PADDLE_MODEL_API_KEY is missing in environment variables. Please add it to your .env file.");
            throw new Error("NEXT_PUBLIC_PADDLE_MODEL_API_KEY is missing. Check console for details.");
        }

        this.endpoint = await EyePop.workerEndpoint({
            auth: {
                secretKey: api_key,
            },
            eyepopUrl: process.env.NEXT_PUBLIC_PADDLE_MODEL_API_URL,
            stopJobs: false
        }).connect()

        await this.endpoint.changePop(ComposablePops.PickleballFull);

        console.log("Pop:", ComposablePops.PickleballFull);

        this.renderer = Render2d.renderer(canvasContext, [
            Render2d.renderContour(),
            Render2d.renderText({ fitToBounds: true }),
            Render2d.renderPose(),
            Render2d.renderFace(), // Added face rendering
            Render2d.renderBox({
                showClass: false,
                showTraceId: false,
                showNestedClasses: false,
                showConfidence: false,
            }),
        ])

        // Live streaming should work with SDK 1.15.3 + await fix
        await this.setStream(canvasContext, stream);
    }

    async processFrame(canvasContext, videoRef, roi) {
        // For live streaming mode
        if (this.stream && this.lastPrediction) {
            if (!this.endpoint) return;
            if (!this.renderer) return;

            // Draw the latest prediction from the stream
            this.drawSpines(canvasContext, this.lastPrediction);
            this.renderer.draw(this.lastPrediction);
            return;
        }

        // For uploaded video playback mode
        if (!this.endpoint) return;
        if (!this.renderer) return;

        let currentFrame = null;
        if (!videoRef || !videoRef?.currentTime || !this.buffer?.length) {
            currentFrame = this.lastPrediction;
        } else {
            const currentTime = videoRef.currentTime;
            currentFrame = this.getClosestPrediction(currentTime);
        }

        if (currentFrame) {
            if (canvasContext.canvas.width !== currentFrame.source_width ||
                canvasContext.canvas.height !== currentFrame.source_height) {
                canvasContext.canvas.width = currentFrame.source_width;
                canvasContext.canvas.height = currentFrame.source_height;
            }

            if (!currentFrame.objects || !currentFrame.objects.length > 0)
                return;

            this.drawSpines(canvasContext, currentFrame);
            this.renderer.draw(currentFrame);
            this.lastPrediction = currentFrame;
        }
    }

    async processPhoto(photo, canvasContext, name, roi) {

        console.log('Processing photo:', photo);

        let results = await this.endpoint.process({
            file: photo,
            mimeType: 'image/*',
        })

        for await (let result of results) {
            console.log(result)
            if (
                canvasContext.canvas.width !== result.source_width ||
                canvasContext.canvas.height !== result.source_height
            ) {
                canvasContext.canvas.width = result.source_width
                canvasContext.canvas.height = result.source_height
            }
            if (!result.objects || !result.objects.length > 0)
                return

            // result.objects = result.objects.filter(obj => obj.confidence > 0.5)

            this.drawSpines(canvasContext, result);
            this.renderer.draw(result);
        }
    }

    async processVideo(video, canvasContext, name, roi) {
        console.log('Processing video:', video);

        const cachedData = await this.loadCachedVideoResults(video.name);
        if (cachedData) {
            this.buffer = cachedData;
            if (this.buffer.length > 0) {
                console.log("Using cached video data from IndexedDB.");
                return;
            }
        }

        this.buffer = []

        let results = await this.endpoint.process({
            file: video
        })

        console.log("video result:", results)

        for await (let result of results) {
            canvasContext.width = result.source_width
            canvasContext.height = result.source_height

            console.log("VIDEO RESULT", result)

            this.buffer.push(result)

            if ('event' in result && result.event.type === 'error') {
                console.log("VIDEO RESULT", result.event.message)
            }
        }

        await this.cacheVideoResults(video.name, this.buffer);
        console.log("Cached video data in IndexedDB.");
    }

    async processFrame(canvasContext, video, roi) {

        //console.log('Processing video frame:', video, this.endpoint, this.renderer);
        if (!this.endpoint) return
        if (!this.renderer) return


        let currentFrame = null;
        if (!video || !video?.currentTime || !this.buffer?.length) {
            currentFrame = this.lastPrediction
        } else {
            const currentTime = video.currentTime;
            currentFrame = this.getClosestPrediction(currentTime)
        }


        if (currentFrame) {
            if (canvasContext.canvas.width !== currentFrame.source_width ||
                canvasContext.canvas.height !== currentFrame.source_height) {
                canvasContext.canvas.width = currentFrame.source_width
                canvasContext.canvas.height = currentFrame.source_height
            }

            if (!currentFrame.objects || !currentFrame.objects.length > 0)
                return


            this.drawSpines(canvasContext, currentFrame);

            this.renderer.draw(currentFrame)
            this.lastPrediction = currentFrame
        }
    }

    drawSpines(canvasContext, result) {
        for (let i = 0; i < result.objects.length; i++) {
            const obj = result.objects[i];

            // Draw paddle spines
            if (obj.category === 'paddle_spine' && obj.keyPoints && obj.keyPoints.length > 0) {
                const paddle = obj.keyPoints[0].points
                if (paddle.length >= 2) {
                    const from = paddle[0]
                    const to = paddle[1]
                    canvasContext.beginPath();
                    canvasContext.moveTo(from.x, from.y);
                    canvasContext.lineTo(to.x, to.y);
                    canvasContext.strokeStyle = 'red';
                    canvasContext.lineWidth = 2;
                    canvasContext.stroke();
                    canvasContext.closePath();
                    //add small white circle at the end of the spine
                    canvasContext.beginPath();
                    canvasContext.arc(to.x, to.y, 5, 0, 2 * Math.PI);
                    canvasContext.fillStyle = 'white';
                    canvasContext.fill();
                    canvasContext.closePath();
                    //add small white circle at the start of the spine
                    canvasContext.beginPath();
                    canvasContext.arc(from.x, from.y, 5, 0, 2 * Math.PI);
                    canvasContext.fillStyle = 'white';
                    canvasContext.fill();
                    canvasContext.closePath();
                }
            }
        }
    }

    getClosestPrediction(seconds) {
        if (this.buffer.length === 0) return null
        return this.buffer.reduce((prev, curr) => {
            if (!prev) return curr
            if (!curr.seconds) return prev
            if (!prev.seconds) return curr
            return Math.abs(curr.seconds - seconds) < Math.abs(prev.seconds - seconds)
                ? curr
                : prev
        })
    }
}

export default PickleballFullProcessor;

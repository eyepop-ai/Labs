import Processor from './processor';
import EyePop from '@eyepop.ai/eyepop';
import Render2d from '@eyepop.ai/eyepop-render-2d'
import next from 'next';

class AutoHighlightVideo extends Processor {
    buffer = [];

    constructor() {
        super();
        // Additional initialization if needed
    }

    async setCanvasContext(canvasContext, stream) {
        const pop_uuid = process.env.NEXT_PUBLIC_OBJECT_POP_UUID;
        const api_key = process.env.NEXT_PUBLIC_OBJECT_POP_API_KEY;

        this.endpoint = await EyePop.workerEndpoint({
            popId: pop_uuid,
            auth: {
                secretKey: api_key,
            },
        }).connect()

        this.renderer = Render2d.renderer(canvasContext, [
            Render2d.renderContour(),
            Render2d.renderText({ fitToBounds: true }),
            Render2d.renderPose(),
            Render2d.renderBox({
                showClass: false,
                showTraceId: false,
                showNestedClasses: false,
                showConfidence: false,
            }),
        ])
    }

    async processFrame(canvasContext, video, roi) {

        //console.log('Processing video frame:', video, this.endpoint, this.renderer);
        if (!this.endpoint) return
        if (!this.renderer) return
        if (!video) return
        if (!video?.currentTime) return
        if (!this.buffer?.length) return

        const currentTime = video.currentTime;
        let currentFrame = this.getClosestPrediction(currentTime)

        const confidenceThreshold = 0.85;

        const skipFramesWithoutObject = false
        if (skipFramesWithoutObject) {
            this.jumpToFrameWithObject(video, 'eye glasses', confidenceThreshold);
        }
        
        if (currentFrame) {
            if (canvasContext.canvas.width !== currentFrame.source_width ||
                canvasContext.canvas.height !== currentFrame.source_height) {
                canvasContext.canvas.width = currentFrame.source_width
                canvasContext.canvas.height = currentFrame.source_height
            }

            if (!currentFrame.objects || !currentFrame.objects.length > 0) 
                return

            // filter objects in currentframe.objects by confidence threshold
            currentFrame.objects = currentFrame.objects.filter(obj => obj.confidence >= confidenceThreshold);

            this.renderer.draw(currentFrame)
            this.lastPrediction = currentFrame


            

        }
    }

    jumpToFrameWithObject(video, classLabel, confidenceThreshold) {
        const nextFrameTime = 1 / 30;
        let scanTime = video.currentTime + nextFrameTime;
    
        let foundFrame = null;
        while (scanTime < video.duration) {
            let nextFrame = this.getClosestPrediction(scanTime);
            if (
                nextFrame?.objects?.some(obj => obj.confidence >= confidenceThreshold && obj.classLabel === classLabel)
            ) {
                foundFrame = scanTime;
                break;
            }
            scanTime += nextFrameTime;
        }

        if( scanTime >= video.duration) {
            foundFrame = video.duration; // if we reach the end of the video, set to the end

            console.log("Reached end of video without finding object in more frames, setting to end:", foundFrame);
        }
    
        if (foundFrame !== null && foundFrame !== video.currentTime && foundFrame !== video.currentTime + nextFrameTime) {
            console.log("Skipping to", foundFrame);
            video.currentTime = foundFrame;
            return; // exit early — will re-enter when video.currentTime updates
        }
    }
    
}

export default AutoHighlightVideo;
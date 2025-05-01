import Processor from './processor';
import { ContourType, EndpointState, EyePop, ForwardOperatorType, InferenceType, PopComponentType, TransientPopId } from "@eyepop.ai/eyepop";
import Render2d from '@eyepop.ai/eyepop-render-2d'
import { ComposablePops } from './composable_pops';

class PersonPoseUploadLocal extends Processor {
    buffer = [];

   
    constructor() {
        super();
        // Additional initialization if needed
    }

    async setCanvasContext(canvasContext, stream) {
       
        if (this.endpoint)
            this.endpoint.disconnect()

        this.endpoint = await EyePop.workerEndpoint({
            isLocalMode: true
        }).connect()

        await this.endpoint.changePop(ComposablePops.Person2D);

        this.renderer = Render2d.renderer(canvasContext, [
            Render2d.renderPose(),
            Render2d.renderBox({
                showClass: false,
                showTraceId: false,
                showNestedClasses: false,
                showConfidence: false,
            }),
        ])
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
            this.renderer.draw(result)
        }
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
        console.log(currentFrame)

        if (currentFrame) {
            if (canvasContext.canvas.width !== currentFrame.source_width ||
                canvasContext.canvas.height !== currentFrame.source_height) {
                canvasContext.canvas.width = currentFrame.source_width
                canvasContext.canvas.height = currentFrame.source_height
            }

            if (!currentFrame.objects || !currentFrame.objects.length > 0)
                return

            // Filter to most prominent object by area
            currentFrame = this.getBiggestObjectInScene(currentFrame, "person")

            this.renderer.draw(currentFrame)
            this.lastPrediction = currentFrame
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

export default PersonPoseUploadLocal;
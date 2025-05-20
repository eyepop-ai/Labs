import Processor from './processor';
import { ContourType, EndpointState, EyePop, ForwardOperatorType, InferenceType, PopComponentType, TransientPopId } from "@eyepop.ai/eyepop";
import Render2d from '@eyepop.ai/eyepop-render-2d'

class VisualIntelligenceProcessor extends Processor {
    buffer = [];
    hasPrompt = true;
    promptPlaceholder = "Person->What color is the shirt?";
    confidenceThreshold = 0.4;

    constructor() {
        super();
        // Additional initialization if needed
    }

    async setCanvasContext(canvasContext, stream) {
        const api_key = process.env.NEXT_PUBLIC_ANYTHING_POP_API_KEY;

        this.endpoint = await EyePop.workerEndpoint({
            auth: {
                secretKey: api_key,
            },
            eyepopUrl: process.env.NEXT_PUBLIC_ANYTHING_POP_API_URL,
            stopJobs: false
        }).connect()

        this.renderer = Render2d.renderer(canvasContext, [
            Render2d.renderText({ fitToBounds: true }),
            Render2d.renderPose(),
            Render2d.renderBox({
                showClass: true,
                showTraceId: false,
                showNestedClasses: true,
                showConfidence: true,
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
            console.log("RESULTS:",result)

            if (
                canvasContext.canvas.width !== result.source_width ||
                canvasContext.canvas.height !== result.source_height
            ) {
                canvasContext.canvas.width = result.source_width
                canvasContext.canvas.height = result.source_height
            }

            if (!result.objects || !result.objects.length > 0)
                return

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

    async handlePrompt(promptMsg) {

        //example promptMsg: "Person->What color is the shirt?, Person->What color is the pants?"
        //split by comma and then by -> to get the prompt and label
        const promptMap = promptMsg.split(',').reduce((acc, prompt) => {
            const [promptText, label] = prompt.split('->');
            const key = promptText.trim().toLowerCase();
            const value = label ? label.trim() : promptText.trim();

            if (!acc[key]) {
            acc[key] = [];
            }
            acc[key].push(value);

            return acc;
        }, {});
        console.log("handlePrompt:", promptMap);

        const objects = Object.keys(promptMap);       

        const pop = {
            components: [{
            type: PopComponentType.INFERENCE,
            ability: 'eyepop.localize-objects:latest',
            params: {
                prompts: objects.map(obj => ({ prompt: obj }))
            },
            forward: {
                operator: {
                type: ForwardOperatorType.CROP,
                },
                targets: [{
                type: PopComponentType.INFERENCE,
                ability: 'eyepop.image-contents-t4:latest',
                params: {
                    prompts: promptMap[objects[0]].map(label => ({ prompt: label }))
                },
                }]
            }
            }]
        }

        console.log(pop)
        
        await this.endpoint.changePop(pop);

        
    }



}

export default VisualIntelligenceProcessor;
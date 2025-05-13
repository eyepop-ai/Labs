import Processor from './processor';
import { ContourType, EndpointState, EyePop, ForwardOperatorType, InferenceType, PopComponentType, TransientPopId } from "@eyepop.ai/eyepop";
import Render2d from '@eyepop.ai/eyepop-render-2d'

class AnythingProcessor extends Processor {
    buffer = [];
    hasPrompt = true;
    useSegmentation = false;

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

        console.log("AnythingProcessor endpoint:", this.endpoint);

        await this.endpoint.changePop({
            components: [{
                type: PopComponentType.INFERENCE,
                ability: 'eyepop.localize-objects:latest',
                params: {
                    prompts: [
                        { prompt: 'can', label: 'can' },
                        { prompt: 'eye glasses', label: 'Glasses' }
                    ]
                }
            }
            ]
        });

        console.log("AnythingProcessor endpoint after changePop:", this.endpoint);

        if(this.useSegmentation) {
            this.renderer = Render2d.renderer(canvasContext, [
                Render2d.renderContour(),                
            ])
        } else {
            this.renderer = Render2d.renderer(canvasContext, [
                Render2d.renderText({ fitToBounds: true }),
                Render2d.renderPose(),
                Render2d.renderBox({
                    showClass: true,
                    showTraceId: false,
                    showNestedClasses: false,
                    showConfidence: false,
                }),
            ])
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

            //filter by confidences
            // result.objects = result.objects.filter((obj) => {
            //     return obj.confidence > 0.5
            // })


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
        const prompts = promptMsg.split(',').map((prompt) => {
            const [promptText, label] = prompt.split(':');
            return {
                prompt: promptText.trim(),
                label: label ? label.trim() : promptText.trim(),

            }


        })

        console.log("AnythingProcessor handlePrompt:", prompts);

        if(this.useSegmentation) {
        await this.endpoint.changePop({ 
            components: [{
              type: PopComponentType.INFERENCE,
              ability: 'eyepop.localize-objects:latest',
              params: {
                  prompts: prompts
                },
              forward: {
                operator: {
                  type: ForwardOperatorType.CROP,
                },
                targets: [{
                  type: PopComponentType.INFERENCE,
                  model: 'eyepop.sam.small:latest',
                  forward: {
                    operator: {
                      type: ForwardOperatorType.FULL,
                    },
                    targets: [{
                      type: PopComponentType.CONTOUR_FINDER,
                      contourType: ContourType.POLYGON,
                      areaThreshold: 0.005
                    }]
                  }
                }]
              }
            }
          ]});
        } else {
            await this.endpoint.changePop({
                components: [{
                    type: PopComponentType.INFERENCE,
                    ability: 'eyepop.localize-objects:latest',
                    params: {
                        prompts: prompts
                    },
                    confidenceThreshold: 0.6,
                }
                ]
            });
        }

        console.log("AnythingProcessor endpoint after changePop:", this.endpoint);
    }



}

export default AnythingProcessor;
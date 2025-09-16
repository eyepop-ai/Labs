import Processor from './processor';
import { ContourType, EndpointState, EyePop, ForwardOperatorType, InferenceType, PopComponentType, TransientPopId } from "@eyepop.ai/eyepop";
import Render2d from '@eyepop.ai/eyepop-render-2d'

class AnythingProcessor extends Processor {
    buffer = [];
    hasPrompt = false;
    useSegmentation = false;
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
            //eyepopUrl: process.env.NEXT_PUBLIC_ANYTHING_POP_API_URL,
            stopJobs: false
        }).connect()

        console.log("AnythingProcessor endpoint:", this.endpoint);

        await this.endpoint.changePop({
            components: [{
                type: PopComponentType.INFERENCE,
                ability: 'eyepop.localize-objects:latest',
                params: {
                    prompt: 'can'
                }
            }
            ]
        });

        console.log("AnythingProcessor endpoint after changePop:", this.endpoint);

        if (this.useSegmentation) {
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
                    showNestedClasses: true,
                    showConfidence: true,
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

            //draw the text result to the canvas ({
//     "objects": [
//         {
//             "classId": 0,
//             "classLabel": "thermometer",
//             "confidence": 0.608,
//             "height": 35,
//             "id": 1,
//             "objects": [
//                 {
//                     "category": "text",
//                     "classId": 0,
//                     "classLabel": "text",
//                     "confidence": 0.6078,
//                     "height": 15.729,
//                     "id": 3,
//                     "orientation": 0,
//                     "texts": [
//                         {
//                             "confidence": 0.2553,
//                             "id": 4,
//                             "text": "71/"
//                         }
//                     ],
//                     "width": 27.917,
//                     "x": 214.348,
//                     "y": 505.997
//                 }
//             ],
//             "orientation": 0,
//             "width": 52,
//             "x": 200,
//             "y": 497
//         }
//     ],
//     "seconds": 0,
//     "source_height": 830,
//     "source_id": "ea2f4f0d-3047-11f0-b5eb-0242ac110004",
//     "source_width": 700,
//     "system_timestamp": 1747174590796050000,
//     "timestamp": 0
// })
            // const text = result.objects.map((obj) => {
            //     if (obj.objects && obj.objects.length > 0) {
            //         return obj.objects.map((subObj) => {
            //             if (subObj.texts && subObj.texts.length > 0) {
            //                 return subObj.texts.map((textObj) => {
            //                     return textObj.text
            //                 }).join(' ')
            //             }
            //             return ''
            //         }).join(' ')
            //     }
            //     return ''
            // }).join(' ')
            // console.log("Text result:", text);


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

        if (this.useSegmentation) {
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
                ]
            });
        } else {
            await this.endpoint.changePop({
                components: [{
                    type: PopComponentType.INFERENCE,
                    ability: 'eyepop.localize-objects:latest',
                    params: {
                        prompts: prompts
                    },
                    confidenceThreshold: this.confidenceThreshold,
                    // forward: {
                    //     operator: {
                    //         type: ForwardOperatorType.CROP,
                    //     },
                    //     targets: [{
                    //         type: PopComponentType.INFERENCE,
                    //         model: 'eyepop.text:latest',
                    //         categoryName: 'text',
                    //         forward: {
                    //             operator: {
                    //                 type: ForwardOperatorType.CROP,
                    //             },
                    //             targets: [{
                    //                 type: PopComponentType.INFERENCE,
                    //                 model: 'eyepop.text.recognize.square:latest'
                    //             }]
                    //         }
                    //     }]
                    // }
                },
                
                ]
            });
        }

        console.log("AnythingProcessor endpoint after changePop:", this.endpoint);
    }



}

export default AnythingProcessor;
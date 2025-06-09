import Processor from './processor';
import { ContourType, EndpointState, EyePop, ForwardOperatorType, InferenceType, PopComponentType, TransientPopId } from "@eyepop.ai/eyepop";
import Render2d from '@eyepop.ai/eyepop-render-2d'

class PersonVisualIntelligenceProcessor extends Processor {
    buffer = [];
    hasPrompt = true;
    promptPlaceholder =["Age (report as range, ex. 20s",
                        "Gender (Male/Female)",
                        "Fashion style (Casual, Formal, Bohemian, Streetwear, Vintage, Chic, Sporty, Edgy)",
                        "Describe their outfit"].join(", ");
    confidenceThreshold = 0.8;
    prompt;

    constructor() {
        super();
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

        await this.endpoint.changePop({
            components: [{
                type: PopComponentType.INFERENCE,
                model: "eyepop.person:latest",
                categoryName: "person",
                confidenceThreshold: .9,

                forward: {
                    operator: {
                        type: ForwardOperatorType.CROP,
                    },
                    targets: [
                        {
                        type: PopComponentType.INFERENCE,
                        id: 2,
                        ability: 'eyepop.image-contents:latest',
                        params:{
                            prompts: [{
                                prompt: "Analyze the image provided and determine the categories of: " + 
                                this.promptPlaceholder + 
                                ". Report the values of the categories as classLabels. If you are unable to provide a category with a value then set it's classLabel to null"                               
                            }],
                        }
                    }
                ]
                }
            }]
        })

        this.renderer = Render2d.renderer(canvasContext, [
            Render2d.renderText({ fitToBounds: true }),
            Render2d.renderPose(),
            Render2d.renderBox({
                showClass: true,
                showTraceId: false,
                //showNestedClasses: true,
                //showConfidence: true,
            }),
        ])
    }

    async processPhoto(photo, canvasContext, name, roi) {

        console.log('Processing photo:', photo, this.prompt);       

        let results = await this.endpoint.process({
            file: photo,
            mimeType: 'image/*',
            //params: params,
        })
        console.log("Results:", results);

        for await (let result of results) {
            console.log("RESULTS:", result)

            if (
                canvasContext.canvas.width !== result.source_width ||
                canvasContext.canvas.height !== result.source_height
            ) {
                canvasContext.canvas.width = result.source_width
                canvasContext.canvas.height = result.source_height
            }

            if (!result.objects || !result.objects.length > 0)
                return

            results.objects = result.objects.filter((object) => {
                if (object.classes && object.classes.length > 0) {
                    return object.classes.some((classObj) => {
                        return classObj.confidence > this.confidenceThreshold;
                    });
                }
                return false;
            });

            console.log("START DRAWING", result.objects)
            this.renderer.draw(result)
            console.log("DONE DRAWING", result.objects)

            for (let i = 0; i < result.objects.length; i++) {
                const object = result.objects[i];
                if (object.classes && object.classes.length > 0) {
                    for (let j = 0; j < object.classes.length; j++) {
                        const classObj = object.classes[j];
                        // if (classObj.confidence > this.confidenceThreshold) {
                        canvasContext.fillText(classObj.category + ": " + classObj.classLabel,
                            object.x+20,
                            object.y + 120 + (j * 40));
                        // }
                    }
                }
            }
        }
    }

    async handlePrompt(promptMsg) {
        
        this.prompt = promptMsg;
        console.log("handlePrompt:", promptMsg);

        const questions = promptMsg.split(",");
        
        const pop = {
            components: [{
                type: PopComponentType.INFERENCE,
                model: "eyepop.person:latest",
                categoryName: "person",
                confidenceThreshold: .9,

                forward: {
                    operator: {
                        type: ForwardOperatorType.CROP,
                    },
                    targets: [
                        {
                        type: PopComponentType.INFERENCE,
                        id: 2,
                        ability: 'eyepop.image-contents:latest',
                        params:{
                            prompts: [{
                                prompt: "Analyze the image provided and determine the categories of: " + 
                               questions.join(",") + 
                                ". Report the values of the categories as classLabels. If you are unable to provide a category with a value then set it's classLabel to null"                               
                            }],
                        }
                    }
                ]
                }
            }]
        }

        console.log("POP",pop)
        await this.endpoint.changePop(pop);
        
        return null;
    }



}

export default PersonVisualIntelligenceProcessor;
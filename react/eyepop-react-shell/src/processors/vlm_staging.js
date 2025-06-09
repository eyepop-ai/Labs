import Processor from './processor';
import { ContourType, EndpointState, EyePop, ForwardOperatorType, InferenceType, PopComponentType, TransientPopId } from "@eyepop.ai/eyepop";
import Render2d from '@eyepop.ai/eyepop-render-2d'

class VLMProcessor extends Processor {
    buffer = [];
    hasPrompt = false;
    promptPlaceholder = "Ask comma separated questions about the image. Is their a dog in the image?, What color is the dog?";
    confidenceThreshold = 0.4;
    prompt;

    constructor() {
        super();
    }

    async setCanvasContext(canvasContext, stream) {
        const api_key = process.env.NEXT_PUBLIC_VLM_API_KEY;

        this.endpoint = await EyePop.workerEndpoint({
            auth: {
                secretKey: api_key,
            },
            eyepopUrl: process.env.NEXT_PUBLIC_VLM_API_URL,
            stopJobs: false
        }).connect()

        await this.endpoint.changePop({
            components: [{
                        type: PopComponentType.INFERENCE,
                        id: 1,
                        ability: 'eyepop.vlm.preview:latest',
                    }
                ]
            });

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

            //example result:
            //{
            //     "seconds": 0,
            //     "source_height": 834,
            //     "source_id": "5146f435-4577-11f0-b6ea-0242ac110004",
            //     "source_width": 1145,
            //     "system_timestamp": 1749503923713696000,
            //     "texts": [
            //         {
            //             "id": 204,
            //             "text": "  The ceiling is white and there are lights on the ceiling.  The walls are white and there are pictures on the wall.  There are two men sitting at a desk.  One man is wearing glasses and the other is wearing a plaid shirt.  The man in the black shirt is giving a thumbs up."
            //         }
            //     ],
            //     "timestamp": 0
            // }

            if (result.texts && result.texts.length > 0) {
                const text = result.texts[0].text;
                console.log("Text:", text);
                // Draw text on canvas: centered black text on white background that takes up 80% horizontally and 20% vertically
                const canvas = canvasContext.canvas;
                const ctx = canvasContext;

                // Set font and alignment
                ctx.font = `${canvas.height * 0.02}px Arial`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";

                // Calculate text position and dimensions
                const textX = canvas.width / 2;
                const textY = canvas.height * 0.8;
                const textWidth = canvas.width * 0.8;
                const textHeight = canvas.height * 0.2;

                // Draw white background rectangle
                ctx.fillStyle = "white";
                ctx.fillRect(
                    textX - textWidth / 2,
                    textY - textHeight / 2,
                    textWidth,
                    textHeight
                );

                // Prepare to wrap text
                const maxTextWidth = textWidth * 0.95;
                const words = text.split(' ');
                let line = '';
                const lines = [];
                const lineHeight = canvas.height * 0.03;

                ctx.fillStyle = "black";

                for (let i = 0; i < words.length; i++) {
                    const testLine = line + words[i] + ' ';
                    const metrics = ctx.measureText(testLine);
                    const testWidth = metrics.width;
                    if (testWidth > maxTextWidth && line !== '') {
                        lines.push(line.trim());
                        line = words[i] + ' ';
                    } else {
                        line = testLine;
                    }
                }
                lines.push(line.trim());

                // Center the group of lines vertically
                const totalTextHeight = lines.length * lineHeight;
                let startY = textY - totalTextHeight / 2 + lineHeight / 2;

                for (let i = 0; i < lines.length; i++) {
                    ctx.fillText(lines[i], textX, startY + i * lineHeight);
                }
                    
               
            }

            
        }
    }

    async handlePrompt(promptMsg) {
        
        this.prompt = promptMsg;
        console.log("handlePrompt:", promptMsg);

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
                ...(promptMap[objects[0]] && promptMap[objects[0]].length > 0 ? {
                    forward: {
                        operator: {
                            type: ForwardOperatorType.CROP,
                        },
                        targets: [{
                            type: PopComponentType.INFERENCE,
                            ability: 'eyepop.image-contents-t4:latest',
                            params: {
                                prompts: [{
                                    prompt: "Analyze the image provided and determine the categories of: " + promptMap[objects[0]].join(',') + ". Report the values of the categories as classLabels. If you are unable to provide a category with a value then set it's classLabel to null",
                                }]
                            },
                        }]
                    }
                } : {})
            }]
        }



        // const pop = {
        //     components: [{
        //         "type": "inference",
        //         "ability": "eyepop.image-contents-t4:latest",
        //         "params": {
        //             "prompts": {
        //                 "prompt": "Analyze the image provided and determine the categories of: 'Shirt Color', 'Hair color'. Report the values of the categories as classLabels. If you are unable to provide a category with a value then set it's classLabel to null"
        //             }
        //         }
        //     }]
        // }

        // const pop2 = {
        //     components: [
        //         {
        //             type: PopComponentType.INFERENCE,
        //             ability: 'eyepop.image-contents-t4:latest',
        //             params: {
        //                 prompts: [
        //                     {
        //                         prompt: "Analyze the image provided and determine the categories of: What color is their hair?, What color is their shirt?. Report the values of the categories as classLabels. If you are unable to provide a category with a value then set it's classLabel to null"
        //                     }
        //                 ]
        //             }
        //         }
        //     ]
        // }

        // const pop3 = {
        //     "components": [
        //         {
        //             "type": "inference",
        //             "ability": "eyepop.image-contents-t4:latest",
        //             "params": {
        //                 "prompts": {
        //                     "prompt": "Analyze the image provided and determine the categories of: What color is their shirt?. Report the values of the categories as classLabels. If you are unable to provide a category with a value then set it's classLabel to null"
        //                 }
        //             }
        //         }
        //     ]
        // }

        console.log("POP",pop)
        //await this.endpoint.changePop(pop);
        return { objects, promptMap };


    }



}

export default VLMProcessor;
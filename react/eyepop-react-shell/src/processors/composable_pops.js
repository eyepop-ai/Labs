import { ContourType, EndpointState, EyePop, ForwardOperatorType, InferenceType, PopComponentType, TransientPopId } from "@eyepop.ai/eyepop";
import Render2d from '@eyepop.ai/eyepop-render-2d'
import { type } from "os";


export const ComposablePops = {
    
    MiniCargo: {
        components: [
            {
                type: PopComponentType.INFERENCE,
                categoryName: "minicargo",
                //model: 'customer.pickleball:0.0.1',
                modelUuid:'06812aeef64b7665800006bdbcc66fc5'
            }
        ],
    },
    PaddleStaging: {
        components: [
            {
                type: PopComponentType.INFERENCE,
                categoryName: "paddle_spine",
                //model: 'customer.pickleball:0.0.1',
                modelUuid:'0682f61cad9e703e80009d9c69ff208b'
                //modelUuid:'0682bb49f81f7a3780006c8a441b9a8d'
            }
        ],
    },

    Paddle: {
        components: [
            {
                type: PopComponentType.INFERENCE,
                categoryName: "paddle_spine",
                model: 'cg1-solutions.pickleball.paddle.spine:latest', 
            }
        ],
    },
    Person2D: {
        components: [
            {
                type: PopComponentType.INFERENCE,
                model: "eyepop.person:latest",
                categoryName: "person",
                //confidenceThreshold: 0.7,
                forward: {
                    operator: {
                        type: ForwardOperatorType.CROP,
                        crop: {
                            maxItems: 128
                        },
                    },
                    targets: [
                        {
                            type: PopComponentType.INFERENCE,
                            categoryName: "2d-body-points",
                            model: "eyepop.person.2d-body-points:latest",
                            confidenceThreshold: 0.25
                        },
                    ],
                },
            },
        ],
    },
    Person2DandBallandPaddle: {
        components: [
            {

                type: PopComponentType.INFERENCE,
                modelUuid: '068080d5b5da79d88000fe5676e26017',
                categoryName: 'ball'

            },
            {

                type: PopComponentType.INFERENCE,
                modelUuid: '067ab6bf9fa378748000d27827aacafb',
                categoryName: 'paddle_box'

            },
            {
                type: PopComponentType.INFERENCE,
                model: "eyepop.person:latest",
                categoryName: "person",
                //confidenceThreshold: 0.7,
                forward: {
                    operator: {
                        type: ForwardOperatorType.CROP,
                        crop: {
                            maxItems: 128
                        },
                    },
                    targets: [
                        {
                            type: PopComponentType.INFERENCE,
                            categoryName: "2d-body-points",
                            model: "eyepop.person.2d-body-points:latest",
                            confidenceThreshold: 0.25
                        },
                    ],
                },
            },
        ],
    },
    Person3DHands: {
        components: [
            {
                type: PopComponentType.INFERENCE,
                categoryName: "paddle_spine",
                model: 'cg1-solutions.pickleball.paddle.spine:latest',
            },
            {
            type: PopComponentType.INFERENCE,
            model: 'eyepop.person:latest',
            categoryName: 'person',
            forward: {
                operator: {
                    type: ForwardOperatorType.CROP,
                    crop: {
                        boxPadding: 0.25,
                        maxItems: 128,
                    }
                },
                targets: [{
                    type: PopComponentType.INFERENCE,
                    model: 'eyepop.person.palm:latest',
                    forward: {
                        operator: {
                            type: ForwardOperatorType.CROP,
                            crop: {
                                includeClasses: ['hand circumference'],
                                orientationTargetAngle: -90.0,
                            }
                        },
                        targets: [{
                            type: PopComponentType.INFERENCE,
                            model: 'eyepop.person.3d-hand-points:latest',
                            categoryName: '3d-hand-points'
                        }]
                    }
                }]
            }
        }]
    },
    SAM2: {
        components: [
            {
                type: PopComponentType.INFERENCE,
                model: "eyepop.sam2.encoder.tiny:latest",
                hidden: true,
                categoryName: "segmentation",
                forward: {
                    operator: {
                        type: ForwardOperatorType.FULL,
                    },
                    targets: [
                        {
                            type: PopComponentType.INFERENCE,
                            categoryName: "decoded-segmentation",
                            model: 'eyepop.sam2.decoder:latest',
                            forward: {
                                operator: {
                                    type: ForwardOperatorType.FULL,
                                },
                                targets: [
                                    {
                                        type: PopComponentType.CONTOUR_FINDER,
                                        model: 'eyepop.sam2.decoder:latest',
                                        contourType: ContourType.POLYGON,
                                        areaThreshold: 0.005
                                    },
                                ],
                            },
                        },
                    ],
                },
            },
        ],
    },
    PersonSAM2: {
        components: [
            {
                type: PopComponentType.INFERENCE,
                model: "eyepop.sam2.encoder.tiny:latest",
                hidden: true,
                categoryName: "segmentation",
                forward: {
                    operator: {
                        type: ForwardOperatorType.FULL,
                    },
                    targets: [
                        {
                            type: PopComponentType.INFERENCE,
                            model: 'eyepop.person:latest',
                            categoryName: "person",
                            forward: {
                                operator: {
                                    type: ForwardOperatorType.CROP,
                                },
                                targets: [
                                    {
                                        type: PopComponentType.INFERENCE,
                                        categoryName: "decoded-segmentation",
                                        model: 'eyepop.sam2.decoder:latest',
                                        forward: {
                                            operator: {
                                                type: ForwardOperatorType.FULL,
                                            },
                                            targets: [
                                                {
                                                    type: PopComponentType.CONTOUR_FINDER,
                                                    model: 'eyepop.sam2.decoder:latest',
                                                    contourType: ContourType.POLYGON,
                                                    areaThreshold: 0.005
                                                },
                                            ],
                                        },
                                    }
                                ],
                            },
                        },
                    ],
                },
            },
        ],
    },

};
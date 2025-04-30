import { ContourType, EndpointState, EyePop, ForwardOperatorType, InferenceType, PopComponentType, TransientPopId } from "@eyepop.ai/eyepop";
import Render2d from '@eyepop.ai/eyepop-render-2d'
import { type } from "os";


export const ComposablePops = {
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
    Person3DHands: {
        components: [{
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
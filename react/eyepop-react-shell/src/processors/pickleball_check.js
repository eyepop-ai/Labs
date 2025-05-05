import Processor from './processor';
import EyePop from '@eyepop.ai/eyepop';
import Render2d from '@eyepop.ai/eyepop-render-2d'
import { ComposablePops } from './composable_pops';

class PickleballCheckProcessor extends Processor {
    buffer = [];

    constructor() {
        super();
        // Additional initialization if needed
    }

    async setCanvasContext(canvasContext, stream) {
        const pop_uuid = process.env.NEXT_PUBLIC_PERSON_POSE_POP_UUID;
        const api_key = process.env.NEXT_PUBLIC_PERSON_POSE_POP_API_KEY;

        this.endpoint = await EyePop.workerEndpoint({
            // auth: { session: data.session },
            popId: pop_uuid,
            auth: {
                secretKey: api_key,
            },
            eyepopUrl: process.env.NEXT_PUBLIC_TEXT_AD_POP_API_URL,
            stopJobs: false
        }).connect()

        this.endpoint.changePop(ComposablePops.Person2DandBallandPaddle);

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

    async processVideo(video, canvasContext, name, roi) {

        console.log('Processing video:', video);

        const cachedData = localStorage.getItem(video.name);
        if (cachedData) {
            this.buffer = JSON.parse(cachedData);
            if (this.buffer.length > 0) {
                console.log("Using cached video data.");
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

        localStorage.setItem(video.name, JSON.stringify(this.buffer));
        console.log("Cached video data.");
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

            if (currentFrame.objects.length === 0) return
            const paddle = this.getPaddleAngleFromHand(currentFrame)
            console.log("Paddle angle:", paddle);

            // const stance = this.passFail_Stance(currentFrame)
            // console.log("Stance:", stance, currentFrame);

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

    getBiggestObjectInScene(prediction, filterLabel = null) {
        if (!prediction.objects || prediction.objects.length === 0) return null

        let filteredObjects = filterLabel
            ? prediction.objects.filter(obj => obj.classLabel === filterLabel)
            : prediction.objects

        if (filteredObjects.length === 0) return {
            ...prediction,
            objects: []
        }

        return {
            ...prediction,
            objects: [filteredObjects.reduce((largest, obj) => {
                const area = obj.width * obj.height
                const largestArea = largest.width * largest.height
                return area > largestArea ? obj : largest
            }, filteredObjects[0])]
        }
    }

    calculateBendAngle(a, b, c) {
        const vectorA = {
            x: a.x - b.x,
            y: a.y - b.y
        };
        const vectorB = {
            x: c.x - b.x,
            y: c.y - b.y
        };

        const dotProduct = vectorA.x * vectorB.x + vectorA.y * vectorB.y;
        const magnitudeA = Math.sqrt(vectorA.x ** 2 + vectorA.y ** 2);
        const magnitudeB = Math.sqrt(vectorB.x ** 2 + vectorB.y ** 2);

        const cosineAngle = dotProduct / (magnitudeA * magnitudeB);
        const angleRadians = Math.acos(Math.max(-1, Math.min(1, cosineAngle))); // Clamp to avoid NaN
        const angleDegrees = angleRadians * (180 / Math.PI);

        return angleDegrees;
    }

    calculateDistance(a, b) {
        return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
    }
    passFail_Stance(currentFrame) {
        // From: https://docs.google.com/document/d/1m3NUKiqkv97Uyq5YG23r9xskaLykdwTw/edit
        // The model should recognize and penalize the following incorrect stance mechanics:
        // 	•	Feet too close together or too wide apart.
        // 	•	Knees too straight (locked out).
        // 	•	Holding the paddle too low (below the waist).

        if (!currentFrame) return
        if (!currentFrame.objects || currentFrame.objects.length === 0) return

        const passedShoulderWidth = this.passFail_Stance_IsShoulderWidth(currentFrame)
        const passedKneesBent = this.passFail_Stance_IsKneesBent(currentFrame)
        const passedPaddleHigh = this.passFail_Stance_IsPaddleHigh(currentFrame)

        const passed = passedShoulderWidth && passedKneesBent && passedPaddleHigh

        console.log("Stance passed:", passed)
        console.log("Stance passed shoulder width:", passedShoulderWidth)
        console.log("Stance passed knees bent:", passedKneesBent)
        console.log("Stance passed paddle high:", passedPaddleHigh)

        return {
            passed,
            passedShoulderWidth,
            passedKneesBent,
            passedPaddleHigh
        }
    }

    passFail_Stance_IsShoulderWidth(currentFrame) {

        const minRatioOK = 0.5 //PLACEHOLDER NUMBER, TKXEL TO DEFINE BASED ON 90% of hero example
        const maxRatioOK = 1.5 //PLACEHOLDER NUMBER, TKXEL TO DEFINE BASED ON 90% of hero example

        const rightShoulder = currentFrame.objects[0].keyPoints[0].points.filter(kp => kp.classLabel === "right shoulder")?.[0]
        const leftShoulder = currentFrame.objects[0].keyPoints[0].points.filter(kp => kp.classLabel === "left shoulder")?.[0]

        const leftAnkle = currentFrame.objects[0].keyPoints[0].points.filter(kp => kp.classLabel === "left ankle")?.[0]
        const rightAnkle = currentFrame.objects[0].keyPoints[0].points.filter(kp => kp.classLabel === "right ankle")?.[0]

        const shoulderDistance = this.calculateDistance(leftShoulder, rightShoulder)
        const ankleDistance = this.calculateDistance(leftAnkle, rightAnkle)

        const ratio = ankleDistance / shoulderDistance

        console.log("Ratio:", ratio);

        if (ratio > minRatioOK && ratio < maxRatioOK) {
            return true
        }
        return false
    }

    passFail_Stance_IsKneesBent(currentFrame) {

        const minAngleOK = 160 //PLACEHOLDER NUMBER, TKXEL TO DEFINE BASED ON 90% of hero example
        const maxAngleOK = 175 //PLACEHOLDER NUMBER, TKXEL TO DEFINE BASED ON 90% of hero example

        const leftHip = currentFrame.objects[0].keyPoints[0].points.filter(kp => kp.classLabel === "left hip")?.[0]
        const leftKnee = currentFrame.objects[0].keyPoints[0].points.filter(kp => kp.classLabel === "left knee")?.[0]
        const leftAnkle = currentFrame.objects[0].keyPoints[0].points.filter(kp => kp.classLabel === "left ankle")?.[0]

        const rightHip = currentFrame.objects[0].keyPoints[0].points.filter(kp => kp.classLabel === "right hip")?.[0]
        const rightKnee = currentFrame.objects[0].keyPoints[0].points.filter(kp => kp.classLabel === "right knee")?.[0]
        const rightAnkle = currentFrame.objects[0].keyPoints[0].points.filter(kp => kp.classLabel === "right ankle")?.[0]

        const leftKneeAngle = this.calculateBendAngle(leftHip, leftKnee, leftAnkle)
        const rightKneeAngle = this.calculateBendAngle(rightHip, rightKnee, rightAnkle)

        if (leftKneeAngle > minAngleOK && leftKneeAngle < maxAngleOK &&
            rightKneeAngle > minAngleOK && rightKneeAngle < maxAngleOK) {
            return true
        }

        return false
    }

    passFail_Stance_IsPaddleHigh(currentFrame) {
        const minRatioOK = 0 //PLACEHOLDER NUMBER, TKXEL TO DEFINE BASED ON 90% of hero example
        const maxRatioOK = 1.05 //PLACEHOLDER NUMBER, TKXEL TO DEFINE BASED ON 90% of hero example
        
        const leftHip = currentFrame.objects[0].keyPoints[0].points.filter(kp => kp.classLabel === "left hip")?.[0]
        const rightHip = currentFrame.objects[0].keyPoints[0].points.filter(kp => kp.classLabel === "right hip")?.[0]

        //Replace this with paddle position
        const rightWrist = currentFrame.objects[0].keyPoints[0].points.filter(kp => kp.classLabel === "right wrist")?.[0]
        const paddleHeight = rightWrist.y

        const hipHeight = (leftHip.y + rightHip.y) / 2
        const paddleHeightRatio = paddleHeight / hipHeight

        console.log("Paddle height ratio:", paddleHeightRatio);

        if (paddleHeightRatio > minRatioOK && paddleHeightRatio < maxRatioOK) {
            return true
        }
        return false
    }

    getPaddleAngleFromHand(response) {
        try {
          const keypoints = response.objects?.[0]?.objects?.[0]?.objects?.[0]?.keyPoints?.[0]?.points;
      
          if (!keypoints || keypoints.length === 0) {
            throw new Error("No keypoints found.");
          }
      
          const wrist = keypoints.find(p => p.classLabel === "wrist");
          const middleTip = keypoints.find(p => p.classLabel === "middle finger tip");
      
          if (!wrist || !middleTip) {
            throw new Error("Required keypoints not found.");
          }
      
          const dx = middleTip.x - wrist.x;
          const dy = middleTip.y - wrist.y;
          const angleRad = Math.atan2(dy, dx);
          const angleDeg = (angleRad * 180) / Math.PI;
      
          return {
            angle: angleDeg,
            spine: {
              from: { x: wrist.x, y: wrist.y },
              to: { x: middleTip.x, y: middleTip.y }
            }
          };
        } catch (err) {
          console.error("Error extracting paddle angle:", err.message);
          return null;
        }
      }
}

export default PickleballCheckProcessor;
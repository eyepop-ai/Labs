import Processor from './processor';
import EyePop from '@eyepop.ai/eyepop';
import Render2d from '@eyepop.ai/eyepop-render-2d'
import { ComposablePops } from './composable_pops';


class PickleballCheckPaddleProcessor extends Processor {
    buffer = [];

    constructor() {
        super();
        // Additional initialization if needed
    }

    async setCanvasContext(canvasContext, stream) {
        const api_key = process.env.NEXT_PUBLIC_PADDLE_MODEL_API_KEY;

        this.endpoint = await EyePop.workerEndpoint({
            // auth: { session: data.session },
            //popId: pop_uuid,
            auth: {
                secretKey: api_key,
            },
            // eyepopUrl: process.env.NEXT_PUBLIC_PADDLE_MODEL_API_URL,
            stopJobs: false
        }).connect()

        // this.endpoint.changePop(ComposablePops.Paddle);
        this.endpoint.changePop(ComposablePops.Paddle);

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
            if (!result.objects || !result.objects.length > 0)
                return

            //filter by object.confidence > 0.5
            result.objects = result.objects.filter(obj => obj.confidence > 0.5)

            //EXAMPLE RESULT{
//     "category": "paddle_spine",
//     "classId": 0,
//     "classLabel": "paddle spine",
//     "confidence": 1,
//     "height": 61.29,
//     "id": 1,
//     "keyPoints": [
//         {
//             "category": "paddle_spine",
//             "id": 901,
//             "points": [
//                 {
//                     "id": 2,
//                     "visible": true,
//                     "x": 245.314,
//                     "y": 483.572
//                 },
//                 {
//                     "id": 3,
//                     "visible": true,
//                     "x": 245.871,
//                     "y": 422.281
//                 }
//             ]
//         }
//     ],
//     "orientation": 0,
//     "width": 0.556,
//     "x": 245.314,
//     "y": 422.281
// }
            //draw the paddle spline from the 2 keypoints in the result.object/keypoints[0].points
            for (let i = 0; i < result.objects.length; i++) {
                const paddle = result.objects[i].keyPoints[0].points
                const from = paddle[0]
                const to = paddle[1]
                canvasContext.beginPath();
                canvasContext.moveTo(from.x, from.y);
                canvasContext.lineTo(to.x, to.y);
                canvasContext.strokeStyle = 'red';
                canvasContext.lineWidth = 2;
                canvasContext.stroke();
                canvasContext.closePath();
                //add small white circle at the end of the spine
                canvasContext.beginPath();
                canvasContext.arc(to.x, to.y, 5, 0, 2 * Math.PI);
                canvasContext.fillStyle = 'white';
                canvasContext.fill();
                canvasContext.closePath();
                //add small white circle at the start of the spine
                canvasContext.beginPath();
                canvasContext.arc(from.x, from.y, 5, 0, 2 * Math.PI);
                canvasContext.fillStyle = 'white';
                canvasContext.fill();
                canvasContext.closePath();
            }

            //render all points in the result.object/keypoints[0].points
            // for (let i = 0; i < result.objects.length; i++) {
            //     const paddle = result.objects[i].keyPoints[0].points
            //     for (let j = 0; j < paddle.length; j++) {
            //         const points = paddle.map(p => ({ x: p.x, y: p.y }));
            //         if (points.length > 2) {
            //             canvasContext.beginPath();
            //             canvasContext.moveTo(points[0].x, points[0].y);
            //             for (let k = 1; k < points.length; k++) {
            //                 canvasContext.lineTo(points[k].x, points[k].y);
            //             }
            //             canvasContext.closePath();
            //             canvasContext.strokeStyle = 'blue';
            //             canvasContext.lineWidth = 2;
            //             canvasContext.stroke();
            //             canvasContext.fillStyle = 'rgba(0, 0, 255, 0.2)';
            //             canvasContext.fill();
            //         }
            //     }
            // }
            
                


            //this.renderer.draw(result)


        }
    }

    async processVideo(video, canvasContext, name, roi) {
        console.log('Processing video:', video);

        const cachedData = await this.loadCachedVideoResults(video.name);
        if (cachedData) {
            this.buffer = cachedData;
            if (this.buffer.length > 0) {
                console.log("Using cached video data from IndexedDB.");
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

        await this.cacheVideoResults(video.name, this.buffer);
        console.log("Cached video data in IndexedDB.");
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

            //draw the paddle angle from spine
            if (paddle) {
                const { angle, spine } = paddle;
                const { from, to } = spine;
                canvasContext.beginPath();
                canvasContext.moveTo(from.x, from.y);
                canvasContext.lineTo(to.x, to.y);
                canvasContext.strokeStyle = 'red';
                canvasContext.lineWidth = 2;
                canvasContext.stroke();
                canvasContext.closePath();

                //add small white circle at the end of the spine
                canvasContext.beginPath();
                canvasContext.arc(to.x, to.y, 5, 0, 2 * Math.PI);
                canvasContext.fillStyle = 'white';
                canvasContext.fill();

                canvasContext.closePath();
            }

            // const stance = this.passFail_Stance(currentFrame)
            // console.log("Stance:", stance, currentFrame);

            //this.renderer.draw(currentFrame)
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
          let angleDeg = (angleRad * 180) / Math.PI;

          const spineLength = Math.sqrt(dx * dx + dy * dy);
          const rotateDegrees = -125; // simplified rotation angle
          const rotateRadians = (rotateDegrees * Math.PI) / 180;
          const cos = Math.cos(rotateRadians);
          const sin = Math.sin(rotateRadians);

          // Apply rotation to the vector
          const rotatedDx = 100* (dx * cos - dy * sin) / spineLength;
          const rotatedDy = 100* (dx * sin + dy * cos) / spineLength;

          return {
            angle: angleDeg,
            spine: {
              from: { x: middleTip.x, y: middleTip.y },
              to: {
                x: middleTip.x - rotatedDx,
                y: middleTip.y - rotatedDy
              }
            }
          };
        } catch (err) {
          console.log("Error extracting paddle angle:", err.message);
          return null;
        }
      }
}

export default PickleballCheckPaddleProcessor;
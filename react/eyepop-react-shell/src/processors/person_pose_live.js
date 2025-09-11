import Processor from './processor';
import { ContourType, EndpointState, EyePop, ForwardOperatorType, InferenceType, PopComponentType, TransientPopId } from "@eyepop.ai/eyepop";
import Render2d from '@eyepop.ai/eyepop-render-2d'
import { ComposablePops } from './composable_pops';

class PersonPoseLiveProcessor extends Processor {
    buffer = [];

    // Snapshot (non-streaming) mode config
    fps = 10;
    intervalMs = 100;
    jpegQuality = 0.7;
    _timer = null;
    _sendLock = false;
    _videoEl = null;
    _captureCanvas = null;
    _captureCtx = null;

    constructor() {
        super();
        // Additional initialization if needed
    }

    async setCanvasContext(canvasContext, stream) {
        //const pop_uuid = process.env.NEXT_PUBLIC_PERSON_POSE_POP_UUID;
        //const api_key = process.env.NEXT_PUBLIC_PERSON_POSE_POP_API_KEY;
        const api_key = process.env.NEXT_PUBLIC_ANYTHING_POP_API_KEY;


        this.endpoint = await EyePop.workerEndpoint({
            // auth: { session: data.session },
            //popId: pop_uuid,
            auth: {
               secretKey: api_key,
            },
            //eyepopUrl: process.env.NEXT_PUBLIC_TEXT_AD_POP_API_URL,
            //stopJobs: false
            //isLocalMode: true
        }).connect()

        this.endpoint.changePop(ComposablePops.Person2D);

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
        await this.setStream(canvasContext, stream)
    }

    async setStream(canvasContext, stream) {
        // Tear down any prior loop
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }

        this.stream = stream;

        // Create an internal <video> element to read frames from the MediaStream
        const v = document.createElement("video");
        v.srcObject = stream;
        v.muted = true;
        v.playsInline = true;
        await v.play();
        this._videoEl = v;

        // Determine capture dimensions, default to 640-wide while preserving aspect
        const track = stream.getVideoTracks?.()[0];
        const settings = track?.getSettings?.() || {};
        const srcW = settings.width || v.videoWidth || 640;
        const srcH = settings.height || v.videoHeight || 360;
        const maxW = 640;
        const scale = Math.min(1, maxW / (srcW || maxW));
        const capW = Math.max(1, Math.round((srcW || maxW) * scale));
        const capH = Math.max(1, Math.round((srcH || Math.round(maxW * 9/16)) * scale));

        // Prepare capture canvas used for JPEG encoding
        const c = document.createElement("canvas");
        c.width = capW;
        c.height = capH;
        this._captureCanvas = c;
        this._captureCtx = c.getContext("2d", { alpha: false });

        // Results holder is updated per frame; draw happens in processFrame
        this.results = null; // not used in snapshot mode

        // Start snapshot loop at ~10 fps
        this._timer = setInterval(async () => {
            if (!this.endpoint || !this._captureCtx || !this._videoEl) return;
            if (this._sendLock) return; // drop if still in-flight

            try {
                this._sendLock = true;

                // Draw latest camera frame into the capture canvas
                this._captureCtx.drawImage(this._videoEl, 0, 0, capW, capH);

                // Encode to JPEG blob at configured quality
                const blob = await new Promise((resolve, reject) => {
                    this._captureCanvas.toBlob(
                        (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
                        "image/jpeg",
                        this.jpegQuality
                    );
                });

                // Send single image to EyePop and grab the first result
                const iterator = await this.endpoint.process({
                    file: blob,
                    mimeType: "image/jpeg",
                });

                for await (const result of iterator) {
                    // Resize the display canvas if source dims change
                    if (
                        canvasContext.canvas.width !== result.source_width ||
                        canvasContext.canvas.height !== result.source_height
                    ) {
                        canvasContext.canvas.width = result.source_width;
                        canvasContext.canvas.height = result.source_height;
                    }

                    this.lastPrediction = result;
                    break; // only need the first emission per still
                }
            } catch (e) {
                // swallow errors to keep loop alive
                // console.warn("snapshot loop error", e);
            } finally {
                this._sendLock = false;
            }
        }, this.intervalMs);
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

    async processFrame(canvasContext, videoRef, roi) {
        // console.log('Processing frame:', this.lastPrediction);
        if (!this.lastPrediction) return

        console.log('Drawing frame:', this.lastPrediction);

        this.renderer.draw(this.lastPrediction)
    }
   
    async destroy() {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
        if (this._videoEl) {
            try { this._videoEl.pause(); } catch {}
            this._videoEl.srcObject = null;
            this._videoEl = null;
        }
        if (this.stream) {
            try { this.stream.getTracks().forEach(t => t.stop()); } catch {}
            this.stream = null;
        }
        this._captureCanvas = null;
        this._captureCtx = null;
    }
}

export default PersonPoseLiveProcessor;
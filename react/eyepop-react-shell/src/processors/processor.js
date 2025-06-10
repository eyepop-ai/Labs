class Processor {

    endpoint = null
    renderer = null
    stream = null
    results = null
    lastPrediction = null

    constructor() {
        // Initialize settings or any other properties here
        this.settings = {};
    }

    processPhoto(photo, canvasContext, name, roi) {
        // Implement the logic to process a photo
        console.log('Processing photo:', photo);
        // Add your processing code here
    }

    processVideo(video, canvasContext, name, roi) {
        // Implement the logic to process a video
        console.log('Processing photo:', video);
        // Add your processing code here
    }

    async setCanvasContext(canvasContext, stream) {
        // Implement the logic to set the canvas context
        console.log('Setting canvas context:', canvasContext);
        // Add your canvas context setting code here
    }

    async setStream(canvasContext, stream) {
        this.stream = stream;
        const liveIngress = await this.endpoint.liveIngress(stream)

        this.results = await this.endpoint.process({
            ingressId: liveIngress.ingressId(),
        })

        for await (const result of this.results) {
            if (
                canvasContext.canvas.width !== result.source_width ||
                canvasContext.canvas.height !== result.source_height
            ) {
                canvasContext.canvas.width = result.source_width
                canvasContext.canvas.height = result.source_height
            }

            console.log("Stream result:", result)
            this.lastPrediction = result
        }

    }

    showSettings() {
        // Implement the logic to show settings
        console.log('Current settings:', this.settings);
        // Add your code to display settings here
    }

    applySettings(newSettings) {
        // Implement the logic to apply new settings
        this.settings = { ...this.settings, ...newSettings };
        console.log('Applied new settings:', this.settings);
        // Add your code to apply new settings here
    }

    processFrame(canvasContext, videoRef, roi) {
        // Implement the logic to process a frame
        // Add your frame processing code here
    }

    destroy() {
        if (!this.endpoint) return;

        console.log("Destroying processor");

        this.endpoint.disconnect();
    }

    LookForWord(predictionJson, word) {
        if (!predictionJson || !predictionJson.objects) return [];

        return predictionJson?.objects.filter(obj =>
            obj.texts && obj.texts.some(textObj =>
                textObj.text.toLowerCase() === word.toLowerCase()
            )
        );
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

    liftContour(context, contours, snapshot) {
        context.drawImage(
            snapshot, //videoRef.current,
            0,
            0,
            context.canvas.width,
            context.canvas.height
        )
        context.save()

        context.clearRect(0, 0, context.canvas.width, context.canvas.height);

        const xScale = 1
        const xOffset = 0
        const yScale = 1
        const yOffset = 0

        for (let j = 0; j < contours.length; j++) {
            const contour = contours[j]

            if (!contour.points)
                continue

            let p = contour.points[contour.points.length - 1];
            context.moveTo(p.x * xScale + xOffset, p.y * yScale + yOffset);
            for (let i = 0; i < contour.points.length; i++) {
                p = contour.points[i];
                context.lineTo(p.x * xScale + xOffset, p.y * yScale + yOffset);
            }
        }
        context.closePath();


        context.lineWidth = 10; // Set the desired thickness
        context.strokeStyle = "#FFFFFF";   // Set the desired color
        context.lineJoin = 'round';
        context.lineCap = 'round';
        context.stroke(); // Draw the outline'

        // Clip to the contour
        context.clip();
        context.drawImage(
            snapshot, //videoRef.current,
            0,
            0,
            context.canvas.width,
            context.canvas.height
        )

        context.restore();
    }

    liftContourBezier(context, contours, snapshot) {
        context.drawImage(
            snapshot, //videoRef.current,
            0,
            0,
            context.canvas.width,
            context.canvas.height
        )
        context.save()

        context.clearRect(0, 0, context.canvas.width, context.canvas.height);

        const xScale = 1
        const xOffset = 0
        const yScale = 1
        const yOffset = 0

        for (let j = 0; j < contours.length; j++) {
            const contour = contours[j]

            if (!contour.points)
                continue

            let p = contour.points[contour.points.length - 1];
            context.moveTo(p.x * xScale + xOffset, p.y * yScale + yOffset);
            for (let i = 1; i < contour.points.length - 2; i++) {
                const cp1x = (contour.points[i].x + contour.points[i + 1].x) / 2 * xScale + xOffset;
                const cp1y = (contour.points[i].y + contour.points[i + 1].y) / 2 * yScale + yOffset;
                const cp2x = (contour.points[i + 1].x + contour.points[i + 2].x) / 2 * xScale + xOffset;
                const cp2y = (contour.points[i + 1].y + contour.points[i + 2].y) / 2 * yScale + yOffset;
                context.bezierCurveTo(
                    cp1x, cp1y,
                    cp2x, cp2y,
                    contour.points[i + 2].x * xScale + xOffset,
                    contour.points[i + 2].y * yScale + yOffset
                );
            }
            // Connect the last two points
            const lastPoint = contour.points[contour.points.length - 1];
            context.lineTo(lastPoint.x * xScale + xOffset, lastPoint.y * yScale + yOffset);
        }
        context.closePath();


        context.lineWidth = 10; // Set the desired thickness
        context.strokeStyle = "#FFFFFF";   // Set the desired color
        context.lineJoin = 'round';
        context.lineCap = 'round';
        context.stroke(); // Draw the outline'

        // Clip to the contour
        context.clip();
        context.drawImage(
            snapshot, //videoRef.current,
            0,
            0,
            context.canvas.width,
            context.canvas.height
        )

        context.restore();
    }

    simplifyContours(contours, epsilon) {
        // Simplify each contour using the Douglas-Peucker algorithm
        return contours.map((contour) => {
            const simplifiedPoints = this.simplifyContourDouglasPeucker(contour.points, epsilon);
            return { ...contour, points: simplifiedPoints };
        });
    }

    simplifyContourDouglasPeucker(points, epsilon) {
        // Douglas-Peucker algorithm for contour simplification
        // https://en.wikipedia.org/wiki/Ramer–Douglas–Peucker_algorithm
        // higher episolon = more simplification

        if (!points || points.length < 3) return points; // A line cannot be simplified further

        const perpendicularDistance = (point, lineStart, lineEnd) => {
            const x0 = point.x, y0 = point.y;
            const x1 = lineStart.x, y1 = lineStart.y;
            const x2 = lineEnd.x, y2 = lineEnd.y;

            const numerator = Math.abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1);
            const denominator = Math.sqrt((y2 - y1) ** 2 + (x2 - x1) ** 2);

            console.log("perpendicularDistance", numerator, denominator, x0, y0, x1, y1, x2, y2);
            return numerator / denominator;
        };

        let maxDistance = 0, index = 0;

        for (let i = 1; i < points.length - 1; i++) {
            const distance = perpendicularDistance(points[i], points[0], points[points.length - 1]);

            console.log(`Distance for point ${i}:`, distance); // Debug distances

            if (distance > maxDistance) {
                maxDistance = distance;
                index = i;
            }
        }

        console.log("maxDistance", maxDistance)


        if (maxDistance > epsilon) {
            const leftSimplified = douglasPeucker(points.slice(0, index + 1), epsilon);
            const rightSimplified = douglasPeucker(points.slice(index), epsilon);
            return [...leftSimplified.slice(0, -1), ...rightSimplified];
        } else {
            return [points[0], points[points.length - 1]];
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

    // IndexedDB video cache helpers
    openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open("eyepop-video-cache", 1);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains("videos")) {
                    db.createObjectStore("videos", { keyPath: "name" });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async cacheVideoResults(name, data) {
        const db = await this.openDB();
        const tx = db.transaction("videos", "readwrite");
        const store = tx.objectStore("videos");
        store.put({ name, data });
        return tx.complete;
    }

    async loadCachedVideoResults(name) {
        const db = await this.openDB();
        const tx = db.transaction("videos", "readonly");
        const store = tx.objectStore("videos");
        return new Promise((resolve, reject) => {
            const request = store.get(name);
            request.onsuccess = () => resolve(request.result?.data || null);
            request.onerror = () => reject(request.error);
        });
    }

}

export default Processor;
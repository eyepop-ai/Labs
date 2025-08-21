#!/usr/bin/env node
const { ForwardOperatorType, PopComponentType, EyePop } = require("@eyepop.ai/eyepop");
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const fg = require('fast-glob');
const sharp = require('sharp');

// Lazy-load ESM execa inside CJS
let _execa = null;
async function execaCmd(cmd, args, opts) {
  if (!_execa) {
    const mod = await import('execa');
    _execa = mod.execa;
  }
  return _execa(cmd, args, opts);
}



let endpoint = null;
let api_key = process.env.EYEPOP_API_KEY;

async function ffprobeJson(input) {
    const { stdout } = await execaCmd('ffprobe', [
        '-v', 'error',
        '-print_format', 'json',
        '-show_streams',
        '-show_format',
        input
    ]);
    return JSON.parse(stdout);
}

// function groupBoxesByFrame(data, fps) {
//     // Accepts entries with {frame} or {time}. Returns Map<frameIndex, boxes[]>
//     const map = new Map();
//     for (const row of data) {
//         const frame = Number.isFinite(row.frame)
//             ? row.frame
//             : Math.round(row.time * fps);
//         if (!map.has(frame)) map.set(frame, []);
//         for (const b of row.boxes || []) map.get(frame).push(b);
//     }
//     return map;
// }

function makeSVGOverlay(width, height, graphics) {
    // graphics: array of primitives:
    //  - { shape: 'rect', x, y, w, h, label?, score?, color? }
    //  - { shape: 'line', x1, y1, x2, y2, label?, score?, color? }
    const safe = (v) => String(v ?? '');

    const elems = (graphics || []).map((g, i) => {
        const color = g.color || '#00ff00';
        const id = `g${i}`;
        if (g.shape === 'line') {
            const mx = (g.x1 + g.x2) / 2;
            const my = (g.y1 + g.y2) / 2;
            const label = g.label ? `${g.label}${Number.isFinite(g.score) ? ` (${(g.score * 100).toFixed(1)}%)` : ''}` : null;
            const pad = 4;
            const labelWidth = label ? Math.max(40, label.length * 7) : 0;
            const lx = Math.max(0, Math.min(width - labelWidth, mx - labelWidth / 2));
            const ly = Math.max(0, my - 12);
            return `
              <g id="${id}">
                <line x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" stroke="${safe(color)}" stroke-width="4" />
                ${label ? `
                  <rect x="${lx - pad}" y="${ly - 14}" width="${labelWidth + pad * 2}" height="18"
                    fill="${safe(color)}" fill-opacity="0.75"/>
                  <text x="${lx}" y="${ly}"
                    font-family="sans-serif" font-size="12" fill="#000">${safe(label)}</text>
                ` : ''}
              </g>
            `;
        } else {
            const rx = Math.max(0, g.x);
            const ry = Math.max(0, g.y);
            const rw = Math.max(0, g.w);
            const rh = Math.max(0, g.h);
            const label = g.label ? `${g.label}${Number.isFinite(g.score) ? ` (${(g.score * 100).toFixed(1)}%)` : ''}` : null;
            const textY = Math.max(12, ry + 12);
            return `
              <g id="${id}">
                <rect x="${rx}" y="${ry}" width="${rw}" height="${rh}"
                  fill="none" stroke="${safe(color)}" stroke-width="3"/>
                ${label ? `
                  <rect x="${rx}" y="${ry - 18 < 0 ? ry : ry - 18}" width="${Math.max(40, label.length * 7)}" height="18"
                    fill="${safe(color)}" fill-opacity="0.75"/>
                  <text x="${rx + 6}" y="${ry - 5 < 0 ? textY : ry - 5}"
                    font-family="sans-serif" font-size="12" fill="#000">${safe(label)}</text>
                ` : ''}
              </g>
            `;
        }
    }).join('\n');

    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
          ${elems}
        </svg>`
    );
}

function objectsToBoxes(row) {
    // Convert buffer entry with { objects: [...] } into an array of drawing primitives
    // Rects for most objects; a line for paddle_spine based on its keypoints.
    if (!row || !Array.isArray(row.objects)) return [];
    const colorByCategory = {
        ball: '#00ff00',
        paddle_spine: '#00ffff',
        person: '#ffcc00',
        pose: '#ff00ff'
    };
    const out = [];

    const pushRect = (o, fallbackColor) => {
        if (Number.isFinite(o.x) && Number.isFinite(o.y) && Number.isFinite(o.width) && Number.isFinite(o.height)) {
            out.push({
                shape: 'rect',
                x: o.x,
                y: o.y,
                w: o.width,
                h: o.height,
                label: o.classLabel || o.category || '',
                score: o.confidence,
                color: colorByCategory[(o.category || '').toLowerCase()] || fallbackColor || '#00ff00'
            });
        }
    };

    const pushPaddleLineIfAny = (o) => {
        // Look for keyPoints[0].points[0..1]
        if (!Array.isArray(o.keyPoints)) return false;
        for (const kp of o.keyPoints) {
            if (!Array.isArray(kp.points) || kp.points.length < 2) continue;
            const p1 = kp.points[0];
            const p2 = kp.points[1];
            if (p1 && p2 && Number.isFinite(p1.x) && Number.isFinite(p1.y) && Number.isFinite(p2.x) && Number.isFinite(p2.y)) {
                out.push({
                    shape: 'line',
                    x1: p1.x,
                    y1: p1.y,
                    x2: p2.x,
                    y2: p2.y,
                    label: o.classLabel || o.category || 'paddle',
                    score: o.confidence,
                    color: colorByCategory['paddle_spine'] || '#00ffff'
                });
                return true;
            }
        }
        return false;
    };

    for (const obj of row.objects) {
        const cat = (obj.category || '').toLowerCase();
        if (cat === 'paddle_spine') {
            // Prefer a line from keypoints; if missing, fall back to rect
            const drewLine = pushPaddleLineIfAny(obj);
            if (!drewLine) pushRect(obj, '#00ffff');
        } else {
            pushRect(obj);
        }

        // Draw immediate child objects too (e.g., pose nested under person)
        if (Array.isArray(obj.objects)) {
            for (const child of obj.objects) {
                const ccat = (child.category || '').toLowerCase();
                if (ccat === 'paddle_spine') {
                    const drewLine = pushPaddleLineIfAny(child);
                    if (!drewLine) pushRect(child, '#00ffff');
                } else {
                    pushRect(child);
                }
            }
        }
    }
    return out;
}

async function augmentVideoWithBoxes(inputFilePath, outputFilePath, buffer) {
    const inputVideo = inputFilePath
    const outputVideo = outputFilePath || inputFilePath.replace(/\.mp4$/, '_overlay.mp4');

    const meta = await ffprobeJson(inputVideo);
    const vstream = (meta.streams || []).find(s => s.codec_type === 'video');
    if (!vstream) throw new Error('No video stream found');
    const fpsStr = vstream.r_frame_rate || vstream.avg_frame_rate || '30/1';
    const [num, den] = fpsStr.split('/').map(Number);
    const fps = den ? num / den : Number(fpsStr);
    const width = vstream.width;
    const height = vstream.height;

    const hasAudio = !!(meta.streams || []).find(s => s.codec_type === 'audio');

    const tmpDir = path.join(process.cwd(), `.frames_${Date.now()}`);
    const rawDir = path.join(tmpDir, 'raw');
    const outDir = path.join(tmpDir, 'out');
    await fse.ensureDir(rawDir);
    await fse.ensureDir(outDir);

    // 1) Extract frames as PNG to preserve quality and avoid JPEG artifacts
    //    We keep original FPS.
    await execaCmd('ffmpeg', [
        '-y',
        '-i', inputVideo,
        '-vsync', '0',
        path.join(rawDir, '%08d.png')
    ], { stdio: 'inherit' });

    // 2) Load boxes
    const frameMap = buffer.reduce((map, row, idx) => {
        // Treat buffer index as the frame index when no explicit frame/time is provided
        const frame = Number.isFinite(row.frame)
            ? row.frame
            : Number.isFinite(row.time) ? Math.round(row.time * fps) : idx;
        if (!map.has(frame)) map.set(frame, []);
        const boxes = objectsToBoxes(row);
        for (const b of boxes) map.get(frame).push(b);
        return map;
    }, new Map());

    // 3) Draw overlays
    const frames = await fg(['*.png'], { cwd: rawDir, onlyFiles: true, absolute: true });
    frames.sort();
    let processed = 0;

    for (let i = 0; i < frames.length; i++) {
        const frameIdx = i + 1; // ffmpeg extracted frames start at 00000001
        const file = frames[i];
        const img = sharp(file);
        const overlayBoxes = frameMap.get(frameIdx - 1) || []; // assume JSON 0-based
        if (overlayBoxes.length === 0) {
            // pass through
            await img.toFile(path.join(outDir, path.basename(file)));
        } else {
            const svg = makeSVGOverlay(width, height, overlayBoxes);
            await img
                .composite([{ input: svg, left: 0, top: 0 }])
                .toFile(path.join(outDir, path.basename(file)));
        }
        if (++processed % 100 === 0) console.log(`Processed ${processed}/${frames.length} frames`);
    }

    // 4) Re-encode. Keep original fps. Try to copy audio if present.
    const outArgs = [
        '-y',
        '-framerate', String(fps),
        '-i', path.join(outDir, '%08d.png'),
        ...(hasAudio ? ['-i', inputVideo] : []),
        '-map', '0:v:0',
        ...(hasAudio ? ['-map', '1:a:0?'] : []),
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-crf', '18',
        '-preset', 'veryfast',
        ...(hasAudio ? ['-c:a', 'aac', '-b:a', '192k'] : []),
        '-shortest',
        outputVideo
    ];
    await execaCmd('ffmpeg', outArgs, { stdio: 'inherit' });

    console.log(`Done. Wrote ${outputVideo}`);
}

async function processVideo(inputFilePath, outputFilePath, popDefinition) {

    if (!endpoint) {
        endpoint = await EyePop.workerEndpoint({
            auth: {
                secretKey: api_key,
            }
        }).connect()
    }

    await endpoint.changePop(
        popDefinition
    );

    //check if inputFilePath+".json" exists    
    const inputJsonPath = inputFilePath + ".json";
    let buffer = [];

    if (fs.existsSync(inputJsonPath)) {
        console.log("Using cached data from:", inputJsonPath);
        const cachedData = JSON.parse(fs.readFileSync(inputJsonPath, 'utf8'));
        buffer = cachedData;
    } else {

        let results = await endpoint.process({
            path: inputFilePath
        })


        for await (let result of results) {
            buffer.push(result)
            console.log("Processing... ", result.timestamp/1000000000);

            if ('event' in result && result.event.type === 'error') {
                console.log("VIDEO RESULT", result.event.message)
            }
        }

        console.log("Processing complete. Buffer length:", buffer.length);
        // Save the buffer to a JSON file
        fs.writeFileSync(inputJsonPath, JSON.stringify(buffer, null, 2));
    }

    // take the output buffer and frame be frame augment the video
    await augmentVideoWithBoxes(inputFilePath, outputFilePath, buffer);
}

pop_definition = {
    components: [
        // Test with standard models first - comment out custom pickleball models for now
        {
            type: PopComponentType.INFERENCE,
            modelUuid: '068080d5b5da79d88000fe5676e26017',
            categoryName: 'ball',
            confidenceThreshold: 0.7,
        },
        {
            type: PopComponentType.INFERENCE,
            modelUuid: '0686ec711e6d7d5c80008d2b8ecca4b6',
            categoryName: 'paddle_spine',
            confidenceThreshold: 0.7,
        },
        {
            type: PopComponentType.INFERENCE,
            model: 'eyepop.person:latest',
            categoryName: 'person',
            confidenceThreshold: 0.9,
            forward: {
                operator: {
                    type: ForwardOperatorType.CROP,
                    crop: {
                        boxPadding: 0.5
                    }
                },
                targets: [{
                    type: PopComponentType.INFERENCE,
                    model: 'eyepop.person.pose:latest',
                    hidden: true,
                    forward: {
                        operator: {
                            type: ForwardOperatorType.CROP,
                            crop: {
                                boxPadding: 0.5,
                                orientationTargetAngle: -90.0,
                            }
                        },
                        targets: [{
                            type: PopComponentType.INFERENCE,
                            model: 'eyepop.person.3d-body-points.heavy:latest',
                            categoryName: '3d-body-points',
                            confidenceThreshold: 0.25
                        }]
                    }
                }]
            }

        }
    ],
}

console.log("Pop definition created:", pop_definition);

// grab the list of mp4 files from ./input_video

const inputDir = path.join(__dirname, 'input_video');
const outputDir = path.join(__dirname, 'output_video');

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

const files = fs.readdirSync(inputDir).filter(file => file.endsWith('.mp4'));
console.log("Found video files:", files);

for (const file of files) {
    const inputFilePath = path.join(inputDir, file);
    const outputFilePath = path.join(outputDir, file.replace('.mp4', '_output.mp4'));

    console.log(`Processing file: ${inputFilePath}`);

    processVideo(inputFilePath, outputFilePath, pop_definition);

    console.log(`Output will be saved to: ${outputFilePath}`);
}

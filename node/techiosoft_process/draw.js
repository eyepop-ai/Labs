const { ForwardOperatorType, PopComponentType, EyePop } = require("@eyepop.ai/eyepop");
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const fg = require('fast-glob');
const sharp = require('sharp');

const traceColors = [
  '#FF0000', '#FF4000', '#FF8000', '#FFBF00', '#FFFF00',
  '#BFFF00', '#80FF00', '#40FF00', '#00FF00', '#00FF40',
  '#00FF80', '#00FFBF', '#00FFFF', '#00BFFF', '#0080FF',
  '#0040FF', '#0000FF', '#4000FF', '#8000FF', '#BF00FF',
  '#FF00FF', '#FF00BF', '#FF0080', '#FF0040', '#FF0000',
  '#FF3300', '#FF6600', '#FF9900', '#FFCC00', '#FFFF00',
  '#CCFF00', '#99FF00', '#66FF00', '#33FF00', '#00FF00',
  '#00FF33', '#00FF66', '#00FF99', '#00FFCC', '#00FFFF',
  '#00CCFF', '#0099FF', '#0066FF', '#0033FF', '#0000FF',
  '#3300FF', '#6600FF', '#9900FF', '#CC00FF', '#FF00FF'
];

// Lazy-load ESM execa inside CJS
let _execa = null;
async function execaCmd(cmd, args, opts) {
  if (!_execa) {
    const mod = await import('execa');
    _execa = mod.execa;
  }
  return _execa(cmd, args, opts);
}


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
        } else if (g.shape === 'circle') {
            const r = Number.isFinite(g.r) ? g.r : 4;
            return `
              <g id="${id}">
                <circle cx="${g.cx}" cy="${g.cy}" r="${r}" fill="${safe(color)}" />
              </g>
            `;
        } else {
            const rx = Math.max(0, g.x);
            const ry = Math.max(0, g.y);
            const rw = Math.max(0, g.w);
            const rh = Math.max(0, g.h);
            const mainLabel = g.classLabel || g.category || '';
            const traceLabel = g.traceId !== undefined ? String(g.traceId) : null;
            const labelText = mainLabel ? `${mainLabel}${Number.isFinite(g.score) ? ` (${(g.score * 100).toFixed(1)}%)` : ''}` : null;
            const pad = 4;
            const labelWidth = Math.max(
              labelText ? labelText.length * 7 : 0,
              traceLabel ? traceLabel.length * 7 : 0,
              40
            );
            const rectHeight = traceLabel ? 18 + 24 + 4 : 18; // 18 for main label + 24 for traceId + 4 padding between

            // Compute y positions for text elements
            let labelY, traceY;
            if (labelText && traceLabel) {
              labelY = ry - rectHeight + 14;
              traceY = labelY + 18;
            } else if (labelText) {
              labelY = ry - rectHeight + 14;
              traceY = null;
            } else if (traceLabel) {
              // Center traceLabel vertically in rectHeight
              traceY = ry - rectHeight + (rectHeight / 2) + 8; // 8 is approx half font size
              labelY = null;
            } else {
              labelY = null;
              traceY = null;
            }

            return `
              <g id="${id}">
                <rect x="${rx}" y="${ry}" width="${rw}" height="${rh}"
                  fill="none" stroke="${safe(color)}" stroke-width="3"/>
                ${(labelText || traceLabel) ? `
                  <rect x="${rx}" y="${ry - rectHeight < 0 ? ry : ry - rectHeight}" width="${labelWidth + pad * 2}" height="${rectHeight}"
                    fill="${safe(color)}" fill-opacity="0.75"/>
                  ${labelText ? `
                    <text x="${rx + 6}" y="${labelY}"
                      font-family="sans-serif" font-size="12" fill="#000">${safe(labelText)}</text>
                  ` : ''}
                  ${traceLabel ? `
                    <text x="${rx + 6}" y="${traceY}"
                      font-family="sans-serif" font-size="24" fill="#000">${safe(traceLabel)}</text>
                  ` : ''}
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
        cash: '#00ff00',
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
                color: colorByCategory[(o.classLabel || '').toLowerCase()] || fallbackColor || '#00ff00',
                traceId: (o.traceId !== undefined && o.traceId !== null) ? o.traceId : null
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

    const pushPoseKeypointsIfAny = (o) => {
        if (!Array.isArray(o.keyPoints)) return false;
        let drewAny = false;
        for (const kp of o.keyPoints) {
            // Prefer the 3d-body-points set, but accept any with points[]
            if (!Array.isArray(kp.points)) continue;
            for (const pt of kp.points) {
                if (pt && pt.visible !== false && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
                    out.push({
                        shape: 'circle',
                        cx: pt.x,
                        cy: pt.y,
                        r: 4,
                        color: colorByCategory['pose'] || '#ff00ff'
                    });
                    drewAny = true;
                }
            }
        }
        return drewAny;
    };

    for (const obj of row.objects) {
        const cat = (obj.category || '').toLowerCase();
        if (cat === 'paddle_spine') {
            // Prefer a line from keypoints; if missing, fall back to rect
            const drewLine = pushPaddleLineIfAny(obj);
            if (!drewLine) pushRect(obj, '#00ffff');
        } else if (cat === 'pose') {
            // draw only keypoints for pose
            pushPoseKeypointsIfAny(obj);
        } else {
            pushRect(obj);
        }

        // Draw immediate child objects too (e.g., pose nested under person)
        if (Array.isArray(obj.objects)) {
            for (const child of obj.objects) {
                const ccat = (child.category || child.classLabel || '').toLowerCase();
                if (ccat === 'paddle_spine') {
                    const drewLine = pushPaddleLineIfAny(child);
                    if (!drewLine) pushRect(child, '#00ffff');
                } else if (ccat === 'pose') {
                    // Do NOT draw a rect for pose; draw its keypoints instead
                    pushPoseKeypointsIfAny(child);
                } else {
                    pushRect(child);
                }
            }
        }
    }
    return out;
}

const traceHistory = new Map();

async function augmentVideoWithBoxes(inputFilePath, outputFilePath, buffer) {
    const inputVideo = inputFilePath
    const outputVideo = outputFilePath || inputFilePath.replace(/\.mp4$/, '_overlay.mp4');

    if (fs.existsSync(outputVideo)) {
        console.log(`Output file ${outputVideo} already exists. Skipping.`);
        return;
    }

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

        // Update traceHistory with current frame's overlayBoxes
        for (const box of overlayBoxes) {
            if (box.traceId !== null && box.traceId !== undefined) {
                const traceId = box.traceId;
                const cx = box.x + (box.w ? box.w / 2 : 0);
                const cy = box.y + (box.h ? box.h / 2 : 0);
                const color = box.color || '#00ff00';
                if (!traceHistory.has(traceId)) {
                    traceHistory.set(traceId, []);
                }
                const history = traceHistory.get(traceId);
                history.push({ x: cx, y: cy, color });
                if (history.length > 50) {
                    history.shift();
                }
            }
        }

        // Generate line objects from traceHistory and add to overlayBoxes
        for (const [traceId, points] of traceHistory.entries()) {
            if (points.length >= 2) {
                for (let j = 1; j < points.length; j++) {
                    const p1 = points[j - 1];
                    const p2 = points[j];
                    overlayBoxes.push({
                        shape: 'line',
                        x1: p1.x,
                        y1: p1.y,
                        x2: p2.x,
                        y2: p2.y,
                        color: traceColors[traceId % traceColors.length],
                        label: null,
                        score: null
                    });
                }
            }
        }

        // Read actual frame dimensions (accounts for rotation/orientation that may differ from stream width/height)
        const metaPng = await img.metadata();
        const frameW = metaPng.width;
        const frameH = metaPng.height;

        if (overlayBoxes.length === 0) {
          // pass through
          await img.toFile(path.join(outDir, path.basename(file)));
        } else {
          const svg = makeSVGOverlay(frameW, frameH, overlayBoxes);
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


module.exports = { augmentVideoWithBoxes };
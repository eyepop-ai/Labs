# Pickleball Video Processing Demo

This project demonstrates how to use [EyePop.ai](https://www.eyepop.ai/) to process pickleball videos.  
It detects objects (ball, paddle, and people with 3D pose) and augments the video with drawn overlays.

---

## Features
- Runs inference with EyePop.ai models:
  - Ball detection
  - Paddle spine detection
  - Person detection with 3D body points
- Caches inference results to JSON to avoid re-processing
- Augments videos frame by frame with bounding boxes and keypoints
- Processes all `.mp4` files in the `input_video` directory and saves results to `output_video`

---

## Requirements
- Node.js v18+
- An [EyePop.ai API key](https://www.eyepop.ai/)  
  (export it as `EYEPOP_API_KEY` in your environment)

---

## Installation
Clone this repo and install dependencies:

```bash
npm install
```

---

## Usage
1. Place input `.mp4` files in the `input_video/` folder.  
2. Run the processor:

   ```
   node index.js
   ```

3. Processed videos will be saved to `output_video/` with `_output.mp4` appended.  
4. Intermediate detection results are cached as `<video>.json` files next to the inputs.

---

## File Structure

```
.
├── index.js        # Main script for running inference + orchestration
├── draw.js         # Augmentation code for drawing boxes/keypoints
├── input_video/    # Folder to place source mp4 files
├── output_video/   # Folder where augmented videos will be saved
└── README.md
```

---

## Notes
- If `video.mp4.json` already exists in `input_video`, it will be reused instead of re-running inference.  
- Update the `pop_definition` in `index.js` to change models or categories.  
- Augmentation behavior (e.g., how detections are drawn) is controlled in `draw.js`.
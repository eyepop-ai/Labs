

# Image Quality Scoring with BRISQUE

This example demonstrates how to evaluate the perceptual quality of images using the BRISQUE model from OpenCV. It scans all folders inside the `./inputs` directory and scores each image using BRISQUE, which is a no-reference quality assessment algorithm.

## Setup

Install dependencies to get started with BRISQUE scoring, a metric that helps you assess the visual quality of user-submitted images without needing a reference image:

```bash
pip install opencv-contrib-python numpy
```

## How It Works

- At runtime, the script checks for the required BRISQUE model files.
- If they are not found locally, it downloads them from the OpenCV GitHub repository and saves them in a `./models` directory.
- The script then scans each subdirectory of `./inputs` for image files and computes a BRISQUE score for each image.
- The lower the score, the better the perceptual quality (e.g., less blurry or noisy).

## Running the Script

```bash
python main.py
```

## File Structure

```
.
├── main.py
├── models/
│   ├── brisque_model_live.yml
│   └── brisque_range_live.yml
└── inputs/
    ├── folder1/
    │   ├── image1.jpg
    │   └── ...
    └── folder2/
        └── ...
```

## Output

The script will print output to the console like:

```
folder1/image1.jpg - BRISQUE Score: 18.45
folder2/image2.png - BRISQUE Score: 32.71
```

Use these scores to identify images with poor perceptual quality for filtering or further processing.

## Interpreting BRISQUE Scores for User-Generated Content

The BRISQUE (Blind/Referenceless Image Spatial Quality Evaluator) score is useful for flagging low-quality images in user-generated content pipelines. A lower score indicates a higher-quality image (i.e., sharper, less noisy), while higher scores suggest blurriness, compression artifacts, or poor lighting.

In practice:
- Scores **below 20** are typically high quality.
- Scores **20–40** are acceptable but may show mild artifacts.
- Scores **above 40** often indicate issues such as blur, poor lighting, or low resolution.

You can use these thresholds to automate filtering, flag questionable uploads, or provide real-time feedback to users submitting images.
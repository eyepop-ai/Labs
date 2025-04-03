# EyePop Image Sorter

This is a simple Python tool that uses the [EyePop SDK](https://www.eyepop.ai) to process images in a folder and sort them based on whether a specified object is detected with sufficient confidence.

## 🔍 What It Does

- Scans all image files in the `./input` directory.
- Uses EyePop to detect objects in each image.
- Caches results in `./output/json/<filename>.json` to avoid redundant processing.
- Copies each image to:
  - `./output/has_object/` if the specified object is found above a confidence threshold.
  - `./output/no_object/` otherwise.

## 📁 Folder Structure

```
project/
├── input/                # Place your images here
├── output/
│   ├── has_object/       # Images with the target object
│   ├── no_object/        # Images without the target object
│   └── json/             # Cached prediction results (as JSON)
├── sort_images.py        # Main script
└── env.py                # Stores your EyePop credentials (see below)
```

## 🔧 Setup

1. **Install dependencies**
   ```bash
   pip install eyepop pillow
   ```

2. **Add EyePop credentials**

   Create a file called `env.py` in the same folder with your credentials:

   ```python
   EYEPOP_POP_ID = "your-pop-id"
   EYEPOP_SECRET_KEY = "your-secret-key"
   ```

   > Alternatively, you can switch to `os.environ.get()` and set env variables directly if preferred.

3. **Add images to the `input/` folder**

## ▶️ Running the Script

Run the script using Python 3:

```bash
python sort_images.py
```

The script will:
- Skip images that have already been processed (based on existing `.json` files).
- Use the EyePop model to predict object presence.
- Automatically categorize and copy images to the appropriate output folders.

## 🛠️ Configuration

In the script, you can modify:

```python
object_label = "eye glasses"           # The class label you're interested in
confidence_threshold = 0.75            # Minimum confidence required to consider the object present
```

## 🧠 Notes

- Supported image formats: `.jpg`, `.jpeg`, `.png`, `.bmp`, `.gif`, `.tiff`, `.webp`
- All predictions are cached to speed up repeated runs
- Uses the EyePop synchronous worker endpoint under the hood

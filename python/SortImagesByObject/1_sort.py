# flake8: noqa
# Example: Use EyePop SDK to detect objects (e.g., "eye glasses") in images
from eyepop import EyePopSdk
import json
import shutil
from pathlib import Path
import env  # Ensure this contains EYEPOP_POP_ID and EYEPOP_SECRET_KEY

# Load EyePop credentials
POP_ID = env.EYEPOP_POP_ID
SECRET_KEY = env.EYEPOP_SECRET_KEY

# Object detection configuration
OBJECT_LABEL = "eye glasses"
CONFIDENCE_THRESHOLD = 0.75

# Define input/output directories
input_dir = Path("./input")
output_dir = Path("./output")
output_dirs = {
    "json": output_dir / "json",
    "has_object": output_dir / "has_object",
    "no_object": output_dir / "no_object"
}

# Create required output directories if they don't exist
for path in output_dirs.values():
    path.mkdir(parents=True, exist_ok=True)

# Supported image formats
image_extensions = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".webp"}

# Start EyePop SDK session
with EyePopSdk.workerEndpoint(pop_id=POP_ID, secret_key=SECRET_KEY) as endpoint:

    def process_with_eyepop(filename: Path):
        """Run the EyePop prediction on the given image file."""
        result = endpoint.upload(str(filename)).predict()
        print(json.dumps(result, indent=2))
        return result

    # Collect all valid image files in the input directory
    image_files = [f for f in input_dir.iterdir() if f.suffix.lower() in image_extensions]

    for image_path in image_files:
        base_filename = image_path.name
        json_path = output_dirs["json"] / f"{base_filename}.json"

        print(f"Processing {base_filename}...")

        # Run EyePop prediction or load cached result
        if json_path.exists():
            with open(json_path, "r") as f:
                result = json.load(f)
        else:
            result = process_with_eyepop(image_path)
            with open(json_path, "w") as f:
                json.dump(result, f, indent=2)

        # Determine if target object is present
        objects = result.get("objects", [])
        has_object = any(
            obj.get("classLabel") == OBJECT_LABEL and obj.get("confidence", 0) > CONFIDENCE_THRESHOLD
            for obj in objects if isinstance(obj, dict)
        )

        # Copy image to appropriate output directory
        target_dir = output_dirs["has_object"] if has_object else output_dirs["no_object"]
        shutil.copy(image_path, target_dir / base_filename)
        print(f"Copied to: {target_dir.name}")
# flake8: noqa
# This is a simple example of how to use the EyePop SDK 
# to detect text in an image
from eyepop import EyePopSdk

# For pretty printing
import json

# For loading environment variables
import env

# File system operations
import shutil
from pathlib import Path

POP_ID = env.EYEPOP_POP_ID
SECRET_KEY = env.EYEPOP_SECRET_KEY

with EyePopSdk.workerEndpoint(
    pop_id=POP_ID,
    secret_key=SECRET_KEY
) as endpoint:

    print(endpoint)

    # Stub for EyePop processing function
    def processWithEyePop(filename):
        result = endpoint.upload(str(filename)).predict()
        print(json.dumps(result, indent=4))
        return result


    object_label = "eye glasses"  # The object label to check for
    confidence_threshold = 0.75  # Confidence threshold for object detection

    input_dir = Path("./input")
    output_dir = Path("./output")
    output_dir_has_object = Path("./output/has_object")
    output_dir_no_object = Path("./output/no_object")
    output_dir_json = Path("./output/json")

    output_dir.mkdir(exist_ok=True)
    output_dir_has_object.mkdir(exist_ok=True)
    output_dir_no_object.mkdir(exist_ok=True)
    output_dir_json.mkdir(exist_ok=True)

    # Collect all image files in the input directory
    image_extensions = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".webp"}
    image_files = [f for f in input_dir.iterdir() if f.suffix.lower() in image_extensions]

    for image_path in image_files:
        base_filename = image_path.name
        json_path = output_dir_json / f"{base_filename}.json"
        
        result = None
        has_object = False

        print(f"Processing {base_filename}...")

        if not json_path.exists():
            # Process and save result
            result = processWithEyePop(str(image_path))
            with open(json_path, "w") as f:
                json.dump(result, f, indent=2)
        else:
            # Load existing result from JSON file
            with open(json_path, "r") as f:
                result = json.load(f)

        objects = result.get("objects", [])
        if isinstance(objects, list):
            has_object = any(
                obj.get("classLabel") == object_label and obj.get("confidence", 0) > confidence_threshold
                for obj in objects
            )

        if has_object:
            # Copy image to output directory for images with the specified object
            shutil.copy(image_path, output_dir_has_object / base_filename)
            print(f"Copied {base_filename} to has_object directory.")
        else:
            # Copy image to output directory for images without the specified object
            shutil.copy(image_path, output_dir_no_object / base_filename)
            print(f"Copied {base_filename} to no_object directory.")
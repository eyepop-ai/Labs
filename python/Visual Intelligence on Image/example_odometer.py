from eyepop import EyePopSdk
from eyepop.worker.worker_types import Pop, InferenceComponent, ComponentParams
import json
import env  # Ensure this contains EYEPOP_SECRET_KEY 
from typing import Any  # Make sure this is imported


secret_key = env.EYEPOP_SECRET_KEY
import os
import re
input_dir = './images'
image_files = [f for f in os.listdir(input_dir) if re.match(r'^odometer.*\.(jpg|jpeg|png)$', f, re.IGNORECASE)]
objectOfInterest = 'odometer'
questionList = (
    "Odometer units. (km/mph - default to mph), "
    "Odometer reading. (number), "
)

with EyePopSdk.workerEndpoint(secret_key=secret_key) as endpoint:
    for image_file in image_files:
        full_path = os.path.join(input_dir, image_file)
        prompt = f"Analyze the image of {objectOfInterest} provided and determine the categories of: " + questionList + "If you are unable to provide a category with a value then set its classLabel to null"

        endpoint.set_pop(
            Pop(components=[
                InferenceComponent(
                    id=1,
                    ability='eyepop.image-contents:latest',
                    params={"prompts": [
                                {
                                    "prompt": prompt
                                }
                            ] }
                )
            ])
        )

        result = endpoint.upload(full_path).predict()
        # print(json.dumps(result, indent=4))
        odometer_reading = None
        units = None
        for item in result.get("classes", []):
            category = item.get("category", "").lower()
            value = item.get("classLabel")
            if "odometer reading" in category:
                odometer_reading = value
            elif "units" in category or "odometer units" in category:
                units = value
        print(f"{image_file}: odometer_reading={odometer_reading}, units={units}")
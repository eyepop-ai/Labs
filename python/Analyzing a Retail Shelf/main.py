# This is a simple example of how to use the EyePop SDK
# to detect text in an image
from eyepop import EyePopSdk
from eyepop.worker.worker_types import Pop, InferenceComponent, ComponentParams, PopComponentType,ForwardOperatorType

# For pretty printing
import json

# For loading environment variables
from dotenv import load_dotenv
import os

from PIL import Image
import glob
import matplotlib.pyplot as plt

load_dotenv()
SECRET_KEY = os.getenv("EYEPOP_API_KEY")

print(f"Using secret key: {SECRET_KEY}")

image_extensions = ('*.jpg', '*.jpeg', '*.gif', '*.webp')
image_files = []
for ext in image_extensions:
    image_files.extend(glob.glob(f'./images/{ext}'))

print(f"Found images: {image_files}")

with EyePopSdk.workerEndpoint(
    secret_key=SECRET_KEY
) as endpoint:
    
    questionList = (
        "Name of product. (e.g. Coca Cola, Pepsi, etc.)"
        "Size of product. (e.g. 500ml, 1L, etc.)"
        "Estimate Price of product in USD. (e.g. 1.99, 2.49, etc.)"
    )
    prompt = f"Analyze the image of bottle provided and determine the categories of: " + questionList + "If you are unable to provide a category with a value then set its classLabel to null"

    pop_definition={
        'components': [{
            'type': PopComponentType.INFERENCE,
            'ability': 'eyepop.common-objects:latest',
            'forward': {
                'operator': {
                    'type': ForwardOperatorType.CROP,
                },
                'targets': [{
                    'type': PopComponentType.INFERENCE,
                    'ability': 'eyepop.image-contents:latest',
                    'params': {
                        'prompts': [{
                            'prompt': prompt
                        }]
                    }
                }]
            }

        }]
    }

    endpoint.set_pop(Pop.model_validate(pop_definition))
    result = endpoint.upload(image_files[0]).predict()

    print(json.dumps(result, indent=4))
    filtered_objects = [obj for obj in result["objects"] if obj["confidence"] > 0.0]
    filtered_objects = [obj for obj in filtered_objects if obj["classLabel"] == "bottle"]
    filtered_result = {**result, "objects": filtered_objects}

    with Image.open(image_files[0]) as image:
        plt.imshow(image)

    plot = EyePopSdk.plot(plt.gca())
    plot.prediction(filtered_result)

    plt.show()

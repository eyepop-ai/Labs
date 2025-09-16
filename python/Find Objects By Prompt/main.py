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
    
    pop_definition = Pop(components=[
            InferenceComponent(
                id=1,
                ability='eyepop.localize-objects:latest',
                params={'prompt': 'chair'}
            )
        ])
    print(f"Using pop definition: {pop_definition.model_dump_json()}")
  
    endpoint.set_pop(pop_definition)

    #for each image, upload and predict
    for image_file in image_files:
        result = endpoint.upload(image_file).predict()


        print(json.dumps(result, indent=4))

        filtered_objects = []
        if "objects" in result:
            filtered_objects = [obj for obj in result["objects"] if obj["confidence"] > 0.4]
        
        filtered_result = {**result, "objects": filtered_objects}

        # Save to output file
        with Image.open(image_file) as image:
            plt.imshow(image)

        # change all filtered_result.objects[x].classLabel to classLabel + " " + str(confidence)
        for obj in filtered_result.get("objects", []):
            obj["classLabel"] = f"{obj['classLabel']} {obj['confidence']:.2f}"  

        plot = EyePopSdk.plot(plt.gca())
        plot.prediction(filtered_result)

        # plt.show()
        
        output_path = f"./output/{os.path.basename(image_file).split('.')[0]}_output.png"
        plt.savefig(output_path)
        print(f"Saved output to {output_path}")
        # exit()
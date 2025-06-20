from eyepop import EyePopSdk
from eyepop.worker.worker_types import Pop, InferenceComponent, ComponentParams
import json
import env  # Ensure this contains EYEPOP_SECRET_KEY 

example_image_path = './images/example1.jpg'
objectOfInterest = 'vehicle'
questionList = (
    "Is there damage to the vehicle? (Yes/No), "
    "Short description of damage to vehicle (if any), "
    "What part of the car can you see clearly? (Front Driver side/Front Passenger side/Rear Driver side/Rear Passenger side/Top/Undercarriage/Front head on/Back head on). "
    "Report the values of the categories as classLabels. "
)

with EyePopSdk.workerEndpoint(secret_key= env.EYEPOP_SECRET_KEY) as endpoint:
    prompt = f"Analyze the image of {objectOfInterest} provided and determine the categories of: " + questionList + "If you are unable to provide a category with a value then set its classLabel to null"

    print (f"Using prompt: {prompt}")

    endpoint.set_pop(
       Pop(components=[
            InferenceComponent(
                id=1,
                ability='eyepop.image-contents:latest',
                params=ComponentParams(
                    componentId=1,
                    values={
                        "prompts": [
                            {
                                "prompt": prompt
                            }
                        ]
                    }
                ).model_dump()
            )
        ])
    )

    result = endpoint.upload(example_image_path).predict()
    print(json.dumps(result, indent=4))
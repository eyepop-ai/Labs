import asyncio
import logging
import time
from pathlib import Path

from eyepop import EyePopSdk
from eyepop import Job
from eyepop.worker.worker_types import Pop, InferenceComponent, ContourFinderComponent, ContourType, CropForward, FullForward, ComponentParams

source_path = Path(__file__).resolve()
source_dir = source_path.parent
example_url_1 = '<RTSP_STREAM_URL_1>'  # Replace with your RTSP stream URL
EYEPOP_SECRET_KEY= '<Your_EyePop_Secret_Key>'  # Replace with your EyePop secret key

logging.basicConfig(level=logging.INFO)
logging.getLogger('eyepop').setLevel(level=logging.DEBUG)

async def async_load_from_rtsp(url: str):
    async def on_ready(job: Job):
        print('async_load_from_rtsp on_ready')        

    async with EyePopSdk.workerEndpoint(secret_key=EYEPOP_SECRET_KEY,is_async=True) as endpoint:
        await endpoint.set_pop(Pop(components=[
                InferenceComponent(
                    model='eyepop.person:latest',
                    categoryName="person"
                )
            ])
        )

        job = await endpoint.load_from(url)
        await on_ready(job)
        while result := await job.predict():
            print(result)

t1 = time.time()
asyncio.run(async_load_from_rtsp(example_url_1))
t2 = time.time()
print("1x video async: ", t2 - t1)
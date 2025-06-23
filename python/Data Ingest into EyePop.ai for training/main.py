"""
EyePop.ai Data Ingestion Demo Script
This Python script demonstrates how to ingest a single labeled image into an EyePop.ai dataset for training.
It performs the following steps:
1. Reads a sample image
2. Authenticates with EyePop.ai API
3. Uploads the image as an asset
4. Waits for the asset to be accepted
5. Adds ground truth labels
6. Confirms upload by pulling the asset details

Usage:
  python main.py <accountUUID> <datasetUUID>
"""

import os
import sys
import time
import asyncio
from PIL import Image
from eyepop import EyePopSdk
from eyepop.data.data_endpoint import DataEndpoint
from eyepop.data.data_jobs import DataJob
from eyepop.data.data_types import DatasetCreate, AssetImport, \
    AutoAnnotateParams, Dataset, Asset, ChangeEvent, ChangeType, DatasetUpdate, UserReview, \
    Model, ModelCreate, ModelStatus, Prediction

# ------------------ Config ------------------

# Hardcoded sample image path (change as needed)
SAMPLE_IMAGE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), './input', 'sample.jpeg')

# ------------------ Authentication ------------------

def get_api_key():
    api_key = os.getenv('EYEPOP_API_KEY')
    if not api_key:
        print("Error: Please set the EYEPOP_API_KEY environment variable.")
        sys.exit(1)
    return api_key

# ------------------ Utility Functions ------------------

def get_image_dimensions(image_path):
    with Image.open(image_path) as img:
        return img.width, img.height

# ------------------ Ground Truth Construction ------------------

def build_ground_truth(width, height):
    # Construct a Prediction object as ground truth
    # Here, we use a single object with minimal required fields as an example.
    obj = {
        "id": 1,
        "confidence": 1.0,
        "classLabel": "example",
        "category": "example",
        "traceId": None,
        "x": 325.47,
        "y": 219.73,
        "width": 316.0,
        "height": 251.0,
        "orientation": 0,
        "outline": None,
        "contours": None,
        "mask": None,
        "objects": None,
        "classes": None,
        "texts": None,
        "meshs": None,
        "keyPoints": None
    }
    prediction = Prediction(
        source_width=width,
        source_height=height,
        objects=[obj]
    )
    return prediction

# ------------------ Main Process ------------------

async def main():
    if len(sys.argv) < 3:
        print("Usage: python main.py <accountUUID> <datasetUUID>")
        sys.exit(1)

    account_uuid = sys.argv[1]
    dataset_uuid = sys.argv[2]
    dataset_version = None  # Placeholder for dataset version if needed

    api_key = get_api_key()

    # Initialize EyePopSdk and get data endpoint asynchronously
    async with EyePopSdk.dataEndpoint(
        secret_key=api_key,
        account_id=account_uuid,
        is_async=True, 
        disable_ws=False) as endpoint:
        
        if not os.path.isfile(SAMPLE_IMAGE_PATH):
            print(f"Error: Sample image file not found at {SAMPLE_IMAGE_PATH}")
            sys.exit(1)

        print(f"Reading image from {SAMPLE_IMAGE_PATH}...")
        width, height = get_image_dimensions(SAMPLE_IMAGE_PATH)
        file_name = os.path.basename(SAMPLE_IMAGE_PATH)

        try:
            print("Uploading asset...")
            # Open file in binary mode and upload using upload_asset_job
            with open(SAMPLE_IMAGE_PATH, "rb") as f:
                job = await endpoint.upload_asset_job(f, mime_type="image/jpeg", dataset_uuid=dataset_uuid, external_id=file_name)
                upload_result = await job.result()

            asset_uuid = getattr(upload_result, 'uuid', None) or getattr(upload_result, 'id', None)  # fallback keys

            if not asset_uuid:
                raise Exception("Upload response missing asset UUID")

            print(f"Asset uploaded. UUID: {asset_uuid}")

            # Wait for asset to be accepted
            print("Waiting for asset to be accepted...")
            while True:
                asset = await endpoint.get_asset(asset_uuid, dataset_uuid=dataset_uuid)
                status = getattr(asset, 'status', None)
                if status == 'accepted':
                    print("Asset upload completed and accepted.")
                    break
                else:
                    print(f"Asset status: {status}. Waiting 5 seconds before retrying...")
                    await asyncio.sleep(5)

            # Build ground truth and update asset
            ground_truth = build_ground_truth(width, height)
            print("Updating asset ground truth...")
            await endpoint.update_asset_ground_truth(asset_uuid=asset_uuid, dataset_uuid=dataset_uuid, ground_truth=ground_truth)
            print("Ground truth added for asset:", asset_uuid)

            # Retrieve and print asset details with annotations
            print("Retrieving asset details with annotations...")
            asset_with_annotations = await endpoint.get_asset(asset_uuid, dataset_uuid=dataset_uuid, include_annotations=True)
            print("Asset details:")
            print(asset_with_annotations)

            print("Data ingestion completed successfully.")

        except Exception as e:
            print(f"Error during ingestion: {e}")
            sys.exit(1)

if __name__ == '__main__':
    asyncio.run(main())
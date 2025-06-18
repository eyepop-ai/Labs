import glob
import fiftyone as fo
import os
import requests
import json
from pathlib import Path
from eyepop import EyePopSdk
from eyepop.data.data_endpoint import DataEndpoint
from eyepop.data.data_jobs import DataJob
from eyepop.data.data_types import DatasetCreate, AssetImport, \
    AutoAnnotateParams, Dataset, Asset, ChangeEvent, ChangeType, DatasetUpdate, UserReview, \
    Model, ModelCreate, ModelStatus
import asyncio


# Define the path to your dataset and other parameters
images_patt = "/path/to/images/*"
accountUUID = "2c97ab0b556742dbbdb7af34cc6f3b6a"
datasetUUID = "0671ffe30fa1784380006a2cc5310604"
apikey = "AAE_w6lCcrCa27chNAbZO-WdZ0FBQUFBQmwyUFk5bmtLZnJBQ2RFVWVDbzU1MnkwTUMzYXhQWjA4a0ZEczFKWWdONjdRS0NGWUZ5aF90aXVQZ3FrcWdkZWwwUEx6Q0luM0F3b3ItMjdqRmhUQkxyTWVvSndFLWRCUENjZGNlanZhbGhRTDdtV289"
cache_directory = "~/Documents/voxel51_cache/"+accountUUID+"/"+datasetUUID




def checkCacheDirectory():
    if not os.path.exists(os.path.expanduser(cache_directory)):
        print("Cache directory does not exist. Creating it...")
        os.makedirs(os.path.expanduser(cache_directory))
    # Check if the cache directory is empty
    cache_files = os.listdir(os.path.expanduser(cache_directory))
    if not cache_files:
        print("Cache directory is empty.")
        return False
    
    print("Cache directory contains files:", cache_files)    
    return True

def convert_annotations_to_coco(annotations, image_id, starting_annotation_id=1):
    if(not annotations or len(annotations) == 0):
        print("No annotations found.")
        return None
    
    image_width = annotations[0].annotation.source_height
    image_height = annotations[0].annotation.source_height
    
    coco = {
        "images": [
            {
                "id": image_id,
                "width": image_width,
                "height": image_height,
                "file_name": f"{image_id}.jpg"
            }
        ],
        "annotations": [],
        "categories": []
    }

    category_name_to_id = {}
    annotation_id = starting_annotation_id

    for annotation in annotations:
        if not hasattr(annotation, "annotation") or not hasattr(annotation.annotation, "objects"):
            continue

        for obj in annotation.annotation.objects:
            label = obj.classLabel
            if label not in category_name_to_id:
                category_id = len(category_name_to_id) + 1
                category_name_to_id[label] = category_id
                coco["categories"].append({
                    "id": category_id,
                    "name": label,
                    "supercategory": "none"
                })
            else:
                category_id = category_name_to_id[label]

            bbox = [
                obj.x,
                obj.y,
                obj.width,
                obj.height
            ]
            area = obj.width * obj.height

            coco["annotations"].append({
                "id": annotation_id,
                "image_id": image_id,
                "category_id": category_id,
                "bbox": bbox,
                "area": area,
                "iscrowd": 0
            })
            annotation_id += 1

    return coco
    

async def downloadDatasetToCache():
    print("Downloading dataset from EyePop.ai to cache directory...")

    async with EyePopSdk.dataEndpoint(
        secret_key=apikey,
        account_id=accountUUID,
        is_async=True, 
        disable_ws=False) as endpoint:

        asset_list = await endpoint.list_assets(dataset_uuid= datasetUUID, include_annotations=True)
        print(f"Found {len(asset_list)} assets in the dataset.")
        
        os.makedirs(os.path.expanduser(cache_directory), exist_ok=True)
        cache_path = Path(os.path.expanduser(cache_directory))

        images_dir = cache_path / "data"
        annotations_dir = cache_path / "annotations"
        images_dir.mkdir(exist_ok=True)
        annotations_dir.mkdir(exist_ok=True)

        combined_coco = {
            "images": [],
            "annotations": [],
            "categories": []
        }
        category_name_to_id = {}
        annotation_id = 1

        for asset in asset_list:
            print(f"Downloading asset {asset.uuid}...")
            print(asset)

            image_response = await endpoint.download_asset(asset.uuid, datasetUUID, dataset_version=None)
            image_bytes = await image_response.read()
            image_filename = f"{asset.uuid}.jpg"
            image_path = images_dir / image_filename
            with open(image_path, "wb") as f:
                f.write(image_bytes)

            metadata = convert_annotations_to_coco(annotations=asset.annotations, image_id=asset.uuid, starting_annotation_id=annotation_id)
            
            if metadata is None:
                continue

            combined_coco["images"].extend(metadata["images"])

            for ann in metadata["annotations"]:
                ann["id"] = annotation_id
                annotation_id += 1
                combined_coco["annotations"].append(ann)

            for cat in metadata["categories"]:
                if cat["name"] not in category_name_to_id:
                    category_name_to_id[cat["name"]] = len(category_name_to_id) + 1
                    combined_coco["categories"].append({
                        "id": category_name_to_id[cat["name"]],
                        "name": cat["name"],
                        "supercategory": "none"
                    })

            print (f"Metadata for asset {asset.uuid}: {metadata}")

            print(f"Downloaded {image_filename}")

        # Update category_id in annotations to match combined category ids
        name_to_id = {cat["name"]: cat["id"] for cat in combined_coco["categories"]}
        for ann in combined_coco["annotations"]:
            cat_name = None
            for cat in metadata["categories"]:
                if cat["id"] == ann["category_id"]:
                    cat_name = cat["name"]
                    break
            if cat_name in name_to_id:
                ann["category_id"] = name_to_id[cat_name]

        annotations_path = annotations_dir / "annotations.json"
        with open(annotations_path, "w") as f:
            json.dump(combined_coco, f, indent=2)

        await endpoint.disconnect()

    print("Dataset downloaded successfully.")



async def run():
    print("Cache directory:", cache_directory)
    # if not checkCacheDirectory():
    await downloadDatasetToCache()
    
    print("Loading dataset from cache directory...")
    dataset = fo.Dataset.from_dir(
        dataset_dir=os.path.expanduser(cache_directory),
        dataset_type=fo.types.COCODetectionDataset,
        labels_path=os.path.expanduser(cache_directory) + "/annotations/annotations.json",
        classes=None
    )
    print("Dataset loaded successfully.")
    session = fo.launch_app(dataset)
    session.wait()


asyncio.run(run())

quit()




# # Ex: your custom label format
# annotations = {
#     "/path/to/images/000001.jpg": [
#         {"bbox": ..., "label": ...},
#         ...
#     ],
#     ...
# }

# # Create samples for your data
# samples = []
# for filepath in glob.glob(images_patt):
#     sample = fo.Sample(filepath=filepath)

#     # Convert detections to FiftyOne format
#     detections = []
#     for obj in annotations[filepath]:
#         label = obj["label"]

#         # Bounding box coordinates should be relative values
#         # in [0, 1] in the following format:
#         # [top-left-x, top-left-y, width, height]
#         bounding_box = obj["bbox"]

#         detections.append(
#             fo.Detection(label=label, bounding_box=bounding_box)
#         )

#     # Store detections in a field name of your choice
#     sample["ground_truth"] = fo.Detections(detections=detections)

#     samples.append(sample)

# # Create dataset
# dataset = fo.Dataset("my-detection-dataset")
# dataset.add_samples(samples)

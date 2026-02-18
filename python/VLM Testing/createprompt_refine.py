# flake8: noqa
import os
import utils
from datetime import datetime
from openai import OpenAI
import generictester
import utils_agent
from eyepop import EyePopSdk
from dotenv import load_dotenv
import pprint

load_dotenv()



account_uuid = "457ca111aa9343399c7e1f58a486b59b"
number_of_mismatches_to_sample = 25


ability_alias = f"shreya-staging.image-classify.marketplace-blur:1.0.0"
description_of_task = """
<task>
Determining if the image contains a blurry areas inappropriate for a product hero image
</task>"""

dataset_uuid = "0698a4252fc978ee8000683fa75b5b8f"

# ability_alias = f"shreya-staging.image-classify.gemini-watermark-6:1.0.1"
# description_of_task = """<task>
# Determine if the image contains a visible watermark. Especially look for a 4 pointed star in the corner of the image.
# </task>"""
# dataset_uuid = "069838825c5d7bf280007c917fd4a827"






EYEPOP_API_KEY = utils_agent._require_env("EYEPOP_API_KEY")
print(EYEPOP_API_KEY[:10] + "...")

compute_token = utils.get_eyepop_token_compute()

eyepop_url = "https://compute.staging.eyepop.xyz"

# utils_agent.ListAbilities(api_key=EYEPOP_API_KEY, account_uuid=account_uuid, eyepop_url=eyepop_url)
# quit()

# ability_alias = f"shreya-staging.image-classify.gemini-watermark-4:latest"
ability_entry, ability, ability_group = utils_agent.GetAbility(api_key=EYEPOP_API_KEY, account_uuid=account_uuid, eyepop_url=eyepop_url, alias=ability_alias)
ability_uuid = ability.uuid if ability else None    


print(f"{ability_uuid}")
print(f"Ability details: {ability.text_prompt}")

og_prompt = ability.text_prompt
print("Original Prompt:")
print(og_prompt)

# dataset_uuid = ""

dataset = utils_agent.fetch_dataset(
    api_key=EYEPOP_API_KEY,
    account_uuid=account_uuid,
    eyepop_url=eyepop_url,
    dataset_uuid=dataset_uuid,
)
print(f"Dataset name: {dataset.uuid}")

assets = utils_agent.fetch_all_assets_sync(
        api_key=EYEPOP_API_KEY,
        account_uuid=account_uuid,
        eyepop_url=eyepop_url,
        dataset_uuid=dataset_uuid,
    )

print(f"Total assets in dataset: {len(assets)}")
# pprint.pprint(assets[0])
source_of_interest = None 

if(not source_of_interest):
    first_asset = assets[0]
    annotations = first_asset.get("annotations", [])
    for annotation in annotations:
        print(f"source: {annotation.get('source')}")
        print(annotation)

        if(annotation.get("source_ability_uuid") == ability_uuid):
             source_of_interest = annotation.get('source')
             print(f"Found matching annotation with source: {source_of_interest}")
             break
        
print(f"Using source of interest: {source_of_interest}")

if not source_of_interest:
    quit()



# get false positives and false negatives among all assets based on the source of interest
all_mismatches = []

for asset in assets:
    ground_truth = utils_agent._find_annotation_predictions(asset, annotation_type="ground_truth")
    predictions = utils_agent._find_annotation_predictions(
        asset,
        auto_annotate="ep_evaluate",
        source_of_interest=source_of_interest,
    )

    gt_class, pr_class = utils_agent.find_false_positives_negatives_in_dataset(asset, predictions, ground_truth)
    
    if pr_class == gt_class:
        continue

    mismatch_info = {
        "asset_uuid": asset.get("uuid"),
        "ground_truth": gt_class,
        "prediction": pr_class,
        "asset": asset,
        "description": None,
    }

    all_mismatches.append(mismatch_info)
    print(f"Mismatch found in asset {asset.get('uuid')}: GT={gt_class}, PR={pr_class}")

print(f"Total mismatches found: {len(all_mismatches)}")

sample_mismatches = all_mismatches[:number_of_mismatches_to_sample]

for mismatch in sample_mismatches:
    print(f"Asset UUID: {mismatch['asset_uuid']}")
    result = utils.infer_image_description(
        image_url=f"ai.eyepop://data/assets/{mismatch['asset_uuid']}?transcode_mode=original",
        text_prompt="Describe in 100 words visual elements in the image that would help this task that the following prompt describes: {description_of_task}. Be specific about visual features, avoid generic descriptions. Do not mention class names or filenames.",
        token=compute_token,
        worker_release="qwen3-instruct",
    )
   
    mismatch["description"] = result.get("raw_output", "").strip()
    print(f"Description: {mismatch['description']}")

timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
refinement_prompt = utils_agent.build_refine_prompt_image_dataset(
    mismatches=sample_mismatches,
    og_prompt=og_prompt,
    class_labels=dataset.auto_annotate_params.candidate_labels,
    timestamp=timestamp
)

print("Refinement Prompt:")
print(refinement_prompt)

better_prompt = utils_agent.generate_prompt_with_chatgpt(refinement_prompt, timestamp)

print("Better Prompt:")
print(better_prompt)
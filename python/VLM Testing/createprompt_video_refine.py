# flake8: noqa
import os
from typing import Any, Dict, Iterable, List
import utils
from datetime import datetime
from openai import OpenAI
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List

from eyepop import EyePopSdk
from dotenv import load_dotenv
import random
import asyncio
import requests
import utils_agent

async def main():
    worker_release = "qwen3-instruct"
    max_new_tokens = 100
    image_size = 512
    asset_uuid = "0697932e34e777ac800063e02ecbd16a"
    ACCOUNT_UUID = "49326f2e085a46c39ba73f91c52e436c"
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    source_of_interest = "ep_evaluate:59ac94a09d5cdf43d736f2a6df0d54ed"

    token = utils.get_eyepop_token_compute()
    api_key = utils_agent._require_env("EYEPOP_API_KEY")


    asset = await utils_agent.fetch_asset(
        api_key=api_key,
        account_uuid=ACCOUNT_UUID,
        asset_uuid=asset_uuid,
    )

    # print(asset)
    ability_info = utils_agent.fetch_ability_info(asset.get("dataset_uuid"), source_of_interest, token)
    og_prompt = ability_info[0]['auto_annotate_params']['infer']['text_prompt']
    print("Original Prompt:")
    print(og_prompt)

    ground_truth = utils_agent._find_annotation_predictions(asset, annotation_type="ground_truth")
    predictions = utils_agent._find_annotation_predictions(
        asset,
        auto_annotate="ep_evaluate",
        source_of_interest=source_of_interest,
    )

    # find mismatched predictions
    false_positives, false_negatives = utils_agent.find_false_positives_negatives(predictions, ground_truth)

    # send false positives to vlm for description
    fp_desc, fn_desc = await utils_agent.process_mismatch_samples_and_collect_results(
        asset_uuid=asset_uuid,
        ACCOUNT_UUID=ACCOUNT_UUID,
        api_key=api_key,
        token=token,
        worker_release=worker_release,
        max_new_tokens=max_new_tokens,
        image_size=image_size,
        false_positives=false_positives,
        false_negatives=false_negatives,
    )

    # Build new prompt from collected results
    refinement_prompt = utils_agent.build_refine_prompt(fp_desc, fn_desc, og_prompt, timestamp)
    print("Refinement Prompt:")
    print(refinement_prompt)

    better_prompt = utils_agent.generate_prompt_with_chatgpt(refinement_prompt, timestamp)

    print("Better Prompt:")
    print(better_prompt)
    
if __name__ == "__main__":
    asyncio.run(main())

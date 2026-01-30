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

import utils_agent


async def main():
    worker_release = "qwen3-instruct"
    max_new_tokens = 100
    image_size = 512
    asset_uuid = "0697932e34e777ac800063e02ecbd16a"
    ACCOUNT_UUID = "49326f2e085a46c39ba73f91c52e436c"
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    promptfiles = []
    results = {}
    token = utils.get_eyepop_token_compute()
    api_key = utils_agent._require_env("EYEPOP_API_KEY")

    # Identify Recognition Frame Amount (the minimum number of frames needed to recognize the action)
    Recognition_Frame_Amount = 5

    # Look through the asset annotations to find the shortest action duration
    Minimum_Action_Duration = 0

    asset = await utils_agent.fetch_asset(
        api_key=api_key,
        account_uuid=ACCOUNT_UUID,
        asset_uuid=asset_uuid,
    )
    ground_truth = utils_agent._find_annotation_predictions(asset, annotation_type="ground_truth")
    for pred in ground_truth:
        duration = int(pred.get("duration") or 0)
        if Minimum_Action_Duration == 0 or duration < Minimum_Action_Duration:
            Minimum_Action_Duration = duration

    print(f"Minimum Action Duration (ns): {Minimum_Action_Duration}")

    # Calculate FPS based on the shortest action duration and recognition frame amount
    if Minimum_Action_Duration > 0:
        fps = Recognition_Frame_Amount / (Minimum_Action_Duration / 1_000_000_000)
        fps = min(fps, 10.0)  # Cap FPS to a maximum of 10.0
        print(f"Calculated FPS: {fps}")
    else:
        fps = 10.0  # Default FPS if no valid action duration found
        print("No valid action durations found. Using default FPS: 10.0")



    results = await utils_agent.process_random_timesegments_and_collect_results(
        asset_uuid=asset_uuid,
        ACCOUNT_UUID=ACCOUNT_UUID,
        token=token,
        api_key=api_key,
        worker_release=worker_release,
        max_new_tokens=max_new_tokens,
        image_size=image_size,
        fps=10.0,
        sample_size_per_class=10
    )

    # Build creation prompt from collected results
    creation_prompt = utils_agent.build_creation_prompt(results, timestamp)

    # Generate final prompt using ChatGPT
    generated_prompt = utils_agent.generate_prompt_with_chatgpt(creation_prompt, timestamp)

    # Test the generated prompt using generictester
    results_csv = f'./results/testarray_results_{timestamp}.csv'

    # make ability group
    # make ability
    
    # call eval flow
    # run_eval_flow(
    # {
    #   "ability_uuid": "0697a74d24d97133800086fe4377925b",
    #   "dataset_uuid": "06979321e8da753080001b9bfa6c3816",
    #   "video_chunk_length_ns": 1000000000,
    #   "video_chunk_overlap": 0.333
    # })

if __name__ == "__main__":
    asyncio.run(main())

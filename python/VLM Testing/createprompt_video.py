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


ASSET_NAME="Novohealth super crop station 1"
ASSET_UUID="0697932e34e777ac800063e02ecbd16a"

PredictionDict = Dict[str, Any]
AssetDict = Dict[str, Any]

def generate_prompt_with_chatgpt(creation_prompt, timestamp):
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    response = client.responses.create(
        model="gpt-5.1",
        input=[
            {
                "role": "system",
                "content": [
                    {
                        "type": "input_text",
                        "text": "You are a helpful assistant that creates prompts for a Vision Language Model (VLM)."
                    }
                ]
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": creation_prompt
                    }
                ]
            }
        ],
        max_output_tokens=5000,
        temperature=0.1,
        # reasoning={
        #     "effort": "none"
        # }
    )

    generated_prompt = response.output_text

    print("Generated Prompt from ChatGPT:")
    print(generated_prompt)

    with open(f"generated_prompt_{timestamp}.txt", "w") as f:
        f.write(generated_prompt)

    return generated_prompt


def _find_annotation_predictions(
    asset: AssetDict,
    *,
    annotation_type: str | None = None,
    auto_annotate: str | None = None,
    source_of_interest: str | None = None,
) -> List[PredictionDict]:
    """Extract a prediction list from asset['annotations'] based on selector criteria."""

    annotations = asset.get("annotations") or []
    if not isinstance(annotations, list):
        raise TypeError(
            f"asset['annotations'] must be a list, got {type(annotations)!r}"
        )

    for ann in annotations:
        if annotation_type is not None and ann.get("type") != annotation_type:
            continue
        if auto_annotate is not None and ann.get("auto_annotate") != auto_annotate:
            continue
        if source_of_interest is not None and ann.get("source") != source_of_interest:
            continue

        preds = ann.get("predictions")
        if isinstance(preds, list):
            return preds

    selector = f"type={annotation_type!r}" if annotation_type is not None else ""
    if auto_annotate is not None:
        selector = f"{selector} auto_annotate={auto_annotate!r}".strip()

    raise KeyError(
        "Could not find matching annotation predictions on asset. "
        f"Selector: {selector or 'none'}"
    )


async def process_random_timesegments_and_collect_results(
    asset_uuid,
    ACCOUNT_UUID,
    api_key,
    token,
    worker_release,
    max_new_tokens,
    image_size,
    sample_size_per_class=3,
    fps=3.0,
):
    results = {}
    asset = await fetch_asset(
        api_key=api_key,
        account_uuid=ACCOUNT_UUID,
        asset_uuid=asset_uuid,
    )

    # print(asset)

    print(f"Fetched asset {asset.get('uuid') or '---'} for processing.")

    ground_truth = _find_annotation_predictions(asset, annotation_type="ground_truth")

    def _label_of(pred: PredictionDict) -> str | None:
        """Safely extract classLabel from a ground-truth prediction."""
        classes = pred.get("classes")
        if not classes or not isinstance(classes, list):
            return None
        first = classes[0] if classes else None
        if not isinstance(first, dict):
            return None
        return first.get("classLabel")

    def _intervals(preds: List[PredictionDict]) -> List[tuple[int, int]]:
        """Convert predictions into [start,end) intervals in ns."""
        out: List[tuple[int, int]] = []
        for p in preds:
            ts = int(p.get("timestamp") or 0)
            dur = int(p.get("duration") or 0)
            if ts <= 0 or dur <= 0:
                continue
            out.append((ts, ts + dur))
        out.sort(key=lambda x: x[0])
        # merge overlaps
        merged: List[tuple[int, int]] = []
        for s, e in out:
            if not merged or s > merged[-1][1]:
                merged.append((s, e))
            else:
                merged[-1] = (merged[-1][0], max(merged[-1][1], e))
        return merged

    def _sample_none_from_gaps(
        intervals: List[tuple[int, int]],
        *,
        k: int,
        clip_len_ns: int,
        min_gap_ns: int = 1_000_000_000,
    ) -> List[PredictionDict]:
        """Generate synthetic 'None' samples by picking timestamps in the gaps between labeled intervals.

        NOTE: Many datasets do not store explicit None ground-truth segments.
        This creates them by sampling the complement of labeled regions.
        """
        if k <= 0 or len(intervals) < 2:
            return []

        gaps: List[tuple[int, int]] = []
        for i in range(len(intervals) - 1):
            gap_start = intervals[i][1]
            gap_end = intervals[i + 1][0]
            gap_len = gap_end - gap_start
            if gap_len >= max(min_gap_ns, clip_len_ns):
                gaps.append((gap_start, gap_end))

        if not gaps:
            return []

        # Sample across gaps to avoid taking everything from one large gap
        samples: List[PredictionDict] = []
        # Simple weighted approach: build a list of candidate gaps duplicated by size bucket
        # (keeps it deterministic enough without heavy math)
        gap_weights: List[tuple[int, int]] = []
        for gs, ge in gaps:
            gap_len = ge - gs
            # weight is proportional to gap length, but capped to avoid huge domination
            w = max(1, min(10, gap_len // max(min_gap_ns, 1)))
            gap_weights.extend([(gs, ge)] * int(w))

        for _ in range(k):
            gs, ge = random.choice(gap_weights)
            # ensure we can fit clip_len_ns inside gap
            latest_start = ge - clip_len_ns
            if latest_start <= gs:
                continue
            ts = random.randint(gs, latest_start)
            samples.append({
                "timestamp": ts,
                "duration": clip_len_ns,
                "classes": [{"classLabel": None}],
            })

        return samples

    class_labels = sorted({lbl for lbl in (_label_of(p) for p in ground_truth) if lbl is not None})
    class_labels.append(None)  # sentinel for the negative/background class

    gt_intervals = _intervals(ground_truth)
    
    for class_label in class_labels:
        #get random samples of time segments for this class label
        if class_label is None:
            # Most datasets do NOT store explicit background/None segments.
            # Instead, we synthesize negative examples by sampling timestamps in the gaps
            # between labeled ground-truth intervals.
            clip_len_ns = 1_000_000_000  # 1 second
            samples = _sample_none_from_gaps(
                gt_intervals,
                k=sample_size_per_class,
                clip_len_ns=clip_len_ns,
                min_gap_ns=1_000_000_000,
            )
            print(f"Processing {len(samples)} samples for class label 'None (sampled from gaps)'")
        else:
            samples = ground_truth.copy()
            samples = [s for s in samples if _label_of(s) == class_label]
            # Randomly sample up to sample_size_per_class from the samples for this class label
            samples = random.sample(samples, min(sample_size_per_class, len(samples)))
            print(f"Processing {len(samples)} samples for class label '{class_label}'")

        for sample in samples:

            # limit to duration of 1 second for image extraction
            timestamp = sample['timestamp']
            duration = int(sample.get('duration') or 0)
            duration = min(duration if duration > 0 else 1_000_000_000, 1_000_000_000)  # cap to 1s

            print(f"Processing sample at timestamp {timestamp} for class {class_label} for duration {duration}\n\n")

            video_url = "ai.eyepop://data/assets/"+asset_uuid+"?transcode_mode=video_original_size&start_timestamp="+str(sample['timestamp'])+"&end_timestamp="+str((sample['timestamp'] + duration))

            prompt = (
                "Describe only the visual features that would help distinguish this image from images belonging to other categories. "
                "Avoid mentioning filenames, paths, or class names. Focus on what is visible and unambiguous."
            )
            result = utils.infer_video_description(
                video_url, prompt, token, worker_release=worker_release, max_new_tokens=max_new_tokens, image_size=image_size, fps=fps
            )

            print(result)

            if 'raw_output' in result:
                raw_output = result['raw_output']
                label_key = "NO" if class_label is None else class_label
                results.setdefault(label_key, []).append(raw_output)
                print(f"Result for sample at timestamp {timestamp} for class {class_label}: {raw_output}\n\n")
            else:
                print(f"No raw_output found for sample at timestamp {timestamp} for class {class_label}\n\n")

    print("Completed processing all classes and samples.")
    print(results)
    return results
    
async def fetch_asset(
    *,
    api_key: str,
    account_uuid: str,
    asset_uuid: str,
) -> AssetDict:
    """Fetch asset JSON using the current EyePop async DataEndpoint pattern."""

    print(f"Fetching asset {asset_uuid} from account {account_uuid}...")

    async with EyePopSdk.dataEndpoint(
        api_key=api_key,
        account_id=account_uuid,
        is_async=True,
        disable_ws=False,
        eyepop_url="https://compute.staging.eyepop.xyz/",
    ) as endpoint:
        asset_obj = await endpoint.get_asset(asset_uuid, include_annotations=True)

    print(type(asset_obj))
    return _asset_to_dict(asset_obj)


def _asset_to_dict(asset_obj: Any) -> Dict[str, Any]:
    """Convert an EyePop SDK Asset (Pydantic model) into a plain dict.

    EyePop's `get_asset` returns a Pydantic model (`Asset`). This script
    operates on plain dicts for simplicity.
    """
    # Pydantic v2
    if hasattr(asset_obj, "model_dump"):
        return asset_obj.model_dump(mode="python")  # type: ignore[no-any-return]
    # Pydantic v1
    if hasattr(asset_obj, "dict"):
        return asset_obj.dict()  # type: ignore[no-any-return]
    # Already a dict or unknown type
    if isinstance(asset_obj, dict):
        return asset_obj
    raise TypeError(f"Unsupported asset type: {type(asset_obj)!r}")




def build_creation_prompt(results,timestamp):
    creation_prompt = """In the following, you will find a series of image descriptions in xml tags.
        The xml tag defines the class of the image. Your task is to create a single comprehensive prompt
        that will allow a VLM to classify images into their respective classes based on the descriptions provided.
        Ensure that the prompt is clear, concise, and covers all the necessary details to facilitate accurate classification by the VLM.
    """

    class_labels = []
    for folder, result in results.items():
        class_label = os.path.basename(folder)
        class_labels.append(class_label)
        for r in result:
            creation_prompt += f"\n<image_description classLabel=\"{class_label}\">{r}</image_description>"

    creation_prompt += (
        f"\n\nThe possible output labels are: {class_labels}. " 
        "Do not include explanations, confidence scores, or additional text. "
        "Choose the closest matching category based on the dominant visual content."
        """ <example_prompt>Determine the primary content of this image and assign exactly one label: {label list}. 
Choose {label 1} only if the {description 1}. 
Choose {label 2} only if the {description 2}. 
Return only the label.</example_prompt>"""
    )

    with open(f"creation_prompt_{timestamp}.txt", "w") as f:
        f.write(creation_prompt)
    
    print(f"Creation prompt saved to creation_prompt_{timestamp}.txt")    
    print(creation_prompt)

    return creation_prompt


def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value

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
    api_key = _require_env("EYEPOP_API_KEY")

    # Identify Recognition Frame Amount (the minimum number of frames needed to recognize the action)
    Recognition_Frame_Amount = 5

    # Look through the asset annotations to find the shortest action duration
    Minimum_Action_Duration = 0

    asset = await fetch_asset(
        api_key=api_key,
        account_uuid=ACCOUNT_UUID,
        asset_uuid=asset_uuid,
    )
    ground_truth = _find_annotation_predictions(asset, annotation_type="ground_truth")
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



    results = await process_random_timesegments_and_collect_results(
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
    creation_prompt = build_creation_prompt(results, timestamp)

    # Generate final prompt using ChatGPT
    generated_prompt = generate_prompt_with_chatgpt(creation_prompt, timestamp)

    # Test the generated prompt using generictester
    results_csv = f'./results/testarray_results_{timestamp}.csv'

    # call eval flow
    # run_eval_flow(
    # {
    #   "ability_uuid": "0697a74d24d97133800086fe4377925b",
    #   "dataset_uuid": "06979321e8da753080001b9bfa6c3816",
    #   "video_chunk_length_ns": 3000000000,
    #   "video_chunk_overlap": 0.5
    # })

if __name__ == "__main__":
    asyncio.run(main())

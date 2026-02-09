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

from eyepop import EyePopSdk
from eyepop.data.data_types import InferRuntimeConfig, VlmAbilityGroupCreate, VlmAbilityCreate, TransformInto
from eyepop.worker.worker_types import CropForward, ForwardComponent, FullForward, InferenceComponent, Pop
import json

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
                        "text": "You are a helpful assistant that creates prompts for a Vision Language Model (VLM).",
                    }
                ],
            },
            {
                "role": "user",
                "content": [{"type": "input_text", "text": creation_prompt}],
            },
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
        print(f" progress {annotations.index(ann) + 1}/{len(annotations)}")
        if annotation_type is not None and ann.get("type") != annotation_type:
            print(
                f"Skipping annotation with type {ann.get('type')}, looking for {annotation_type}"
            )
            continue
        if auto_annotate is not None and ann.get("auto_annotate") != auto_annotate:
            print(
                f"Skipping annotation with auto_annotate {ann.get('auto_annotate')}, looking for {auto_annotate}"
            )
            continue
        if source_of_interest is not None and ann.get("source") != source_of_interest:
            print(
                f"Skipping annotation with source {ann.get('source')}, looking for {source_of_interest}"
            )
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


def send_segment_to_vlm(
    sample,
    class_label,
    asset_uuid,
    token,
    worker_release,
    max_new_tokens,
    image_size,
    fps,
):
    # limit to duration of 1 second for image extraction
    timestamp = sample["timestamp"]
    duration = int(sample.get("duration") or 0)
    duration = min(
        duration if duration > 0 else 1_000_000_000, 1_000_000_000
    )  # cap to 1s

    print(
        f"Processing sample at timestamp {timestamp} for class {class_label} for duration {duration}\n\n"
    )

    video_url = (
        "ai.eyepop://data/assets/"
        + asset_uuid
        + "?transcode_mode=video_original_size&start_timestamp="
        + str(sample["timestamp"])
        + "&end_timestamp="
        + str((sample["timestamp"] + duration))
    )

    prompt = (
        "Describe only the visual features that would help distinguish this image from images belonging to other categories. "
        "Avoid mentioning filenames, paths, or class names. Focus on what is visible and unambiguous."
    )
    result = utils.infer_video_description(
        video_url,
        prompt,
        token,
        worker_release=worker_release,
        max_new_tokens=max_new_tokens,
        image_size=image_size,
        fps=fps,
    )

    print(result)

    if "raw_output" in result:
        raw_output = result["raw_output"]
        label_key = "NO" if class_label is None else class_label
        return label_key, raw_output
    else:
        print(
            f"No raw_output found for sample at timestamp {timestamp} for class {class_label}\n\n"
        )
        return None, None


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
            samples.append(
                {
                    "timestamp": ts,
                    "duration": clip_len_ns,
                    "classes": [{"classLabel": None}],
                }
            )

        return samples

    class_labels = sorted(
        {lbl for lbl in (_label_of(p) for p in ground_truth) if lbl is not None}
    )
    class_labels.append(None)  # sentinel for the negative/background class

    gt_intervals = _intervals(ground_truth)

    for class_label in class_labels:
        # get random samples of time segments for this class label
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
            print(
                f"Processing {len(samples)} samples for class label 'None (sampled from gaps)'"
            )
        else:
            samples = ground_truth.copy()
            samples = [s for s in samples if _label_of(s) == class_label]
            # Randomly sample up to sample_size_per_class from the samples for this class label
            samples = random.sample(samples, min(sample_size_per_class, len(samples)))
            print(f"Processing {len(samples)} samples for class label '{class_label}'")

        for sample in samples:
            label_key, raw_output = send_segment_to_vlm(
                sample,
                class_label,
                asset_uuid,
                token,
                worker_release,
                max_new_tokens,
                image_size,
                fps,
            )
            if label_key and raw_output:
                results.setdefault(label_key, []).append(raw_output)
                print(
                    f"Result for sample at timestamp {sample['timestamp']} for class {class_label}: {raw_output}\n\n"
                )

    print("Completed processing all classes and samples.")
    print(results)
    return results


async def process_mismatch_samples_and_collect_results(
    asset_uuid,
    ACCOUNT_UUID,
    api_key,
    token,
    worker_release,
    max_new_tokens,
    image_size,
    false_positives,
    false_negatives,
):
   
    fp_desc = []
    fn_desc = []
    for sample in false_positives:
        label_key, raw_output = send_segment_to_vlm(
            sample,
            sample.get("classes", [{}])[0].get("classLabel"),
            asset_uuid,
            token,
            worker_release,
            max_new_tokens,
            image_size,
            fps=10.0,
        )
        if label_key and raw_output:
            fp_desc.append((label_key, raw_output))
            print(
                f"Result for false positive sample at timestamp {sample['timestamp']}: {raw_output}\n\n"
            )

    for sample in false_negatives:
        label_key, raw_output = send_segment_to_vlm(
            sample,
            sample.get("classes", [{}])[0].get("classLabel"),
            asset_uuid,
            token,
            worker_release,
            max_new_tokens,
            image_size,
            fps=10.0,
        )
        if label_key and raw_output:
            fn_desc.append((label_key, raw_output))
            print(
                f"Result for false negative sample at timestamp {sample['timestamp']}: {raw_output}\n\n"
            )

    return [fp_desc, fn_desc]


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

async def fetch_all_assets(
    *,
    api_key: str,
    account_uuid: str,
    dataset_uuid: str,
    eyepop_url: str = "https://compute.staging.eyepop.xyz/",
) -> AssetDict:
    """Fetch asset JSON using the current EyePop async DataEndpoint pattern."""

    #implement 
    # async def list_assets(
    #         self,
    #         dataset_uuid: str,
    #         dataset_version: int | None = None,
    #         include_annotations: bool = False,
    #         inclusion_mode: AssetInclusionMode = AssetInclusionMode.annotated_only,
    #         annotation_inclusion_mode: AnnotationInclusionMode | None = None,
    #         include_partitions: list[str] | None = None,
    #         include_auto_annotates: list[AutoAnnotate] | None = None,
    #         include_sources: list[str] | None = None,
    # ) -> list[Asset]:

    async with EyePopSdk.dataEndpoint(
        api_key=api_key,
        account_id=account_uuid,
        is_async=True,
        disable_ws=False,
        eyepop_url=eyepop_url,
    ) as endpoint:
        asset_objs = await endpoint.list_assets(
            dataset_uuid=dataset_uuid,
            include_annotations=True
        )

    # print(type(asset_objs))
    return [_asset_to_dict(asset_obj) for asset_obj in asset_objs]

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


def build_creation_prompt(results, timestamp):
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
            creation_prompt += f'\n<image_description classLabel="{class_label}">{r}</image_description>'

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

def build_refine_prompt(fp_desc, fn_desc, og_prompt, timestamp):
    creation_prompt = """In the following, you will find a series of image descriptions in xml tags. The xml tag defines the class of the image and if it was correctly classified. You will also find an action classification prompt to a vlm. Your task is to create a single more accurate prompt that will allow a VLM to classify a video segment into it's respective classes based on the descriptions provided.
    Ensure that the prompt is clear, concise, and covers all the necessary details to facilitate accurate classification by the VLM.
    """

    # add original prompt
    creation_prompt += f"\n\n<original_prompt>{og_prompt}</original_prompt>\n\n"

    # add false positives
    creation_prompt += "\n\n<!-- False Positives Descriptions -->\n"
    for label, desc in fp_desc:
        creation_prompt += f'\n<image_description classLabel="{label}" mismatch_type="False Positive">{desc}</image_description>'
    
    # add false negatives
    creation_prompt += "\n\n<!-- False Negatives Descriptions -->\n"
    for label, desc in fn_desc:
        creation_prompt += f'\n<image_description classLabel="{label}" mismatch_type="False Negative">{desc}</image_description>'


    class_labels = []
    for label, _ in fp_desc + fn_desc:
        if label not in class_labels:
            class_labels.append(label)

    creation_prompt += (
        f"\n\nThe possible output labels are: {class_labels}. "
        "Do not include explanations, confidence scores, or additional text. "
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


def find_false_positives_negatives(predictions, ground_truth):
    false_positives = []
    false_negatives = []
    for pred in predictions:
        print(f"Processing prediction: {pred}")
        classes = pred.get("classes", [])
        pred_label = (
            classes[0].get("classLabel")
            if classes and isinstance(classes[0], dict)
            else None
        )
        matching_gt = [
            gt
            for gt in ground_truth
            if gt.get("timestamp") == pred.get("timestamp")
            and gt.get("duration") == pred.get("duration")
        ]
        if matching_gt:
            gt_label = matching_gt[0].get("classes", [{}])[0].get("classLabel")
            if pred_label != gt_label:
                if pred_label is not None and (
                    gt_label is None or pred_label != gt_label
                ):
                    false_positives.append(pred)
                if gt_label is not None and (
                    pred_label is None or pred_label != gt_label
                ):
                    false_negatives.append(matching_gt[0])
        else:
            if pred_label is not None:
                false_positives.append(pred)

    print(
        f"Found {len(false_positives)} false positives and {len(false_negatives)} false negatives."
    )
    print("False Positives:")
    for fp in false_positives:
        print(fp)
    print("False Negatives:")
    for fn in false_negatives:
        print(fn)
    return false_positives, false_negatives

def fetch_ability_info(dataset_id, source, token):
    """
    Fetch ability_info from the EyePop dataset API.

    Args:
        dataset_id (str): The dataset UUID.
        source (str): The source query parameter (e.g., "ep_evaluate:...").
        token (str): Bearer token for authorization.

    Returns:
        dict: The JSON response from the API.
    """
    url = f"https://dataset-api.staging.eyepop.xyz/datasets/{dataset_id}/auto_annotates"
    headers = {
        "accept": "application/json",
        "Authorization": f"{token}",
    }
    params = {"source": source}
    response = requests.get(url, headers=headers, params=params)
    response.raise_for_status()
    return response.json()








def create_ability_prototypes(alias,text_prompt, classes, max_new_tokens=5, image_size=640, fps=10) -> List[VlmAbilityCreate]:
    NAMESPACE_PREFIX = "custom.vehicle-inspection"
    return VlmAbilityCreate(
            name=f"{alias}",
            description="Auto Generated Ability: {timestamp_now}",
            worker_release="qwen3-instruct",
            text_prompt="{text_prompt}",
            transform_into=TransformInto(
                classes=classes
            ),
            config=InferRuntimeConfig(
                max_new_tokens=max_new_tokens,
                image_size=image_size,
                fps=fps,
            ),
            is_public=False
        )

def ListAbilities(api_key: str, account_id: str, eyepop_url: str):
    with EyePopSdk.dataEndpoint(api_key=api_key, account_id=account_id, eyepop_url=eyepop_url) as endpoint:
        vlm_ability_groups = endpoint.list_vlm_ability_groups()

        print(f'found {len(vlm_ability_groups)} active ability groups in account {account_id}')
        for vlm_ability_group in vlm_ability_groups:
            vlm_abilities = endpoint.list_vlm_abilities(vlm_ability_group_uuid=vlm_ability_group.uuid)
        
        print(f'\nfound {len(vlm_abilities)} active abilities in group {vlm_ability_group.name} ({vlm_ability_group.uuid}):')
        for vlm_ability in vlm_abilities:
            aliases = '.'.join([f'{entry.alias}:{entry.tag}' for entry in vlm_ability.alias_entries])
            print(f'\t{vlm_ability.name} ({vlm_ability.uuid}): status={vlm_ability.status}, aliases=[{aliases}]')
    

def fetch_dataset(api_key, account_uuid, eyepop_url, dataset_uuid):
    with EyePopSdk.dataEndpoint(api_key=api_key, account_id=account_uuid, eyepop_url=eyepop_url) as endpoint:
        dataset = endpoint.get_dataset(dataset_uuid)
        return dataset
    
async def download_asset(
    asset_uuid,
    account_uuid,
    api_key,
    output_path,
    eyepop_url
):
    # Use the async DataEndpoint so we can `await` safely.
    async with EyePopSdk.dataEndpoint(
        api_key=api_key,
        account_id=account_uuid,
        is_async=True,
        disable_ws=False,
        eyepop_url=eyepop_url,
    ) as endpoint:
        asset_obj = await endpoint.download_asset(asset_uuid)

        # IMPORTANT: If the SDK returns a stream/buffer backed by the HTTP connection,
        # we must read it *before* exiting the context manager, otherwise the
        # connection is closed and reads will fail.
        if isinstance(asset_obj, (bytes, bytearray)):
            asset_bytes = bytes(asset_obj)
        elif hasattr(asset_obj, "read"):
            read_result = asset_obj.read()
            if asyncio.iscoroutine(read_result) or asyncio.isfuture(read_result):
                asset_bytes = await read_result
            else:
                asset_bytes = read_result

            # Close if possible (sync or async)
            try:
                close_fn = getattr(asset_obj, "close", None)
                if callable(close_fn):
                    close_result = close_fn()
                    if asyncio.iscoroutine(close_result) or asyncio.isfuture(close_result):
                        await close_result
            except Exception:
                pass
        else:
            raise TypeError(f"Unsupported download_asset return type: {type(asset_obj)!r}")

    # Normalize to raw bytes
    if isinstance(asset_bytes, memoryview):
        asset_bytes = asset_bytes.tobytes()
    elif not isinstance(asset_bytes, (bytes, bytearray)):
        raise TypeError(f"download_asset produced non-bytes payload: {type(asset_bytes)!r}")

    # If output_path is a directory, append a filename
    if os.path.isdir(output_path):
        filename = f"{asset_uuid}.jpg"
        file_path = os.path.join(output_path, filename)
    else:
        file_path = output_path

    print(f"Asset {asset_uuid} downloaded successfully. Saving to {file_path}...")
    with open(file_path, "wb") as f:
        f.write(asset_bytes)
    print(f"Asset saved to {file_path}")

    return asset_bytes

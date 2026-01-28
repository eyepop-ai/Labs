# flake8: noqa
"""Compare ground-truth vs model predictions for a video asset and export a per-segment CSV.

This script:
1) Fetches an asset (including annotations) from EyePop DataEndpoint.
2) Extracts ground-truth predictions and a chosen auto-annotation prediction set.
3) Samples the timeline at a fixed segment size (default: 0.25s).
4) Writes a CSV comparing the active label at each segment start.

Environment:
  - EYEPOP_API_KEY must be set.

Notes:
  - The API expresses timestamps/durations in nanoseconds for video annotations.
  - Some assets may not contain the expected annotations; the script will fail fast
    with a readable error.
"""

from __future__ import annotations

import asyncio
import csv
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List

from eyepop import EyePopSdk
from dotenv import load_dotenv
import aiofiles
import subprocess
import shutil

load_dotenv()


# ----------------------------- Configuration ------------------------------

ASSET_UUID = "0697932e34e777ac800063e02ecbd16a" # Novohealth super crop station 1
#ASSET_UUID = "069790b723297cb380005cc2bb7b3d46" # IONSport trimmed

ACCOUNT_UUID = "49326f2e085a46c39ba73f91c52e436c"

# Which auto-annotation to compare against GT.
# This matches the existing data shape in your commented example.
AUTO_ANNOTATE_KEY = "ep_evaluate"

# Segment duration in seconds.
TIMESEGMENT_SECS = 0.25

# Output directory (created if missing).
TRANSCRIPT_DIR = Path("./transcripts")


# ------------------------------- Data Types -------------------------------

PredictionDict = Dict[str, Any]
AssetDict = Dict[str, Any]


@dataclass(frozen=True)
class SegmentRow:
    """A single row in the output CSV."""

    timestamp_s: float
    gt_class: str
    predicted_class: str

    @property
    def is_mismatch(self) -> bool:
        return self.gt_class != self.predicted_class

    def to_csv_dict(self) -> Dict[str, str]:
        return {
            "Timestamp of segment": f"{self.timestamp_s:.3f}",
            "GT Class": self.gt_class,
            "Predicted Class": self.predicted_class,
            "Is mismatch?": "TRUE" if self.is_mismatch else "FALSE",
        }


# ------------------------------- Helpers ----------------------------------


def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def _first_class_label(pred: PredictionDict) -> str:
    """Return the first classLabel for a prediction (or empty string)."""
    classes = pred.get("classes") or []
    if not classes:
        return ""

    # GT uses {id, confidence, classLabel, category}; preds may only have {classLabel}
    label = (classes[0].get("classLabel") or "").strip()
    return label


def _label_at_time_ns(preds: Iterable[PredictionDict], t_ns: int) -> str:
    """Find the label active at time t_ns, based on [timestamp, duration) windows."""
    for p in preds:
        start = int(p.get("timestamp", 0))
        dur = int(p.get("duration", 0))
        end = start + dur
        if start <= t_ns < end:
            return _first_class_label(p)
    return ""


def _find_annotation_predictions(
    asset: AssetDict,
    *,
    annotation_type: str | None = None,
    auto_annotate: str | None = None,
) -> List[PredictionDict]:
    """Extract a prediction list from asset['annotations'] based on selector criteria."""
    
    annotations = asset.get("annotations") or []
    if not isinstance(annotations, list):
        raise TypeError(f"asset['annotations'] must be a list, got {type(annotations)!r}")

    for ann in annotations:
        if annotation_type is not None and ann.get("type") != annotation_type:
            continue
        if auto_annotate is not None and ann.get("auto_annotate") != auto_annotate:
            continue

        preds = ann.get("predictions")
        if isinstance(preds, list):
            return preds

    selector = (
        f"type={annotation_type!r}" if annotation_type is not None else ""
    )
    if auto_annotate is not None:
        selector = f"{selector} auto_annotate={auto_annotate!r}".strip()

    raise KeyError(
        "Could not find matching annotation predictions on asset. "
        f"Selector: {selector or 'none'}"
    )


def build_rows(
    *,
    ground_truth: List[PredictionDict],
    predictions: List[PredictionDict],
    segment_secs: float,
    video_duration_secs: float,
) -> List[SegmentRow]:
    segment_ns = int(segment_secs * 1_000_000_000)
    video_duration_ns = int(video_duration_secs * 1_000_000_000)

    if segment_ns <= 0:
        raise ValueError("segment_secs must be > 0")

    # Compute how many segment start times we will sample.
    num_segments = int(video_duration_secs / segment_secs) + (
        1 if (video_duration_secs % segment_secs) > 0 else 0
    )

    rows: List[SegmentRow] = []
    for i in range(num_segments):
        t_ns = i * segment_ns
        if t_ns >= video_duration_ns:
            break

        gt_label = _label_at_time_ns(ground_truth, t_ns)
        pred_label = _label_at_time_ns(predictions, t_ns)
        rows.append(
            SegmentRow(
                timestamp_s=round(t_ns / 1_000_000_000, 3),
                gt_class=gt_label,
                predicted_class=pred_label,
            )
        )

    return rows


def write_csv(rows: List[SegmentRow], out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)

    fieldnames = [
        "Timestamp of segment",
        "GT Class",
        "Predicted Class",
        "Is mismatch?",
    ]

    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in rows:
            writer.writerow(r.to_csv_dict())


def print_mismatch_preview(rows: List[SegmentRow], limit: int = 25) -> None:
    mismatches = [r for r in rows if r.is_mismatch]
    print(f"Mismatches: {len(mismatches)}")
    for r in mismatches[:limit]:
        print(
            {
                "Timestamp of segment": f"{r.timestamp_s:.3f}",
                "GT Class": r.gt_class,
                "Predicted Class": r.predicted_class,
                "Is mismatch?": "TRUE",
            }
        )


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


# --------- SRT/Overlay helpers ----------

def _require_cmd(cmd_name: str) -> str:
    path = shutil.which(cmd_name)
    if not path:
        raise RuntimeError(
            f"Required command not found on PATH: {cmd_name}. "
            "Install it (e.g., `brew install ffmpeg`) and try again."
        )
    return path


def _srt_timestamp(seconds: float) -> str:
    """Format seconds as an SRT timestamp: HH:MM:SS,mmm"""
    if seconds < 0:
        seconds = 0
    millis = int(round(seconds * 1000.0))
    hours = millis // 3_600_000
    millis -= hours * 3_600_000
    minutes = millis // 60_000
    millis -= minutes * 60_000
    secs = millis // 1000
    millis -= secs * 1000
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def _escape_srt_text(text: str) -> str:
    """SRT is forgiving, but strip newlines and keep it single-line per cue."""
    return (text or "").replace("\n", " ").replace("\r", " ").strip()


def write_segment_overlay_srt(
    rows: List[SegmentRow],
    *,
    segment_secs: float,
    out_srt_path: Path,
) -> None:
    """Write an SRT file where each cue spans one segment.

    Each cue shows GT and predicted label for that segment start.
    """
    out_srt_path.parent.mkdir(parents=True, exist_ok=True)

    cues: List[str] = []
    for i, r in enumerate(rows, start=1):
        start_s = r.timestamp_s
        end_s = r.timestamp_s + segment_secs
        # Avoid zero-length cues (ffmpeg dislikes them)
        if end_s <= start_s:
            end_s = start_s + 0.001

        gt = r.gt_class or "(none)"
        pred = r.predicted_class or "(none)"
        mismatch = " ✗" if r.is_mismatch else ""
        line = _escape_srt_text(f"GT: {gt} | Pred: {pred}{mismatch}")

        cues.append(
            "\n".join(
                [
                    str(i),
                    f"{_srt_timestamp(start_s)} --> {_srt_timestamp(end_s)}",
                    line,
                    "",  # blank line between cues
                ]
            )
        )

    out_srt_path.write_text("\n".join(cues), encoding="utf-8")


def write_predictions_onto_video(
    *,
    rows: List[SegmentRow],
    segment_secs: float,
    asset_uuid: str,
    input_video_path: Path,
    output_dir: Path,
) -> Path:
    """Burn GT/prediction labels into the video at the right timestamps.

    Implementation strategy:
      1) Generate an SRT file with one cue per segment.
      2) Use ffmpeg to burn subtitles into the video.

    Notes:
      - Requires `ffmpeg` to be installed and on PATH.
      - Output is an .mp4 with subtitles burned in.
    """
    _require_cmd("ffmpeg")

    if not input_video_path.exists():
        raise FileNotFoundError(f"Input video not found: {input_video_path}")

    output_dir.mkdir(parents=True, exist_ok=True)

    srt_path = output_dir / f"{asset_uuid}_labels_{str(segment_secs).replace('.', 'p')}.srt"
    write_segment_overlay_srt(rows, segment_secs=segment_secs, out_srt_path=srt_path)

    out_video_path = output_dir / f"{asset_uuid}_overlay_{str(segment_secs).replace('.', 'p')}.mp4"

    # Burn subtitles into the video.
    # We keep audio as-is, and re-encode video for the overlay.
    # `-y` overwrites.
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(input_video_path),
        "-vf",
        f"subtitles={str(srt_path)}",
        "-c:a",
        "copy",
        str(out_video_path),
    ]

    print("Running:", " ".join(cmd))
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        # Include stderr for actionable debugging.
        raise RuntimeError(
            "ffmpeg failed while burning subtitles.\n"
            f"Command: {' '.join(cmd)}\n"
            f"STDERR:\n{proc.stderr.strip()}"
        )

    print(f"Wrote overlay video to {out_video_path}")
    return out_video_path


# ------------------------------ EyePop I/O --------------------------------


async def fetch_asset(
    *,
    api_key: str,
    account_uuid: str,
    asset_uuid: str,
) -> AssetDict:
    """Fetch asset JSON using the current EyePop async DataEndpoint pattern."""

    print("API Key found, proceeding to fetch asset.")
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

async def download_video(
    *,
    api_key: str,
    account_uuid: str,
    asset_uuid: str,
):
    cache_dir = Path(".cache/assets")
    cache_dir.mkdir(parents=True, exist_ok=True)
    video_path = cache_dir / f"{asset_uuid}.mp4"

    if video_path.exists():
        print(f"Video already downloaded at {video_path}")
        return video_path

    async with EyePopSdk.dataEndpoint(
        api_key=api_key,
        account_id=account_uuid,
        is_async=True,
        disable_ws=False,
        eyepop_url="https://compute.staging.eyepop.xyz/",
    ) as endpoint:
        # Download the asset as a stream
        stream = await endpoint.download_asset(asset_uuid)
        async with aiofiles.open(video_path, "wb") as f:
            async for chunk in stream:
                await f.write(chunk)
        print(f"Downloaded video to {video_path}")
        return video_path

    


# --------------------------------- Main -----------------------------------


async def main() -> int:
    try:
        api_key = _require_env("EYEPOP_API_KEY")

        asset = await fetch_asset(
            api_key=api_key,
            account_uuid=ACCOUNT_UUID,
            asset_uuid=ASSET_UUID,
        )
        # `fetch_asset` normalizes the SDK Asset model into a plain dict.

        video_path = await download_video(
            api_key=api_key,
            account_uuid=ACCOUNT_UUID,
            asset_uuid=ASSET_UUID,
        )

        video_duration_secs = float(asset.get("original_duration") or 0.0)
        if video_duration_secs <= 0:
            raise ValueError(
                f"Asset has invalid original_duration: {asset.get('original_duration')!r}"
            )

        ground_truth = _find_annotation_predictions(asset, annotation_type="ground_truth")
        predictions = _find_annotation_predictions(
            asset,
            auto_annotate=AUTO_ANNOTATE_KEY,
        )

        rows = build_rows(
            ground_truth=ground_truth,
            predictions=predictions,
            segment_secs=TIMESEGMENT_SECS,
            video_duration_secs=video_duration_secs,
        )

        asset_id = asset.get("uuid") or ASSET_UUID
        out_path = (
            TRANSCRIPT_DIR
            / f"VisT_{asset_id}_{str(TIMESEGMENT_SECS).replace('.', 'p')}.csv"
        )

        write_csv(rows, out_path)
        print(f"Wrote {len(rows)} rows to {out_path}")
        print_mismatch_preview(rows)

        # Burn GT/pred labels into a local overlay video.
        overlay_out_dir = Path(".cache/overlays")
        write_predictions_onto_video(
            rows=rows,
            segment_secs=TIMESEGMENT_SECS,
            asset_uuid=str(asset_id),
            input_video_path=Path(video_path),
            output_dir=overlay_out_dir,
        )

        return 0

    except Exception:
        raise


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

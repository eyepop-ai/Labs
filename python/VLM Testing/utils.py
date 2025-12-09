# flake8: noqa
import requests
import yt_dlp
import json
import time
import os
from PIL import Image


def resize_image(image_path, max_size=(400, 400)):
    # if image path contains "_resized" already, skip resizing
    if "_resized" in image_path:
        print(f"Image {image_path} already resized, skipping resize.")
        return None
    
    # if already resized image exists, skip resizing
    # Create cache directory
    cache_dir = os.path.join(os.path.dirname(image_path), ".vlmcache")
    os.makedirs(cache_dir, exist_ok=True)

    # Get original filename and extension
    base_name = os.path.basename(image_path)
    name, ext = os.path.splitext(base_name)
    new_w, new_h = max_size
   
    # Compose resized image path
    resized_image_path = os.path.join(
        cache_dir, f"{name}_resized({new_w})({new_h}){ext}"
    )
    img = Image.open(image_path)
    img.thumbnail(max_size, Image.LANCZOS)
    img.save(resized_image_path)
    
   
    return resized_image_path


def download_youtube_video(yt_url):
    # Example usage:
    # download_youtube_video("https://www.youtube.com/watch?v=IODxDxX7oi4")
    ydl_opts = {
        "format": "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b",
        "merge_output_format": "mp4",
        "outtmpl": "%(title)s.%(ext)s",
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([yt_url])


def infer_image_description_with_file(
    image_filepath, text_prompt, token, worker_release="qwen3", max_new_tokens=500
):
    url = "https://vlm.staging.eyepop.xyz/api/v1/infer"

    # Bearer auth is accepted by the API security scheme
    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {token}" if not token.startswith("Bearer ") else token,
    }

    infer_request = {
        "worker_release": worker_release,
        "text_prompt": text_prompt,
        "config": {"max_new_tokens": max_new_tokens},
        "refresh": False,
    }

    with open(image_filepath, "rb") as img_file:
        files = {
            "file": (image_filepath, img_file, "application/octet-stream"),
        }

        data = {
            "infer_request": json.dumps(infer_request)
        }

        start_time = time.time()
        response = requests.post(
            url,
            headers=headers,
            data=data,
            files=files,
            # verify=False
        )
        elapsed_time = time.time() - start_time
        print(f"Inference request took {elapsed_time:.2f} seconds.")

    return response.json()


def infer_image_description(
    image_url, text_prompt, token, worker_release="qwen3", max_new_tokens=500
):
    url = "https://vlm.staging.eyepop.xyz/api/v1/infer"

    headers = {
        "accept": "application/json",
        "Authorization": token
    }

    infer_request = {
        "worker_release": worker_release,
        "url": image_url,
        "text_prompt": text_prompt,
        "config": {"max_new_tokens": max_new_tokens},
        "refresh": False,
    }

    data = {
        "infer_request": json.dumps(infer_request)
    }

    start_time = time.time()
    response = requests.post(
        url,
        headers=headers,
        data=data,
        # verify=False
    )
    elapsed_time = time.time() - start_time
    print(f"Inference request took {elapsed_time:.2f} seconds.")

    return response.json()


categories = {
    "Exterior": {
        "conditions": [
            "dirty or wet",
            "poor lighting",
            "out of frame",
            "distracting background",
        ],
        "shot_types": [
            "front profile",
            "driver front ¾",
            "driver side profile",
            "driver rear ¾",
            "rear profile",
            "passenger rear ¾",
            "passenger side profile",
            "passenger front ¾",
            "driver front wheel",
            "driver rear wheel",
            "passenger front wheel",
            "passenger rear wheel",
            "convertible top up",
            "convertible top down",
            "truck bed tailgate down",
            "roof",
            "driver mirror",
            "passenger mirror",
            "driver headlight",
            "passenger headlight",
            "driver taillight",
            "passenger taillight",
        ],
        "details": ["flaw", "detail"],
    },
    "Interior": {
        "shot_types": [
            "lead dash driver’s side",
            "lead dash passenger side",
            "lead dash center",
            "driver front seat",
            "passenger front seat",
            "instrument cluster",
            "cluster - odometer",
            "shifter close up",
            "center stack",
            "driver front door panel",
            "passenger front door panel",
            "driver rear door panel",
            "passenger rear door panel",
            "rear seat - driver side",
            "rear seat - passenger side",
            "trunk",
            "front trunk",
            "headliner",
            "driver front footwell",
            "passenger front footwell",
            "driver rear footwell",
            "passenger rear footwell",
            "glovebox open",
            "glovebox closed",
            "steering wheel",
        ]
    },
    "Document": {
        "shot_types": [
            "title or registration",
            "photo ID",
            "service record",
            "window sticker",
            "manuals",
            "labels",
        ]
    },
    "Other": {"items": ["keys", "extra parts", "engine bay", "undercarriage"]},
}

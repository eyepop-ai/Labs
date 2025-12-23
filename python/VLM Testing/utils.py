# flake8: noqa
import hashlib
import requests
import yt_dlp
import json
import time
import os
from PIL import Image
from dotenv import load_dotenv


def resize_image(image_path, max_size=(512, 512)):
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
    image_filepath, text_prompt, token, worker_release="qwen3", max_new_tokens=500, image_size=512
):
    hashOfPrompt = hashlib.sha256(text_prompt.encode()).hexdigest()
    folder = os.path.dirname(image_filepath)
    cache_file = os.path.join(folder+"/.vlmcache", f"{os.path.basename(image_filepath)}_{hashOfPrompt}.{worker_release}.{max_new_tokens}.{image_size}.json")
    os.makedirs(os.path.dirname(cache_file), exist_ok=True)

    print(f"Checking for cache file: {cache_file}\n")
    if os.path.exists(cache_file):
        print(f"Cache file found: {cache_file}\n")

        try:
            with open(cache_file, "r") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error reading cache file: {e}. Proceeding with inference request.\n")

    url = "https://vlm.staging.eyepop.xyz/api/v1/infer"

    # Bearer auth is accepted by the API security scheme
    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {token}" if not token.startswith("Bearer ") else token,
    }

    infer_request = {
        "worker_release": worker_release,
        "text_prompt": text_prompt,
        "config": {
            "max_new_tokens": max_new_tokens,
            "image_size": image_size,
        },
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
        print(f"Inference request took {elapsed_time:.2f} seconds.\n")

    # test for response status
    if response.status_code != 200:
        print(f"Error: Received status code {response.status_code}")
        print(f"Response: {response.text}")
        quit()

    
    with open(cache_file, "w") as f:
        f.write(response.text)
        print(f"Saved response to cache file: {cache_file}\n")

    

    return response.json()


def infer_image_description(
    image_url, text_prompt, token, worker_release="qwen3-instruct", max_new_tokens=500, image_size=512
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
        "config": {
            "max_new_tokens": max_new_tokens,
            "image_size": image_size
        },
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


def infer_video_description(
    video_url, text_prompt, token, worker_release="qwen3-instruct", max_new_tokens=500, image_size=512, fps=1.0
):
    url = "https://vlm.staging.eyepop.xyz/api/v1/infer"

    headers = {
        "accept": "application/json",
        "Authorization": token
    }

    infer_request = {
        "worker_release": worker_release,
        "url": video_url,
        "text_prompt": text_prompt,
        "config": {
            "max_new_tokens": max_new_tokens,
            "image_size": image_size,
            "fps": fps
        },
        "refresh": False,
    }

    data = {
        "infer_request": json.dumps(infer_request)
    }

    # print("Sending inference request...")
    # print (infer_request)

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



def download_video_asset(
    asset_uuid,
    token,
    start_timestamp,
    end_timestamp,
    output_path,
    transcode_mode="video_original_size",
    api_base="https://dataset-api.staging.eyepop.xyz"
):
    url = (
        f"{api_base}/assets/{asset_uuid}/download"
        f"?transcode_mode={transcode_mode}"
        f"&start_timestamp={start_timestamp}"
        f"&end_timestamp={end_timestamp}"
    )
    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {token}"
    }
    response = requests.get(url, headers=headers, stream=True)
    response.raise_for_status()
    with open(output_path, "wb") as f:
        for chunk in response.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)
    print(f"Downloaded video to {output_path}")

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


def get_eyepop_token():
    load_dotenv()
    api_key = os.getenv("EYEPOP_API_KEY")
    print("Using API Key:", api_key,"\n\n")

    response = requests.post(
        "https://web-api.staging.eyepop.xyz/authentication/token",
        headers={
            "accept": "application/json",
            "Content-Type": "application/json"
        },
        json={"secret_key": api_key}
    )

    if response.ok:
        print("Token response:", response.json())
        token = "Bearer " + response.json().get("access_token", "")
        return token
    else:
        print("Failed to get token:", response.status_code, response.text)
        quit()
# flake8: noqa
import utils
import os
from PIL import Image
import json
import re
import hashlib


def process_images_in_folder(image_files, text_prompt, token, worker_release, hashOfPrompt, expected_result):
    correct_answers = 0
    wrong_answers = 0
    for image_path in image_files:
        print(f"Processing: {image_path}")
        
        # Dynamically populate categories from utils.categories
        categories = {}
        for cat_name, cat_info in utils.categories.items():
            categories[cat_name] = {}
            for key, value in cat_info.items():
                categories[cat_name][key] = value

        cache_dir = os.path.join(os.path.dirname(image_path), ".vlmcache")
        os.makedirs(cache_dir, exist_ok=True)
        image_filename = os.path.basename(image_path)
        resized_json_path = os.path.join(
            cache_dir,
            f"{image_filename}.{worker_release}.{hashOfPrompt}.json"
        )

        print(f"Resized JSON Path: {resized_json_path}")
        
        if not os.path.exists(resized_json_path):
            print("Resizing image...")    
            resized_image_path = utils.resize_image(image_path)
            print("--------------------")

            if(resized_image_path is None):
                print("Could not resize image, skipping...")        
                continue

            result = utils.infer_image_description_with_file(
                resized_image_path, text_prompt, token, worker_release=worker_release, max_new_tokens=50
            )
        else:
            with open(resized_json_path, "r") as f:
                result = json.load(f)
            print("Loaded result from cache.")
            print("--------------------")

        print("Raw Output:")
        print(result.get("raw_output", ""))

        raw_output = result.get("raw_output", "")
        # Extract JSON object from raw_output
        match = re.search(r'({[\s\S]*})', raw_output)
        if match:
            json_str = match.group(1)
            try:
                parsed = json.loads(json_str)
                print("Parsed Result:")
                print(json.dumps(parsed, indent=4))
            except Exception as e:
                print("Could not parse JSON from raw_output:", e)
                print(json_str)
        else:
            print("No JSON object found in raw_output.")

        print("Full Result Dict:")
        print(json.dumps(result, indent=2, default=str))

        # Save result to resized_json_path
        with open(resized_json_path, "w") as f:
            json.dump(result, f, indent=2, default=str)        
        
        # trim whitespace and punctuation from raw_output
        answer = raw_output.strip().strip(".").upper()
        print(f"Final Answer: {answer}")

        if answer == expected_result:
            correct_answers += 1
        else:
            wrong_answers += 1  # count unexpected as NO for safety
        
        print(f"Percentage: {correct_answers / (correct_answers + wrong_answers) * 100.0}%, progress: {correct_answers + wrong_answers} / {len(image_files)}")
        print("--------------------")
    
    return correct_answers, wrong_answers



def TestPrompt(
    tag,
    text_prompt,
    positive_image_folder_path,
    token,
    worker_release="smol",
    sample_size=50,
    results_csv="test_results.csv",
    expected_result="YES"
):
    hash_input = (text_prompt + worker_release).encode('utf-8')
    hashOfPrompt = hashlib.sha256(hash_input).hexdigest()
    print(f"Hash of Prompt: {hashOfPrompt}")    

    image_folder_path = positive_image_folder_path
    print("Categories:")
    print(list(utils.categories.keys()))

    expected_result = expected_result.strip().upper()

    image_extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp'}
    image_files = [
        os.path.join(image_folder_path, f)
        for f in os.listdir(image_folder_path)
        if os.path.splitext(f)[1].lower() in image_extensions
    ]

    print(f"Found {len(image_files)} images to process.")

    # slice image files for testing
    image_files = image_files[:sample_size]

    correct_answers = 0
    wrong_answers = 0

    print("VLM: "+worker_release)
    print("--------------------")

    print("Testing Prompt:")
    print(text_prompt)
    print(f"Prompt Hash: {hashOfPrompt}")
    print("--------------------")

    # PROCESS IMAGES IN FOLDER
    correct_answers, wrong_answers = process_images_in_folder(
        image_files, text_prompt, token, worker_release, hashOfPrompt, expected_result
    )

    # PROCESS FOLDERS IN FOLDER
    for folder_name in os.listdir(positive_image_folder_path):
        folder_path = os.path.join(positive_image_folder_path, folder_name)
        if os.path.isdir(folder_path):
            print(f"Processing folder: {folder_name}")
            # Get all image files in the folder
            folder_image_files = [
                os.path.join(folder_path, f)
                for f in os.listdir(folder_path)
                if os.path.splitext(f)[1].lower() in image_extensions
            ]
            # Process images in the folder
            # If expected_result is "<folder>", use the current folder name as expected_result
            folder_expected_result = folder_name.strip().upper() if expected_result == "<folder>" else expected_result
            correct_answers, wrong_answers = process_images_in_folder(
                folder_image_files, text_prompt, token, worker_release, hashOfPrompt, folder_expected_result
            )

    # append log final percentage and prompt to csv with header: tag, prompt, model, yes_percentage, sample_size
    # if the csv does not exist, create it with header
    if not os.path.exists(results_csv):
        with open(results_csv, "w") as f:
            f.write("Tag,Prompt,Model,Score,expected result, samples\n")
            f.flush()

    with open(results_csv, "a") as f:
        f.write(f'"{tag}", "{text_prompt.replace(chr(10), " ")}", "{worker_release}", {correct_answers / (correct_answers + wrong_answers) * 100.0}, {expected_result}, {correct_answers + wrong_answers}\n')
        f.flush()

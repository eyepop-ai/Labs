# flake8: noqa
import datetime
import utils
import os
from PIL import Image
import json
import re
import hashlib
import time


def process_images_in_folder(image_files, text_prompt, token, worker_release, hashOfPrompt, expected_result):
    correct_answers = 0
    wrong_answers = 0
   

    for image_path in image_files:
        start_time = time.time()
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

        if(os.path.exists(resized_json_path)):
            print("Found cached result, loading...")
            with open(resized_json_path, "r") as f:
                result = json.load(f)
            print("Loaded result from cache.")
            print("--------------------")
            if ( isinstance(result, dict) and (
                result.get("detail") == "Token expired" or
                (isinstance(result.get("detail"), str) and result.get("detail").startswith("Internal server error"))
            )):
                #  delete the cached file
                os.remove(resized_json_path)
                print("Deleted cached file due to token expiration.")

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

        # Save result to resized_json_path only if not token expired
        if not (
            isinstance(result, dict) and (
                result.get("detail") == "Token expired" or
                (isinstance(result.get("detail"), str) and result.get("detail").startswith("Internal server error"))
            )
        ):
            with open(resized_json_path, "w") as f:
                json.dump(result, f, indent=2, default=str)        
        else:
            print("Token expired or internal server error detected, not saving to cache.")
        
        # trim whitespace and punctuation from raw_output
        answer = raw_output.strip().strip(".").lower()
        print(f"Final Answer: {answer} vs Expected: {expected_result}")

        if answer == expected_result:
            correct_answers += 1
        else:
            wrong_answers += 1  # count unexpected as NO for safety
            with open(os.path.join(cache_dir, f"wrong_log.{worker_release}.{hashOfPrompt}.txt"), "a") as log_file:
                log_file.write(f"{image_filename}\n")
        
        print(f"Percentage: {correct_answers / (correct_answers + wrong_answers) * 100.0}%, progress: {correct_answers + wrong_answers} / {len(image_files)}")
        print("--------------------")

        
        end_time = time.time()
        perf_log_path = os.path.join(cache_dir, "perf_log.{worker_release}.{hashOfPrompt}.txt")
        with open(perf_log_path, "a") as perf_log:
            perf_log.write(f"{image_filename}: {end_time - start_time:.4f} seconds\n")
    
    return correct_answers, wrong_answers

def get_image_files(image_folder_path, sample_size):
        image_extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp'}
        image_files = [
            os.path.join(image_folder_path, f)
            for f in os.listdir(image_folder_path)
            if os.path.splitext(f)[1].lower() in image_extensions
        ]

        print(f"Found {len(image_files)} images to process.")

        # slice image files for testing
        return image_files[:sample_size]


def log_results_to_csv(tag, text_prompt, worker_release, correct_answers, wrong_answers, expected_result, results_csv):
    # Append log final percentage and prompt to csv with header: tag, prompt, model, yes_percentage, sample_size
    # If the csv does not exist, create it with header
    if not os.path.exists(results_csv):
        with open(results_csv, "w") as f:
            f.write('"Tag","Prompt","Model","Score","expected result","samples"\n')
            f.flush()

    # Ensure all fields are double quoted
    score = correct_answers / (correct_answers + wrong_answers) * 100.0 if (correct_answers + wrong_answers) > 0 else 0.0
    with open(results_csv, "a") as f:
        escaped_prompt = text_prompt.replace('\n', ' ').replace('"', '""')
        f.write(f'"{tag}","{escaped_prompt}","{worker_release}","{score}","{expected_result}","{correct_answers + wrong_answers}"\n')
        f.flush()


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

    expected_result = expected_result.strip().lower()

    image_files = get_image_files(image_folder_path, sample_size)

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

        if folder_name.startswith("."):
            continue

        if os.path.isdir(folder_path):
            print(f"Processing folder: {folder_name}")
            folder_image_files = get_image_files(folder_path, sample_size)

            # Process images in the folder
            # If expected_result is "<folder>", use the current folder name as expected_result
            folder_expected_result = folder_name.strip().lower() if expected_result == "<folder>" else expected_result
            folder_correct_answers, folder_wrong_answers = process_images_in_folder(
                folder_image_files, text_prompt, token, worker_release, hashOfPrompt, folder_expected_result
            )

            correct_answers += folder_correct_answers
            wrong_answers += folder_wrong_answers

            # Write detailed log for each folder processed
            timestamp = datetime.datetime.now().strftime("%y%m%d_%H%M")
            log_csv = f"./results/test_log_{timestamp}.csv"
            if not os.path.exists(log_csv):
                with open(log_csv, "w") as f:
                    f.write("Tag,Prompt,Model,Score,expected result,samples,folder name\n")
                    f.flush()

            # Log the main folder results
            with open(log_csv, "a") as f:
                f.write(f'"{tag}","{text_prompt.replace(chr(10), " ")}","{worker_release}",{folder_correct_answers / (folder_correct_answers + folder_wrong_answers) * 100.0},{folder_expected_result},{folder_correct_answers + folder_wrong_answers},"{folder_name}"\n')
                f.flush()

    log_results_to_csv(
        tag,
        text_prompt,
        worker_release,
        correct_answers,
        wrong_answers,
        expected_result,
        results_csv
    )
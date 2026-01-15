# flake8: noqa
import datetime
import shutil
import utils
import os
from PIL import Image
import json
import re
import hashlib
import time
import requests


# Document mode
# max_new_tokens = 500
image_size = 1024

# regular mode
max_new_tokens = 5
# image_size = 512
# image_size = 640


def save_and_parse_json_raw_output(raw_output, image_filename, worker_release, hashOfPrompt):
    is_raw_output_json = False
    json_raw_output = raw_output.strip()

    if json_raw_output.startswith("```json"):
        is_raw_output_json = True
        
        # Remove the markdown code block markers
        json_raw_output = re.sub(r"^```json\s*", "", json_raw_output)
        json_raw_output = re.sub(r"\s*```$", "", json_raw_output)
        
        # Save to file
        mkdir_path = f"./results/images_predicted/{hashOfPrompt}"
        os.makedirs(mkdir_path, exist_ok=True)
        json_path = f"./results/images_predicted/{hashOfPrompt}/{image_filename}.{worker_release}.{hashOfPrompt}.json"
        with open(json_path, "w") as f:
            f.write(json_raw_output)
    
    return is_raw_output_json


def process_images_in_folder(image_files, text_prompt, token, worker_release, hashOfPrompt, expected_result, should_copy_files_to_predicted_folders):
    correct_answers = 0
    wrong_answers = 0   
    stats_input_tokens = 0
    stats_output_tokens = 0

    for image_path in image_files:
        start_time = time.time()
        print(f"\n-------------\nProcessing: {image_path}")
        
        # Dynamically populate categories from utils.categories
        categories = {}
        for cat_name, cat_info in utils.categories.items():
            categories[cat_name] = {}
            for key, value in cat_info.items():
                categories[cat_name][key] = value

        image_filename = os.path.basename(image_path)
        cache_dir = os.path.join(os.path.dirname(image_path), ".vlmcache")
        os.makedirs(cache_dir, exist_ok=True)
        json_path = os.path.join(
            cache_dir,
            f"{image_filename}.{worker_release}.{hashOfPrompt}.json"
        )

        print("MAX NEW TOKENS:", max_new_tokens)
        result = utils.infer_image_description_with_file(
            image_path, text_prompt, token, worker_release=worker_release, max_new_tokens=max_new_tokens, image_size=image_size
        )

        if not isinstance(result, dict):
            print("Invalid result type, skipping image.")
            wrong_answers += 1
            continue

        raw_output = result.get("raw_output", "")
        if not raw_output:
            print("Empty raw_output, skipping image.")
            wrong_answers += 1
            continue

        input_tokens = 0
        output_tokens = 0
        run_info = result.get("run_info", {})
        if run_info:
            input_tokens = run_info.get("input_tokens", 0)
            output_tokens = run_info.get("output_tokens", 0)
            print(f"Input Tokens: {input_tokens}, Output Tokens: {output_tokens}, Total Tokens: {input_tokens + output_tokens}")
            stats_input_tokens += input_tokens
            stats_output_tokens += output_tokens
        
        save_and_parse_json_raw_output(raw_output, image_filename, worker_release, hashOfPrompt)

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
        else:
            print("No JSON object found in raw_output.")

        print("Full Result Dict:")
        print(json.dumps(result, indent=2, default=str))

       
        # trim whitespace and punctuation from raw_output
        answer = raw_output.strip().strip(".").lower()
        print(f"Final Answer: {answer} vs Expected: {expected_result}")

        if answer == expected_result:
            correct_answers += 1
        else:
            wrong_answers += 1  # count unexpected as NO for safety
            with open(os.path.join(cache_dir, f"wrong_log.{worker_release}.{hashOfPrompt}.txt"), "a") as log_file:
                log_file.write(f"{image_filename}\n")

        if(should_copy_files_to_predicted_folders):
            # Create predicted folder if it doesn't exist
            predicted_folder = "./results/images_predicted/"+hashOfPrompt+"/"+answer
            os.makedirs(predicted_folder, exist_ok=True)
            # Copy image to predicted folder
            destination_path = os.path.join(predicted_folder, image_filename)
            if not os.path.exists(destination_path):
                shutil.copy2(image_path, destination_path)
        
        total = correct_answers + wrong_answers
        pct = (correct_answers / total * 100.0) if total > 0 else 0.0
        print(f"Percentage: {pct}%, progress: {total} / {len(image_files)}")
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


def log_results_to_csv(tag, text_prompt, worker_release, correct_answers, wrong_answers, expected_result, results_csv, hashOfPrompt, total_time):
    # Append log final percentage and prompt to csv with header: tag, prompt, model, yes_percentage, sample_size
    # If the csv does not exist, create it with header
    if not os.path.exists(results_csv):
        with open(results_csv, "w") as f:
            f.write('"Tag","Prompt","Model","Score","expected result","samples","hash","Total Time","Time per sample"\n')
            f.flush()

    # Ensure all fields are double quoted
    score = correct_answers / (correct_answers + wrong_answers) * 100.0 if (correct_answers + wrong_answers) > 0 else 0.0
    with open(results_csv, "a") as f:
        escaped_prompt = text_prompt.replace('\n', ' ').replace('"', '""')
        f.write(f'"{tag}","{escaped_prompt}","{worker_release}","{score}","{expected_result}","{correct_answers + wrong_answers}","{hashOfPrompt}","{total_time}","{total_time / (correct_answers + wrong_answers) if (correct_answers + wrong_answers) > 0 else 0.0}"\n')
        f.flush()


def TestPrompt(
    tag,
    text_prompt,
    positive_image_folder_path,
    token,
    worker_release="smol",
    sample_size=50,
    results_csv="test_results.csv",
    expected_result="YES",
    should_copy_files_to_predicted_folders=False
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
        image_files, text_prompt, token, worker_release, hashOfPrompt, expected_result, should_copy_files_to_predicted_folders=should_copy_files_to_predicted_folders
    )


    total_time_secs = 0  

    # PROCESS FOLDERS IN FOLDER
    for folder_name in os.listdir(positive_image_folder_path):
        folder_path = os.path.join(positive_image_folder_path, folder_name)

        if folder_name.startswith("."):
            continue

        if os.path.isdir(folder_path):
            print(f"Processing folder: {folder_name}")
            folder_start_time = time.time()
            folder_image_files = get_image_files(folder_path, sample_size)

            # Process images in the folder
            # If expected_result is "<folder>", use the current folder name as expected_result
            folder_expected_result = folder_name.strip().lower() if expected_result == "<folder>" else expected_result
            folder_correct_answers, folder_wrong_answers = process_images_in_folder(
                folder_image_files, text_prompt, token, worker_release, hashOfPrompt, folder_expected_result, should_copy_files_to_predicted_folders=should_copy_files_to_predicted_folders
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

            total_time_secs += time.time() - folder_start_time

    log_results_to_csv(
        tag,
        text_prompt,
        worker_release,
        correct_answers,
        wrong_answers,
        expected_result,
        results_csv,
        f"{worker_release}.{hashOfPrompt}",
        total_time_secs
    )
    print(f"{worker_release}.{hashOfPrompt}")

def TestPromptAgainstVideoAsset(tag,
    text_prompt,
    asset_uuid,
    token,
    worker_release="smol",    
    results_csv="test_results.csv",
    expected_result="YES",
    should_copy_files_to_predicted_folders=False,
    start_seconds=0,
    end_seconds=1,
    fps=1.0
):

    # get length of video
    # video_length_secs = utils.get_video_length_secs(assetUuid, token)
    video_length_secs = 15*60
    print(f"Video length: {video_length_secs} seconds")

    # event_length_secs = 2
    # overlap = .5
    # step = int(event_length_secs * overlap)
    # print(f"Using step size: {step} seconds")

    # # Create a list of timestamps to sample from the video
    
    # timestamps = [i for i in range(0, video_length_secs, step)]
    # print(f"Sampling timestamps: {timestamps}")

    # timestamps = timestamps[:1]
    # timestamps = [12]

    # for timestamp in timestamps:


    print(f"Processing timestamp: {start_seconds} to {end_seconds} at {fps} fps")
    # Extract frame at timestamp
    video_url = "ai.eyepop://data/assets/"+asset_uuid+"?transcode_mode=video_original_size&start_timestamp="+str(start_seconds*1000000000)+"&end_timestamp="+str((end_seconds)*1000000000)
    print(f"Video URL: {video_url}")
    result = utils.infer_video_description(
        video_url, text_prompt, token, worker_release=worker_release, max_new_tokens=50, image_size=512, fps=fps
    )

    # print("Result Output: <-->")
    # print(result)
    # print("</-->")

    raw_output = result.get("raw_output", "")
    if not raw_output:
        print("Empty raw_output, skipping image.")
        return    

    # print("Full Result Dict:")
    # print(json.dumps(result, indent=2, default=str))

    # trim whitespace and punctuation from raw_output
    answer = raw_output.strip().strip(".").lower()
    print(f"--------\nFinal Answer: {answer} vs Expected: {expected_result}--------\n")

    # with open(resized_json_path, "w") as f:
    #     json.dump(result, f, indent=2, default=str)        


# flake8: noqa
import utils
import os
from PIL import Image
import json
import re



def TestPrompt(
    tag,
    text_prompt,
    positive_image_folder_path,
    token,
    worker_release="smol",
    sample_size=50,
    results_csv="test_results.csv"
):
    hashOfPrompt = hash(text_prompt + worker_release)
    image_folder_path = positive_image_folder_path
    print("Categories:")
    print(list(utils.categories.keys()))

    image_extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp'}
    image_files = [
        os.path.join(image_folder_path, f)
        for f in os.listdir(image_folder_path)
        if os.path.splitext(f)[1].lower() in image_extensions
    ]

    print(f"Found {len(image_files)} images to process.")

    # slice image files for testing
    image_files = image_files[:sample_size]

    yes_answers = 0
    no_answers = 0

    print("VLM: "+worker_release)
    print("--------------------")

    print("Testing Prompt:")
    print(text_prompt)
    print(f"Prompt Hash: {hashOfPrompt}")
    print("--------------------")

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

        if answer == "YES":
            yes_answers += 1
        elif answer == "NO":
            no_answers += 1
        else:
            print("Unexpected answer received.")
            no_answers += 1  # count unexpected as NO for safety
        
        print(f"Percentage: {yes_answers / (yes_answers + no_answers) * 100.0}%, progress: {yes_answers + no_answers} / {len(image_files)}")
        print("--------------------")

    # append log final percentage and prompt to csv with header: tag, prompt, model, yes_percentage, sample_size
    # if the csv does not exist, create it with header
    if not os.path.exists(results_csv):
        with open(results_csv, "w") as f:
            f.write("Prompt,\" Model\",Score,samples\n")
            f.flush()

    with open(results_csv, "a") as f:
        f.write(f'"{tag}", "{text_prompt.replace(chr(10), " ")}", {worker_release}, {yes_answers / (yes_answers + no_answers) * 100.0}, {yes_answers + no_answers}\n')
        f.flush()

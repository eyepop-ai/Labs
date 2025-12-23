# flake8: noqa
import os
import utils
from datetime import datetime
import openai
import generictester


def get_all_subfolders(main_folder):
    sub_folders = []
    for root, dirs, files in os.walk(main_folder):
        for dir in dirs:
            if not dir.startswith('.'):
                sub_folders.append(os.path.join(root, dir))
    return sub_folders


def generate_prompt_with_chatgpt(creation_prompt, timestamp):
    openai.api_key = os.getenv("OPENAI_API_KEY")
    response = openai.ChatCompletion.create(
        model="gpt-5.2",
        messages=[
            {"role": "system", "content": "You are a helpful assistant that creates prompts for Vision Language Models (VLMs)."},
            {"role": "user", "content": creation_prompt}
        ],
        max_tokens=5000,
        n=1,
        stop=None,
        temperature=0.1,
    )

    print("Generated Prompt from ChatGPT:")
    generated_prompt = response.choices[0].message['content']
    print(generated_prompt)
    with open(f"generated_prompt_{timestamp}.txt", "w") as f:
        f.write(generated_prompt)
    return generated_prompt


def process_images_and_collect_results(sub_folders, results, token, worker_release, max_new_tokens, image_size):
    for folder in sub_folders:
        images = [f for f in os.listdir(folder) if f.lower().endswith(('.png', '.jpg', '.jpeg'))][:10]

        for image in images:
            print(f"-------\n\nProcessing image: {image} in folder: {folder}\n\n")
            image_path = os.path.join(folder, image)
            prompt = (
                "Describe only the visual features that would help distinguish this image from images belonging to other vehicle-related categories. "
                "Avoid mentioning filenames, paths, or class names. Focus on what is visible and unambiguous."
            )
            result = utils.infer_image_description_with_file(
                image_path, prompt, token, worker_release=worker_release, max_new_tokens=max_new_tokens, image_size=image_size
            )

            if 'raw_output' in result:
                raw_output = result['raw_output']
                results.setdefault(folder, []).append(raw_output)
                print(f"Result for image {image} in folder {folder}: {raw_output}\n\n")
            else:
                print(f"No raw_output found for image {image} in folder {folder}\n\n")


def build_creation_prompt(results,timestamp):
    creation_prompt = (
        "In the following, you will find a series of image descriptions in xml tags. "
        "The xml tag defines the class of the image. Your task is to create a single comprehensive prompt "
        "that will allow a VLM to classify images into their respective classes based on the descriptions provided. "
        "Ensure that the prompt is clear, concise, and covers all the necessary details to facilitate accurate classification by the VLM.\n"
    )

    class_labels = []
    for folder, result in results.items():
        class_label = os.path.basename(folder)
        class_labels.append(class_label)
        creation_prompt += f"\n<image_description classLabel=\"{class_label}\">{result}</image_description>"

    creation_prompt += (
        f"\n\nThe possible output labels are: {class_labels}. "
        "Do not include explanations, confidence scores, or additional text. "
        "Choose the closest matching category based on the dominant visual content."
    )

    with open(f"creation_prompt_{timestamp}.txt", "w") as f:
        f.write(creation_prompt)
    
    print(f"Creation prompt saved to creation_prompt_{timestamp}.txt")    
    print(creation_prompt)

    return creation_prompt


worker_release = "qwen3-instruct"
max_new_tokens = 100
image_size = 512
main_folder = "./images/carsandbids/data"
timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
sub_folders = get_all_subfolders(main_folder)
promptfiles = []
results = {}
token = utils.get_eyepop_token()

print(sub_folders)

# Get sample images from each subfolder and process them
process_images_and_collect_results(sub_folders, results, token, worker_release, max_new_tokens, image_size)

# Build creation prompt from collected results
creation_prompt = build_creation_prompt(results, timestamp)

# Generate final prompt using ChatGPT
generated_prompt = generate_prompt_with_chatgpt(creation_prompt, timestamp)

# Test the generated prompt using generictester
results_csv = f'./results/testarray_results_{timestamp}.csv'
generictester.TestPrompt(
            "generated",
            generated_prompt,
            main_folder,
            token,
            worker_release=worker_release,
            sample_size=20,
            expected_result="<folder>",
            results_csv=results_csv,
            should_copy_files_to_predicted_folders=False
        )

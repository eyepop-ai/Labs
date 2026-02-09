# flake8: noqa
import os
import utils
from datetime import datetime
from openai import OpenAI
import generictester
import utils_agent


def get_all_subfolders(main_folder):
    sub_folders = []
    for root, dirs, files in os.walk(main_folder):
        for dir in dirs:
            if not dir.startswith("."):
                sub_folders.append(os.path.join(root, dir))
    return sub_folders


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


def process_images_and_collect_results(
    sub_folders, results, token, worker_release, max_new_tokens, image_size
):
    for folder in sub_folders:
        images = [
            f
            for f in os.listdir(folder)
            if f.lower().endswith((".png", ".jpg", ".jpeg"))
        ][:10]

        for image in images:
            print(
                f"-------\n\nProcessing image: {image} in folder: {folder}\n{images.index(image)+1} of {len(images)}\n\n"
            )
            image_path = os.path.join(folder, image)
            prompt = (
                "Describe only the visual features that would help distinguish this image from images belonging to other categories. "
                "Avoid mentioning filenames, paths, or class names. Focus on what is visible and unambiguous."
            )
            result = utils.infer_image_description_with_file(
                image_path,
                prompt,
                token,
                worker_release=worker_release,
                max_new_tokens=max_new_tokens,
                image_size=image_size,
            )

            if "raw_output" in result:
                raw_output = result["raw_output"]
                results.setdefault(folder, []).append(raw_output)
                print(f"Result for image {image} in folder {folder}: {raw_output}\n\n")
            else:
                print(f"No raw_output found for image {image} in folder {folder}\n\n")


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


# Main execution
async def main():
    dataset_uuid = "069838825c5d7bf280007c917fd4a827"
    account_uuid = "457ca111aa9343399c7e1f58a486b59b"
    EYEPOP_URL = "https://compute.staging.eyepop.xyz"
    EYEPOP_API_KEY = "eyp_7fbe1757e3e39265345e234f7dd166c8d40442aa47fc5b9ed3e72d35d621b38be07c8473dd60d0d2bdb5231ea056c415600b0b1d577e194e8bdad982de38fb57"


    token = utils.get_eyepop_token_compute()

    # create main folder path based on dataset_uuid
    main_folder = f"./datasets/{dataset_uuid}"

    # create main folder if it doesn't exist
    if not os.path.exists(main_folder):
        os.makedirs(main_folder)
        print(f"Created main folder: {main_folder}")

    worker_release = "qwen3-instruct"
    max_new_tokens = 100
    image_size = 512
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    sub_folders = get_all_subfolders(main_folder)
    promptfiles = []
    results = {}
    # token = utils.get_eyepop_token()

    # get dataset labels using utils function
    dataset = utils_agent.fetch_dataset(
        api_key=EYEPOP_API_KEY,
        account_uuid=account_uuid,
        eyepop_url=EYEPOP_URL,
        dataset_uuid=dataset_uuid,
    )

    print(f"Dataset name: {dataset.uuid}")

    # create subfolders for each class label from auto_annotate_params
    for label in dataset.auto_annotate_params.candidate_labels:
        sub_folder = os.path.join(main_folder, label)
        if not os.path.exists(sub_folder):
            os.makedirs(sub_folder)
            print(f"Created subfolder: {sub_folder}")

    # add folder "NEGATIVES" for assets that do not contain any of the candidate labels
    # negatives_folder = os.path.join(main_folder, "NEGATIVES")
    # if not os.path.exists(negatives_folder):
    #     os.makedirs(negatives_folder)
    #     print(f"Created subfolder for negatives: {negatives_folder}")

    print(sub_folders)

    # fetch assets from dataset and save images to respective subfolders based on their labels
    assets = await utils_agent.fetch_all_assets(
        api_key=EYEPOP_API_KEY,
        account_uuid=account_uuid,
        eyepop_url=EYEPOP_URL,
        dataset_uuid=dataset_uuid,
    )

    print(len(assets))
    samples_per_label = 20
    label_counts = {os.path.basename(folder): 0 for folder in sub_folders}

    for asset in assets:
        asset_uuid = asset.get("uuid")

        ground_truth = utils_agent._find_annotation_predictions(
            asset, annotation_type="ground_truth"
        )[0]
        if not ground_truth:
            print(
                f"No ground truth annotations found for asset {asset_uuid}. Skipping."
            )
            continue

        # Assume each asset has only one class label for simplicity
        class_label = None
        for classes in ground_truth.get("classes"):
            class_label = classes.get("classLabel")
            break

        if class_label is None:
            class_label = "NEGATIVES"

        if label_counts.get(class_label, 0) >= samples_per_label:
            continue

        print(f"Downloading asset {asset_uuid} with class label {class_label}...")

        await utils_agent.download_asset(
            asset_uuid=asset_uuid,
            api_key=EYEPOP_API_KEY,
            account_uuid=account_uuid,
            eyepop_url=EYEPOP_URL,
            output_path=os.path.join(main_folder, class_label),
        )

        label_counts[class_label] += 1

        print(
            f"Downloaded asset {asset_uuid} to folder {class_label}. Current count for this label: {label_counts[class_label]}"
        )

        # Early exit if all classes have enough samples
        if all(count >= samples_per_label for count in label_counts.values()):
            print("Collected enough samples for all classes.")
            break

    # Get sample images from each subfolder and process them
    process_images_and_collect_results(
        sub_folders, results, token, worker_release, max_new_tokens, image_size
    )

    # Build creation prompt from collected results
    creation_prompt = build_creation_prompt(results, timestamp)

    # Generate final prompt using ChatGPT
    generated_prompt = generate_prompt_with_chatgpt(creation_prompt, timestamp)

    # Test the generated prompt using generictester
    results_csv = f"./results/testarray_results_{timestamp}.csv"
    generictester.TestPrompt(
        "generated",
        generated_prompt,
        main_folder,
        token,
        worker_release=worker_release,
        sample_size=20,
        expected_result="<folder>",
        results_csv=results_csv,
        should_copy_files_to_predicted_folders=False,
    )


# To run the async main function
import asyncio

asyncio.run(main())

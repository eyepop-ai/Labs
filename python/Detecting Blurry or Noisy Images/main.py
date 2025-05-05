import cv2
import os
import numpy as np

# Ensure BRISQUE models are available
import urllib.request

MODEL_DIR = "./models"
MODEL_FILES = {
    "brisque_model_live.yml": "https://github.com/opencv/opencv_contrib/raw/master/modules/quality/samples/brisque_model_live.yml",
    "brisque_range_live.yml": "https://github.com/opencv/opencv_contrib/raw/master/modules/quality/samples/brisque_range_live.yml",
}

os.makedirs(MODEL_DIR, exist_ok=True)

for filename, url in MODEL_FILES.items():
    filepath = os.path.join(MODEL_DIR, filename)
    if not os.path.exists(filepath):
        print(f"Downloading {filename}...")
        urllib.request.urlretrieve(url, filepath)

def is_image_file(filename):
    return any(filename.lower().endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.bmp', '.tiff'])

def score_image_brisque(image_path):
    img = cv2.imread(image_path)
    if img is None:
        return None
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    model_path = os.path.join(MODEL_DIR, "brisque_model_live.yml")
    range_path = os.path.join(MODEL_DIR, "brisque_range_live.yml")
    brisque = cv2.quality.QualityBRISQUE_create(model_path, range_path)
    score = brisque.compute(gray)
    if isinstance(score, (float, int)):
        return float(score)
    elif isinstance(score, (list, tuple)) and isinstance(score[0], (list, tuple)):
        return float(score[0][0])
    elif isinstance(score, (list, tuple)):
        return float(score[0])
    else:
        raise TypeError(f"Unexpected BRISQUE score format: {type(score)} - {score}")

def evaluate_inputs_folder(base_path="./inputs"):
    results = []
    for folder in os.listdir(base_path):
        folder_path = os.path.join(base_path, folder)
        if os.path.isdir(folder_path):
            for file in os.listdir(folder_path):
                if file.startswith('.'):
                    continue
                if is_image_file(file):
                    file_path = os.path.join(folder_path, file)
                    score = score_image_brisque(file_path)
                    if score is not None:
                        results.append((folder, file, score))
                        print(f"{folder}/{file} - BRISQUE Score: {score:.2f}")
                    else:
                        print(f"Skipped unreadable image: {folder}/{file}")

    # Calculate and print average scores by folder
    from collections import defaultdict

    folder_scores = defaultdict(list)
    for folder, _, score in results:
        folder_scores[folder].append(score)

    print("\nAverage BRISQUE Scores by Folder:")
    for folder, scores in folder_scores.items():
        avg_score = sum(scores) / len(scores)
        print(f"{folder} - Average Score: {avg_score:.2f}")

    return results

if __name__ == "__main__":
    evaluate_inputs_folder()
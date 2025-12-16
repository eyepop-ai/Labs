# flake8: noqa 
import os
import json
from PIL import Image
import matplotlib.pyplot as plt
from matplotlib.widgets import Button
import shutil


slug = "qwen3-instruct.20eae2030530fa3cb005dc1e95a9b15986aae4f11ecbb5aa312a6d089eb48ace"
main_folder = "./images/carsandbids/data/"

# get folders in the path
folders = [f for f in os.listdir(main_folder) if os.path.isdir(os.path.join(main_folder, f))]

for folder in folders:    
    vlmcachefolder = main_folder + folder + "/.vlmcache"
    print(f"Folder: {vlmcachefolder}")

    # get the cached results that have slug in their filename
    files = os.listdir(vlmcachefolder)
    relevant_files = [f for f in files if slug in f]
    for json_file in relevant_files:
        print(f"Found JSON file: {json_file}")
        json_filepath = os.path.join(vlmcachefolder, json_file)
        image_filepath = main_folder + folder + "/" + json_file.rsplit(f".{slug}.json", 1)[0]
        print(f"Corresponding image file: {image_filepath}")
        print(f"Location of image: {main_folder + folder}/")

        with open(json_filepath, "r") as file:
            content = file.read()

            if not content or content.strip() == "":
                print("Empty JSON file, skipping...")
                continue

            try:
                data = json.loads(content)
            except json.JSONDecodeError as e:
                print(f"Invalid JSON in {json_filepath}, skipping...")
                print(e)
                continue
            
            raw_output = data.get("raw_output", "")
            answer = raw_output.strip().strip(".").lower()

            print(f"Compare: {folder} vs {answer} ")
            if not (folder.lower() == answer):
                if not os.path.exists(image_filepath):
                    print(f"Image file does not exist: {image_filepath}, skipping...")
                    continue
                
                img = Image.open(image_filepath)

                fig, ax = plt.subplots()
                plt.subplots_adjust(bottom=0.2)

                ax.imshow(img)
                ax.set_title(f"Current Folder: {folder} | Predicted: {answer}")
                ax.axis('off')

                # Button axes
                ax_keep = plt.axes([0.25, 0.05, 0.2, 0.075])
                ax_move = plt.axes([0.55, 0.05, 0.2, 0.075])

                btn_keep = Button(ax_keep, 'Keep')
                btn_move = Button(ax_move, 'Move')

                def on_keep(event):
                    plt.close(fig)

                def on_move(event):
                    target_folder = os.path.join(main_folder, answer)
                    print(f"Moving file to: {target_folder}")
                    # return
                    # os.makedirs(target_folder, exist_ok=True)
                    # target_path = os.path.join(target_folder, os.path.basename(image_filepath))
                    shutil.move(image_filepath, target_folder)
                    plt.close(fig)

                btn_keep.on_clicked(on_keep)
                btn_move.on_clicked(on_move)

                plt.show()                   
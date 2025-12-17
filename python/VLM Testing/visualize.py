# flake8: noqa 
import os
import json
from PIL import Image
import matplotlib.pyplot as plt
from matplotlib.widgets import Button
import shutil
from matplotlib.widgets import Button as MplButton
import sys


hashOfPrompt = "qwen3-instruct.5818ffa9e718b31ed62947e49dfbfba3bb01fd6b8c64c6353ef2977d7b6db424"
# main_folder = "./images/carsandbids/data/"
main_folder = "./results/images_predicted/5818ffa9e718b31ed62947e49dfbfba3bb01fd6b8c64c6353ef2977d7b6db424"
# visualize_only_errors = True
visualize_only_errors = False

# get folders in the path
folders = [f for f in os.listdir(main_folder) if os.path.isdir(os.path.join(main_folder, f))]

def show_image_and_handle_action(image_filepath, folder, answer, main_folder, visualize_only_errors=True, hashOfPrompt=""):
    if not os.path.exists(image_filepath):
        print(f"Image file does not exist: {image_filepath}, skipping...")
        return
    
    def on_keep(event):
        plt.close(fig)

    def on_move(event):
        target_folder = os.path.join(main_folder, answer)
        print(f"Moving file to: {target_folder}")
        shutil.move(image_filepath, target_folder)
        plt.close(fig)

    def on_quit(event):
        plt.close('all')
        sys.exit(0)


    img = Image.open(image_filepath)

    fig, ax = plt.subplots()
    plt.subplots_adjust(bottom=0.2)

    ax.imshow(img)
    ax.set_title(f"Current Folder: {folder} | Predicted: {answer}")
    fig.suptitle(f"{hashOfPrompt}", fontsize=5, y=0.98)
    ax.axis('off')

    # Button axes
    ax_keep = plt.axes([0.25, 0.05, 0.2, 0.075])
    btn_keep = Button(ax_keep, 'Skip')
    btn_keep.on_clicked(on_keep)
    
    if visualize_only_errors:
        ax_move = plt.axes([0.55, 0.05, 0.2, 0.075])
        btn_move = Button(ax_move, 'Move')
        btn_move.on_clicked(on_move)

    # Add Quit button
    ax_quit = plt.axes([0.85, 0.92, 0.12, 0.075])
    btn_quit = MplButton(ax_quit, 'Quit', color='red', hovercolor='salmon')
    btn_quit.on_clicked(on_quit)

    plt.show()







for folder in folders:    
    vlmcachefolder = main_folder + folder + "/.vlmcache"
    print(f"Folder: {vlmcachefolder}")

    # get the cached results that have hashOfPrompt in their filename
    files = os.listdir(vlmcachefolder)
    relevant_files = [f for f in files if hashOfPrompt in f]
    for json_file in relevant_files:
        print(f"Found JSON file: {json_file}")
        json_filepath = os.path.join(vlmcachefolder, json_file)
        image_filepath = main_folder + folder + "/" + json_file.rsplit(f".{hashOfPrompt}.json", 1)[0]
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

            if visualize_only_errors:
                if not (folder.lower() == answer):
                    show_image_and_handle_action(image_filepath, folder, answer, main_folder, visualize_only_errors, hashOfPrompt)
            else:
                show_image_and_handle_action(image_filepath, folder, answer, main_folder, visualize_only_errors, hashOfPrompt)

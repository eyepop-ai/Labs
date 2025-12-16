# flake8: noqa
import os
import shutil


main_folder = "./images/carsandbids/data/"

# get folders in the path
folders = [f for f in os.listdir(main_folder) if os.path.isdir(os.path.join(main_folder, f))]

for folder in folders:
    vlmcachefolder = main_folder + folder + "/.vlmcache"
    print(f"Folder: {vlmcachefolder}")
    # delete the vlmcache folder and all its contents
    if os.path.exists(vlmcachefolder):
        shutil.rmtree(vlmcachefolder)
        print(f"Deleted vlmcache folder: {vlmcachefolder}")
    else:
        print(f"VLMcache folder does not exist: {vlmcachefolder}")

# flake8: noqa
import generictester
import csv
import requests
import os
from dotenv import load_dotenv
from datetime import datetime
import utils


response = utils.get_eyepop_token()

token = "Bearer " + response.json().get("access_token", "")

with open('./results/testarray.csv', newline='') as csvfile:
    reader = csv.DictReader(csvfile)
    for row in reader:
        print(row)
        tag = row['tag']
        text_prompt = row['prompt']
        worker_release = row['model']
        image_folder_path = row['folder']
        samples = int(row['samples'])
        expected_result = row['expected']
        run = row['run']

        if(run=='x'):
            continue
    
        timestamp = datetime.now().strftime("%y%m%d_%H%M")
        results_csv = f'./results/testarray_results_{timestamp}.csv'
        generictester.TestPrompt(
            tag,
            text_prompt,
            image_folder_path,
            token,
            worker_release=worker_release,
            sample_size=samples,
            expected_result=expected_result,
            results_csv=results_csv,
            should_copy_files_to_predicted_folders=False
        )
        # break
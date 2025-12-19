# flake8: noqa
import generictester
import csv
import requests
import os
from dotenv import load_dotenv
from datetime import datetime


load_dotenv()
api_key = os.getenv("EYEPOP_API_KEY")
print("Using API Key:", api_key)

response = requests.post(
    "https://web-api.staging.eyepop.xyz/authentication/token",
    headers={
        "accept": "application/json",
        "Content-Type": "application/json"
    },
    json={"secret_key": api_key}
)

if response.ok:
    print("Token response:", response.json())
else:
    print("Failed to get token:", response.status_code, response.text)

token = "Bearer " + response.json().get("access_token", "")

with open('./results/testvideoarray.csv', newline='') as csvfile:
    reader = csv.DictReader(csvfile)
    for row in reader:
        # print(row)
        # run,tag,prompt,model,asset_uuid,start,end,fps,expected
        tag = row['tag']
        text_prompt = row['prompt']
        worker_release = row['model']
        asset_uuid = row['asset_uuid']
        start = row['start']
        end = row['end']
        fps = row['fps']

        expected_result = row['expected']
        run = row['run']

        if(run=='x'):
            continue
    
        timestamp = datetime.now().strftime("%y%m%d_%H%M")
        results_csv = f'./results/testvideoarray_results_{timestamp}.csv'
        generictester.TestPromptAgainstVideoAsset(
            tag,
            text_prompt,
            asset_uuid,
            token,
            worker_release=worker_release,    
            results_csv="test_videoresults.csv",
            expected_result=expected_result,
            should_copy_files_to_predicted_folders=False,
            start_seconds=float(start),
            end_seconds=float(end),
            fps=float(fps)
        )
        # break
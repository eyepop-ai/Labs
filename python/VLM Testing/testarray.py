# flake8: noqa
import generictester
import csv
import requests
import os
from dotenv import load_dotenv


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

with open('testarray.csv', newline='') as csvfile:
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
    
        generictester.TestPrompt(
            tag,
            text_prompt,
            image_folder_path,
            token,
            worker_release=worker_release,
            sample_size=samples,
            expected_result=expected_result
        )
        # break